/**
 * Supported ERC-20 tokens — addresses + ABI for frontend balance detection.
 * Native ETH is handled separately.
 */

export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

export const ERC20_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)'
];

export interface TokenConfig {
    symbol: string;
    name: string;
    decimals: number;
    address: string | null; // null for native ETH
    isNative: boolean;
    coingeckoId: string;
}

// Mainnet ERC-20 tokens
export const MAINNET_TOKENS: TokenConfig[] = [
    { symbol: 'USDC', name: 'USD Coin', decimals: 6, address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', isNative: false, coingeckoId: 'usd-coin' },
    { symbol: 'USDT', name: 'Tether USD', decimals: 6, address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', isNative: false, coingeckoId: 'tether' },
    { symbol: 'WBTC', name: 'Wrapped Bitcoin', decimals: 8, address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', isNative: false, coingeckoId: 'wrapped-bitcoin' },
    { symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', isNative: false, coingeckoId: 'weth' },
    { symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18, address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', isNative: false, coingeckoId: 'dai' },
    { symbol: 'LINK', name: 'Chainlink', decimals: 18, address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', isNative: false, coingeckoId: 'chainlink' },
    { symbol: 'UNI', name: 'Uniswap', decimals: 18, address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', isNative: false, coingeckoId: 'uniswap' },
    { symbol: 'SHIB', name: 'Shiba Inu', decimals: 18, address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', isNative: false, coingeckoId: 'shiba-inu' },
];

// Sepolia testnet ERC-20 tokens
export const SEPOLIA_TOKENS: TokenConfig[] = [
    { symbol: 'USDC', name: 'USD Coin', decimals: 6, address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', isNative: false, coingeckoId: 'usd-coin' },
    { symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, address: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9', isNative: false, coingeckoId: 'weth' },
    { symbol: 'LINK', name: 'Chainlink', decimals: 18, address: '0x779877A7B0D9E8603169DdbD7836e478b4624789', isNative: false, coingeckoId: 'chainlink' },
];

export function getTokensForChain(chainId: number): TokenConfig[] {
    switch (chainId) {
        case 1: return MAINNET_TOKENS;
        case 11155111: return SEPOLIA_TOKENS;
        default: return MAINNET_TOKENS;
    }
}

// Permit2 EIP-712 types for batch transfer
export const PERMIT2_BATCH_TYPES = {
    PermitBatchTransferFrom: [
        { name: 'permitted', type: 'TokenPermissions[]' },
        { name: 'spender', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
    ],
    TokenPermissions: [
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' }
    ]
};

// Single token Permit2 types
export const PERMIT2_SINGLE_TYPES = {
    PermitTransferFrom: [
        { name: 'permitted', type: 'TokenPermissions' },
        { name: 'spender', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
    ],
    TokenPermissions: [
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' }
    ]
};
