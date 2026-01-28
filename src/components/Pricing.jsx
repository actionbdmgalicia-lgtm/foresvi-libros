import React from 'react';

const Pricing = () => {
    const tiers = [
        {
            name: "Lector Gratis",
            role: "Invitado",
            price: "Gratis",
            features: [
                "10s de vista previa audiollibro",
                "Resúmenes técnicos parciales",
                "Categorías básicas de consulta"
            ],
            cta: "Explorar Gratis",
            highlight: false
        },
        {
            name: "Lector Mensual",
            role: "Profesional VIP",
            price: "2,95€",
            period: "/mes",
            features: [
                "Audiolibros completos ilimitados",
                "Transcripciones exportables",
                "Descarga de resúmenes en PDF",
                "Acceso sin publicidad"
            ],
            cta: "Hazte VIP",
            highlight: true
        },
        {
            name: "Lector Anual",
            role: "Ahorro Experto",
            price: "29,95€",
            period: "/año",
            features: [
                "Todo el contenido VIP",
                "Equivalente a 2 meses gratis",
                "Certificaciones mensuales",
                "Soporte técnico prioritario"
            ],
            cta: "Suscripción Anual",
            highlight: false
        }
    ];

    return (
        <section id="pricing" style={{ padding: '3rem 0', background: 'white' }}>
            <div className="container" style={{ maxWidth: '1000px' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h2 style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>Planes de <span className="text-gradient">Membresía</span></h2>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Invierte en tu productividad profesional.</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                    {tiers.map((tier, index) => (
                        <div key={index} className={`card ${tier.highlight ? 'highlight' : ''}`} style={{
                            padding: '1.5rem',
                            display: 'flex',
                            flexDirection: 'column',
                            border: tier.highlight ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                            transform: tier.highlight ? 'scale(1.02)' : 'none',
                            background: tier.highlight ? '#fdfdff' : 'white'
                        }}>
                            <div style={{ marginBottom: '1rem' }}>
                                <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{tier.name}</h3>
                                <div style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: 'bold' }}>{tier.role}</div>
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <span style={{ fontSize: '2rem', fontWeight: 'bold' }}>{tier.price}</span>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{tier.period}</span>
                            </div>

                            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem 0', flex: 1 }}>
                                {tier.features.map((feature, i) => (
                                    <li key={i} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ color: 'var(--accent-primary)' }}>✓</span> {feature}
                                    </li>
                                ))}
                            </ul>

                            <button className={`btn ${tier.highlight ? 'btn-primary' : 'btn-outline'}`} style={{ width: '100%', padding: '0.7rem' }}>
                                {tier.cta}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Pricing;
