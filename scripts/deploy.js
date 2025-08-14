async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Deploy MockUSDT with 1,000 USDT (6 decimals)
  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy(ethers.parseUnits("1000", 6));
  await usdt.waitForDeployment();
  console.log("MockUSDT:", await usdt.getAddress());

  // Deploy GameToken
  const GameToken = await ethers.getContractFactory("GameToken");
  const gt = await GameToken.deploy();
  await gt.waitForDeployment();
  console.log("GameToken:", await gt.getAddress());

  // Deploy TokenStore with gtPerUsdt = 1e18
  const TokenStore = await ethers.getContractFactory("TokenStore");
  const gtPerUsdt = ethers.parseUnits("1", 18); // 1 USDT -> 1 GT
  const store = await TokenStore.deploy(await usdt.getAddress(), await gt.getAddress(), gtPerUsdt);
  await store.waitForDeployment();
  console.log("TokenStore:", await store.getAddress());

  // give TokenStore the minter role on GT
  await gt.setMinter(await store.getAddress());

  // Deploy PlayGame
  const PlayGame = await ethers.getContractFactory("PlayGame");
  const play = await PlayGame.deploy(await gt.getAddress());
  await play.waitForDeployment();
  console.log("PlayGame:", await play.getAddress());

  // set operator (for testing we'll use deployer)
  await play.setOperator(deployer.address);

  console.log("Deployment complete");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
