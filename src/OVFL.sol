// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

/**
 * Pendle Basket (PT-only) Vault with ovflETH wrapper, market-value fee on PT deposits,
 * per-market fixed TWAP (duration), timelocked market onboarding (self-timelocked delay),
 * PUBLIC settlement with adjustable dust guard (no slippage semantics),
 * Sablier V2 Lockup Linear streaming for the “excess”, duration-based Oracle pricing,
 * and an approved-markets registry.
 *
 * Core flows:
 * - wrap: WETH -> ovflETH at 1:1, credits settledWeth (immediate redeemability).
 * - deposit: user supplies PT pre-maturity; fee on MARKET VALUE (in WETH); must create a stream.
 * - settleMarket: public; after maturity; redeem PT->WETH ~1:1 with tiny dust guard.
 * - claim: burn pETH, withdraw WETH from the settled pool.
 */

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PRBMath} from "prb-math/PRBMath.sol";
import {OVFLETH} from "./OVFLETH.sol";

// -------- Pendle minimal --------
    interface IPendleMarket {
        function expiry() external view returns (uint256);

        function readTokens()
        external
        view
        returns (
            address _SY,
            address _PT,
            address _YT
        );
    }

    interface IPYieldToken {
        function redeemPY(address receiver) external returns (uint256 amountSyOut);
        function isExpired() external view returns (bool);
    }

    interface IPendleRouter {

        struct SwapData { 
            bytes data; 
        }

        struct TokenOutput {
            address tokenOut; 
            uint256 minTokenOut; 
            address tokenRedeemSy; 
            address pendleSwap; 
            SwapData swapData;
        }

        function redeemPyToToken(address receiver, address ytOrMarket, TokenOutput calldata out) external returns (uint256);
    }

    interface IPendleOracle { 
        function getPtToSyRate(address market, uint32 twapDuration) external view returns (uint256); 
        function getOracleState(address market, uint32 duration) external view returns (bool, uint16, bool);
    }

    interface IStandardizedYield { 
        function getTokensOut() external view returns (address[] memory);

        function redeem(address receiver, uint256 shares, address tokenOut, uint256 minTokenOut, bool burnFromInternalBalance) 
            external returns (uint256);
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
     // Redemption pool
    uint256 public settledAsset;      // WETH available for claims
    uint256 public totalClaimed;     // WETH already paid out
     // Timelock (self-timelocked delay; 0 => instant first-time changes)
    uint256 public timelockDelaySeconds; // 0 until first execute

    uint256 public constant FEE_MAX_BPS = 1_000; // 10% max
    uint256 public constant MIN_DELAY_SECONDS = 1 hours;
    uint256 public constant MAX_DELAY_SECONDS = 7 days;
    uint256 public constant MIN_TWAP_DURATION = 15 minutes;
    uint256 public constant MAX_TWAP_DURATION = 30 minutes;
    uint256 public constant BASIS_POINTS = 10_000;

    uint256 public constant MIN_PT_AMOUNT = 100000000000000000; // 0.1 PT
    
    PendingTimelockDelay public pendingDelay;
    // Fees
    uint16  public feeBps = 300; // 3% (applies on MARKET VALUE in WETH)

    address[] private _approvedMarkets;

    // Market state
    struct SeriesInfo {
        bool    approved;            // set at executeAddMarket()
        bool    settled;             // after PT->WETH redemption
        uint32  twapDurationFixed;   // frozen on add
        uint256 ptBalance;           // PT held by vault
        uint256 expiryCached;        // cached on add
    }
    struct PendingMarket { 
        bool queued; 
        uint32 twapDuration; 
        uint256 eta; 
    }

    struct PendingTimelockDelay { 
        bool queued; 
        uint256 newDelay; 
        uint256 eta; 
    }

    // Market state
    mapping(address => SeriesInfo) public series;
    mapping(address => PendingMarket) public pendingMarkets;

    
    address private TREASURY_ADDR; // immutable fee recipient
    
    IPendleOracle public immutable pendleOracle = IPendleOracle(0x9a9Fa8338dd5E5B2188006f1Cd2Ef26d921650C2);
    ISablierV2LockupLinear public immutable sablierLL = ISablierV2LockupLinear(0x3962f6585946823440d274aD7C719B02b49DE51E);
    IERC20 public immutable WSTETH = IERC20(0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0);
    OVFLETH public immutable ovflETH;

    // Events
    event FeeTaken(address indexed payer, address indexed token, uint256 amount);
    event Settled(address indexed market, uint256 redeemedWeth);
    event Claimed(address indexed user, uint256 burned, uint256 wethOut);
    event MarketQueued(address indexed market, uint32 twapSeconds, uint256 eta);
    event MarketApproved(address indexed market, bool approved, uint32 twapSeconds, uint256 expiry);
    event FeeUpdated(uint16 feeBps, address treasury);
    event TimelockDelayQueued(uint256 newDelay, uint256 eta);
    event TimelockDelayExecuted(uint256 newDelay);
    event DustToleranceUpdated(uint256 oldDust, uint256 newDust);

    constructor(address admin, address treasury) {

        // Set admin
        require(admin != address(0), "OVFL: admin is zero address");
        _grantRole(ADMIN_ROLE, admin);

        // Set treasury
        require(treasury != address(0), "OVFL: treasury is zero address");
        TREASURY_ADDR = treasury;

        // Deploy ovflETH and hand ownership to this contract
        ovflETH = new OVFLETH();
        ovflETH.transferOwnership(address(this));

    }

     // --- Admin: fee bps only (treasury is immutable) ---
    function setFee(uint16 newFeeBps) external onlyRole(ADMIN_ROLE) {
        require(newFeeBps <= FEE_MAX_BPS, "OVFL: fee >10%");
        feeBps = newFeeBps;
        emit FeeUpdated(newFeeBps, TREASURY_ADDR);
    }

    // --- Timelock delay (self-timelocked) ---
    /// If current delay is 0, the queued change is instantaneous (eta = now).
    function queueSetTimelockDelay(uint256 newDelay) external onlyRole(ADMIN_ROLE) {
        require(newDelay >= MIN_DELAY_SECONDS && newDelay <= MAX_DELAY_SECONDS, "OVFL: delay bounds");
        require(!pendingDelay.queued, "OVFL: delay queued");
        uint256 wait = (timelockDelaySeconds == 0) ? 0 : timelockDelaySeconds;
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

        // Check SY→WETH redeemability once (here)
        (address sy, , ) = IPendleMarket(market).readTokens();
        bool wethOk;
        {
            address[] memory outs = IStandardizedYield(sy).getTokensOut();
            for (uint256 i; i < outs.length; ++i) {
                if (outs[i] == address(WSTETH)) { 
                    wethOk = true;
                     break; 
                }
            }
        }
        require(wethOk, "OVFL: SY cannot redeem to WETH");

        uint256 wait = timelockDelaySeconds; // 0 => instant first-time onboarding
        pend.queued = true;
        pend.twapDuration = twapSeconds;
        pend.eta = block.timestamp + wait;

        emit MarketQueued(market, twapSeconds, pend.eta);
    }

    function executeAddMarket(address market) external onlyRole(ADMIN_ROLE) {
        PendingMarket storage pend = pendingMarkets[market];
        require(pend.queued, "OVFL: not queued");
        require(block.timestamp >= pend.eta, "OVFL: timelock not passed");

        _checkOracleReady(market, pend.twapDuration);

        SeriesInfo storage info = series[market];
        require(!info.approved, "OVFL: already added");

        uint256 expiry = IPendleMarket(market).expiry(); // cache (no SY→WETH recheck)
        info.approved = true;
        info.twapDurationFixed = pend.twapDuration;
        info.expiryCached = expiry;

        _approvedMarkets.push(market);
        delete pendingMarkets[market];

        emit MarketApproved(market, true, info.twapDurationFixed, expiry);
    }

    // --- Internal helper ---
    function _checkOracleReady(address market, uint32 duration) internal view {
        (bool increaseCardinalityRequired, , bool oldestObservationSatisfied) = pendleOracle.getOracleState(market, duration);
        require(!increaseCardinalityRequired, "OVFL: oracle cardinality");
        require(oldestObservationSatisfied, "OVFL: oracle wait");
    }

    function _ensureAllowance(IERC20 token, address spender, uint256 needed) internal {
        if (token.allowance(address(this), spender) < needed) {
            token.approve(spender, type(uint256).max);
        }
    }

    // --- Wrap 1:1 ---
    function wrap(uint256 amount, address to) external nonReentrant {
        require(to != address(0), "OVFL: to is zero address");
        require(amount > 0, "OVFL: amount is zero");
        WSTETH.safeTransferFrom(msg.sender, address(this), amount);
        settledAsset += amount; // back new ovflETH 1:1
        ovflETH.mint(to, amount);
    }

     function deposit(address market, uint256 ptAmount)
        external
        nonReentrant
        returns (uint256 toUser, uint256 toStream, uint256 streamId)
    {
        SeriesInfo storage info = series[market];
        SeriesInfo memory memInfo = info;
        // Check market is approved
        require(memInfo.approved, "OVFL: market not approved");
        require(ptAmount >= MIN_PT_AMOUNT, "OVFL: amount is less than 1 PT");
        require(block.timestamp < memInfo.expiryCached, "OVFL: matured");

        // Pull PTs and update holdings
        ( , address pt, ) = IPendleMarket(market).readTokens();
        IERC20(pt).safeTransferFrom(msg.sender, address(this), ptAmount);
        info.ptBalance += ptAmount; // update PT balance using storage pointer

        uint256 rateE18 = pendleOracle.getPtToSyRate(market, memInfo.twapDurationFixed);

        require(rateE18 <= 1e18, "OVFL: PT rate cannot exceed par");
        require(rateE18 >= 0.5e18, "OVFL: PT rate too low"); // Adjust bounds appropriately

        toUser   = PRBMath.mulDiv(ptAmount, rateE18, 1e18);
        if (toUser > ptAmount) toUser = ptAmount;
        toStream = ptAmount - toUser;

        require(toStream > 0, "OVFL: nothing to stream");

        uint256 feeAmount = PRBMath.mulDiv(toUser, feeBps, BASIS_POINTS);

        if (feeAmount > 0) {
            IERC20(WSTETH).safeTransferFrom(msg.sender, TREASURY_ADDR, feeAmount);
            emit FeeTaken(msg.sender, address(WSTETH), feeAmount);
        }

        ovflETH.mint(msg.sender, toUser);
        ovflETH.mint(address(this), toStream);
        _ensureAllowance(IERC20(address(ovflETH)), address(sablierLL), toStream);

        uint256 duration = memInfo.expiryCached - block.timestamp; 
        ISablierV2LockupLinear.CreateWithDurations memory p = ISablierV2LockupLinear.CreateWithDurations({
            sender: address(this),
            recipient: msg.sender,
            totalAmount: uint128(toStream),
            asset: IERC20(address(ovflETH)),
            cancelable: false,
            transferable: true,
            durations: ISablierV2LockupLinear.Durations({
                cliff: 0,
                total: uint40(duration)
            }),
            broker: ISablierV2LockupLinear.Broker({
                account: address(0),
                fee: 0
            })
        });
        streamId = sablierLL.createWithDurations(p);
    }

    function settleMarket(address market) external nonReentrant {
        SeriesInfo storage info = series[market];
        require(info.approved, "OVFL: market not approved");
        require(!info.settled, "OVFL: already settled");
        require(info.ptBalance > 0, "OVFL: no PT");
        require(block.timestamp >= info.expiryCached, "OVFL: not matured");

        uint256 ptAmount = info.ptBalance;
        
        // Get PT, SY, and YT contracts from market
        (address sy, address pt, address yt) = IPendleMarket(market).readTokens();
        
        // Verify YT is actually expired
        require(IPYieldToken(yt).isExpired(), "OVFL: YT not expired");

        // Post-maturity redemption: PT -> YT contract -> SY -> wstETH
        
        // Step 1: Transfer PT to YT contract and redeem to SY
        uint256 syBalanceBefore = IERC20(sy).balanceOf(address(this));
        IERC20(pt).safeTransfer(address(yt), ptAmount);
        uint256 syReceived = IPYieldToken(yt).redeemPY(address(this));
        
        // Verify we received the expected SY
        require(IERC20(sy).balanceOf(address(this)) - syBalanceBefore >= syReceived, "OVFL: SY mismatch");
        
        // Step 2: Redeem SY to wstETH
        uint256 wethBefore = IERC20(WSTETH).balanceOf(address(this));
        _ensureAllowance(IERC20(sy), sy, syReceived);
        IStandardizedYield(sy).redeem(address(this), syReceived, address(WSTETH), 0, false);
        uint256 redeemed = IERC20(WSTETH).balanceOf(address(this)) - wethBefore;        

        info.settled = true;
        info.ptBalance = 0;
        settledAsset += redeemed;

        emit Settled(market, redeemed);
    }

    function claim(uint256 amount) external nonReentrant {
        uint256 claimableNow = settledAsset - totalClaimed;
        require(amount > 0 && amount <= claimableNow, "OVFL: insufficient settled");
        ovflETH.burn(msg.sender, amount);
        totalClaimed += amount;
        IERC20(WSTETH).safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount, amount);
    }

    // --- View ---
    function claimable() external view returns (uint256) {
        return settledAsset - totalClaimed;
    }

      // --- Approved markets views ---
    function getApprovedMarkets() external view returns (address[] memory) { 
        return _approvedMarkets; 
    }

    function approvedMarketsCount() external view returns (uint256) { 
        return _approvedMarkets.length; 
    }

    // --- Previews (duration-based pricing, no swap previews here) ---
    function previewRate(address market) external view returns (uint256 rateE18) {
        SeriesInfo storage info = series[market]; require(info.approved, "market not approved");
        rateE18 = pendleOracle.getPtToSyRate(market, info.twapDurationFixed);
    }

    function previewStream(address market, uint256 ptAmount)
        external view returns (uint256 toUser, uint256 toStream, uint256 rateE18)
    {
        SeriesInfo storage info = series[market]; require(info.approved, "market not approved");
        rateE18 = pendleOracle.getPtToSyRate(market, info.twapDurationFixed);
        toUser  = PRBMath.mulDiv(ptAmount, rateE18, 1e18);
        if (toUser > ptAmount) toUser = ptAmount;
        toStream = ptAmount - toUser;
    }
}
