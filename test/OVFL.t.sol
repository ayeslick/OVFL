// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {OVFL} from "../src/OVFL.sol";
import {OVFLETH} from "../src/OVFLETH.sol";

contract OVFLTest is Test {


    OVFL public ovfl;
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant PENDLE_ROUTER = 0x0000000000000000000000000000000000000000;
    address public constant PENDLE_ORACLE = 0x0000000000000000000000000000000000000000;
    address public constant PENDLE_MARKET = 0x0000000000000000000000000000000000000000;
    address public constant PENDLE_SY = 0x0000000000000000000000000000000000000000;
    address public constant PENDLE_PT = 0x0000000000000000000000000000000000000000;
    address public constant PENDLE_PY = 0x0000000000000000000000000000000000000000;
    address public constant PENDLE_LP = 0x0000000000000000000000000000000000000000;

    address public constant ADMIN = address(0x123);
    address public constant TREASURY = address(0x456);

    function setUp() public {
        ovfl = new OVFL(ADMIN, TREASURY);
    }

    // add tests for all functions
    

    

    
}
