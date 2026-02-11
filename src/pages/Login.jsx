import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');
        if (login(username, password)) {
            if (username === 'admin') {
                navigate('/admin');
            } else {
                navigate('/');
            }
        } else {
            setError('Credenciales incorrectas');
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            color: 'white'
        }}>
            <div style={{
                background: 'rgba(255, 255, 255, 0.05)',
                backdropFilter: 'blur(10px)',
                padding: '3rem',
                borderRadius: '24px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                width: '100%',
                maxWidth: '400px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem', background: 'linear-gradient(to right, #4ade80, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>FORESVI</h1>
                    <p style={{ color: '#94a3b8' }}>Acceso a la plataforma</p>
                </div>

                {error && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.9rem', textAlign: 'center' }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.5rem' }}>Usuario</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.85rem',
                                borderRadius: '12px',
                                background: 'rgba(0, 0, 0, 0.2)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                color: 'white',
                                outline: 'none',
                                fontSize: '1rem'
                            }}
                            placeholder="Ej. usuario o admin"
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.5rem' }}>Contraseña</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.85rem',
                                borderRadius: '12px',
                                background: 'rgba(0, 0, 0, 0.2)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                color: 'white',
                                outline: 'none',
                                fontSize: '1rem'
                            }}
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        style={{
                            marginTop: '1rem',
                            padding: '1rem',
                            borderRadius: '12px',
                            border: 'none',
                            background: 'linear-gradient(to right, #16a34a, #15803d)',
                            color: 'white',
                            fontWeight: 'bold',
                            fontSize: '1rem',
                            cursor: 'pointer',
                            transition: 'transform 0.1s'
                        }}
                    >
                        Entrar
                    </button>

                    <div style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.8rem', color: '#64748b' }}>
                        Claves: foresvi2026 (Usuario) / admin (Juan Represa)
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Login;
