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
    event OVFLAddressSet(address indexed ovflAddress);
    IPendleOracle public constant pendleOracle = IPendleOracle(0x9a9Fa8338dd5E5B2188006f1Cd2Ef26d921650C2);

    constructor(address admin) {
        require(admin != address(0), "Admin: admin is zero address");
        _grantRole(ADMIN_ROLE, admin);
    }

    function setOVFL(address ovflAddress) external onlyRole(ADMIN_ROLE) {
        require(ovflAddress != address(0), "Admin: ovfl is zero address");
        ovfl = OVFL(ovflAddress);
        emit OVFLAddressSet(ovflAddress);
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

        address ovflToken = ovfl.underlyingToOvfl(underlying);
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

        ovfl.setApprovedUnderlying(underlying, ovflToken, feeBps, true);
    }

    function setUnderlyingAlias(address token, address underlying) external onlyRole(ADMIN_ROLE) {
        require(token != address(0), "Admin: alias token is zero");
        require(ovfl.approvedUnderlying(underlying), "Admin: underlying not approved");

        address current = ovfl.canonicalUnderlyingForToken(token);
        require(current == address(0) || current == underlying, "Admin: alias conflict");

        ovfl.setUnderlyingAlias(token, underlying);
    }

    function setUnderlyingFee(address underlying, uint16 feeBps) external onlyRole(ADMIN_ROLE) {
        require(ovfl.approvedUnderlying(underlying), "Admin: underlying not approved");
        require(feeBps <= FEE_MAX_BPS, "Admin: fee >10%");

        ovfl.setUnderlyingFee(underlying, feeBps);
    }

    function queueSetTimelockDelay(uint256 newDelay) external onlyRole(ADMIN_ROLE) {
        require(newDelay >= MIN_DELAY_SECONDS && newDelay <= MAX_DELAY_SECONDS, "Admin: delay bounds");
        (bool queued,,) = ovfl.pendingDelay();
        require(!queued, "Admin: delay queued");

        uint256 wait = ovfl.timelockDelaySeconds();
        uint256 eta = block.timestamp + wait;
        ovfl.setTimelockDelayQueued(newDelay, eta);
    }

    function executeSetTimelockDelay() external onlyRole(ADMIN_ROLE) {
        (bool queued, uint256 newDelay, uint256 eta) = ovfl.pendingDelay();
        require(queued, "Admin: no delay queued");
        require(block.timestamp >= eta, "Admin: timelock not passed");

        ovfl.setTimelockDelayExecuted(newDelay);
    }

    function queueAddMarket(address market, uint32 twapSeconds) external onlyRole(ADMIN_ROLE) {
        require(market != address(0), "Admin: market is zero address");
        require(twapSeconds >= MIN_TWAP_DURATION && twapSeconds <= MAX_TWAP_DURATION, "Admin: twap bounds");

        (bool queued,,,) = ovfl.pendingMarkets(market);
        require(!queued, "Admin: already queued");

        bool isFirstMarket = (ovfl.approvedMarketsCount() == 0 && ovfl.timelockDelaySeconds() == 0);

        if (isFirstMarket) {
            ovfl.setTimelockDelayExecuted(MIN_DELAY_SECONDS);
        }

        (address sy,,) = IPendleMarket(market).readTokens();
        require(sy != address(0), "Admin: unsupported underlying");

        address underlying = ovfl.canonicalUnderlyingForToken(sy);

        if (underlying == address(0)) {
            try IStandardizedYield(sy).yieldToken() returns (address yieldTokenAddr) {
                if (yieldTokenAddr != address(0)) {
                    address mapped = ovfl.canonicalUnderlyingForToken(yieldTokenAddr);
                    if (mapped != address(0)) {
                        underlying = mapped;
                    } else if (ovfl.approvedUnderlying(yieldTokenAddr)) {
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
                    address mapped = ovfl.canonicalUnderlyingForToken(candidate);
                    if (mapped != address(0)) {
                        underlying = mapped;
                        break;
                    }
                    if (ovfl.approvedUnderlying(candidate)) {
                        underlying = candidate;
                        break;
                    }
                }
            } catch {}
        }

        require(underlying != address(0), "Admin: unsupported underlying");
        require(ovfl.approvedUnderlying(underlying), "Admin: underlying not approved");

        _setAliasInternal(sy, underlying);

        (bool increaseCardinalityRequired, uint16 cardinalityRequired,) = pendleOracle.getOracleState(market, twapSeconds);

        if (increaseCardinalityRequired) {
            try IPendleMarket(market).increaseObservationsCardinalityNext(cardinalityRequired) {} catch {
                revert("Admin: cannot increase oracle cardinality");
            }
        }

        uint256 wait = isFirstMarket ? 0 : ovfl.timelockDelaySeconds();
        uint256 eta = block.timestamp + wait;

        ovfl.setMarketQueued(market, twapSeconds, eta, underlying);
    }

    function executeAddMarket(address market) external onlyRole(ADMIN_ROLE) {
        (bool queued, uint32 twapDuration, uint256 eta, address underlying) = ovfl.pendingMarkets(market);
        require(queued, "Admin: not queued");
        require(block.timestamp >= eta, "Admin: timelock not passed");

        _checkOracleReady(market, twapDuration);

        (bool approved,,,,,) = ovfl.series(market);
        require(!approved, "Admin: already added");

        (address sy, address pt,) = IPendleMarket(market).readTokens();
        require(sy != address(0), "Admin: unsupported underlying");

        require(underlying != address(0), "Admin: underlying not approved");

        address ovflToken = ovfl.underlyingToOvfl(underlying);
        require(ovflToken != address(0), "Admin: ovfl token missing");

        uint256 expiry = IPendleMarket(market).expiry();

        ovfl.setMarketApproved(market, pt, underlying, ovflToken, twapDuration, expiry);
    }

    function setMarketDepositLimit(address market, uint256 limit) external onlyRole(ADMIN_ROLE) {
        require(market != address(0), "Admin: market is zero address");
        uint256 currentDeposited = ovfl.marketTotalDeposited(market);
        if (limit > 0) {
            require(limit >= currentDeposited, "Admin: limit below current deposits");
        }

        ovfl.setMarketDepositLimit(market, limit);
    }

    function _setAliasInternal(address token, address underlying) internal {
        address current = ovfl.canonicalUnderlyingForToken(token);
        require(current == address(0) || current == underlying, "Admin: alias conflict");
        ovfl.setUnderlyingAliasInternal(token, underlying);
    }

    function _checkOracleReady(address market, uint32 duration) internal view {
        (bool increaseCardinalityRequired,, bool oldestObservationSatisfied) = pendleOracle.getOracleState(market, duration);
        require(!increaseCardinalityRequired, "Admin: oracle cardinality");
        require(oldestObservationSatisfied, "Admin: oracle wait");
    }
}


