# Game DApp — Quick Setup & Smoke Test

Overview:
- Local Hardhat chain + MockUSDT, GameToken, TokenStore, PlayGame contracts.
- Backend (Express) runs event listeners and exposes endpoints for owner actions and purchase tx population.
- Minimal frontend (single HTML) for wallet interactions.

## Time estimate
This full stack should be possible within ~2.0–2.5 hours if you follow the checklist and reuse the provided code.

## 1) Start local node and deploy
Terminal A:
1. npx hardhat node

Terminal B:
1. npx hardhat compile
2. npx hardhat run --network localhost scripts/deploy.js
   - NOTE: copy addresses printed by deploy script for later use.

## 2) Prepare backend
1. cd api
2. Copy ABIs from `artifacts/contracts/...` to `api/abis/` (TokenStore.json, PlayGame.json, GameToken.json) and include `ERC20.json` (see sample in repo).
3. Create `.env` (based on .env.example) with addresses and PRIVATE_KEY (use first hardhat account private key).
4. npm install
5. npm start
   - Backend will start on port (default 3001) and begin listening to PlayGame events.

## 3) Prepare frontend
1. Edit `web/index.html` and replace placeholder addresses:
   - PLAYGAME_ADDRESS, GAME_TOKEN_ADDRESS, TOKENSTORE_ADDRESS, USDT_ADDRESS
2. Serve the `web/` folder (or open file in browser). For local testing, open file directly, or run a static server:
   - npx serve web
3. Connect MetaMask to `http://127.0.0.1:8545` network (use Hardhat accounts).
4. Import or use an account with funds (the deployer/test accounts).

## 4) Smoke test (happy path)
1. Transfer MockUSDT to player accounts:
   - Use `tools/transfer-usdt.js` or Hardhat console.
2. Buy GT:
   - In UI, connect wallet, set buy amount e.g. `1`, click Buy. Approve USDT->TokenStore when prompted and send tx.
   - Confirm GT balance increased by `1` (GT uses 18 decimals, TokenStore rate is 1 USDT -> 1 GT by default).
3. Create match (owner/backed):
   - In UI (or via backend POST /match/start), create `match1` with p1/p2 and stake `0.1`.
4. Approve PlayGame and stake:
   - Each player approves PlayGame to spend `0.1` GT then calls `stake(match1)`.
5. Commit result (owner):
   - POST `/match/result` to backend with winner address.
   - Winner should receive `0.2` GT (double stake).
6. Leaderboard:
   - GET `/leaderboard` should show the winner's totals.

## 5) Tests & verification
- Re-try commit to confirm re-entrancy / double-settlement prevented.
- Create a match but only one side stakes, set refund timeout short (via contract setter), and call `refund(matchId)` to validate refunds.

## Security notes
- Do NOT deploy these exact contracts to mainnet as-is without a security audit.
- Private keys must never be committed. Use ephemeral accounts for testing.

