// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {OVFL} from "../src/OVFL.sol";

contract OVFLTest is Test {
    OVFL public ovfl;

    function setUp() public {
        ovfl = new OVFL(address(this));
    }
}
