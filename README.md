# Automated Base Sepolia Interaction Bot

This is a Node.js bot designed to automate interactions with specific smart contracts on the Base Sepolia testnet. It performs a daily cycle of minting, approving, wrapping, and unwrapping tokens to simulate regular user activity.

## Features

- **Automated Daily Cycle**: Runs a full cycle of transactions once every 24 hours.
- **Human-like Behavior**:
  - Uses randomized delays between transactions.
  - Uses randomized token IDs for wrap/unwrap operations.
  - Varies gas prices slightly for each transaction.
- **Structured Logging**: Provides clear, professional logs for each step of the process.
- **Secure Configuration**: Uses a `.env` file to securely store your private key and RPC URL.
- **Robust**: Includes error handling to prevent the script from crashing on a single failed transaction.

## Prerequisites

- [Node.js](https://nodejs.org/) (version 16.14.0 or higher recommended)
- An EVM wallet with a private key.
- A small amount of Base Sepolia ETH in the wallet to cover gas fees. You can get Sepolia ETH from a faucet and then bridge it to Base Sepolia.

## Setup & Installation

1.  **Clone or download the repository:**
    ```bash
    git clone <your-repo-url>
    cd auto-script
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Create and configure your environment file:**
    -   Copy the example file:
        ```bash
        cp .env.example .env
        ```
    -   Open the `.env` file and fill in your details:
        ```
        BASE_SEPOLIA_RPC_URL="https://sepolia.base.org" # This is now managed in code, but good to have as a reference
        PRIVATE_KEY="0xYOUR_PRIVATE_KEY_HERE"
        TX_LIMIT=100
        ```

## Running the Bot

To start the bot, run the following command in your terminal:

```bash
npm start