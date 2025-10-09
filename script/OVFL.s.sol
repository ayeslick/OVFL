// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {OVFL} from "../src/OVFL.sol";

contract OVFLScript is Script {
    OVFL public ovfl;

    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        // Get the deployer address
        address deployer = vm.addr(vm.envUint("PRIVATE_KEY"));
        
        // Deploy OVFL with deployer as admin and treasury
        ovfl = new OVFL(deployer, deployer);

        console.log("OVFL deployed to:", address(ovfl));
        console.log("Admin:", deployer);
        console.log("Treasury:", deployer);

        vm.stopBroadcast();
    }
}
