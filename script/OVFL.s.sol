// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {OVFL} from "../src/OVFL.sol";

contract OVFLScript is Script {
    OVFL public ovfl;

    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        ovfl = new OVFL(address(this), address(this));

        vm.stopBroadcast();
    }
}
