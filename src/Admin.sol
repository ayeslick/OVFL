// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {OVFL} from "./OVFL.sol";
import {OVFLETH} from "./OVFLETH.sol";
import {IPendleMarket} from "../interfaces/IPendleMarket.sol";
import {IPendleOracle} from "../interfaces/IPendleOracle.sol";
import {IStandardizedYield} from "../interfaces/IStandardizedYield.sol";

contract Admin is AccessControl {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;

    uint256 public constant FEE_MAX_BPS = 100;
    uint256 public constant MIN_DELAY_SECONDS = 1 hours;
    uint256 public constant MAX_DELAY_SECONDS = 2 days;
    uint256 public constant MIN_TWAP_DURATION = 15 minutes;
    uint256 public constant MAX_TWAP_DURATION = 30 minutes;

    OVFL public ovfl;
    PendingOVFL public pendingOVFL;
    IPendleOracle public constant pendleOracle = IPendleOracle(0x9a9Fa8338dd5E5B2188006f1Cd2Ef26d921650C2);

    // Timelock state (moved from OVFL)
    uint256 public timelockDelaySeconds;
    PendingTimelockDelay public pendingDelay;

    // Market queue (moved from OVFL)
    mapping(address => PendingMarket) public pendingMarkets;
    address[] private _approvedMarkets;

    // Underlying management (moved from OVFL)
    mapping(address => bool) public approvedUnderlying;
    mapping(address => address) public underlyingToOvfl;
    mapping(address => address) public tokenToUnderlying;
    mapping(address => uint16) public feeBpsByUnderlying;

    // Structs (moved from OVFL)
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

    struct PendingOVFL {
        bool queued;
        address newOVFL;
        uint256 eta;
    }

    // Events (moved from OVFL)
    event OVFLQueued(address indexed ovflAddress, uint256 eta);
    event OVFLAddressSet(address indexed ovflAddress);
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

    constructor(address admin) {
        require(admin != address(0), "Admin: admin is zero address");
        _grantRole(ADMIN_ROLE, admin);
    }

    function queueSetOVFL(address ovflAddress) external onlyRole(ADMIN_ROLE) {
        require(ovflAddress != address(0), "Admin: ovfl is zero address");
        require(!pendingOVFL.queued, "Admin: ovfl already queued");

        // First time setup is instant
        if (address(ovfl) == address(0)) {
            ovfl = OVFL(ovflAddress);
            emit OVFLAddressSet(ovflAddress);
            return;
        }

        uint256 eta = block.timestamp + timelockDelaySeconds;
        pendingOVFL = PendingOVFL({queued: true, newOVFL: ovflAddress, eta: eta});
        emit OVFLQueued(ovflAddress, eta);
    }

    function executeSetOVFL() external onlyRole(ADMIN_ROLE) {
        require(pendingOVFL.queued, "Admin: no ovfl queued");
        require(block.timestamp >= pendingOVFL.eta, "Admin: timelock not passed");

        ovfl = OVFL(pendingOVFL.newOVFL);
        emit OVFLAddressSet(pendingOVFL.newOVFL);
        delete pendingOVFL;
    }

    function approveUnderlying(
        address underlying,
        string calldata name,
        string calldata symbol,
        uint16 feeBps,
        address[] calldata aliases
    ) external onlyRole(ADMIN_ROLE) {
        require(underlying != address(0), "Admin: underlying is zero");
        require(feeBps <= FEE_MAX_BPS, "Admin: fee >10%");

        address ovflToken = underlyingToOvfl[underlying];
        if (ovflToken == address(0)) {
            OVFLETH token = new OVFLETH(name, symbol);
            token.transferOwnership(address(ovfl));
            ovflToken = address(token);
        }

        _setAliasInternal(underlying, underlying);

        for (uint256 i; i < aliases.length; ++i) {
            address aliasToken = aliases[i];
            require(aliasToken != address(0), "Admin: alias is zero");
            _setAliasInternal(aliasToken, underlying);
        }

        approvedUnderlying[underlying] = true;
        underlyingToOvfl[underlying] = ovflToken;
        feeBpsByUnderlying[underlying] = feeBps;
        emit UnderlyingApproved(underlying, ovflToken, feeBps);
    }

    function setUnderlyingAlias(address token, address underlying) external onlyRole(ADMIN_ROLE) {
        require(token != address(0), "Admin: alias token is zero");
        require(approvedUnderlying[underlying], "Admin: underlying not approved");

        address current = tokenToUnderlying[token];
        require(current == address(0) || current == underlying, "Admin: alias conflict");

        tokenToUnderlying[token] = underlying;
        emit UnderlyingAliasSet(token, underlying);
    }

    function setUnderlyingFee(address underlying, uint16 feeBps) external onlyRole(ADMIN_ROLE) {
        require(approvedUnderlying[underlying], "Admin: underlying not approved");
        require(feeBps <= FEE_MAX_BPS, "Admin: fee >10%");

        feeBpsByUnderlying[underlying] = feeBps;
        emit FeeUpdated(underlying, feeBps);
    }

    function queueSetTimelockDelay(uint256 newDelay) external onlyRole(ADMIN_ROLE) {
        require(newDelay >= MIN_DELAY_SECONDS && newDelay <= MAX_DELAY_SECONDS, "Admin: delay bounds");
        require(!pendingDelay.queued, "Admin: delay queued");

        uint256 wait = timelockDelaySeconds;
        uint256 eta = block.timestamp + wait;
        pendingDelay = PendingTimelockDelay({queued: true, newDelay: newDelay, eta: eta});
        emit TimelockDelayQueued(newDelay, eta);
    }

    function executeSetTimelockDelay() external onlyRole(ADMIN_ROLE) {
        require(pendingDelay.queued, "Admin: no delay queued");
        require(block.timestamp >= pendingDelay.eta, "Admin: timelock not passed");

        timelockDelaySeconds = pendingDelay.newDelay;
        emit TimelockDelayExecuted(pendingDelay.newDelay);
        delete pendingDelay;
    }

    function queueAddMarket(address market, uint32 twapSeconds) external onlyRole(ADMIN_ROLE) {
        require(market != address(0), "Admin: market is zero address");
        require(twapSeconds >= MIN_TWAP_DURATION && twapSeconds <= MAX_TWAP_DURATION, "Admin: twap bounds");

        require(!pendingMarkets[market].queued, "Admin: already queued");

        bool isFirstMarket = (_approvedMarkets.length == 0 && timelockDelaySeconds == 0);

        if (isFirstMarket) {
            timelockDelaySeconds = MIN_DELAY_SECONDS;
            emit TimelockDelayExecuted(MIN_DELAY_SECONDS);
        }

        (address sy,,) = IPendleMarket(market).readTokens();
        require(sy != address(0), "Admin: unsupported underlying");

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

        require(underlying != address(0), "Admin: unsupported underlying");
        require(approvedUnderlying[underlying], "Admin: underlying not approved");

        _setAliasInternal(sy, underlying);

        (bool increaseCardinalityRequired, uint16 cardinalityRequired,) = pendleOracle.getOracleState(market, twapSeconds);

        if (increaseCardinalityRequired) {
            try IPendleMarket(market).increaseObservationsCardinalityNext(cardinalityRequired) {} catch {
                revert("Admin: cannot increase oracle cardinality");
            }
        }

        uint256 wait = isFirstMarket ? 0 : timelockDelaySeconds;
        uint256 eta = block.timestamp + wait;

        pendingMarkets[market] = PendingMarket({queued: true, twapDuration: twapSeconds, eta: eta, underlying: underlying});
        emit MarketQueued(market, twapSeconds, eta);
    }

    function executeAddMarket(address market) external onlyRole(ADMIN_ROLE) {
        PendingMarket memory pending = pendingMarkets[market];
        require(pending.queued, "Admin: not queued");
        require(block.timestamp >= pending.eta, "Admin: timelock not passed");

        _checkOracleReady(market, pending.twapDuration);

        (bool approved,,,,,,) = ovfl.series(market);
        require(!approved, "Admin: already added");

        (address sy, address pt,) = IPendleMarket(market).readTokens();
        require(sy != address(0), "Admin: unsupported underlying");

        require(pending.underlying != address(0), "Admin: underlying not approved");

        address ovflToken = underlyingToOvfl[pending.underlying];
        require(ovflToken != address(0), "Admin: ovfl token missing");

        uint256 expiry = IPendleMarket(market).expiry();
        uint16 feeBps = feeBpsByUnderlying[pending.underlying];

        ovfl.setSeriesApproved(market, pt, pending.underlying, ovflToken, pending.twapDuration, expiry, feeBps);

        _approvedMarkets.push(market);
        delete pendingMarkets[market];

        emit MarketApproved(market, pt, pending.underlying, ovflToken, pending.twapDuration, expiry);
    }

    function setMarketDepositLimit(address market, uint256 limit) external onlyRole(ADMIN_ROLE) {
        require(market != address(0), "Admin: market is zero address");
        uint256 currentDeposited = ovfl.marketTotalDeposited(market);
        if (limit > 0) {
            require(limit >= currentDeposited, "Admin: limit below current deposits");
        }

        ovfl.setMarketDepositLimit(market, limit);
        emit MarketDepositLimitSet(market, limit);
    }

    function setMinPtAmount(uint256 newMin) external onlyRole(ADMIN_ROLE) {
        ovfl.setMinPtAmount(newMin);
    }

    function _setAliasInternal(address token, address underlying) internal {
        address current = tokenToUnderlying[token];
        require(current == address(0) || current == underlying, "Admin: alias conflict");
        tokenToUnderlying[token] = underlying;
    }

    // View functions
    function getApprovedMarkets() external view returns (address[] memory) {
        return _approvedMarkets;
    }

    function approvedMarketsCount() external view returns (uint256) {
        return _approvedMarkets.length;
    }

    function ovflTokenForUnderlying(address underlying) external view returns (address) {
        return underlyingToOvfl[underlying];
    }

    function canonicalUnderlyingForToken(address token) external view returns (address) {
        return tokenToUnderlying[token];
    }

    function _checkOracleReady(address market, uint32 duration) internal view {
        (bool increaseCardinalityRequired,, bool oldestObservationSatisfied) = pendleOracle.getOracleState(market, duration);
        require(!increaseCardinalityRequired, "Admin: oracle cardinality");
        require(oldestObservationSatisfied, "Admin: oracle wait");
    }
}


