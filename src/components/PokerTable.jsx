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
                    setGameState(message.data);
                    setRaiseAmount(Math.max(message.data.currentBet * 2, 40));
                    
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
                        // Fold sound if someone folded
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
                    // Update the ref AFTER processing sounds
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

        return () => {
            if (ws.current) {
                ws.current.close();
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tableId, user, token, navigate]);

    const handleAction = (action, amount = 0) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ action, amount }));
            if (action === 'fold') foldSound.current.play().catch(e=>console.log(e));
            if (action === 'call' || action === 'raise') callRaiseSound.current.play().catch(e=>console.log(e));
        }
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

    return (
        <div style={{ padding: '0.5rem', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <header className="glass-panel" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Users size={18} /> Global Table
                    </h2>
                </div>
                <div style={{ color: 'var(--text-muted)', fontWeight: '500', fontSize: '0.9rem' }}>
                    Status: <span style={{ color: state === 'waiting' ? 'orange' : 'var(--accent-color)', textTransform: 'capitalize' }}>{state}</span>
                </div>
                <button onClick={() => navigate('/lobby')} className="btn-secondary" style={{ padding: '0.4rem 0.8rem', display: 'flex', gap: '0.5rem', fontSize: '0.9rem' }}>
                    <LogOut size={16}/> Leave
                </button>
            </header>

            <main className="poker-table-surface" style={{ flex: 1, borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', minHeight: '400px' }}>
                
                {/* Information Overlay */}
                {gameState.notification && (
                    <div className="glass-panel animate-fade-in" style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', padding: '1rem', zIndex: 10,  boxShadow: '0 0 30px rgba(251, 191, 36, 0.4)', border: '1px solid var(--chip-gold)', width: '80%', maxWidth: '400px', textAlign: 'center' }}>
                        <h3 style={{ margin: 0, color: 'var(--chip-gold)', fontSize: '1.1rem' }}>{gameState.notification}</h3>
                    </div>
                )}

                {/* Pot & Community Cards Container - Responsive Auto-layout via Flex */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '1rem', gap: '1rem', zIndex: 5 }}>
                    <div className="glass-card" style={{ padding: '0.5rem 1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', borderRadius: 'var(--radius-xl)' }}>
                        <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>POT</span>
                        <span style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--chip-gold)' }}>${pot}</span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem', background: 'rgba(0,0,0,0.3)', padding: '0.8rem', borderRadius: 'var(--radius-md)', flexWrap: 'wrap', justifyContent: 'center', perspective: '600px' }}>
                        {[0, 1, 2, 3, 4].map(i => {
                            const card = communityCards[i];
                            // Determine animation class based on which street this card belongs to
                            let animClass = 'card-flip';
                            let delay = 0;
                            if (i < 3) {
                                // Flop cards - staggered slide
                                animClass = 'card-slide';
                                delay = i * 150;
                            } else if (i === 3) {
                                // Turn card
                                animClass = 'card-flip';
                                delay = 0;
                            } else {
                                // River card
                                animClass = 'card-flip';
                                delay = 0;
                            }
                            return card ? renderCard(card, i, animClass, delay) : renderCard(null, i);
                        })}
                    </div>
                </div>

                {/* Players Grid (Responsive wrapper around absolute positioning/flex rules) */}
                {/* On mobile, this overlays nicely via flex wrapping at the borders */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', padding: '0.5rem', justifyContent: 'center', background: 'rgba(0,0,0,0.2)', alignItems: 'flex-start' }}>
                    {players.map((p, idx) => {
                        const isCurrent = currentPlayerIndex === idx && state !== 'waiting';
                        const isMe = p.username === user.username;
                        // During all-in runout, show everyone's probability (cards are face-up)
                        // Otherwise, only show own probability
                        const showProb = (isAllinRunout || isMe) && p.winProb > 0 && !p.folded && state !== 'waiting';

                        return (
                            <div key={p.username} className={`glass-card ${isCurrent ? 'animate-pulse' : ''}`} style={{ 
                                padding: '0.8rem', flex: '1 1 120px', maxWidth: '180px', textAlign: 'center', position: 'relative',
                                border: isCurrent ? '2px solid var(--accent-color)' : '1px solid var(--glass-border)',
                                opacity: p.folded ? 0.4 : 1, transition: 'all 0.3s ease'
                            }}>
                                <div style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.2rem', color: isMe ? 'var(--accent-color)' : 'white' }}>
                                    {p.fullName || p.username} {isMe && '(You)'}
                                </div>
                                <div style={{ color: 'var(--chip-gold)', fontWeight: 'bold', marginBottom: '0.3rem', fontSize: '1.1rem' }}>${p.chips}</div>
                                
                                {showProb && (
                                     <div className="animate-fade-in" style={{ position: 'absolute', top: '-10px', right: '-10px', background: isAllinRunout ? 'linear-gradient(135deg, #dc2626, #f97316)' : 'linear-gradient(135deg, #2563eb, #7c3aed)', color: 'white', fontSize: '0.7rem', fontWeight: 'bold', padding: '2px 6px', borderRadius: '10px', boxShadow: isAllinRunout ? '0 2px 8px rgba(220, 38, 38, 0.5)' : '0 2px 8px rgba(124, 58, 237, 0.5)', transition: 'all 0.3s ease' }}>
                                        {p.winProb}%
                                     </div>
                                )}

                                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', background: 'rgba(0,0,0,0.4)', padding: '0.2rem', borderRadius: '4px', marginBottom: '0.5rem' }}>
                                    Bet: ${p.bet}
                                </div>
                                
                                {/* Show cards if it's us or showdown mode where cards are revealed or post_hand_reveal where specific ones are revealed */}
                                <div style={{ display: 'flex', gap: '0.1rem', justifyContent: 'center' }}>
                                    {(p.cards && p.cards.length > 0) ? (
                                        p.cards.map((c, i) => <div key={i} style={{ transform: 'scale(0.8)', margin: '-5px -3px' }}>{renderCard(c, i, 'card-deal', i * 100)}</div>)
                                    ) : (
                                        isMe && privateCards.length > 0 ? (
                                           privateCards.map((c, i) => <div key={i} style={{ transform: 'scale(0.8)', margin: '-5px -3px' }}>{renderCard(c, i, 'card-deal', i * 150)}</div>)
                                        ) : (
                                            !p.folded && state !== 'waiting' ? (
                                                <div style={{ display: 'flex', gap: '2px' }}>
                                                    <div style={{ width: '25px', height: '35px', background: 'repeating-linear-gradient(45deg, var(--suit-red) 0px, var(--suit-red) 4px, white 4px, white 8px)', borderRadius: '2px', border: '1px solid white' }} />
                                                    <div style={{ width: '25px', height: '35px', background: 'repeating-linear-gradient(45deg, var(--suit-red) 0px, var(--suit-red) 4px, white 4px, white 8px)', borderRadius: '2px', border: '1px solid white' }} />
                                                </div>
                                            ) : null
                                        )
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

            </main>

            {/* Action Bar - Highly Responsive Flex Toolbar */}
            <footer className="glass-panel" style={{ padding: '1rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', opacity: isMyTurn ? 1 : 0.5, transition: 'opacity 0.3s' }}>
                <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 100px' }}>
                     <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Current Call: <span style={{ color: 'white', fontWeight: 'bold' }}>${gameState.currentBet}</span></span>
                     <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Your Bet: <span style={{ color: 'white', fontWeight: 'bold' }}>${myPlayer?.bet || 0}</span></span>
                </div>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', justifyContent: 'flex-end', flex: '1 1 200px' }}>
                    <button className="btn-secondary" disabled={!isMyTurn} onClick={() => handleAction('fold')} style={{ border: '1px solid var(--suit-red)', color: 'var(--suit-red)', flex: 1 }}>
                        Fold
                    </button>
                    <button className="btn-primary" disabled={!isMyTurn} onClick={() => handleAction('call')} style={{ flex: 1 }}>
                        Call {gameState.currentBet > (myPlayer?.bet || 0) ? `$${gameState.currentBet - (myPlayer?.bet || 0)}` : '(Check)'}
                    </button>
                    
                    <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'stretch', background: 'rgba(0,0,0,0.2)', padding: '0.3rem', borderRadius: 'var(--radius-sm)', flex: 2 }}>
                        <input 
                            type="number" 
                            className="input-field" 
                            style={{ width: '70px', padding: '0.5rem', flex: 1 }} 
                            value={raiseAmount} 
                            onChange={e => setRaiseAmount(Number(e.target.value))}
                            min={gameState.currentBet + 20}
                            disabled={!isMyTurn}
                        />
                        <button className="btn-secondary" disabled={!isMyTurn} onClick={() => handleAction('raise', raiseAmount)} style={{ flex: 1, padding: '0.5rem' }}>
                            Raise
                        </button>
                    </div>
                </div>
            </footer>

            {/* Post Hand Reveal Options */}
            {state === 'post_hand_reveal' && !myPlayer?.folded && (
                <div className="glass-panel animate-fade-in" style={{ padding: '1rem', display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '0.5rem', border: '1px solid var(--chip-gold)' }}>
                    <span style={{ color: 'var(--chip-gold)', fontWeight: 'bold', alignSelf: 'center' }}>You Won! Show Cards?</span>
                    <button className="btn-secondary" onClick={() => handleAction('show_card', 0)} disabled={myPlayer.shownCards?.includes(0)}>Show Left</button>
                    <button className="btn-secondary" onClick={() => handleAction('show_card', 1)} disabled={myPlayer.shownCards?.includes(1)}>Show Right</button>
                    <button className="btn-primary" onClick={() => handleAction('show_card', 2)} disabled={myPlayer.shownCards?.includes(0) && myPlayer.shownCards?.includes(1)}>Show Both</button>
                </div>
            )}
        </div>
    );
};

export default PokerTable;
