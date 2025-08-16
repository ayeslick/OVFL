// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {OVFL} from "../src/OVFL.sol";

contract OVFLScript is Script {
    OVFL public ovfl;

    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        ovfl = new OVFL(
            address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2),
            address(0x82aF49447D8a07e3bd95BD0d56f35241523fBab1),
            address(0x82aF49447D8a07e3bd95BD0d56f35241523fBab1)
        );

        vm.stopBroadcast();
    }
}
