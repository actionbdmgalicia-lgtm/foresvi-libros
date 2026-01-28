import React from 'react';

const CallToAction = () => {
    return (
        <section style={{ padding: '6rem 0', background: 'var(--accent-primary)', color: 'white', position: 'relative', overflow: 'hidden' }}>
            {/* Background Pattern */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.1) 0%, transparent 50%)',
                zIndex: 0
            }}></div>

            <div className="container" style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
                <h2 style={{ color: 'white', marginBottom: '1.5rem' }}>¿Quieres contribuir como Experto?</h2>
                <p style={{ color: 'rgba(255,255,255,0.9)', maxWidth: '600px', margin: '0 auto 2.5rem auto', fontSize: '1.25rem' }}>
                    Ayúdanos a curar la mejor biblioteca técnica del mundo. Valida resúmenes, produce audiolibros y destaca en la industria con los Libros FORESVI.
                </p>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                    <button className="btn" style={{ background: 'white', color: 'var(--accent-primary)' }}>
                        Postular como Experto
                    </button>
                    <button className="btn" style={{ border: '1px solid rgba(255,255,255,0.3)', color: 'white' }}>
                        Manual de Curación
                    </button>
                </div>
            </div>
        </section>
    );
};

export default CallToAction;
