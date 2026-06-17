/**
 * Cross-chain bridge service
 * Uses SwapKit API v3 for bridge quotes and transaction building
 * Fallback: THORChain direct node API
 */

const SWAPKIT_BASE = 'https://api.swapkit.dev';
const THORNODE_BASE = 'https://thornode.ninerealms.com';

/**
 * Get a cross-chain swap quote from SwapKit
 * @param {string} sellAsset - e.g. "ETH.ETH", "ETH.USDC-0xA0b8..."
 * @param {string} buyAsset - e.g. "BTC.BTC"
 * @param {string} sellAmount - amount in base units
 * @param {number} slippage - e.g. 3 (percent)
 */
async function getQuote(sellAsset, buyAsset, sellAmount, slippage = 3) {
    const apiKey = process.env.SWAPKIT_API_KEY;

    try {
        const res = await fetch(`${SWAPKIT_BASE}/v3/quote`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { 'x-api-key': apiKey } : {})
            },
            body: JSON.stringify({
                sellAsset,
                buyAsset,
                sellAmount,
                slippage,
                senderAddress: process.env.COMPANY_WALLET,
                recipientAddress: process.env.COMPANY_BTC
            })
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`SwapKit quote error: ${err}`);
        }

        return await res.json();
    } catch (err) {
        console.error('SwapKit quote failed:', err.message);
        // Fallback to THORChain direct
        return await getThorchainQuote(sellAsset, buyAsset, sellAmount);
    }
}

/**
 * Build a swap transaction from a SwapKit quote
 * @param {string} routeId - from getQuote response
 * @param {string} sellAddress - sender address
 * @param {string} buyAddress - recipient address
 */
async function buildSwapTx(routeId, sellAddress, buyAddress) {
    const apiKey = process.env.SWAPKIT_API_KEY;

    const res = await fetch(`${SWAPKIT_BASE}/v3/swap`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'x-api-key': apiKey } : {})
        },
        body: JSON.stringify({ routeId, sellAddress, buyAddress })
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`SwapKit swap error: ${err}`);
    }

    return await res.json();
}

/**
 * Fallback: Get quote directly from THORChain node
 */
async function getThorchainQuote(sellAsset, buyAsset, sellAmount) {
    try {
        const url = `${THORNODE_BASE}/thorchain/quote/swap?from_asset=${sellAsset}&to_asset=${buyAsset}&amount=${sellAmount}&destination=${process.env.COMPANY_BTC}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`THORChain quote error: ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error('THORChain fallback failed:', err.message);
        return null;
    }
}

/**
 * Get THORChain inbound vault addresses for deposits
 */
async function getInboundAddresses() {
    try {
        const res = await fetch(`${THORNODE_BASE}/thorchain/inbound_addresses`);
        if (!res.ok) throw new Error(`Inbound addresses error: ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error('Inbound addresses fetch failed:', err.message);
        return [];
    }
}

module.exports = { getQuote, buildSwapTx, getInboundAddresses };
