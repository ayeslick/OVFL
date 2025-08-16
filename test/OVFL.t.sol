// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {OVFL} from "../src/OVFL.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract OVFLTest is Test {
    OVFL public ovfl;

    address public constant PENDLE_ORACLE = 0x9a9Fa8338dd5E5B2188006f1Cd2Ef26d921650C2;
    address public constant PENDLE_MARKET = 0xC374f7eC85F8C7DE3207a10bB1978bA104bdA3B2;
    address public constant PENDLE_SY = 0xcbC72d92b2dc8187414F6734718563898740C0BC;
    address public constant PENDLE_PT = 0xf99985822fb361117FCf3768D34a6353E6022F5F;


    address public constant WSTETH = 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0;

    address public constant ADMIN = address(0x123);
    address public constant TREASURY = address(0x456);

    uint32 public constant TWAP_DURATION = 30 minutes;

    function setUp() public {
        ovfl = new OVFL(ADMIN, TREASURY);

        vm.startPrank(ADMIN);

        ovfl.queueAddMarket(PENDLE_MARKET, TWAP_DURATION);
        ovfl.executeAddMarket(PENDLE_MARKET);

        vm.stopPrank();

    }

    function test_Deposit_Success() public {
        address user = makeAddr("user");
        uint256 ptAmount = 10 ether;
        uint256 feeAmount = 0.3 ether; // 3% fee on market value
        
        // Setup: Give user PT tokens and wstETH for fees
        deal(PENDLE_PT, user, ptAmount);
        deal(WSTETH, user, feeAmount);
        
        vm.startPrank(user);
        
        // Approve tokens
        IERC20(PENDLE_PT).approve(address(ovfl), ptAmount);
        IERC20(WSTETH).approve(address(ovfl), feeAmount);
        
        // Get initial balances
        uint256 userPtBalanceBefore = IERC20(PENDLE_PT).balanceOf(user);
        uint256 userWstethBalanceBefore = IERC20(WSTETH).balanceOf(user);
        uint256 treasuryWstethBalanceBefore = IERC20(WSTETH).balanceOf(TREASURY);
        uint256 userOvflEthBalanceBefore = ovfl.ovflETH().balanceOf(user);
        
        // Preview the deposit to get expected values
        (uint256 expectedToUser, uint256 expectedToStream, uint256 expectedRate) = ovfl.previewStream(PENDLE_MARKET, ptAmount);
        
        // Execute deposit
        (uint256 actualToUser, uint256 actualToStream, uint256 streamId) = ovfl.deposit(PENDLE_MARKET, ptAmount);
        
        vm.stopPrank();
        
        // Verify return values match preview
        assertEq(actualToUser, expectedToUser, "toUser should match preview");
        assertEq(actualToStream, expectedToStream, "toStream should match preview");
        
        // Verify PT balance transferred to vault
        assertEq(IERC20(PENDLE_PT).balanceOf(user), userPtBalanceBefore - ptAmount, "User PT balance should decrease");
        assertEq(IERC20(PENDLE_PT).balanceOf(address(ovfl)), ptAmount, "Vault should receive PT tokens");
        
        // Verify fee payment
        uint256 expectedFee = (actualToUser * ovfl.feeBps()) / ovfl.BASIS_POINTS();
        assertEq(IERC20(WSTETH).balanceOf(user), userWstethBalanceBefore - expectedFee, "User should pay fee");
        assertEq(IERC20(WSTETH).balanceOf(TREASURY), treasuryWstethBalanceBefore + expectedFee, "Treasury should receive fee");
        
        // Verify ovflETH minting
        assertEq(ovfl.ovflETH().balanceOf(user), userOvflEthBalanceBefore + actualToUser, "User should receive ovflETH");
        assertEq(ovfl.ovflETH().balanceOf(address(ovfl)), 0, "Vault should not hold tokens after stream creation");
        
        // Verify stream creation
        assertGt(streamId, 0, "Stream ID should be created");
        
        // Verify vault state update
        (bool approved, bool settled, uint32 twapDuration, uint256 ptBalance, uint256 expiry) = ovfl.series(PENDLE_MARKET);
        assertEq(ptBalance, ptAmount, "Vault PT balance should be updated");
    }
    
//     function test_Deposit_RevertWhenMarketNotApproved() public {
//         address user = makeAddr("user");
//         address fakeMarket = makeAddr("fakeMarket");
//         uint256 ptAmount = 10 ether;
        
