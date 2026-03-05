import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { adminCreateUser, getAllowedEmails, addAllowedEmail, removeAllowedEmail } from '../services/api';
import { LogOut, Play, UserPlus, ShieldAlert, Mail, Trash2 } from 'lucide-react';

const Lobby = () => {
    const { user, token, logoutUser } = useAuth();
    const navigate = useNavigate();
    
    // User Prov State
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [adminMsg, setAdminMsg] = useState('');
    const [adminErr, setAdminErr] = useState('');
    const [loading, setLoading] = useState(false);
    
    // Email Whitelist State
    const [emails, setEmails] = useState([]);
    const [newEmail, setNewEmail] = useState('');
    const [emailMsg, setEmailMsg] = useState('');
    const [emailErr, setEmailErr] = useState('');
    const [emailLoading, setEmailLoading] = useState(false);

    const fetchEmails = useCallback(async () => {
        try {
            const data = await getAllowedEmails(token);
            setEmails(data);
        } catch (err) {
            console.error(err);
        }
    }, [token]);

    useEffect(() => {
        if (!user) {
            navigate('/login');
        } else if (user.is_admin) {
            fetchEmails();
        }
    }, [user, navigate, fetchEmails]);

    const handleCreateUser = async (e) => {
        e.preventDefault();
        setAdminMsg('');
        setAdminErr('');
        setLoading(true);
        try {
            const data = await adminCreateUser(newUsername, newPassword, token);
            setAdminMsg(data.message);
            setNewUsername('');
            setNewPassword('');
        } catch (err) {
            setAdminErr(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddEmail = async (e) => {
        e.preventDefault();
        setEmailMsg('');
        setEmailErr('');
        setEmailLoading(true);
        try {
            await addAllowedEmail(newEmail, token);
            setEmailMsg(`Added ${newEmail} to whitelist.`);
            setNewEmail('');
            fetchEmails();
        } catch (err) {
            setEmailErr(err.message);
        } finally {
            setEmailLoading(false);
        }
    };

    const handleRemoveEmail = async (id) => {
        try {
            await removeAllowedEmail(id, token);
            fetchEmails();
        } catch (err) {
            console.error(err);
        }
    };

    if (!user) return null;

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <header className="glass-panel" style={{ padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--accent-color)' }}>Texas Hold'em Gateway</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: '500', color: user.is_admin ? 'var(--suit-red)' : 'white' }}>
                            {user.username} {user.is_admin && '(Admin)'}
                        </span>
                    </div>
                    <div style={{ background: 'rgba(251, 191, 36, 0.1)', color: 'var(--chip-gold)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-xl)', fontWeight: '600', border: '1px solid rgba(251, 191, 36, 0.2)' }}>
                        Chips: {user.chips.toLocaleString()}
                    </div>
                    <button onClick={logoutUser} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}>
                        <LogOut size={16} /> Logout
                    </button>
                </div>
            </header>

            <main style={{ display: 'flex', flexDirection: 'column', gap: '2rem', alignItems: 'center', flex: 1 }}>
                
                <section className="glass-card animate-fade-in" style={{ padding: '3rem', width: '100%', maxWidth: '600px', textAlign: 'center' }}>
                    <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Welcome to the Room</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Join the global poker table to play.</p>
                    <button 
                         onClick={() => navigate('/table/main')} 
                         className="btn-primary" 
                         style={{ padding: '1.5rem 3rem', fontSize: '1.5rem', width: '100%', display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center' }}
                    >
                        <Play fill="currentColor" /> Enter Table
                    </button>
                </section>

                {user.is_admin && (
                    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', width: '100%', justifyContent: 'center' }}>
                        <section className="glass-card animate-fade-in" style={{ padding: '2rem', flex: '1 1 400px', maxWidth: '600px', animationDelay: '0.2s', borderTop: '4px solid var(--suit-red)' }}>
                            <h3 style={{ fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: 'var(--suit-red)' }}>
                                <ShieldAlert size={20} /> Provision User (Password/2FA)
                            </h3>
                            
                            {adminMsg && <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '0.75rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem' }}>{adminMsg}</div>}
                            {adminErr && <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--suit-red)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem' }}>{adminErr}</div>}

                            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <input
                                    type="text"
                                    value={newUsername}
                                    onChange={(e) => setNewUsername(e.target.value)}
                                    className="input-field"
                                    placeholder="New Username"
                                    required
                                />
                                <input
                                    type="text"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="input-field"
                                    placeholder="Initial Password"
                                    required
                                />
                                <button type="submit" className="btn-secondary" disabled={loading} style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                                    <UserPlus size={18} /> {loading ? 'Creating...' : 'Create Account'}
                                </button>
                            </form>
                        </section>

                        <section className="glass-card animate-fade-in" style={{ padding: '2rem', flex: '1 1 400px', maxWidth: '600px', animationDelay: '0.3s', borderTop: '4px solid #4285F4' }}>
                            <h3 style={{ fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: '#4285F4' }}>
                                <Mail size={20} /> Google OAuth Whitelist
                            </h3>
                            
                            {emailMsg && <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '0.75rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem' }}>{emailMsg}</div>}
                            {emailErr && <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--suit-red)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem' }}>{emailErr}</div>}

                            <form onSubmit={handleAddEmail} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                                <input
                                    type="email"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    className="input-field"
                                    placeholder="friend@gmail.com"
                                    required
                                    style={{ flex: 1 }}
                                />
                                <button type="submit" className="btn-secondary" disabled={emailLoading} style={{ padding: '0.5rem 1rem' }}>
                                    Add
                                </button>
                            </form>

                            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)', padding: '1rem', maxHeight: '200px', overflowY: 'auto' }}>
                                {emails.length === 0 ? (
                                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.9rem' }}>No emails whitelisted. Google Sign-In is blocked for everyone.</div>
                                ) : (
                                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {emails.map(e => (
                                            <li key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                                                <span style={{ fontSize: '0.9rem' }}>{e.email}</span>
                                                <button onClick={() => handleRemoveEmail(e.id)} style={{ background: 'transparent', border: 'none', color: 'var(--suit-red)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                                    <Trash2 size={16} />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </section>
                    </div>
                )}

            </main>
        </div>
    );
};

export default Lobby;
