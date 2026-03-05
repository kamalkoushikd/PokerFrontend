import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Copy, Check, Users } from 'lucide-react';

const suitsMap = {
  'h': { icon: '♥', color: 'var(--suit-red)' },
  'd': { icon: '♦', color: 'var(--suit-red)' },
  'c': { icon: '♣', color: 'var(--suit-black)' },
  's': { icon: '♠', color: 'var(--suit-black)' }
};

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/table';

const PokerTable = () => {
    // Single Global Table
    const tableId = "main";
    const { user, token } = useAuth();
    const navigate = useNavigate();
    
    const [gameState, setGameState] = useState(null);
    const [privateCards, setPrivateCards] = useState([]);
    const [raiseAmount, setRaiseAmount] = useState(0);
    const [timeLeft, setTimeLeft] = useState(null);
    const [editStackTarget, setEditStackTarget] = useState(null);
    const [editStackValue, setEditStackValue] = useState('');
    const [isAway, setIsAway] = useState(false);
    const raiseInputRef = useRef(null);
    // Refs for stable keyboard handler
    const gameStateRef = useRef(null);
    const raiseAmountRef = useRef(0);
    const userRef = useRef(null);
    useEffect(() => { userRef.current = user; }, [user]);
    useEffect(() => { raiseAmountRef.current = raiseAmount; }, [raiseAmount]);
    
    // Use a ref to track previous state for sounds (avoids re-creating WebSocket)
    const prevStateRef = useRef(null);
    
    // Audio refs
    const foldSound = useRef(new Audio('/sliding_card.wav'));
    const callRaiseSound = useRef(new Audio('/chips_stacking_short.wav'));
    const winSound = useRef(new Audio('/cartoon_success_fanfare.wav'));
    const dealSound = useRef(new Audio('/shuffle_cards_and_deal.wav'));
    
    const ws = useRef(null);

    useEffect(() => {
        if (!user || !token) {
            navigate('/login');
            return;
        }

        ws.current = new WebSocket(`${WS_URL}?token=${token}`);

        ws.current.onopen = () => {
            console.log('Connected to table');
        };

        ws.current.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'table_state') {
                    const prevState = prevStateRef.current;
                    gameStateRef.current = message.data;
                    setGameState(message.data);
                    setRaiseAmount(prev => {
                        // Only auto-update raise amount when it's a new hand (state became preflop)
                        if (prevState?.state !== 'preflop' && message.data.state === 'preflop') {
                            return Math.max(message.data.currentBet * 2, message.data.bigBlind * 2);
                        }
                        return prev;
                    });
                    
                    // Sound Logic
                    if (prevState && message.data) {
                        if (prevState.state === 'waiting' && message.data.state === 'preflop') {
                            dealSound.current.play().catch(e=>console.log(e));
                        }
                        if (message.data.state === 'showdown' || message.data.state === 'post_hand_reveal') {
                            if (prevState.state !== 'showdown' && prevState.state !== 'post_hand_reveal') {
                                winSound.current.play().catch(e=>console.log(e));
                            }
                        }
                        if (message.data.pot > prevState.pot) {
                            callRaiseSound.current.play().catch(e=>console.log(e));
                        }
                        const prevPlayers = prevState.players;
                        const newPlayers = message.data.players;
                        if (prevPlayers && prevPlayers.length === newPlayers.length) {
                             newPlayers.forEach((np, i) => {
                                 if (!prevPlayers[i].folded && np.folded && np.username !== user?.username) {
                                     foldSound.current.play().catch(e=>console.log(e));
                                 }
                             });
                        }
                    }
                    prevStateRef.current = message.data;
                } else if (message.type === 'private_state') {
                    setPrivateCards(message.data.cards || []);
                } else if (message.type === 'error') {
                    alert(message.data.message);
                    navigate('/lobby');
                }
            } catch (err) {
                console.error("Failed to parse WS message", err);
            }
        };

        ws.current.onclose = (event) => {
            console.log('Disconnected from table', event.code);
            if(event.code === 1008) {
                navigate('/lobby');
            }
        };

        // When the tab closes, tell the server we're going offline (keep seat)
        const handleBeforeUnload = () => {
            if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                ws.current.send(JSON.stringify({ action: 'set_away' }));
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            if (ws.current) {
                ws.current.close();
            }
        };
    }, [tableId, user, token, navigate]);

    // Countdown timer effect — float timeLeft for smooth SVG ring
    useEffect(() => {
        if (!gameState?.turnDeadline) {
            setTimeLeft(null);
            return;
        }
        const updateTimer = () => {
            const now = Date.now() / 1000;
            const remaining = Math.max(0, gameState.turnDeadline - now);
            setTimeLeft(remaining);
        };
        updateTimer();
        const interval = setInterval(updateTimer, 100);
        return () => clearInterval(interval);
    }, [gameState?.turnDeadline]);

    const handleAction = (action, amount = 0, target = '') => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ action, amount, target }));
            if (action === 'fold') foldSound.current.play().catch(e=>console.log(e));
            if (action === 'call' || action === 'raise') callRaiseSound.current.play().catch(e=>console.log(e));
        }
    };

    const handleLeave = () => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ action: 'leave_table' }));
        }
        navigate('/lobby');
    };

    // Keyboard shortcuts: F=fold, C/Space=call, R=focus raise input
    useEffect(() => {
        const onKey = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            const gs = gameStateRef.current;
            if (!gs) return;
            const { players, currentPlayerIndex, state: phase } = gs;
            const active = !['waiting', 'showdown', 'allin_runout', 'post_hand_reveal'].includes(phase);
            const myTurn = active && players[currentPlayerIndex]?.username === userRef.current?.username;
            if (!myTurn) return;
            if (e.key.toLowerCase() === 'f') { e.preventDefault(); handleAction('fold'); }
            else if (e.key.toLowerCase() === 'c' || e.key === ' ') { e.preventDefault(); handleAction('call'); }
            else if (e.key.toLowerCase() === 'r') { e.preventDefault(); raiseInputRef.current?.focus(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []); // stable — reads from refs

    const toggleAway = () => {
        const newAway = !isAway;
        setIsAway(newAway);
        handleAction(newAway ? 'set_away' : 'set_active');
    };

    const submitEditStack = (targetUsername) => {
        const chips = parseInt(editStackValue, 10);
        if (isNaN(chips) || chips < 0) return;
        handleAction('edit_stack', chips, targetUsername);
        setEditStackTarget(null);
        setEditStackValue('');
    };

    if (!gameState) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '1.5rem', color: 'var(--accent-color)' }} className="animate-pulse">Loading Table...</div>;
    }

    const { players, pot, communityCards, state, currentPlayerIndex } = gameState;
    const isMyTurn = players[currentPlayerIndex]?.username === user?.username && !['waiting', 'showdown', 'allin_runout', 'post_hand_reveal'].includes(state);
    const myPlayer = players.find(p => p.username === user?.username);
    const isAllinRunout = state === 'allin_runout';

    // Helpers to render cards responsive
    const renderCard = (cardStr, i, animClass = 'animate-fade-in', delay = 0) => {
        if (!cardStr) return <div key={i} className="glass-panel" style={{ width: '45px', height: '65px', background: 'rgba(255,255,255,0.05)', flexShrink: 0 }} />;
        const rank = cardStr[0];
        const suit = cardStr[1];
        const { icon, color } = suitsMap[suit];
        return (
            <div key={str_to_key(cardStr, i)} className={animClass} style={{ 
                width: '45px', height: '65px', background: 'white', borderRadius: '4px', 
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '2px 4px',
                color: color, fontWeight: 'bold', fontSize: '1rem', boxShadow: '0 4px 6px rgba(0,0,0,0.3)', flexShrink: 0,
                animationDelay: `${delay}ms`
            }}>
                <span style={{ alignSelf: 'flex-start', lineHeight: 1 }}>{rank}</span>
                <span style={{ alignSelf: 'center', fontSize: '1.5rem', lineHeight: 1 }}>{icon}</span>
                <span style={{ alignSelf: 'flex-end', transform: 'rotate(180deg)', lineHeight: 1 }}>{rank}</span>
            </div>
        );
    };

    const str_to_key = (str, i) => `${str}-${i}`;

    const isHost = gameState?.hostUsername === user?.username;
    const pendingPlayers = gameState?.pendingPlayers || [];

    // Calculate positions around an ellipse for each player
    const getPlayerPosition = (idx, total) => {
        // Start from bottom center, go clockwise
        const angle = (Math.PI / 2) + (2 * Math.PI * idx / total);
        const rx = 42; // horizontal radius %
        const ry = 38; // vertical radius %
        return {
            left: `${50 + rx * Math.cos(angle)}%`,
            top: `${50 + ry * Math.sin(angle)}%`,
        };
    };

    return (
        <div style={{ padding: '0.5rem', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <header className="glass-panel" style={{ padding: '0.8rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Users size={18} /> Global Table
                    </h2>
                    {isHost && <span style={{ fontSize: '0.7rem', background: 'var(--chip-gold)', color: '#000', padding: '1px 6px', borderRadius: '8px', fontWeight: 'bold' }}>HOST</span>}
                </div>
                <div style={{ color: 'var(--text-muted)', fontWeight: '500', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    Status: <span style={{ color: state === 'waiting' ? 'orange' : 'var(--accent-color)', textTransform: 'capitalize' }}>{state === 'allin_runout' ? 'All-In Runout' : state}</span>
                    {timeLeft !== null && timeLeft > 0 && ((
                        <span style={{ 
                            background: timeLeft <= 5 ? 'rgba(239,68,68,0.3)' : timeLeft <= 10 ? 'rgba(251,191,36,0.2)' : 'rgba(34,197,94,0.15)', 
                            color: timeLeft <= 5 ? '#ef4444' : timeLeft <= 10 ? 'var(--chip-gold)' : '#22c55e',
                            padding: '2px 8px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 'bold',
                            border: `1px solid ${timeLeft <= 5 ? '#ef4444' : timeLeft <= 10 ? 'var(--chip-gold)' : '#22c55e'}`,
                            animation: timeLeft <= 5 ? 'pulse-glow 0.5s infinite' : 'none'
                        }}>
                            ⏱ {Math.ceil(timeLeft)}s
                        </span>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                        onClick={toggleAway}
                        className={isAway ? 'btn-primary' : 'btn-secondary'}
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', 
                            border: isAway ? '1px solid #f97316' : '1px solid var(--glass-border)',
                            color: isAway ? '#f97316' : 'var(--text-muted)' }}
                    >
                        {isAway ? '🔄 Back' : '💤 Away'}
                    </button>
                    <button onClick={handleLeave} className="btn-secondary" style={{ padding: '0.4rem 0.8rem', display: 'flex', gap: '0.5rem', fontSize: '0.9rem' }}>
                        <LogOut size={16}/> Leave
                    </button>
                </div>
            </header>

            {/* Host Approval Panel */}
            {isHost && pendingPlayers.length > 0 && (
                <div className="glass-panel animate-fade-in" style={{ padding: '0.8rem 1rem', border: '1px solid var(--chip-gold)' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--chip-gold)', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                        🔔 Player Requests
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {pendingPlayers.map(pp => (
                            <div key={pp.username} className="glass-card" style={{ padding: '0.5rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.85rem', color: 'white' }}>{pp.fullName}</span>
                                <button className="btn-primary" onClick={() => handleAction('approve_player', 0, pp.username)} style={{ padding: '2px 8px', fontSize: '0.75rem' }}>✓</button>
                                <button className="btn-secondary" onClick={() => handleAction('reject_player', 0, pp.username)} style={{ padding: '2px 8px', fontSize: '0.75rem', border: '1px solid #ef4444', color: '#ef4444' }}>✗</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <main className="poker-table-surface" style={{ flex: 1, borderRadius: 'var(--radius-lg)', position: 'relative', overflow: 'hidden', minHeight: '500px' }}>
                
                {/* Information Overlay */}
                {gameState.notification && (
                    <div className="glass-panel animate-fade-in" style={{ position: 'absolute', top: '8%', left: '50%', transform: 'translateX(-50%)', padding: '0.8rem 1.5rem', zIndex: 10, boxShadow: '0 0 30px rgba(251, 191, 36, 0.4)', border: '1px solid var(--chip-gold)', maxWidth: '400px', textAlign: 'center' }}>
                        <h3 style={{ margin: 0, color: 'var(--chip-gold)', fontSize: '1rem' }}>{gameState.notification}</h3>
                    </div>
                )}

                {/* Center: Pot & Community Cards */}
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.8rem', zIndex: 5 }}>
                    <div className="glass-card" style={{ padding: '0.3rem 1.2rem', display: 'flex', gap: '0.5rem', alignItems: 'center', borderRadius: 'var(--radius-xl)' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>POT</span>
                        <span key={pot} className="pot-pop" style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--chip-gold)', display: 'inline-block' }}>${pot}</span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.3rem', background: 'rgba(0,0,0,0.3)', padding: '0.6rem', borderRadius: 'var(--radius-md)', perspective: '600px' }}>
                        {[0, 1, 2, 3, 4].map(i => {
                            const card = communityCards[i];
                            let animClass = 'card-flip';
                            let delay = 0;
                            if (i < 3) { animClass = 'card-slide'; delay = i * 150; }
                            return card ? renderCard(card, i, animClass, delay) : renderCard(null, i);
                        })}
                    </div>
                </div>

                {/* Players positioned around the table */}
                {players.map((p, idx) => {
                    const isCurrent = currentPlayerIndex === idx && !['waiting', 'showdown', 'allin_runout', 'post_hand_reveal'].includes(state);
                    const isMe = p.username === user.username;
                    const showProb = (isAllinRunout || isMe) && p.winProb > 0 && !p.folded && state !== 'waiting';
                    const pos = getPlayerPosition(idx, players.length);
                    const isOffline = !p.isOnline;
                    const isAwaySeat = p.isAway;

                    // SVG timer ring parameters
                    const RING_R = 52; // radius (px) around the card area
                    const RING_CIRC = 2 * Math.PI * RING_R; // ~326
                    const TURN_TOTAL = gameState.turnTimeLimit || 30;
                    const progress = isCurrent && timeLeft !== null ? timeLeft / TURN_TOTAL : 0;
                    const dashOffset = RING_CIRC * (1 - progress);
                    // Color: green → yellow → red as time decreases
                    const ringColor = isCurrent && timeLeft !== null
                        ? timeLeft > 15 ? '#22c55e'
                        : timeLeft > 8 ? '#f59e0b'
                        : '#ef4444'
                        : 'transparent';
                    const ringGlow = isCurrent && timeLeft !== null
                        ? timeLeft > 15 ? 'drop-shadow(0 0 6px #22c55e)'
                        : timeLeft > 8 ? 'drop-shadow(0 0 6px #f59e0b)'
                        : 'drop-shadow(0 0 8px #ef4444)'
                        : 'none';

                    return (
                        <div key={p.username} style={{ 
                            position: 'absolute', ...pos, transform: 'translate(-50%, -50%)',
                            zIndex: 6, width: '140px', textAlign: 'center',
                        }}>
                            {/* SVG Timer Ring - rendered around the card box when it's this player's turn */}
                            {isCurrent && timeLeft !== null && (
                                <svg
                                    style={{ position: 'absolute', top: '50%', left: '50%',
                                        transform: 'translate(-50%, -50%)',
                                        width: `${RING_R * 2 + 16}px`, height: `${RING_R * 2 + 16}px`,
                                        pointerEvents: 'none', zIndex: 7,
                                        filter: ringGlow }}
                                    viewBox={`0 0 ${RING_R * 2 + 16} ${RING_R * 2 + 16}`}
                                >
                                    {/* Background ring */}
                                    <circle
                                        cx={RING_R + 8} cy={RING_R + 8} r={RING_R}
                                        fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4"
                                    />
                                    {/* Progress ring */}
                                    <circle
                                        cx={RING_R + 8} cy={RING_R + 8} r={RING_R}
                                        fill="none"
                                        stroke={ringColor}
                                        strokeWidth="4"
                                        strokeLinecap="round"
                                        strokeDasharray={RING_CIRC}
                                        strokeDashoffset={dashOffset}
                                        transform={`rotate(-90 ${RING_R + 8} ${RING_R + 8})`}
                                        style={{ transition: 'stroke-dashoffset 0.25s linear, stroke 0.5s ease' }}
                                    />
                                    {/* Timer text in ring */}
                                    <text
                                        x={RING_R + 8} y={RING_R + 8 - RING_R - 6}
                                        textAnchor="middle" dominantBaseline="middle"
                                        fill={ringColor}
                                        fontSize="11" fontWeight="bold"
                                        style={{ fontFamily: 'monospace' }}
                                    >
                                        {Math.ceil(timeLeft)}s
                                    </text>
                                </svg>
                            )}

                            <div className={`glass-card ${isCurrent ? 'animate-pulse' : ''}`} style={{ 
                                padding: '0.6rem',
                                border: isCurrent
                                    ? `2px solid ${ringColor !== 'transparent' ? ringColor : 'var(--accent-color)'}`
                                    : isOffline ? '1px solid #6b7280' : '1px solid var(--glass-border)',
                                opacity: p.folded ? 0.4 : isOffline ? 0.6 : 1,
                                transition: 'all 0.3s ease',
                            }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.1rem', color: isMe ? 'var(--accent-color)' : isOffline ? '#9ca3af' : 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                                    {isOffline && <span title="Offline" style={{ fontSize: '0.7rem' }}>📴</span>}
                                    {!isOffline && isAwaySeat && <span title="Away" style={{ fontSize: '0.7rem' }}>💤</span>}
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {p.fullName || p.username} {isMe && '(You)'}
                                    </span>
                                </div>
                                <div style={{ color: 'var(--chip-gold)', fontWeight: 'bold', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                                    ${p.chips}
                                    {/* Host edit stack button */}
                                    {isHost && !isMe && (
                                        <button
                                            onClick={() => { setEditStackTarget(p.username); setEditStackValue(String(p.chips)); }}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--chip-gold)', fontSize: '0.7rem', padding: '0', lineHeight: 1, opacity: 0.7 }}
                                            title="Edit stack"
                                        >✏️</button>
                                    )}
                                </div>
                                
                                {/* Edit stack inline form */}
                                {isHost && editStackTarget === p.username && (
                                    <div className="animate-fade-in" style={{ display: 'flex', gap: '2px', marginTop: '0.3rem' }}>
                                        <input
                                            type="number"
                                            className="input-field"
                                            value={editStackValue}
                                            onChange={e => setEditStackValue(e.target.value)}
                                            style={{ width: '55px', padding: '2px 4px', fontSize: '0.75rem' }}
                                            autoFocus
                                            onKeyDown={e => { if (e.key === 'Enter') submitEditStack(p.username); if (e.key === 'Escape') setEditStackTarget(null); }}
                                        />
                                        <button className="btn-primary" onClick={() => submitEditStack(p.username)} style={{ padding: '2px 5px', fontSize: '0.7rem' }}>✓</button>
                                        <button className="btn-secondary" onClick={() => setEditStackTarget(null)} style={{ padding: '2px 5px', fontSize: '0.7rem' }}>✗</button>
                                    </div>
                                )}

                                {showProb && (
                                     <div className="animate-fade-in" title="Estimated win probability" style={{ position: 'absolute', top: '-10px', right: '-10px', background: isAllinRunout ? 'linear-gradient(135deg, #dc2626, #f97316)' : 'linear-gradient(135deg, #2563eb, #7c3aed)', color: 'white', fontSize: '0.6rem', fontWeight: 'bold', padding: '2px 5px', borderRadius: '10px', boxShadow: isAllinRunout ? '0 2px 8px rgba(220, 38, 38, 0.5)' : '0 2px 8px rgba(124, 58, 237, 0.5)', textAlign: 'center', lineHeight: 1.3 }}>
                                        <div style={{ opacity: 0.8, fontSize: '0.5rem', letterSpacing: '0.03em' }}>WIN</div>
                                        {p.winProb}%
                                     </div>
                                )}

                                {p.bet > 0 && (
                                    <div key={p.bet} className="bet-appear" style={{ color: 'var(--chip-gold)', fontSize: '0.7rem', background: 'rgba(0,0,0,0.4)', padding: '1px 4px', borderRadius: '4px', marginTop: '0.2rem' }}>
                                        Bet: ${p.bet}
                                    </div>
                                )}
                                
                                {/* Cards */}
                                <div style={{ display: 'flex', gap: '0.1rem', justifyContent: 'center', marginTop: '0.3rem' }}>
                                    {(p.cards && p.cards.length > 0) ? (
                                        p.cards.map((c, i) => <div key={i} style={{ transform: 'scale(0.7)', margin: '-8px -5px' }}>{renderCard(c, i, 'card-deal', i * 100)}</div>)
                                    ) : (
                                        isMe && privateCards.length > 0 ? (
                                           privateCards.map((c, i) => <div key={i} style={{ transform: 'scale(0.7)', margin: '-8px -5px' }}>{renderCard(c, i, 'card-deal', i * 150)}</div>)
                                        ) : (
                                            !p.folded && !isAwaySeat && state !== 'waiting' ? (
                                                <div style={{ display: 'flex', gap: '2px' }}>
                                                    <div style={{ width: '20px', height: '28px', background: 'repeating-linear-gradient(45deg, var(--suit-red) 0px, var(--suit-red) 3px, white 3px, white 6px)', borderRadius: '2px', border: '1px solid white' }} />
                                                    <div style={{ width: '20px', height: '28px', background: 'repeating-linear-gradient(45deg, var(--suit-red) 0px, var(--suit-red) 3px, white 3px, white 6px)', borderRadius: '2px', border: '1px solid white' }} />
                                                </div>
                                            ) : null
                                        )
                                    )}
                                </div>

                            </div>
                        </div>
                    );
                })}

            </main>

            {/* Action Bar */}
            <footer className="glass-panel" style={{ padding: '0.8rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.8rem', opacity: isMyTurn ? 1 : 0.5, transition: 'opacity 0.3s' }}>
                {/* Left: info column */}
                <div style={{ display: 'flex', flexDirection: 'column', flex: '0 0 130px', gap: '0.2rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        To call: <span style={{ color: 'white', fontWeight: 'bold' }}>${Math.max(0, gameState.currentBet - (myPlayer?.bet || 0))}</span>
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        Your bet: <span style={{ color: 'white', fontWeight: 'bold' }}>${myPlayer?.bet || 0}</span>
                    </span>
                    {isMyTurn && (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.62rem', marginTop: '0.15rem', letterSpacing: '0.02em' }}>
                            [F] Fold · [C] Call · [R] Raise
                        </span>
                    )}
                </div>

                {/* Right: buttons */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end', justifyContent: 'flex-end', flex: '1 1 280px' }}>
                    <button className="btn-secondary" disabled={!isMyTurn} onClick={() => handleAction('fold')}
                        style={{ border: '1px solid var(--suit-red)', color: 'var(--suit-red)', flex: '0 0 auto', minWidth: '75px' }}>
                        Fold <span style={{ fontSize: '0.62rem', opacity: 0.6 }}>[F]</span>
                    </button>
                    <button className="btn-primary" disabled={!isMyTurn} onClick={() => handleAction('call')}
                        style={{ flex: '0 0 auto', minWidth: '110px' }}>
                        {gameState.currentBet > (myPlayer?.bet || 0)
                            ? `Call $${gameState.currentBet - (myPlayer?.bet || 0)}`
                            : 'Check ✓'}
                        <span style={{ fontSize: '0.62rem', opacity: 0.7 }}> [C]</span>
                    </button>

                    {/* Raise controls */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 210px' }}>
                        {/* Quick raise presets */}
                        <div style={{ display: 'flex', gap: '0.2rem' }}>
                            {(() => {
                                const minR = gameState.minRaise || gameState.bigBlind || 20;
                                const myBet = myPlayer?.bet || 0;
                                const halfPot = Math.max(gameState.currentBet + minR, gameState.currentBet + Math.round(pot / 2));
                                const fullPot = Math.max(gameState.currentBet + minR, gameState.currentBet + pot);
                                const allIn = myBet + (myPlayer?.chips || 0);
                                return [
                                    { label: '½ Pot', val: halfPot },
                                    { label: 'Pot', val: fullPot },
                                    { label: 'All In', val: allIn },
                                ].map(({ label, val }) => (
                                    <button key={label} className="btn-secondary" disabled={!isMyTurn}
                                        onClick={() => setRaiseAmount(val)}
                                        style={{ flex: 1, padding: '0.18rem 0.25rem', fontSize: '0.68rem',
                                            borderColor: 'rgba(251,191,36,0.35)', color: 'var(--chip-gold)' }}>
                                        {label}
                                    </button>
                                ));
                            })()}
                        </div>
                        {/* Raise input row */}
                        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                            <input
                                ref={raiseInputRef}
                                type="number"
                                className="input-field"
                                style={{ width: '70px', padding: '0.4rem 0.5rem', flex: 1, fontSize: '0.9rem' }}
                                value={raiseAmount}
                                onChange={e => setRaiseAmount(Number(e.target.value))}
                                min={(gameState.minRaise || 20) + gameState.currentBet}
                                disabled={!isMyTurn}
                                onKeyDown={e => { if (e.key === 'Enter' && isMyTurn) handleAction('raise', raiseAmount); }}
                            />
                            <button className="btn-secondary" disabled={!isMyTurn}
                                onClick={() => handleAction('raise', raiseAmount)}
                                style={{ padding: '0.4rem 0.6rem', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                                Raise
                                <span style={{ color: 'var(--chip-gold)', fontWeight: 'bold', marginLeft: '0.3rem' }}>
                                    +${Math.max(0, raiseAmount - (myPlayer?.bet || 0))}
                                </span>
                                <span style={{ fontSize: '0.62rem', opacity: 0.6 }}> [R]</span>
                            </button>
                        </div>
                    </div>
                </div>
            </footer>

            {/* Post Hand Reveal Options */}
            {state === 'post_hand_reveal' && !myPlayer?.folded && (
                <div className="glass-panel animate-fade-in" style={{ padding: '0.8rem', display: 'flex', justifyContent: 'center', gap: '0.8rem', border: '1px solid var(--chip-gold)' }}>
                    <span style={{ color: 'var(--chip-gold)', fontWeight: 'bold', alignSelf: 'center', fontSize: '0.9rem' }}>Show Cards?</span>
                    <button className="btn-secondary" onClick={() => handleAction('show_card', 0)} disabled={myPlayer.shownCards?.includes(0)}>Left</button>
                    <button className="btn-secondary" onClick={() => handleAction('show_card', 1)} disabled={myPlayer.shownCards?.includes(1)}>Right</button>
                    <button className="btn-primary" onClick={() => handleAction('show_card', 2)} disabled={myPlayer.shownCards?.includes(0) && myPlayer.shownCards?.includes(1)}>Both</button>
                </div>
            )}
        </div>
    );
};

export default PokerTable;
