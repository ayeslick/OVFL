// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract OVFLETH is ERC20 {
    
    address public owner;

    modifier onlyOwner() { 
        require(msg.sender == owner,"pETH: not owner"); 
        _; 
    }   
    constructor() ERC20("OVFL ETH","ovflETH") { 
        owner = msg.sender; 
    }
    function transferOwnership(address newOwner) external onlyOwner { 

        require(newOwner != address(0),"ovflETH: new owner is zero address"); 
        owner = newOwner; 
    }

    function mint(address to,uint256 amount) external onlyOwner { 
        _mint(to,amount); 
    }

    function burn(address from,uint256 amount) external onlyOwner { 
        _burn(from,amount); 
    }

}