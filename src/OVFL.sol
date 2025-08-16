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

contract OVFL {
    function get() public pure returns (uint256) {
        return 1;
    }
}
