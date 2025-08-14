require("@nomicfoundation/hardhat-ethers");

module.exports = {
  solidity: {
    compilers: [
      { version: "0.8.19" },
      { version: "0.8.28" }
    ]
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545"
    }
  }
};
