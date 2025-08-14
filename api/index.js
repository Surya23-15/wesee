// api/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const { JsonRpcProvider } = require('ethers');
const ERC20_ABI = loadAbi('ERC20');


const app = express();
app.use(cors());
app.use(express.json());

// --- Config from .env ---
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const PORT = process.env.PORT || 3001;
const TOKENSTORE_ADDRESS = process.env.TOKENSTORE_ADDRESS || '';
const PLAYGAME_ADDRESS = process.env.PLAYGAME_ADDRESS || '';
const GAME_TOKEN_ADDRESS = process.env.GAME_TOKEN_ADDRESS || '';
const USDT_ADDRESS = process.env.USDT_ADDRESS || '';

// --- Load ABIs from api/abis/ (exported from Hardhat artifacts) ---
function loadAbi(name) {
  const p = path.join(__dirname, 'abis', `${name}.json`);
  if (!fs.existsSync(p)) throw new Error(`ABI not found: ${p}`);
  const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  return Array.isArray(json) ? json : json.abi;
}

const TokenStoreABI = loadAbi('TokenStore');
const PlayGameABI = loadAbi('PlayGame');
const GameTokenABI = loadAbi('GameToken');
// const ERC20_ABI = loadAbi('ERC20');

console.log({
  TokenStoreABI: !!TokenStoreABI,
  PlayGameABI: !!PlayGameABI,
  GameTokenABI: !!GameTokenABI,
  ERC20_ABI: !!ERC20_ABI
});

// --- Provider & wallets ---
const provider = new JsonRpcProvider(RPC_URL);
if (!PRIVATE_KEY) {
  console.warn('Warning: PRIVATE_KEY not set. Owner-only endpoints will fail.');
}
const signer = PRIVATE_KEY ? new ethers.Wallet(PRIVATE_KEY, provider) : null;

// --- Contract instances ---
const tokenStore = new ethers.Contract(TOKENSTORE_ADDRESS, TokenStoreABI, provider);
const tokenStoreSigner = signer ? tokenStore.connect(signer) : null;
const playGame = new ethers.Contract(PLAYGAME_ADDRESS, PlayGameABI, signer || provider);
const gameToken = new ethers.Contract(GAME_TOKEN_ADDRESS, GameTokenABI, provider);
const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, provider);

// --- In-memory leaderboard store (simple) ---
const leaderboard = {
  winsByAddress: {},    // addr -> wins count
  totalGTWon: {},       // addr -> BigInt total GT
  matchesPlayed: {}     // addr -> matches count
};

// helper to safe-add big ints stored as strings
function addBigToMap(map, addr, addVal) {
  const prev = BigInt(map[addr] || '0');
  map[addr] = (prev + BigInt(addVal)).toString();
}

// --- Routes ---

// health
app.get('/', (req, res) => res.send({ ok: true }));

// 1) Populate buy tx: client wallet will sign and send
app.get('/purchase', async (req, res) => {
  try {
    const amount = req.query.amount; // human string, e.g., "1.5" (USDT)
    if (!amount) return res.status(400).send('missing amount query param');
    // USDT uses 6 decimals
    const usdtAmount = ethers.utils.parseUnits(amount, 6);
    const populated = await tokenStore.populateTransaction.buy(usdtAmount);
    // return { to, data } for frontend to call signer.sendTransaction
    return res.json({ to: tokenStore.address, data: populated.data, value: populated.value || '0' });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message);
  }
});

// 2) Owner-only: create match (calls PlayGame.createMatch)
// expects JSON: { matchId: "match1", p1: "0x..", p2: "0x..", stake: "0.1" } stake in GT human units
app.post('/match/start', async (req, res) => {
  try {
    if (!signer) return res.status(500).send('Server not configured with PRIVATE_KEY');
    const { matchId, p1, p2, stake } = req.body;
    if (!matchId || !p1 || !p2 || !stake) return res.status(400).send('missing params');

    const stakeBN = ethers.utils.parseUnits(stake.toString(), 18); // GT = 18 decimals
    const matchIdBytes = ethers.utils.formatBytes32String(matchId);

    const tx = await playGame.createMatch(matchIdBytes, p1, p2, stakeBN);
    const rc = await tx.wait();
    return res.json({ txHash: rc.transactionHash });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message);
  }
});

// 3) Owner/operator: commit result
// expects JSON: { matchId: "match1", winner: "0x..." }
app.post('/match/result', async (req, res) => {
  try {
    if (!signer) return res.status(500).send('Server not configured with PRIVATE_KEY');
    const { matchId, winner } = req.body;
    if (!matchId || !winner) return res.status(400).send('missing params');
    const matchIdBytes = ethers.utils.formatBytes32String(matchId);
    const tx = await playGame.commitResult(matchIdBytes, winner);
    const rc = await tx.wait();
    return res.json({ txHash: rc.transactionHash });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message);
  }
});

// 4) Leaderboard: returns top winners
app.get('/leaderboard', (req, res) => {
  try {
    const arr = Object.entries(leaderboard.totalGTWon).map(([addr, won]) => ({
      address: addr,
      totalGTWon: won,
      wins: leaderboard.winsByAddress[addr] || 0,
      matchesPlayed: leaderboard.matchesPlayed[addr] || 0
    }));
    arr.sort((a, b) => (BigInt(b.totalGTWon) - BigInt(a.totalGTWon)));
    return res.json(arr.slice(0, 20));
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message);
  }
});

// --- Event listeners to update leaderboard ---
async function startListeners() {
  try {
    const providerContract = new ethers.Contract(PLAYGAME_ADDRESS, PlayGameABI, provider);

    providerContract.on('Settled', (matchIdBytes, winner, amount, ev) => {
      try {
        // amount is BigNumber payout (stake*2)
        const matchId = ethers.utils.parseBytes32String(matchIdBytes);
        console.log(`[Event] Settled match ${matchId} winner=${winner} amount=${amount.toString()}`);
        // update leaderboard
        addBigToMap(leaderboard.totalGTWon, winner, amount.toString());
        leaderboard.winsByAddress[winner] = (leaderboard.winsByAddress[winner] || 0) + 1;
        leaderboard.matchesPlayed[winner] = (leaderboard.matchesPlayed[winner] || 0) + 1;
      } catch (e) { console.error('Error handling Settled event', e); }
    });

    providerContract.on('Staked', (matchIdBytes, player, ev) => {
      try {
        const matchId = ethers.utils.parseBytes32String(matchIdBytes);
        // count as match played when both players stake could be better, but we increment per stake for simplicity
        leaderboard.matchesPlayed[player] = (leaderboard.matchesPlayed[player] || 0) + 0; // no-op
      } catch (e) { console.error('Staked event error', e); }
    });

    providerContract.on('Refunded', (matchIdBytes, ev) => {
      try {
        const matchId = ethers.utils.parseBytes32String(matchIdBytes);
        console.log(`[Event] Refunded match ${matchId}`);
      } catch (e) { console.error('Refunded event error', e); }
    });

    console.log('Event listeners started for PlayGame');
  } catch (err) {
    console.error('Failed to start listeners', err);
  }
}

// start
app.listen(PORT, async () => {
  console.log(`API listening on ${PORT}`);
  startListeners();
});
