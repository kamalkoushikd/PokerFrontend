import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { login, setup2FA, googleAuth } from '../services/api';
import { supabase } from '../services/supabase';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [totpCode, setTotpCode] = useState('');
    
    // States: 'login' | 'totp_input' | 'totp_setup'
    const [step, setStep] = useState('login');
    const [setupUri, setSetupUri] = useState('');
    const [tempToken, setTempToken] = useState('');
    
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    
    const { loginUser } = useAuth();
    const navigate = useNavigate();

    // Listen for Supabase auth state changes (for Google OAuth redirect)
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session?.provider_token) {
                // We got Google's access token from Supabase 
                setGoogleLoading(true);
                try {
                    const data = await googleAuth(session.provider_token);
                    loginUser(data.user, data.token);
                    navigate('/lobby');
                } catch (err) {
                    setError(err.message);
                } finally {
                    setGoogleLoading(false);
                }
            } else if (event === 'SIGNED_IN' && session?.access_token) {
                // Fallback: use Supabase access token to get user info
                // Try to get provider_token from session
                const providerToken = session.provider_token;
                if (providerToken) {
                    setGoogleLoading(true);
                    try {
                        const data = await googleAuth(providerToken);
                        loginUser(data.user, data.token);
                        navigate('/lobby');
                    } catch (err) {
                        setError(err.message);
                    } finally {
                        setGoogleLoading(false);
                    }
                }
            }
        });

        return () => subscription.unsubscribe();
    }, [loginUser, navigate]);

    const handleGoogleLogin = async () => {
        setError('');
        setGoogleLoading(true);
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin + '/login',
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'consent',
                    },
                    scopes: 'openid email profile'
                }
            });
            if (error) throw error;
        } catch (err) {
            setError(err.message);
            setGoogleLoading(false);
        }
    };

    const handleInitialLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const data = await login(username, password);
            
            if (data.requires_2fa_setup) {
                setSetupUri(data.totp_uri);
                setTempToken(data.temp_token);
                setStep('totp_setup');
            } else if (data.requires_totp) {
                setStep('totp_input');
            } else if (data.token) {
                loginUser(data.user, data.token);
                navigate('/lobby');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleTotpVerify = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (step === 'totp_setup') {
                const data = await setup2FA(totpCode, tempToken);
                loginUser(data.user, data.token);
                navigate('/lobby');
            } else {
                const data = await login(username, password, totpCode);
                loginUser(data.user, data.token);
                navigate('/lobby');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (googleLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
                <div className="glass-card animate-pulse" style={{ padding: '3rem', textAlign: 'center' }}>
                    <h2 style={{ color: 'var(--accent-color)', marginBottom: '1rem' }}>Signing in with Google...</h2>
                    <p style={{ color: 'var(--text-muted)' }}>Please wait while we verify your account.</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '1rem' }}>
            <div className="glass-card animate-fade-in" style={{ padding: '2.5rem', width: '100%', maxWidth: '400px' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem', color: 'var(--accent-color)' }}>♠ Texas Hold'em</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Secure Login</p>
                </div>

                {error && <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--suit-red)', color: 'var(--suit-red)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>{error}</div>}

                {step === 'login' && (
                    <>
                        {/* Google Sign-In Button */}
                        <button 
                            onClick={handleGoogleLogin} 
                            disabled={googleLoading}
                            style={{ 
                                width: '100%', padding: '0.8rem', marginBottom: '1.5rem',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
                                background: 'white', color: '#333', border: 'none', borderRadius: 'var(--radius-sm)',
                                fontSize: '1rem', fontWeight: '600', cursor: 'pointer',
                                transition: 'all 0.2s ease', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                            }}
                            onMouseOver={e => e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)'}
                            onMouseOut={e => e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)'}
                        >
                            <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                            Sign in with Google
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                            <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }} />
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>OR</span>
                            <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }} />
                        </div>

                        <form onSubmit={handleInitialLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Username</label>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="input-field"
                                    placeholder="Enter your username"
                                    required
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Password</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="input-field"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                            <button type="submit" className="btn-primary" disabled={loading}>
                                {loading ? 'Authenticating...' : 'Continue'}
                            </button>
                        </form>
                    </>
                )}

                {step === 'totp_input' && (
                    <form onSubmit={handleTotpVerify} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>2FA Authenticator Code</label>
                            <input
                                type="text"
                                value={totpCode}
                                onChange={(e) => setTotpCode(e.target.value)}
                                className="input-field"
                                placeholder="123456"
                                maxLength={6}
                                required
                                style={{ textAlign: 'center', letterSpacing: '0.5em', fontSize: '1.2rem' }}
                            />
                        </div>
                        <button type="submit" className="btn-primary" disabled={loading}>
                            {loading ? 'Verifying...' : 'Login'}
                        </button>
                        <button type="button" className="btn-secondary" onClick={() => setStep('login')}>Back</button>
                    </form>
                )}

                {step === 'totp_setup' && (
                    <form onSubmit={handleTotpVerify} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center' }}>
                        <p style={{ textAlign: 'center', fontSize: '0.9rem' }}>Scan this QR Code with your Authenticator App (Google Authenticator, Authy) to setup 2FA.</p>
                        
                        <div style={{ background: 'white', padding: '10px', borderRadius: '8px' }}>
                            <img 
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setupUri)}`} 
                                alt="2FA QR Code" 
                                width={200} 
                                height={200} 
                            />
                        </div>

                        <div style={{ width: '100%' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Enter 6-digit Code</label>
                            <input
                                type="text"
                                value={totpCode}
                                onChange={(e) => setTotpCode(e.target.value)}
                                className="input-field"
                                placeholder="123456"
                                maxLength={6}
                                required
                                style={{ textAlign: 'center', letterSpacing: '0.5em', fontSize: '1.2rem' }}
                            />
                        </div>
                        <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%' }}>
                            {loading ? 'Verifying...' : 'Complete Setup & Login'}
                        </button>
                        <button type="button" className="btn-secondary" onClick={() => setStep('login')} style={{ width: '100%' }}>Back</button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default Login;
