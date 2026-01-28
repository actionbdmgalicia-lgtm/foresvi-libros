import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const Navbar = () => {
    const [scrolled, setScrolled] = useState(false);

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
            background: scrolled ? 'rgba(255, 255, 255, 0.9)' : 'transparent',
            backdropFilter: scrolled ? 'blur(10px)' : 'none',
            borderBottom: scrolled ? '1px solid var(--border-subtle)' : 'none',
            transition: 'all 0.3s ease'
        }}>
            <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '80px' }}>
                <Link to="/" style={{ display: 'flex', alignItems: 'center' }}>
                    <img src="/logo.png" alt="FORESVI Logo" style={{ height: '40px', width: 'auto' }} />
                </Link>
                <div style={{ display: 'flex', gap: '2rem' }}>
                    <Link to="/" style={{ color: 'var(--text-primary)' }}>Inicio</Link>
                    <a href="#methodology" style={{ color: 'var(--text-secondary)' }}>Método</a>
                    <a href="#pricing" style={{ color: 'var(--text-secondary)' }}>Planes</a>
                    <Link to="/admin" style={{ color: 'var(--accent-gold)', fontWeight: '600' }}>Panel Técnico</Link>
                </div>
                <button className="btn btn-primary" style={{ padding: '0.5rem 1rem' }}>Entrar</button>
            </div>
        </nav>
    );
};

export default Navbar;
