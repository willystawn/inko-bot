# Inko Testnet Interaction Bot

This is a Node.js bot designed to automate interactions with the Inko testnet smart contracts on Base Sepolia. It continuously performs a cycle of wrapping and unwrapping tokens to simulate regular user activity, with intelligent checks for token balance and contract approvals.

## Features

- **Continuous Operation**: Runs a wrap/unwrap cycle 24/7.
- **Smart Minting & Approvals**:
  - Automatically mints new tokens only when the balance is empty.
  - Automatically approves the wrapper contract to spend tokens, only when needed.
- **Human-like Behavior**:
  - Uses randomized delays between wrap/unwrap pairs (5-10 minutes) and between individual transactions (10-30 seconds).
  - Uses large, randomized token IDs for each wrap/unwrap operation.
  - Varies gas prices slightly for each transaction to improve priority.
- **Robust & Resilient**:
  - **Multi-RPC Failover**: Automatically switches between multiple public RPCs if one becomes unavailable.
  - **Rate-Limit Handling**: Implements an exponential backoff strategy if an RPC rate limit is hit.
  - **Error Handling**: Catches and logs errors gracefully to prevent the script from crashing.
- **Structured Logging**: Provides clear, color-coded logs for each step of the process.
- **Secure Configuration**: Uses a `.env` file to securely store your private key.

## Prerequisites

- [Node.js](https://nodejs.org/) (version 18.0.0 or higher recommended)
- An EVM wallet with a private key.
- A small amount of Base Sepolia ETH in the wallet to cover gas fees. You can get Sepolia ETH from a faucet and then bridge it to Base Sepolia.

## Setup & Installation

1.  **Clone or download the repository:**
    ```bash
    git clone https://github.com/your-username/inko-bot.git
    cd inko-bot
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
    -   Open the `.env` file and add your wallet's private key:
        ```env
        PRIVATE_KEY="0xYOUR_PRIVATE_KEY_HERE"
        ```

## Running the Bot

To start the bot, run the following command in your terminal:

```bash
npm start
```

The bot will initialize, check your token balance and approvals, and then start its continuous wrap/unwrap cycle.
