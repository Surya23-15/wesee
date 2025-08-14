// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./GameToken.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TokenStore is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdt;     // could be any ERC20-like token
    GameToken public immutable gameToken;
    uint256 public gtPerUsdt;         // e.g., 1e18 for 1 USDT -> 1e18 GT (rate is in GT base units per 1 unit of the *human* USDT)
    uint8 public usdtDecimals;

    event Purchase(address indexed buyer, uint256 usdtAmount, uint256 gtOut);

    /**
     * @param _usdt address of the purchased token (e.g., USDT-like)
     * @param _gameToken address of GT token
     * @param _gtPerUsdt rate expressed as (GT units per 1 USDT human unit).
     *        Example: if you want 1 USDT -> 1 GT (GT has 18 decimals) => set _gtPerUsdt = 1e18
     */
    constructor(address _usdt, address _gameToken, uint256 _gtPerUsdt) {
        require(_usdt != address(0) && _gameToken != address(0), "TokenStore: zero addr");
        usdt = IERC20(_usdt);
        // read decimals dynamically
        usdtDecimals = IERC20Metadata(_usdt).decimals();
        gameToken = GameToken(_gameToken);
        gtPerUsdt = _gtPerUsdt;
    }

    // buy: caller must have approved TokenStore to spend their USDT
    function buy(uint256 usdtAmount) external nonReentrant {
        require(usdtAmount > 0, "TokenStore: zero amount");

        // compute GT out:
        // gtOut = usdtAmount * gtPerUsdt / (10 ** usdtDecimals)
        // where usdtAmount is in token base units (e.g., if usdtDecimals=6, 1 USDT = 1e6)
        uint256 scale = 10 ** uint256(usdtDecimals);
        uint256 gtOut = (usdtAmount * gtPerUsdt) / scale;

        // pull USDT from buyer using SafeERC20 (handles non-standard return)
        IERC20(address(usdt)).safeTransferFrom(msg.sender, address(this), usdtAmount);

        // mint GT to buyer via gameToken minter (TokenStore should be minter)
        gameToken.mint(msg.sender, gtOut);

        emit Purchase(msg.sender, usdtAmount, gtOut);
    }

    function withdrawUSDT(address to, uint256 amount) external onlyOwner {
        IERC20(address(usdt)).safeTransfer(to, amount);
    }

    // owner helper to update rate if needed
    function setRate(uint256 _gtPerUsdt) external onlyOwner {
        gtPerUsdt = _gtPerUsdt;
    }
}
