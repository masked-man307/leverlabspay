/**
 * Supported token registry
 * Each token has: symbol, name, addresses (per chain), decimals, coingeckoId
 */

const TOKENS = {
    // Native ETH is handled separately (not ERC-20)
    ETH: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        coingeckoId: 'ethereum',
        isNative: true,
        addresses: {
            1: null,       // mainnet - native
            11155111: null  // sepolia - native
        }
    },
    USDC: {
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        coingeckoId: 'usd-coin',
        isNative: false,
        addresses: {
            1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            11155111: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
        }
    },
    USDT: {
        symbol: 'USDT',
        name: 'Tether USD',
        decimals: 6,
        coingeckoId: 'tether',
        isNative: false,
        addresses: {
            1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            11155111: null
        }
    },
    WBTC: {
        symbol: 'WBTC',
        name: 'Wrapped Bitcoin',
        decimals: 8,
        coingeckoId: 'wrapped-bitcoin',
        isNative: false,
        addresses: {
            1: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
            11155111: null
        }
    },
    WETH: {
        symbol: 'WETH',
        name: 'Wrapped Ether',
        decimals: 18,
        coingeckoId: 'weth',
        isNative: false,
        addresses: {
            1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            11155111: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9'
        }
    },
    DAI: {
        symbol: 'DAI',
        name: 'Dai Stablecoin',
        decimals: 18,
        coingeckoId: 'dai',
        isNative: false,
        addresses: {
            1: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
            11155111: null
        }
    },
    LINK: {
        symbol: 'LINK',
        name: 'Chainlink',
        decimals: 18,
        coingeckoId: 'chainlink',
        isNative: false,
        addresses: {
            1: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
            11155111: '0x779877A7B0D9E8603169DdbD7836e478b4624789'
        }
    },
    UNI: {
        symbol: 'UNI',
        name: 'Uniswap',
        decimals: 18,
        coingeckoId: 'uniswap',
        isNative: false,
        addresses: {
            1: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
            11155111: null
        }
    },
    SHIB: {
        symbol: 'SHIB',
        name: 'Shiba Inu',
        decimals: 18,
        coingeckoId: 'shiba-inu',
        isNative: false,
        addresses: {
            1: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
            11155111: null
        }
    }
};

/**
 * Get tokens available on a specific chain
 */
function getTokensForChain(chainId) {
    const result = {};
    for (const [symbol, token] of Object.entries(TOKENS)) {
        const address = token.addresses[chainId];
        if (address !== undefined) { // null = native, string = ERC-20 address
            result[symbol] = { ...token, address };
        }
    }
    return result;
}

/**
 * Get all CoinGecko IDs for price fetching
 */
function getAllCoingeckoIds() {
    return [...new Set(Object.values(TOKENS).map(t => t.coingeckoId))];
}

module.exports = { TOKENS, getTokensForChain, getAllCoingeckoIds };
