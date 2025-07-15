import { ethers } from 'ethers';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- HELPER FUNCTIONS ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadJson(filePath) {
    const fullPath = path.join(__dirname, filePath);
    const fileContent = fs.readFileSync(fullPath, 'utf8');
    return JSON.parse(fileContent);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

function getRandomTokenID(length = 18) {
    let result = '';
    const characters = '0123456789';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    result += Date.now().toString().slice(-5);
    return BigInt(result);
}

// --- CONFIGURATION ---
const { PRIVATE_KEY } = process.env;

if (!PRIVATE_KEY) {
    console.error("[ERROR] Please set PRIVATE_KEY in your .env file.");
    process.exit(1);
}

const RPC_URLS = ["https://sepolia.base.org", "https://base-sepolia.drpc.org", "https://base-sepolia.therpc.io"];
let currentRpcIndex = 0;
const MAX_RETRIES = 5; // Max retries for a single transaction after hitting rate limits

// ===> FIX: ADDED THE MISSING CONTRACT ADDRESSES BACK <===
const MINT_CONTRACT_ADDRESS = "0xAF33ADd7918F685B2A82C1077bd8c07d220FFA04";
const WRAPPER_CONTRACT_ADDRESS = "0xA449bc031fA0b815cA14fAFD0c5EdB75ccD9c80f";
// =========================================================

let provider, wallet, mintContract, wrapperContract;

function initializeConnections() {
    const rpcUrl = RPC_URLS[currentRpcIndex];
    console.log(`[SETUP] Connecting using RPC: ${rpcUrl}`);
    provider = new ethers.JsonRpcProvider(rpcUrl);
    wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const mintContractABI = loadJson('./abi/mintContract.json');
    const wrapperContractABI = loadJson('./abi/wrapperContract.json');
    mintContract = new ethers.Contract(MINT_CONTRACT_ADDRESS, mintContractABI, wallet);
    wrapperContract = new ethers.Contract(WRAPPER_CONTRACT_ADDRESS, wrapperContractABI, wallet);
    console.log(`[SETUP] Connection successful. Wallet: ${wallet.address}`);
}

// --- CORE TRANSACTION (ENHANCED WITH RETRY LOGIC) ---

async function executeTransaction(fn, actionName) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const feeData = await provider.getFeeData();
            const gasPrice = feeData.gasPrice + BigInt(randomDelay(1, 100));
            const tx = await fn({ gasPrice });
            console.log(`[INFO] ${actionName} transaction sent. Hash: ${tx.hash}`);
            const receipt = await tx.wait();
            console.log(`[SUCCESS] ${actionName} confirmed in block: ${receipt.blockNumber}`);
            return true;
        } catch (error) {
            const isRateLimitError = (error.code === -32029) || (error.message && error.message.toLowerCase().includes('rate limit exceeded'));
            const isNetworkError = ['SERVER_ERROR', 'NETWORK_ERROR', 'TIMEOUT'].includes(error.code) || (error.message && error.message.includes('failed to detect network'));
            
            if (isRateLimitError) {
                console.warn(`[WARN] Rate limit exceeded on attempt ${attempt}/${MAX_RETRIES}.`);
                if (attempt < MAX_RETRIES) {
                    const backoffTime = randomDelay(60000, 120000); // Wait 1-2 minutes
                    console.log(`[INFO] Waiting for ${backoffTime / 1000}s before retrying...`);
                    await sleep(backoffTime);
                    continue; // Retry the same transaction after delay
                } else {
                    console.error(`[CRITICAL] Failed after ${MAX_RETRIES} rate-limit retries. Aborting action.`);
                    return false;
                }
            } else if (isNetworkError) {
                console.warn(`[WARN] Network issue on RPC ${RPC_URLS[currentRpcIndex]}. Switching RPC...`);
                currentRpcIndex = (currentRpcIndex + 1) % RPC_URLS.length;
                initializeConnections();
                await sleep(2000); // Short delay after switching RPC
                continue;
            } else {
                console.error(`[ERROR] A fatal non-network, non-rate-limit error occurred during ${actionName}: ${error.reason || error.message}`);
                return false; // Fatal error, no point in retrying
            }
        }
    }
    return false;
}

// --- The rest of the script remains the same ---

async function runDailyCycle() {
    console.log("\n========================================================");
    console.log(`[WORKFLOW] Starting new daily cycle at ${new Date().toUTCString()}`);
    console.log("========================================================");

    const dailyPairGoal = randomDelay(25, 50);
    const dailyTxGoal = dailyPairGoal * 2;
    console.log(`[GOAL] Today's target is ${dailyTxGoal} transactions (${dailyPairGoal} wrap/unwrap pairs).`);
    
    console.log("\n--- Phase 1: Preparation ---");
    const mintSuccess = await executeTransaction((overrides) => mintContract.mint(wallet.address, ethers.parseUnits("100", 18), overrides), "Daily Mint");
    const approveSuccess = await executeTransaction((overrides) => mintContract.approve(WRAPPER_CONTRACT_ADDRESS, ethers.MaxUint256, overrides), "Daily Approve");
    
    if (!mintSuccess || !approveSuccess) {
        console.error("[CRITICAL] Preparation phase failed. Skipping transactions for today.");
        return;
    }

    console.log("\n--- Phase 2: Transaction Execution ---");
    let txCounter = 0;
    for (let i = 1; i <= dailyPairGoal; i++) {
        console.log(`\n----- Executing Pair ${i} of ${dailyPairGoal} -----`);
        const randomID = getRandomTokenID();

        const wrapSuccess = await executeTransaction((overrides) => wrapperContract.wrap(randomID, overrides), `Wrap #${i}`);
        if(wrapSuccess) txCounter++;

        if (wrapSuccess) {
            await sleep(randomDelay(30000, 60000));
            const unwrapSuccess = await executeTransaction((overrides) => wrapperContract.unwrap(randomID, overrides), `Unwrap #${i}`);
            if(unwrapSuccess) txCounter++;
        }
        
        if(i < dailyPairGoal) {
            await sleep(randomDelay(10000, 20000));
        }
    }
    console.log(`\n[WORKFLOW] Execution phase complete. Total transactions today: ${txCounter}`);
}

async function main() {
    initializeConnections();
    while (true) {
        const startTime = Date.now();
        await runDailyCycle();
        const endTime = Date.now();
        const cycleDuration = endTime - startTime;
        const oneDayInMs = 24 * 60 * 60 * 1000;
        const sleepTime = Math.max(0, oneDayInMs - cycleDuration);
        
        console.log("\n========================================================");
        console.log(`[WORKFLOW] Daily cycle has concluded.`);
        console.log(`[INFO] Cycle duration: ${(cycleDuration / 1000 / 60).toFixed(2)} minutes.`);
        console.log(`[INFO] Sleeping for ${(sleepTime / 1000 / 60 / 60).toFixed(2)} hours.`);
        console.log(`[INFO] Next cycle will start around ${new Date(Date.now() + sleepTime).toUTCString()}`);
        console.log("========================================================\n");
        await sleep(sleepTime);
    }
}

main().catch(error => {
    console.error("[FATAL] An unexpected error occurred in the main loop:", error);
    process.exit(1);
});