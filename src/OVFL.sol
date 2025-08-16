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
 *
 * NOTE: No swap/buy logic here. One-click WETH->PT swap lives in an external "zapper"
 *       that acquires PT then calls deposit() and pays the fee.
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
        function pt() external view returns (address);
        function sy() external view returns (address);
        function expiry() external view returns (uint256);
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
        function getPtToAssetRate(address market, uint32 twapDuration) external view returns (uint256); 
    }

    interface IStandardizedYield { 
        function getTokensOut() external view returns (address[] memory); 
    }

    // -------- Sablier V2 Lockup Linear (minimal) --------
    interface ISablierV2LockupLinear {
        struct CreateWithDurations {
            address sender; 
            address recipient; 
            IERC20 asset; 
            uint128 totalAmount;
            uint40 startTime; 
            uint40 cliffDuration; 
            uint40 totalDuration; 
            bool cancelable; 
            bool transferable;
        }

        function createWithDurations(CreateWithDurations calldata params) external returns (uint256 streamId);
    }

contract OVFL is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address constant PENDLE_ROUTER_ADDR  = 0x1111111111111111111111111111111111111111;
    address constant PENDLE_ORACLE_ADDR  = 0x2222222222222222222222222222222222222222;
    address constant SABLIER_LINEAR_ADDR = 0x3333333333333333333333333333333333333333;
    address constant WETH_ADDR           = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address private TREASURY_ADDR        = address(this); // immutable fee recipient

    // Roles
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
     // Redemption pool
    uint256 public settledWeth;      // WETH available for claims
    uint256 public totalClaimed;     // WETH already paid out
    // Adjustable dust tolerance 
    uint256 public dustTolerance = 1; // in wei
     // Timelock (self-timelocked delay; 0 => instant first-time changes)
    uint256 public timelockDelaySeconds; // 0 until first execute
    
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
    mapping(address=>PendingMarket) public pendingMarkets;
    
    // Immutables (wired from chain constants)
    IPendleRouter public immutable pendleRouter = IPendleRouter(PENDLE_ROUTER_ADDR);
    IPendleOracle public immutable pendleOracle = IPendleOracle(PENDLE_ORACLE_ADDR);
    ISablierV2LockupLinear public immutable sablierLL = ISablierV2LockupLinear(SABLIER_LINEAR_ADDR);
    IERC20 public immutable WETH = IERC20(WETH_ADDR);
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

    constructor(address admin) {

        // Set admin
        require(admin != address(0), "OVFL: admin is zero address");
        _grantRole(ADMIN_ROLE, admin);

        // Deploy ovflETH and hand ownership to this contract
        ovflETH = new OVFLETH();
        ovflETH.transferOwnership(address(this));
    }

     // --- Admin: fee bps only (treasury is immutable) ---
    function setFee(uint16 newFeeBps) external onlyRole(ADMIN_ROLE) {
        require(newFeeBps <= 1_000, "fee >10%");
        feeBps = newFeeBps;
        emit FeeUpdated(newFeeBps, TREASURY_ADDR);
    }

    // --- Admin: adjustable dust tolerance (no timelock) ---
    function setDustTolerance(uint256 newDust) external onlyRole(ADMIN_ROLE) {
        uint256 old = dustTolerance;
        dustTolerance = newDust;
        emit DustToleranceUpdated(old, newDust);
    }

    // --- Timelock delay (self-timelocked) ---
    /// If current delay is 0, the queued change is instantaneous (eta = now).
    function queueSetTimelockDelay(uint256 newDelay) external onlyRole(ADMIN_ROLE) {
        require(newDelay >= 1 hours && newDelay <= 7 days, "delay bounds");
        require(!pendingDelay.queued, "delay queued");
        uint256 wait = (timelockDelaySeconds == 0) ? 0 : timelockDelaySeconds;
        pendingDelay = PendingTimelockDelay({queued: true, newDelay: newDelay, eta: block.timestamp + wait});
        emit TimelockDelayQueued(newDelay, pendingDelay.eta);
    }
    function executeSetTimelockDelay() external onlyRole(ADMIN_ROLE) {
        require(pendingDelay.queued, "no delay queued");
        require(block.timestamp >= pendingDelay.eta, "timelock not passed");
        timelockDelaySeconds = pendingDelay.newDelay;
        delete pendingDelay;
        emit TimelockDelayExecuted(timelockDelaySeconds);
    }

    // --- Timelocked market onboarding ---
    function queueAddMarket(address market, uint32 twapSeconds) external onlyRole(ADMIN_ROLE) {
        require(market != address(0), "market=0");
        require(twapSeconds > 0, "bad twap");

        PendingMarket storage pend = pendingMarkets[market];
        require(!pend.queued, "already queued");

        // Check SY→WETH redeemability once (here)
        address sy = IPendleMarket(market).sy();
        bool wethOk;
        {
            address[] memory outs = IStandardizedYield(sy).getTokensOut();
            for (uint256 i; i < outs.length; ++i) if (outs[i] == address(WETH)) { wethOk = true; break; }
        }
        require(wethOk, "SY cannot redeem to WETH");

        uint256 wait = timelockDelaySeconds; // 0 => instant first-time onboarding
        pend.queued = true;
        pend.twapDuration = twapSeconds;
        pend.eta = block.timestamp + wait;

        emit MarketQueued(market, twapSeconds, pend.eta);
    }

    function executeAddMarket(address market) external onlyRole(ADMIN_ROLE) {
        PendingMarket storage pend = pendingMarkets[market];
        require(pend.queued, "not queued");
        require(block.timestamp >= pend.eta, "timelock not passed");

        SeriesInfo storage info = series[market];
        require(!info.approved, "already added");

        uint256 expiry = IPendleMarket(market).expiry(); // cache (no SY→WETH recheck)
        info.approved = true;
        info.twapDurationFixed = pend.twapDuration;
        info.expiryCached = expiry;

        _approvedMarkets.push(market);
        delete pendingMarkets[market];

        emit MarketApproved(market, true, info.twapDurationFixed, expiry);
    }

}
