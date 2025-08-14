// tools/transfer-usdt.js
// Usage: node transfer-usdt.js <rpc> <privateKey> <usdtAddress> <toAddress> <amountHuman>
const { ethers } = require('ethers');

async function main() {
  const [rpc, pk, usdtAddr, to, amount] = process.argv.slice(2);
  if (!rpc || !pk || !usdtAddr || !to || !amount) {
    console.log('Usage: node transfer-usdt.js <rpc> <pk> <usdt> <to> <amount>');
    process.exit(1);
  }
  const provider = new ethers.providers.JsonRpcProvider(rpc);
  const w = new ethers.Wallet(pk, provider);
  const ERC20 = [
    "function transfer(address to, uint amount) public returns (bool)",
    "function decimals() view returns (uint8)"
  ];
  const usdt = new ethers.Contract(usdtAddr, ERC20, w);
  const dec = await usdt.decimals();
  const tx = await usdt.transfer(to, ethers.utils.parseUnits(amount, dec));
  console.log('tx hash', tx.hash);
  await tx.wait();
  console.log('done');
}
main();
