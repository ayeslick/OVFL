// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

/**
 * Pendle Basket (PT-only) Vault with per-underlying ovfl tokens, market-value fees on PT deposits,
 * per-market fixed TWAP (duration), timelocked market onboarding (self-timelocked delay),
 * Sablier V2 Lockup Linear streaming for the “excess”, duration-based Oracle pricing,
 * and an approved-markets registry.
 *
 * Core flows:
 * - deposit: user supplies PT pre-maturity; fee on MARKET VALUE (in canonical underlying); creates a stream.
 * - claim: once matured, burn ovfl tokens to withdraw the corresponding PTs for settlement elsewhere.
 */

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PRBMath} from "prb-math/PRBMath.sol";
import {OVFLETH} from "./OVFLETH.sol";

// -------- Pendle minimal --------
interface IPendleMarket {
    function expiry() external view returns (uint256);
    function increaseObservationsCardinalityNext(uint16 cardinalityNext) external;

    function readTokens()
        external
        view
        returns (address _SY, address _PT, address _YT);
}

interface IPendleOracle {
    function getPtToSyRate(address market, uint32 twapDuration) external view returns (uint256);
    function getOracleState(address market, uint32 duration) external view returns (bool, uint16, bool);
}

interface IStandardizedYield {
    function getTokensOut() external view returns (address[] memory);

    function yieldToken() external view returns (address);

    function redeem(
        address receiver,
        uint256 shares,
        address tokenOut,
        uint256 minTokenOut,
        bool burnFromInternalBalance
    ) external returns (uint256);
}

// -------- Sablier V2 Lockup Linear (minimal) --------
interface ISablierV2LockupLinear {
    struct Durations {
        uint40 cliff;
        uint40 total;
    }

    struct Broker {
        address account;
        uint256 fee; // UD60x18 formatted
    }

    struct CreateWithDurations {
        address sender;
        address recipient;
        uint128 totalAmount;
        IERC20 asset;
        bool cancelable;
        bool transferable;
        Durations durations;
        Broker broker;
    }

    function createWithDurations(CreateWithDurations calldata params) external returns (uint256 streamId);
}