//         deal(PENDLE_PT, user, ptAmount);
        
//         vm.startPrank(user);
//         IERC20(PENDLE_PT).approve(address(ovfl), ptAmount);
        
//         vm.expectRevert("OVFL: market not approved");
//         ovfl.deposit(fakeMarket, ptAmount);
        
//         vm.stopPrank();
//     }
    
//     function test_Deposit_RevertWhenAmountTooSmall() public {
//         address user = makeAddr("user");
//         uint256 ptAmount = 0.05 ether; // Below MIN_PT_AMOUNT (0.1)
        
//         deal(PENDLE_PT, user, ptAmount);
        
//         vm.startPrank(user);
//         IERC20(PENDLE_PT).approve(address(ovfl), ptAmount);
        
//         vm.expectRevert("OVFL: amount is less than 1 PT");
//         ovfl.deposit(PENDLE_MARKET, ptAmount);
        
//         vm.stopPrank();
//     }
    
//     function test_Deposit_RevertWhenMatured() public {
//         address user = makeAddr("user");
//         uint256 ptAmount = 10 ether;
        
//         // Fast forward past expiry
//         (, , , , uint256 expiry) = ovfl.series(PENDLE_MARKET);
//         vm.warp(expiry + 1);
        
//         deal(PENDLE_PT, user, ptAmount);
        
//         vm.startPrank(user);
//         IERC20(PENDLE_PT).approve(address(ovfl), ptAmount);
        
//         vm.expectRevert("OVFL: matured");
//         ovfl.deposit(PENDLE_MARKET, ptAmount);
        
//         vm.stopPrank();
//     }
    
//     function test_Deposit_RevertWhenNothingToStream() public {
//         address user = makeAddr("user");
//         uint256 ptAmount = 10 ether;
        
//         // Mock oracle to return rate = 1e18 (at par), which would make toStream = 0
//         vm.mockCall(
//             PENDLE_ORACLE,
//             abi.encodeWithSignature("getPtToSyRate(address,uint32)", PENDLE_MARKET, TWAP_DURATION),
//             abi.encode(1e18)
//         );
        
//         deal(PENDLE_PT, user, ptAmount);
//         deal(WSTETH, user, 1 ether);
        
//         vm.startPrank(user);
//         IERC20(PENDLE_PT).approve(address(ovfl), ptAmount);
//         IERC20(WSTETH).approve(address(ovfl), 1 ether);
        
//         vm.expectRevert("OVFL: nothing to stream");
//         ovfl.deposit(PENDLE_MARKET, ptAmount);
        
//         vm.stopPrank();
//     }
    
//     function test_Deposit_CorrectMathCalculations() public {
//         address user = makeAddr("user");
//         uint256 ptAmount = 10 ether;
        
//         // Mock oracle to return specific rate for predictable testing
//         uint256 mockRate = 0.95e18; // 95% of par value
//         vm.mockCall(
//             PENDLE_ORACLE,
//             abi.encodeWithSignature("getPtToSyRate(address,uint32)", PENDLE_MARKET, TWAP_DURATION),
//             abi.encode(mockRate)
//         );
        
//         deal(PENDLE_PT, user, ptAmount);
//         deal(WSTETH, user, 1 ether);
        
//         vm.startPrank(user);
//         IERC20(PENDLE_PT).approve(address(ovfl), ptAmount);
//         IERC20(WSTETH).approve(address(ovfl), 1 ether);
        
//         (uint256 toUser, uint256 toStream, ) = ovfl.deposit(PENDLE_MARKET, ptAmount);
        
//         vm.stopPrank();
        
//         // Verify calculations
//         uint256 expectedToUser = (ptAmount * mockRate) / 1e18; // 9.5 ether
//         uint256 expectedToStream = ptAmount - expectedToUser;   // 0.5 ether
        
//         assertEq(toUser, expectedToUser, "toUser calculation incorrect");
//         assertEq(toStream, expectedToStream, "toStream calculation incorrect");
        
//         // Verify fee calculation
//         uint256 expectedFee = (expectedToUser * ovfl.feeBps()) / ovfl.BASIS_POINTS(); // 3% of 9.5 = 0.285
//         uint256 actualFee = 1 ether - IERC20(WSTETH).balanceOf(user);
//         assertEq(actualFee, expectedFee, "Fee calculation incorrect");
//     }
}
