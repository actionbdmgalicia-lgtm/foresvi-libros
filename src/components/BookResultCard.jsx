import React from 'react';
import { getApiBase } from '../utils/api';

const API_BASE = getApiBase();

export default function BookResultCard({ libro, onSelect }) {
    const downloads = libro.artifactDownloads || {};

    const getArtifactUrl = (type) => {
        const mapping = {
            'video': (d) => d.fileName?.endsWith('.mp4'),
            'infographic': (d) => d.fileName?.endsWith('.png'),
            'audio': (d) => d.fileName?.endsWith('.mp3'),
            'document': (d) => d.fileName?.endsWith('.docx') || d.fileName?.endsWith('.md'),
            'presentation': (d) => d.fileName?.endsWith('.pdf') || d.fileName?.endsWith('.pptx')
        };
        const file = Object.values(downloads).find(mapping[type]);
        return file ? file.path : null;
    };

    const artifacts = [
        { emoji: '🎬', type: 'video', label: 'Video' },
        { emoji: '🧩', type: 'infographic', label: 'Infografía' },
        { emoji: '🎧', type: 'audio', label: 'Audio' },
        { emoji: '📄', type: 'document', label: 'Documento' },
        { emoji: '📊', type: 'presentation', label: 'Presentación' }
    ];

    const PIRAMIDE_TEMAS = [
        { nivel: 1, nombre: 'Destino' },
        { nivel: 2, nombre: 'Dinero' },
        { nivel: 3, nombre: 'Tiempo' },
        { nivel: 4, nombre: 'Servicio' },
        { nivel: 5.1, nombre: 'Marketing' },
        { nivel: 5.2, nombre: 'Ventas' },
        { nivel: 6, nombre: 'Sistematizando' },
        { nivel: 7, nombre: 'Equipo' },
        { nivel: 8, nombre: 'Equipo Avanzado' },
        { nivel: 9, nombre: 'Sinergia' }
    ];

    const temaPiramide = PIRAMIDE_TEMAS.find(t => t.nivel === libro.tema_piramide);

    return (
        <div style={{
            background: 'white',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            transition: 'all 0.3s ease',
            cursor: onSelect ? 'pointer' : 'default',
            ':hover': {
                borderColor: '#cbd5e1',
                boxShadow: '0 4px 12px rgba(0, 51, 73, 0.1)',
                transform: 'translateY(-2px)'
            }
        }}
        onClick={onSelect ? () => onSelect(libro) : undefined}
        >
            {/* Encabezado */}
            <h3 style={{
                color: '#0f172a',
                fontSize: '1.05rem',
                fontWeight: '700',
                marginBottom: '0.5rem',
                lineHeight: '1.4'
            }}>
                {libro.title}
            </h3>

            {/* Tema de Pirámide */}
            {temaPiramide && (
                <span style={{
                    display: 'inline-block',
                    padding: '0.35rem 0.9rem',
                    background: 'linear-gradient(135deg, #E25454 0%, #c43131 100%)',
                    color: 'white',
                    borderRadius: '20px',
                    fontSize: '0.75rem',
                    marginBottom: '0.75rem',
                    fontWeight: '600',
                    boxShadow: '0 2px 4px rgba(226, 84, 84, 0.2)'
                }}>
                    🏛️ {temaPiramide.nombre}
                </span>
            )}

            {/* Hashtags */}
            {libro.hashtags && libro.hashtags.length > 0 && (
                <div style={{
                    marginBottom: '1rem',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.5rem'
                }}>
                    {libro.hashtags.slice(0, 5).map((tag, idx) => (
                        <span
                            key={idx}
                            style={{
                                padding: '0.3rem 0.7rem',
                                background: '#f1f5f9',
                                border: '1px solid #cbd5e1',
                                borderRadius: '12px',
                                fontSize: '0.75rem',
                                color: '#475569',
                                fontWeight: '500'
                            }}
                        >
                            {tag}
                        </span>
                    ))}
                    {libro.hashtags.length > 5 && (
                        <span style={{
                            fontSize: '0.75rem',
                            color: '#94a3b8',
                            fontWeight: '500',
                            alignSelf: 'center'
                        }}>
                            +{libro.hashtags.length - 5} más
                        </span>
                    )}
                </div>
            )}

            {/* Metadata */}
            {(libro.level || libro.driveFolderName) && (
                <div style={{
                    fontSize: '0.8rem',
                    color: '#94a3b8',
                    marginBottom: '1rem',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.5rem'
                }}>
                    {libro.level && <span>📚 {libro.level}</span>}
                    {libro.driveFolderName && <span>📁 {libro.driveFolderName}</span>}
                </div>
            )}

            {/* Botones de Acceso - Vista Mejorada */}
            <div style={{
                borderTop: '1px solid #e2e8f0',
                paddingTop: '1rem',
                marginTop: '1rem'
            }}>
                <p style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#717B8D',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.75rem'
                }}>
                    📦 Contenidos Disponibles
                </p>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(48px, 1fr))',
                    gap: '0.4rem'
                }}>
                    {artifacts.map(({ emoji, type, label }) => {
                        const url = getArtifactUrl(type);
                        const hasArtifact = !!url;

                        return (
                            <a
                                key={type}
                                href={hasArtifact ? `${API_BASE}/api/drive-file?path=${encodeURIComponent(url)}&download=true` : '#'}
                                target={hasArtifact ? '_blank' : undefined}
                                rel={hasArtifact ? 'noopener noreferrer' : undefined}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '0.6rem',
                                    background: hasArtifact ? '#f0f4ff' : '#fafbfc',
                                    border: hasArtifact ? '1.5px solid #003349' : '1px solid #e2e8f0',
                                    borderRadius: '10px',
                                    textDecoration: 'none',
                                    opacity: hasArtifact ? 1 : 0.35,
                                    pointerEvents: hasArtifact ? 'auto' : 'none',
                                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                    cursor: hasArtifact ? 'pointer' : 'default',
                                    aspectRatio: '1',
                                    minWidth: '48px'
                                }}
                                onMouseEnter={(e) => {
                                    if (hasArtifact) {
                                        e.currentTarget.style.background = '#e0ebff';
                                        e.currentTarget.style.borderColor = '#1e3a8a';
                                        e.currentTarget.style.transform = 'scale(1.15)';
                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 51, 73, 0.2)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (hasArtifact) {
                                        e.currentTarget.style.background = '#f0f4ff';
                                        e.currentTarget.style.borderColor = '#003349';
                                        e.currentTarget.style.transform = 'scale(1)';
                                        e.currentTarget.style.boxShadow = 'none';
                                    }
                                }}
                                title={label}
                            >
                                <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{emoji}</span>
                                <span style={{
                                    fontSize: '0.6rem',
                                    marginTop: '0.2rem',
                                    color: hasArtifact ? '#003349' : '#94a3b8',
                                    fontWeight: '700',
                                    textAlign: 'center',
                                    lineHeight: 1
                                }}>
                                    {label.split(' ')[0]}
                                </span>
                            </a>
                        );
                    })}
                </div>
            </div>

            {/* Estado si no hay artefactos */}
            {Object.keys(downloads).length === 0 && (
                <div style={{
                    marginTop: '0.75rem',
                    padding: '0.75rem',
                    background: '#f8fafc',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    color: '#94a3b8',
                    textAlign: 'center'
                }}>
                    ⏳ Artefactos en generación...
                </div>
            )}
        </div>
    );
}
