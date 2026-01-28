import React from 'react';

const Footer = () => {
    return (
        <footer style={{ padding: '2rem 0', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-tertiary)' }}>
            <div className="container" style={{ textAlign: 'center' }}>
                <h3 className="text-gradient" style={{ marginBottom: '1rem' }}>LIBROS FORESVI</h3>
                <p style={{ fontSize: '0.9rem' }}>&copy; {new Date().getFullYear()} Libros FORESVI. Todos los derechos reservados.</p>
            </div>
        </footer>
    );
};

export default Footer;
