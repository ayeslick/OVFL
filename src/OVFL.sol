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
import {IPendleMarket} from "../interfaces/IPendleMarket.sol";
import {IPendleOracle} from "../interfaces/IPendleOracle.sol";
import {IStandardizedYield} from "../interfaces/IStandardizedYield.sol";
import {ISablierV2LockupLinear} from "../interfaces/ISablierV2LockupLinear.sol";

contract OVFL is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Roles
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    // Timelock (self-timelocked delay; 0 => instant first-time changes)
    uint256 public timelockDelaySeconds; // 0 until first execute

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

    address public adminContract;
    mapping(address => uint256) public marketDepositLimits;
    mapping(address => uint256) public marketTotalDeposited;

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
    event MarketDepositLimitSet(address indexed market, uint256 limit);
    event AdminContractUpdated(address indexed adminContract);

    modifier onlyAdmin() {
        require(adminContract != address(0), "OVFL: admin not set");
        require(msg.sender == adminContract, "OVFL: not admin");
        _;
    }

    constructor(address admin, address treasury) {
        require(admin != address(0), "OVFL: admin is zero address");
        require(treasury != address(0), "OVFL: treasury is zero address");

        _grantRole(ADMIN_ROLE, admin);
        TREASURY_ADDR = treasury;
    }

    function setAdminContract(address newAdminContract) external onlyRole(ADMIN_ROLE) {
        require(newAdminContract != address(0), "OVFL: admin contract is zero address");
        adminContract = newAdminContract;
        emit AdminContractUpdated(newAdminContract);
    }

    function setApprovedUnderlying(
        address underlying,
        address ovflToken,
        uint16 feeBps,
        bool approved
    ) external onlyAdmin {
        approvedUnderlying[underlying] = approved;
        underlyingToOvfl[underlying] = approved ? ovflToken : address(0);
        feeBpsByUnderlying[underlying] = feeBps;
        if (approved) {
            emit UnderlyingApproved(underlying, ovflToken, feeBps);
        }
    }

    function setUnderlyingAlias(address token, address underlying) external onlyAdmin {
        tokenToUnderlying[token] = underlying;
        emit UnderlyingAliasSet(token, underlying);
    }

    function setUnderlyingAliasInternal(address token, address underlying) external onlyAdmin {
        tokenToUnderlying[token] = underlying;
    }

    function setUnderlyingFee(address underlying, uint16 feeBps) external onlyAdmin {
        feeBpsByUnderlying[underlying] = feeBps;
        emit FeeUpdated(underlying, feeBps);
    }

    function setTimelockDelayQueued(uint256 newDelay, uint256 eta) external onlyAdmin {
        pendingDelay = PendingTimelockDelay({queued: true, newDelay: newDelay, eta: eta});
        emit TimelockDelayQueued(newDelay, eta);
    }

    function setTimelockDelayExecuted(uint256 newDelay) external onlyAdmin {
        timelockDelaySeconds = newDelay;
        delete pendingDelay;
        emit TimelockDelayExecuted(newDelay);
    }

    function setMarketQueued(address market, uint32 twapDuration, uint256 eta, address underlying) external onlyAdmin {
        pendingMarkets[market] = PendingMarket({queued: true, twapDuration: twapDuration, eta: eta, underlying: underlying});
        emit MarketQueued(market, twapDuration, eta);
    }

    function setMarketApproved(
        address market,
        address pt,
        address underlying,
        address ovflToken,
        uint32 twapDuration,
        uint256 expiry
    ) external onlyAdmin {
        SeriesInfo storage info = series[market];
        info.approved = true;
        info.twapDurationFixed = twapDuration;
        info.expiryCached = expiry;
        info.ptToken = pt;
        info.ovflToken = ovflToken;
        info.underlying = underlying;

        ptToMarket[pt] = market;

        _approvedMarkets.push(market);
        delete pendingMarkets[market];

        emit MarketApproved(market, pt, underlying, ovflToken, twapDuration, expiry);
    }

    function setMarketDepositLimit(address market, uint256 limit) external onlyAdmin {
        marketDepositLimits[market] = limit;
        emit MarketDepositLimitSet(market, limit);
    }


    // --- Internal helpers ---
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

        uint256 currentDeposited = marketTotalDeposited[market];
        uint256 limit = marketDepositLimits[market];
        if (limit > 0) {
            require(currentDeposited + ptAmount <= limit, "OVFL: deposit limit exceeded");
        }

        IERC20(info.ptToken).safeTransferFrom(msg.sender, address(this), ptAmount);

        uint256 rateE18 = pendleOracle.getPtToSyRate(market, info.twapDurationFixed);

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

        marketTotalDeposited[market] = currentDeposited + ptAmount;
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

        uint256 currentDeposited = marketTotalDeposited[market];
        require(currentDeposited >= amount, "OVFL: deposit accounting");
        marketTotalDeposited[market] = currentDeposited - amount;

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
