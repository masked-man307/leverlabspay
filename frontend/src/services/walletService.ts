import { BrowserProvider, JsonRpcSigner } from 'ethers';

export type WalletType = 'metamask' | 'trustwallet' | 'phantom';

export interface WalletConnection {
    provider: BrowserProvider;
    signer: JsonRpcSigner;
    address: string;
    chainId: number;
    walletType: WalletType;
}

/**
 * Detect which wallets are available in the browser
 */
export function detectWallets(): { type: WalletType; name: string; icon: string; available: boolean }[] {
    const ethereum = (window as any).ethereum;
    const phantom = (window as any).phantom;
    const trustwallet = (window as any).trustwallet;

    return [
        {
            type: 'metamask' as WalletType,
            name: 'MetaMask',
            icon: 'https://raw.githubusercontent.com/MetaMask/brand-assets/main/Assets/SVG/Icon/FullColor/MetaMask_Icon_FullColor.svg',
            available: !!(ethereum?.isMetaMask)
        },
        {
            type: 'trustwallet' as WalletType,
            name: 'Trust Wallet',
            icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
            available: !!(trustwallet || ethereum?.isTrust)
        },
        {
            type: 'phantom' as WalletType,
            name: 'Phantom',
            icon: 'https://raw.githubusercontent.com/phantom-labs/press-kit/main/logo/phantom-icon-purple.svg',
            available: !!(phantom?.ethereum)
        }
    ];
}

/**
 * Get the raw ethereum provider for a specific wallet type
 */
function getProviderForWallet(walletType: WalletType): any {
    const ethereum = (window as any).ethereum;
    const phantom = (window as any).phantom;
    const trustwallet = (window as any).trustwallet;

    switch (walletType) {
        case 'metamask':
            // If multiple providers injected, find MetaMask specifically
            if (ethereum?.providers) {
                return ethereum.providers.find((p: any) => p.isMetaMask) || ethereum;
            }
            return ethereum;
        case 'trustwallet':
            return trustwallet?.ethereum || (ethereum?.isTrust ? ethereum : null);
        case 'phantom':
            return phantom?.ethereum || null;
        default:
            return ethereum;
    }
}

/**
 * Connect to a specific wallet
 */
export async function connectWallet(walletType: WalletType): Promise<WalletConnection> {
    const rawProvider = getProviderForWallet(walletType);

    if (!rawProvider) {
        throw new Error(`${walletType} wallet not found. Please install it.`);
    }

    const provider = new BrowserProvider(rawProvider);
    await rawProvider.request({ method: 'eth_requestAccounts' });

    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);

    return { provider, signer, address, chainId, walletType };
}
