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
const MAX_RETRIES = 5;

const MINT_CONTRACT_ADDRESS = "0xAF33ADd7918F685B2A82C1077bd8c07d220FFA04";
const WRAPPER_CONTRACT_ADDRESS = "0xA449bc031fA0b815cA14fAFD0c5EdB75ccD9c80f";

// --- GLOBAL VARIABLES ---
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
            // Add a small random value to the gas price to improve tx priority
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
                    continue;
                } else {
                    console.error(`[CRITICAL] Failed after ${MAX_RETRIES} rate-limit retries. Aborting action.`);
                    return false;
                }
            } else if (isNetworkError) {
                console.warn(`[WARN] Network issue on RPC ${RPC_URLS[currentRpcIndex]}. Switching RPC...`);
                currentRpcIndex = (currentRpcIndex + 1) % RPC_URLS.length;
                initializeConnections();
                await sleep(2000);
                continue;
            } else {
                console.error(`[ERROR] A fatal error occurred during ${actionName}: ${error.reason || error.message}`);
                return false;
            }
        }
    }
    return false;
}

// --- NEW HELPER FUNCTIONS ---

const MINT_AMOUNT = ethers.parseUnits("100", 18); // Amount to mint when balance is empty
const SUFFICIENT_ALLOWANCE = ethers.parseUnits("1000000", 18); // A large number for checking allowance

async function checkAndMintIfNeeded() {
    console.log("[CHECK] Checking token balance...");
    try {
        const balance = await mintContract.balanceOf(wallet.address);
        console.log(`[INFO] Current balance: ${ethers.formatUnits(balance, 18)} tokens.`);
        
        if (balance === 0n) { // Check if balance is exactly zero
            console.log("[ACTION] Balance is empty. Minting new tokens...");
            return await executeTransaction(
                (overrides) => mintContract.mint(wallet.address, MINT_AMOUNT, overrides),
                "Mint"
            );
        } else {
            console.log("[INFO] Sufficient balance, no minting needed.");
            return true;
        }
    } catch (error) {
        console.error(`[ERROR] Failed to check token balance: ${error.message}`);
        return false;
    }
}

async function checkAndApproveIfNeeded() {
    console.log("[CHECK] Checking token allowance for the wrapper contract...");
    try {
        const allowance = await mintContract.allowance(wallet.address, WRAPPER_CONTRACT_ADDRESS);
        console.log(`[INFO] Current allowance: ${ethers.formatUnits(allowance, 18)} tokens.`);

        if (allowance < SUFFICIENT_ALLOWANCE) {
            console.log("[ACTION] Allowance is low. Setting approval to maximum...");
            return await executeTransaction(
                (overrides) => mintContract.approve(WRAPPER_CONTRACT_ADDRESS, ethers.MaxUint256, overrides),
                "Approve"
            );
        } else {
            console.log("[INFO] Sufficient allowance, no approval needed.");
            return true;
        }
    } catch (error) {
        console.error(`[ERROR] Failed to check or set token allowance: ${error.message}`);
        return false;
    }
}

// --- MAIN WORKFLOW ---

async function main() {
    initializeConnections();

    console.log("\n--- Initial Setup ---");
    const setupSuccess = await checkAndApproveIfNeeded();
    if (!setupSuccess) {
        console.error("[FATAL] Initial approval failed. Please check RPC and wallet. Exiting in 1 minute.");
        await sleep(60000);
        process.exit(1);
    }
    console.log("--- Setup Complete ---\n");

    let successfulPairs = 0;
    while (true) {
        console.log("========================================================");
        console.log(`[WORKFLOW] Starting transaction pair #${successfulPairs + 1} at ${new Date().toUTCString()}`);
        console.log("========================================================");

        const readyToWrap = await checkAndMintIfNeeded();
        if (!readyToWrap) {
            console.warn("[WARN] Minting check or action failed. Retrying after 2 minutes.");
            await sleep(120000);
            continue; // Skip to the next iteration
        }

        const randomID = getRandomTokenID();
        console.log(`\n----- Executing pair for Token ID: ${randomID} -----`);
        
        const wrapSuccess = await executeTransaction(
            (overrides) => wrapperContract.wrap(randomID, overrides), 
            `Wrap #${successfulPairs + 1}`
        );
        
        if (wrapSuccess) {
            const interTxDelay = randomDelay(10000, 30000); // 10-30s delay between wrap & unwrap
            console.log(`[INFO] Wrap successful. Waiting ${interTxDelay / 1000}s before unwrapping.`);
            await sleep(interTxDelay);

            const unwrapSuccess = await executeTransaction(
                (overrides) => wrapperContract.unwrap(randomID, overrides), 
                `Unwrap #${successfulPairs + 1}`
            );

            if (unwrapSuccess) {
                successfulPairs++;
                console.log(`\n[SUCCESS] Completed transaction pair #${successfulPairs}.`);

                const mainDelay = randomDelay(300 * 1000, 600 * 1000); // 5 to 10 minutes
                console.log(`[INFO] Waiting for ${(mainDelay / 1000 / 60).toFixed(2)} minutes until the next pair.`);
                await sleep(mainDelay);
            } else {
                console.error("[ERROR] Unwrap transaction failed. Waiting 1 minute before starting a new pair.");
                await sleep(60000);
            }
        } else {
            console.error("[ERROR] Wrap transaction failed. Waiting 1 minute before starting a new pair.");
            await sleep(60000);
        }
    }
}

main().catch(error => {
    console.error("[FATAL] An unexpected error occurred in the main loop:", error);
    process.exit(1);
});