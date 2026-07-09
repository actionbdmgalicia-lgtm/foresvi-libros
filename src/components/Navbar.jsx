import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
    const [scrolled, setScrolled] = useState(false);
    const { user, logout } = useAuth();
    const location = useLocation();

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 50);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const isLoginPage = location.pathname === '/login';

    return (
        <nav style={{
            position: 'fixed',
            top: 0,
            width: '100%',
            zIndex: 1000,
            background: scrolled ? 'rgba(255, 255, 255, 0.97)' : 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(12px)',
            borderBottom: scrolled ? '1px solid #e2e8f0' : '1px solid transparent',
            transition: 'all 0.3s ease',
            boxShadow: scrolled ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'
        }}>
            <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '64px', maxWidth: '1200px', margin: '0 auto', padding: '0 1.5rem' }}>
                {/* Logo */}
                <Link to="/admin" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none', flexShrink: 0 }}>
                    <img src="/logo.png" alt="FORESVI Logo" style={{ height: '36px', width: 'auto' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
                        <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 500, letterSpacing: '0.05em' }}>FORESVI</span>
                        <span style={{ fontSize: '0.55rem', color: '#cbd5e1' }}>Biblioteca de Libros</span>
                    </div>
                </Link>

                {/* Right side */}
                {user && !isLoginPage ? (
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', minWidth: 0 }}>
                        <span style={{ fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '45vw' }}>
                            Hola, <b style={{ color: '#334155' }}>{user.username}</b>
                        </span>
                        <button
                            onClick={logout}
                            style={{
                                padding: '0.4rem 0.8rem',
                                fontSize: '0.8rem',
                                borderRadius: '6px',
                                border: '1px solid #e2e8f0',
                                background: 'white',
                                color: '#64748b',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                flexShrink: 0
                            }}
                            onMouseEnter={e => { e.target.style.background = '#f1f5f9'; e.target.style.borderColor = '#cbd5e1'; }}
                            onMouseLeave={e => { e.target.style.background = 'white'; e.target.style.borderColor = '#e2e8f0'; }}
                        >
                            Salir
                        </button>
                    </div>
                ) : !isLoginPage ? (
                    <Link to="/login" className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>Entrar</Link>
                ) : null}
            </div>
        </nav>
    );
};

export default Navbar;
