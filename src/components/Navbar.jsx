import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';

const Navbar = () => {
    const [scrolled, setScrolled] = useState(false);
    const { user, logout } = useAuth();

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 50);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <nav style={{
            position: 'fixed',
            top: 0,
            width: '100%',
            zIndex: 1000,
            background: scrolled ? 'var(--bg-primary-translucent, rgba(255, 255, 255, 0.95))' : 'transparent',
            backdropFilter: scrolled ? 'blur(10px)' : 'none',
            borderBottom: scrolled ? '1px solid var(--border-subtle)' : 'none',
            transition: 'all 0.3s ease'
        }}>
            <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '80px' }}>
                <Link to="/" style={{ display: 'flex', alignItems: 'center' }}>
                    <img src="/logo.png" alt="FORESVI Logo" style={{ height: '40px', width: 'auto' }} />
                </Link>
                {user && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                        <div style={{ fontSize: '0.6rem', color: '#94a3b8', opacity: 0.5 }}>v2.0</div>
                        <Link to="/" style={{ color: 'var(--text-primary)' }}>Inicio</Link>
                        <a
                            href="#library"
                            onClick={(e) => {
                                e.preventDefault();
                                const el = document.getElementById('library');
                                if (el) el.scrollIntoView({ behavior: 'smooth' });
                                else window.location.href = '/#library';
                            }}
                            style={{ color: 'var(--text-secondary)' }}
                        >Biblioteca</a>
                        {user.role === 'admin' && (
                            <Link to="/admin" style={{ color: 'var(--accent-gold)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                🛡️ Admin Panel
                            </Link>
                        )}
                    </div>
                )}

                {user ? (
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Hola, <b>{user.username}</b></span>
                        <button onClick={logout} className="btn btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>Salir</button>
                    </div>
                ) : (
                    <Link to="/login" className="btn btn-primary" style={{ padding: '0.5rem 1rem' }}>Entrar</Link>
                )}
            </div>
        </nav>
    );
};

export default Navbar;
