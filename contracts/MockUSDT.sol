// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDT is ERC20 {
    constructor(uint256 initialSupply) ERC20("MockUSDT", "USDT") {
        _mint(msg.sender, initialSupply);
    }

    // USDT-like 6 decimals
    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
