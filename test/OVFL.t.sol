// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {OVFL} from "../src/OVFL.sol";
import {Admin} from "../src/Admin.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract OVFLTest is Test {
    OVFL public ovfl;
    Admin public admin;

    address public constant PENDLE_ORACLE = 0x9a9Fa8338dd5E5B2188006f1Cd2Ef26d921650C2;
    address public constant PENDLE_MARKET = 0xC374f7eC85F8C7DE3207a10bB1978bA104bdA3B2;
    address public constant PENDLE_SY = 0xcbC72d92b2dc8187414F6734718563898740C0BC;
    address public constant PENDLE_PT = 0xf99985822fb361117FCf3768D34a6353E6022F5F;

    address public constant WSTETH = 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0;

    address public constant ADMIN_ADDR = address(0x123);
    address public constant TREASURY = address(0x456);

    uint32 public constant TWAP_DURATION = 30 minutes;

    function setUp() public {
        // Deploy Admin first
        admin = new Admin(ADMIN_ADDR);

        // Deploy OVFL with Admin as the admin contract
        ovfl = new OVFL(address(admin), TREASURY);

        // Connect Admin to OVFL
        vm.startPrank(ADMIN_ADDR);
        admin.setOVFL(address(ovfl));

        // Approve underlying (WSTETH)
        admin.approveUnderlying(WSTETH, "OVFL wstETH", "ovflWSTETH");

        // Queue market with explicit underlying and fee
        admin.queueAddMarket(PENDLE_MARKET, TWAP_DURATION, WSTETH, 100); // 1% fee

        // Skip timelock
        vm.warp(block.timestamp + 1 hours);

        // Execute market
        admin.executeAddMarket(PENDLE_MARKET);

        vm.stopPrank();
    }

    function test_Deposit_Success() public {
        address user = makeAddr("user");
        uint256 ptAmount = 10 ether;
        uint256 feeAmount = 0.3 ether; // buffer for fees
        
        // Setup: Give user PT tokens and wstETH for fees
        deal(PENDLE_PT, user, ptAmount);
        deal(WSTETH, user, feeAmount);
        
        vm.startPrank(user);
        
        // Approve tokens
        IERC20(PENDLE_PT).approve(address(ovfl), ptAmount);
        IERC20(WSTETH).approve(address(ovfl), feeAmount);
        
        // Get initial balances
        uint256 userPtBalanceBefore = IERC20(PENDLE_PT).balanceOf(user);
        
        // Preview the deposit to get expected values
        (uint256 expectedToUser, uint256 expectedToStream, ) = ovfl.previewStream(PENDLE_MARKET, ptAmount);
        
        // Execute deposit with slippage protection (minToUser = 0 for no slippage check in test)
        (uint256 actualToUser, uint256 actualToStream, uint256 streamId) = ovfl.deposit(PENDLE_MARKET, ptAmount, 0);
        
        vm.stopPrank();
        
        // Verify return values match preview
        assertEq(actualToUser, expectedToUser, "toUser should match preview");
        assertEq(actualToStream, expectedToStream, "toStream should match preview");
        
        // Verify PT balance transferred to vault
        assertEq(IERC20(PENDLE_PT).balanceOf(user), userPtBalanceBefore - ptAmount, "User PT balance should decrease");
        assertEq(IERC20(PENDLE_PT).balanceOf(address(ovfl)), ptAmount, "Vault should receive PT tokens");
        
        // Verify stream creation
        assertGt(streamId, 0, "Stream ID should be created");
    }
}
