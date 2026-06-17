const { getAllCoingeckoIds, TOKENS } = require('../config/tokens');

let priceCache = {};
let lastFetch = 0;
const CACHE_TTL = 60_000; // 60 seconds

/**
 * Fetch USD prices for all supported tokens from CoinGecko
 * Uses free demo API — 100 calls/min rate limit
 */
async function fetchPrices() {
    const now = Date.now();
    if (now - lastFetch < CACHE_TTL && Object.keys(priceCache).length > 0) {
        return priceCache;
    }

    const ids = getAllCoingeckoIds().join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;

    const headers = {};
    if (process.env.COINGECKO_API_KEY) {
        headers['x-cg-demo-api-key'] = process.env.COINGECKO_API_KEY;
    }

    try {
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`CoinGecko API error: ${res.status}`);
        const data = await res.json();

        // Map coingeckoId → symbol → price
        const prices = {};
        for (const [symbol, token] of Object.entries(TOKENS)) {
            const priceData = data[token.coingeckoId];
            prices[symbol] = priceData ? priceData.usd : 0;
        }

        priceCache = prices;
        lastFetch = now;
        return prices;
    } catch (err) {
        console.error('Price fetch error:', err.message);
        // Return cache or zeros
        if (Object.keys(priceCache).length > 0) return priceCache;

        const fallback = {};
        for (const symbol of Object.keys(TOKENS)) {
            fallback[symbol] = 0;
        }
        return fallback;
    }
}

module.exports = { fetchPrices };
