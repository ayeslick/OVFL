// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

/**
 * Pendle Basket (PT-only) Vault with per-underlying ovfl tokens, market-value fees on PT deposits,
 * per-market fixed TWAP (duration), timelocked market onboarding (self-timelocked delay),
 * Sablier V2 Lockup Linear streaming for the "excess", duration-based Oracle pricing,
 * and an approved-markets registry.
 *
 * Core flows:
 * - deposit: user supplies PT pre-maturity; fee on MARKET VALUE (in canonical underlying); creates a stream.
 * - claim: once matured, burn ovfl tokens to withdraw the corresponding PTs for settlement elsewhere.
 */

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PRBMath} from "prb-math/PRBMath.sol";
import {OVFLETH} from "./OVFLETH.sol";
import {IPendleOracle} from "../interfaces/IPendleOracle.sol";
import {ISablierV2LockupLinear} from "../interfaces/ISablierV2LockupLinear.sol";

contract OVFL is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public minPtAmount = 0.01 ether;

    address private immutable TREASURY_ADDR;
    address public adminContract;

    // Market state - the only state OVFL needs for deposit/claim
    struct SeriesInfo {
        bool approved;
        uint32 twapDurationFixed;
        uint16 feeBps;
        uint256 expiryCached;
        address ptToken;
        address ovflToken;
        address underlying;
    }

    mapping(address => SeriesInfo) public series;
    mapping(address => address) public ptToMarket;
    mapping(address => uint256) public marketDepositLimits;
    mapping(address => uint256) public marketTotalDeposited;

    IPendleOracle public immutable pendleOracle = IPendleOracle(0x9a9Fa8338dd5E5B2188006f1Cd2Ef26d921650C2);
    ISablierV2LockupLinear public immutable sablierLL = ISablierV2LockupLinear(0x3962f6585946823440d274aD7C719B02b49DE51E);

    // Events - only what's needed for core operations
    event FeeTaken(address indexed payer, address indexed token, uint256 amount);
    event Claimed(
        address indexed user,
        address indexed market,
        address indexed ptToken,
        address ovflToken,
        uint256 burnedAmount,
        uint256 ptOut
    );
    event AdminContractUpdated(address indexed adminContract);

    modifier onlyAdmin() {
        require(adminContract != address(0), "OVFL: admin not set");
        require(msg.sender == adminContract, "OVFL: not admin");
        _;
    }

    constructor(address admin, address treasury) {
        require(admin != address(0), "OVFL: admin is zero address");
        require(treasury != address(0), "OVFL: treasury is zero address");

        adminContract = admin;
        TREASURY_ADDR = treasury;
    }

    function setAdminContract(address newAdminContract) external onlyAdmin {
        require(newAdminContract != address(0), "OVFL: admin contract is zero address");
        adminContract = newAdminContract;
        emit AdminContractUpdated(newAdminContract);
    }

    function setSeriesApproved(
        address market,
        address pt,
        address underlying,
        address ovflToken,
        uint32 twapDuration,
        uint256 expiry,
        uint16 feeBps
    ) external onlyAdmin {
        SeriesInfo storage info = series[market];
        info.approved = true;
        info.twapDurationFixed = twapDuration;
        info.feeBps = feeBps;
        info.expiryCached = expiry;
        info.ptToken = pt;
        info.ovflToken = ovflToken;
        info.underlying = underlying;

        ptToMarket[pt] = market;
    }

    function setMarketDepositLimit(address market, uint256 limit) external onlyAdmin {
        marketDepositLimits[market] = limit;
    }

    function setMinPtAmount(uint256 newMin) external onlyAdmin {
        minPtAmount = newMin;
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
        require(ptAmount >= minPtAmount, "OVFL: amount < min PT");
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

        uint256 feeAmount = info.feeBps == 0 ? 0 : PRBMath.mulDiv(toUser, info.feeBps, BASIS_POINTS);

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
}