contract OVFL is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Roles
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    // Timelock (self-timelocked delay; 0 => instant first-time changes)
    uint256 public timelockDelaySeconds; // 0 until first execute

    uint256 public constant FEE_MAX_BPS = 1_000; // 10% max
    uint256 public constant MIN_DELAY_SECONDS = 1 hours;
    uint256 public constant MAX_DELAY_SECONDS = 2 days;
    uint256 public constant MIN_TWAP_DURATION = 15 minutes;
    uint256 public constant MAX_TWAP_DURATION = 30 minutes;
    uint256 public constant BASIS_POINTS = 10_000;

    uint256 public constant MIN_PT_AMOUNT = 0.1 ether; // 0.1 PT

    PendingTimelockDelay public pendingDelay;

    address[] private _approvedMarkets;

    // Market state
    struct SeriesInfo {
        bool approved;
        uint32 twapDurationFixed;
        uint256 expiryCached;
        address ptToken;
        address ovflToken;
        address underlying;
    }

    struct PendingMarket {
        bool queued;
        uint32 twapDuration;
        uint256 eta;
        address underlying;
    }

    struct PendingTimelockDelay {
        bool queued;
        uint256 newDelay;
        uint256 eta;
    }

    mapping(address => SeriesInfo) public series;
    mapping(address => PendingMarket) public pendingMarkets;
    mapping(address => address) public ptToMarket; // PT token -> market

    // Underlying management
    mapping(address => bool) public approvedUnderlying;
    mapping(address => address) public underlyingToOvfl;
    mapping(address => uint16) public feeBpsByUnderlying;
    mapping(address => address) public tokenToUnderlying; // token alias -> canonical underlying

    address private immutable TREASURY_ADDR;

    IPendleOracle public immutable pendleOracle = IPendleOracle(0x9a9Fa8338dd5E5B2188006f1Cd2Ef26d921650C2);
    ISablierV2LockupLinear public immutable sablierLL = ISablierV2LockupLinear(0x3962f6585946823440d274aD7C719B02b49DE51E);

    // Events
    event FeeTaken(address indexed payer, address indexed token, uint256 amount);
    event Claimed(
        address indexed user,
        address indexed market,
        address indexed ptToken,
        address ovflToken,
        uint256 burnedAmount,
        uint256 ptOut
    );
    event MarketQueued(address indexed market, uint32 twapSeconds, uint256 eta);
    event MarketApproved(
        address indexed market,
        address indexed ptToken,
        address indexed underlying,
        address ovflToken,
        uint32 twapSeconds,
        uint256 expiry
    );
    event UnderlyingApproved(address indexed underlying, address indexed ovflToken, uint16 feeBps);
    event UnderlyingAliasSet(address indexed token, address indexed underlying);
    event FeeUpdated(address indexed underlying, uint16 feeBps);
    event TimelockDelayQueued(uint256 newDelay, uint256 eta);
    event TimelockDelayExecuted(uint256 newDelay);

    constructor(address admin, address treasury) {
        require(admin != address(0), "OVFL: admin is zero address");
        require(treasury != address(0), "OVFL: treasury is zero address");

        _grantRole(ADMIN_ROLE, admin);
        TREASURY_ADDR = treasury;
    }

    // --- Admin: Underlying approvals & fees ---
    function approveUnderlying(
        address underlying,
        string calldata name,
        string calldata symbol,
        uint16 feeBps,
        address[] calldata aliases
    ) external onlyRole(ADMIN_ROLE) {
        require(underlying != address(0), "OVFL: underlying is zero");
        require(feeBps <= FEE_MAX_BPS, "OVFL: fee >10%");

        address ovflToken = underlyingToOvfl[underlying];
        if (ovflToken == address(0)) {
            OVFLETH token = new OVFLETH(name, symbol);
            token.transferOwnership(address(this));
            ovflToken = address(token);
            underlyingToOvfl[underlying] = ovflToken;
        }

        approvedUnderlying[underlying] = true;
        feeBpsByUnderlying[underlying] = feeBps;
        _setUnderlyingAlias(underlying, underlying);

        for (uint256 i; i < aliases.length; ++i) {
            require(aliases[i] != address(0), "OVFL: alias is zero");
            _setUnderlyingAlias(aliases[i], underlying);
        }

        emit UnderlyingApproved(underlying, ovflToken, feeBps);
    }

    function setUnderlyingAlias(address token, address underlying) external onlyRole(ADMIN_ROLE) {
        require(token != address(0), "OVFL: alias token is zero");
        require(approvedUnderlying[underlying], "OVFL: underlying not approved");
        _setUnderlyingAlias(token, underlying);
        emit UnderlyingAliasSet(token, underlying);
    }

    function setUnderlyingFee(address underlying, uint16 feeBps) external onlyRole(ADMIN_ROLE) {
        require(approvedUnderlying[underlying], "OVFL: underlying not approved");
        require(feeBps <= FEE_MAX_BPS, "OVFL: fee >10%");
        feeBpsByUnderlying[underlying] = feeBps;
        emit FeeUpdated(underlying, feeBps);
    }

    // --- Timelock delay (self-timelocked) ---
    /// If current delay is 0, the queued change is instantaneous (eta = now).
    function queueSetTimelockDelay(uint256 newDelay) external onlyRole(ADMIN_ROLE) {
        require(newDelay >= MIN_DELAY_SECONDS && newDelay <= MAX_DELAY_SECONDS, "OVFL: delay bounds");
        require(!pendingDelay.queued, "OVFL: delay queued");
        uint256 wait = timelockDelaySeconds;
        pendingDelay = PendingTimelockDelay({queued: true, newDelay: newDelay, eta: block.timestamp + wait});
        emit TimelockDelayQueued(newDelay, pendingDelay.eta);
    }

    function executeSetTimelockDelay() external onlyRole(ADMIN_ROLE) {
        require(pendingDelay.queued, "OVFL: no delay queued");
        require(block.timestamp >= pendingDelay.eta, "OVFL: timelock not passed");
        timelockDelaySeconds = pendingDelay.newDelay;
        delete pendingDelay;
        emit TimelockDelayExecuted(timelockDelaySeconds);
    }

    // --- Timelocked market onboarding ---
    function queueAddMarket(address market, uint32 twapSeconds) external onlyRole(ADMIN_ROLE) {
        require(market != address(0), "OVFL: market is zero address");
        require(twapSeconds >= MIN_TWAP_DURATION && twapSeconds <= MAX_TWAP_DURATION, "OVFL: twap bounds");

        PendingMarket storage pend = pendingMarkets[market];
        require(!pend.queued, "OVFL: already queued");

        // Auto-enable timelock after first market (if not already set)
        bool isFirstMarket = (_approvedMarkets.length == 0 && timelockDelaySeconds == 0);

        if (isFirstMarket) {
            timelockDelaySeconds = MIN_DELAY_SECONDS; // Auto-set to minimum delay
            emit TimelockDelayExecuted(MIN_DELAY_SECONDS);
        }

        (address sy, , ) = IPendleMarket(market).readTokens();
        require(sy != address(0), "OVFL: unsupported underlying");

        address underlying = tokenToUnderlying[sy];

        if (underlying == address(0)) {
            try IStandardizedYield(sy).yieldToken() returns (address yieldTokenAddr) {
                if (yieldTokenAddr != address(0)) {
                    address mapped = tokenToUnderlying[yieldTokenAddr];
                    if (mapped != address(0)) {
                        underlying = mapped;
                    } else if (approvedUnderlying[yieldTokenAddr]) {
                        underlying = yieldTokenAddr;
                    }
                }
            } catch {}
        }

        if (underlying == address(0)) {
            try IStandardizedYield(sy).getTokensOut() returns (address[] memory outs) {
                for (uint256 i; i < outs.length; ++i) {
                    address candidate = outs[i];
                    if (candidate == address(0)) continue;
                    address mapped = tokenToUnderlying[candidate];
                    if (mapped != address(0)) {
                        underlying = mapped;
                        break;
                    }
                    if (approvedUnderlying[candidate]) {
                        underlying = candidate;
                        break;
                    }
                }
            } catch {}
        }

        require(underlying != address(0), "OVFL: unsupported underlying");
        require(approvedUnderlying[underlying], "OVFL: underlying not approved");

        _setUnderlyingAlias(sy, underlying);

        // Check TWAP compatibility with market oracle
        (bool increaseCardinalityRequired, uint16 cardinalityRequired, ) = pendleOracle.getOracleState(market, twapSeconds);

        if (increaseCardinalityRequired) {
            try IPendleMarket(market).increaseObservationsCardinalityNext(cardinalityRequired) {} catch {
                revert("OVFL: cannot increase oracle cardinality");
            }
        }

        // First market gets instant execution, subsequent markets use timelock delay
        uint256 wait = isFirstMarket ? 0 : timelockDelaySeconds;
        pend.queued = true;
        pend.twapDuration = twapSeconds;
        pend.eta = block.timestamp + wait;
        pend.underlying = underlying;

        emit MarketQueued(market, twapSeconds, pend.eta);
    }

    function executeAddMarket(address market) external onlyRole(ADMIN_ROLE) {
        PendingMarket storage pend = pendingMarkets[market];
        require(pend.queued, "OVFL: not queued");
        require(block.timestamp >= pend.eta, "OVFL: timelock not passed");

        _checkOracleReady(market, pend.twapDuration);

        SeriesInfo storage info = series[market];
        require(!info.approved, "OVFL: already added");

        (address sy, address pt, ) = IPendleMarket(market).readTokens();
        require(sy != address(0), "OVFL: unsupported underlying");

        address underlying = pend.underlying;
        require(underlying != address(0), "OVFL: underlying not approved");

        address ovflToken = underlyingToOvfl[underlying];
        require(ovflToken != address(0), "OVFL: ovfl token missing");

        uint256 expiry = IPendleMarket(market).expiry();
        info.approved = true;
        info.twapDurationFixed = pend.twapDuration;
        info.expiryCached = expiry;
        info.ptToken = pt;
        info.ovflToken = ovflToken;
        info.underlying = underlying;

        ptToMarket[pt] = market;

        _approvedMarkets.push(market);
        delete pendingMarkets[market];

        emit MarketApproved(market, pt, underlying, ovflToken, info.twapDurationFixed, expiry);
    }

    // --- Internal helpers ---
    function _setUnderlyingAlias(address token, address underlying) internal {
        address current = tokenToUnderlying[token];
        require(current == address(0) || current == underlying, "OVFL: alias conflict");
        tokenToUnderlying[token] = underlying;
    }

    function _checkOracleReady(address market, uint32 duration) internal view {
        (bool increaseCardinalityRequired, , bool oldestObservationSatisfied) =
            pendleOracle.getOracleState(market, duration);
        require(!increaseCardinalityRequired, "OVFL: oracle cardinality");
        require(oldestObservationSatisfied, "OVFL: oracle wait");
    }

    function _ensureAllowance(IERC20 token, address spender, uint256 needed) internal {
        if (token.allowance(address(this), spender) < needed) {
            token.approve(spender, type(uint256).max);
        }
    }

    // --- Deposit flow ---
    function deposit(address market, uint256 ptAmount)
        external
        nonReentrant
        returns (uint256 toUser, uint256 toStream, uint256 streamId)
    {
        SeriesInfo memory info = series[market];
        require(info.approved, "OVFL: market not approved");
        require(ptAmount >= MIN_PT_AMOUNT, "OVFL: amount < min PT");
        require(block.timestamp < info.expiryCached, "OVFL: matured");

        IERC20(info.ptToken).safeTransferFrom(msg.sender, address(this), ptAmount);

        uint256 rateE18 = pendleOracle.getPtToSyRate(market, info.twapDurationFixed);

        require(rateE18 <= 1e18, "OVFL: PT rate > par");
        require(rateE18 >= 0.5e18, "OVFL: PT rate too low");

        toUser = PRBMath.mulDiv(ptAmount, rateE18, 1e18);
        if (toUser > ptAmount) toUser = ptAmount;
        toStream = ptAmount - toUser;

        require(toStream > 0, "OVFL: nothing to stream");

        uint16 feeBps = feeBpsByUnderlying[info.underlying];
        uint256 feeAmount = feeBps == 0 ? 0 : PRBMath.mulDiv(toUser, feeBps, BASIS_POINTS);

        if (feeAmount > 0) {
            IERC20(info.underlying).safeTransferFrom(msg.sender, TREASURY_ADDR, feeAmount);
            emit FeeTaken(msg.sender, info.underlying, feeAmount);
        }

        OVFLETH ovflToken = OVFLETH(info.ovflToken);
        ovflToken.mint(msg.sender, toUser);
        ovflToken.mint(address(this), toStream);
        _ensureAllowance(IERC20(info.ovflToken), address(sablierLL), toStream);

        uint256 duration = info.expiryCached - block.timestamp;
        ISablierV2LockupLinear.CreateWithDurations memory p = ISablierV2LockupLinear.CreateWithDurations({
            sender: address(this),
            recipient: msg.sender,
            totalAmount: uint128(toStream),
            asset: IERC20(info.ovflToken),
            cancelable: false,
            transferable: true,
            durations: ISablierV2LockupLinear.Durations({cliff: 0, total: uint40(duration)}),
            broker: ISablierV2LockupLinear.Broker({account: address(0), fee: 0})
        });
        streamId = sablierLL.createWithDurations(p);
    }

    function claim(address ptToken, uint256 amount) external nonReentrant {
        address market = ptToMarket[ptToken];
        require(market != address(0), "OVFL: unknown PT");

        SeriesInfo memory info = series[market];
        require(info.approved, "OVFL: market not approved");
        require(block.timestamp >= info.expiryCached, "OVFL: not matured");
        require(amount > 0, "OVFL: amount is zero");

        uint256 vaultBalance = IERC20(ptToken).balanceOf(address(this));
        require(amount <= vaultBalance, "OVFL: insufficient PT reserves");

        OVFLETH(info.ovflToken).burn(msg.sender, amount);
        IERC20(ptToken).safeTransfer(msg.sender, amount);

        emit Claimed(msg.sender, market, ptToken, info.ovflToken, amount, amount);
    }

    // --- View ---
    function claimablePt(address ptToken) external view returns (uint256) {
        return IERC20(ptToken).balanceOf(address(this));
    }

    function getApprovedMarkets() external view returns (address[] memory) {
        return _approvedMarkets;
    }

    function approvedMarketsCount() external view returns (uint256) {
        return _approvedMarkets.length;
    }

    function previewRate(address market) external view returns (uint256 rateE18) {
        SeriesInfo memory info = series[market];
        require(info.approved, "OVFL: market not approved");
        rateE18 = pendleOracle.getPtToSyRate(market, info.twapDurationFixed);
    }

    function previewStream(address market, uint256 ptAmount)
        external
        view
        returns (uint256 toUser, uint256 toStream, uint256 rateE18)
    {
        SeriesInfo memory info = series[market];
        require(info.approved, "OVFL: market not approved");
        rateE18 = pendleOracle.getPtToSyRate(market, info.twapDurationFixed);
        toUser = PRBMath.mulDiv(ptAmount, rateE18, 1e18);
        if (toUser > ptAmount) toUser = ptAmount;
        toStream = ptAmount - toUser;
    }

    function ovflTokenForUnderlying(address underlying) external view returns (address) {
        return underlyingToOvfl[underlying];
    }

    function canonicalUnderlyingForToken(address token) external view returns (address) {
        return tokenToUnderlying[token];
    }
}
