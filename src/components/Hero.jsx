import React from 'react';

const Hero = () => {
  return (
    <section className="hero" style={{ padding: '4rem 0 2rem 0', minHeight: 'auto', display: 'flex', alignItems: 'center', background: 'radial-gradient(circle at 50% -20%, #eff6ff 0%, #ffffff 60%)' }}>
      <div className="container animate-fade-in" style={{ textAlign: 'center' }}>
        <h3 className="text-gold" style={{ textTransform: 'uppercase', letterSpacing: '1.5px', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
          La Biblioteca Técnica de Foresvi
        </h3>
        <h1 style={{ fontSize: '2.8rem', marginBottom: '1rem', lineHeight: '1.1' }}>
          Toda la Información <br />
          <span className="text-gradient">En tu Bolsillo</span>
        </h1>
        <p style={{ maxWidth: '500px', margin: '0 auto 1.5rem auto', fontSize: '1.05rem', color: 'var(--text-secondary)' }}>
          Transformamos videos técnicos en audiolibros y resúmenes ejecutivos. Aprende lo que importa mientras trabajas.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button className="btn btn-primary" style={{ padding: '0.7rem 1.5rem' }}>Empieza Ahora Gratis</button>
          <button
            className="btn btn-outline"
            style={{ padding: '0.7rem 1.5rem' }}
            onClick={() => document.getElementById('library').scrollIntoView({ behavior: 'smooth' })}
          >Ver Biblioteca</button>
        </div>
      </div>
    </section>
  );
};

export default Hero;
