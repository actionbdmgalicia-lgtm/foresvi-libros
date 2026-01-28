import React from 'react';

const Methodology = () => {
    const steps = [
        {
            title: "1. Curación",
            desc: "Expertos filtran el contenido técnico más relevante.",
            icon: "🔍"
        },
        {
            title: "2. Síntesis",
            desc: "Transformamos horas de video en minutos de audio y texto.",
            icon: "🎙️"
        },
        {
            title: "3. Validación",
            desc: "Técnicos de FORESVI aseguran la precisión del contenido.",
            icon: "🛡️"
        }
    ];

    return (
        <section id="methodology" style={{ padding: '2rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="container">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
                    {steps.map((step, index) => (
                        <div key={index} style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: 'white', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                            <div style={{ fontSize: '2rem' }}>{step.icon}</div>
                            <div>
                                <h4 style={{ margin: '0 0 0.2rem 0', fontSize: '1rem' }}>{step.title}</h4>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.3' }}>{step.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Methodology;
