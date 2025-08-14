// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract GameToken is ERC20, Ownable {
    address public minter; // TokenStore

    event Minted(address indexed to, uint256 amount);

    constructor() ERC20("GameToken", "GT") {}

    function decimals() public pure override returns (uint8) {
        return 18;
    }

    /// @notice Set minter - only callable once by owner to reduce risk
    function setMinter(address _minter) external onlyOwner {
        require(_minter != address(0), "GameToken: zero minter");
        require(minter == address(0), "GameToken: minter already set");
        minter = _minter;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "GameToken: only minter");
        _mint(to, amount);
        emit Minted(to, amount);
    }
}
