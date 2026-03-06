import React, { useMemo, useState } from 'react';
import BookResultCard from './BookResultCard';
import AdvancedSearch from './AdvancedSearch';

// Colores corporativos FORESVI
const NAVY = '#003349';
const RED = '#E25454';
const GRAY = '#717B8D';
const WHITE = '#FFFFFF';
const LIGHT_BG = '#f8fafc';
const BORDER = '#e2e8f0';

export default function PyramidaConocimiento({ piramidaTemas, libros, selectedTema, onSelectTema }) {
    const [viewMode, setViewMode] = useState('table'); // 'table' | 'search'
    const [contentMode, setContentMode] = useState('books'); // 'books' | 'content'

    // Agrupar libros por tema de pirámide
    const librosPorTema = useMemo(() => {
        const grouped = {};
        piramidaTemas.forEach(tema => {
            grouped[tema.nivel] = libros.filter(l => {
                // Comparar como número o string
                const bookTema = l.tema_piramide;
                return bookTema == tema.nivel || bookTema === String(tema.nivel);
            });
        });
        return grouped;
    }, [libros, piramidaTemas]);

    const librosDelTema = selectedTema ? (librosPorTema[selectedTema.nivel] || []) : [];
    const totalLibrosAsignados = useMemo(() => {
        return Object.values(librosPorTema).reduce((sum, arr) => sum + arr.length, 0);
    }, [librosPorTema]);

    // Agrupar libros por tipo de contenido
    const librosPorContenido = useMemo(() => {
        const grouped = {
            video: [],
            audio: [],
            infografía: [],
            documento: [],
            presentación: []
        };

        librosDelTema.forEach(libro => {
            const artifacts = libro.artifactDownloads || {};

            if (Object.values(artifacts).some(d => d.fileName?.endsWith('.mp4'))) {
                grouped.video.push(libro);
            }
            if (Object.values(artifacts).some(d => d.fileName?.endsWith('.mp3'))) {
                grouped.audio.push(libro);
            }
            if (Object.values(artifacts).some(d => d.fileName?.endsWith('.png'))) {
                grouped.infografía.push(libro);
            }
            if (Object.values(artifacts).some(d => d.fileName?.endsWith('.docx') || d.fileName?.endsWith('.md'))) {
                grouped.documento.push(libro);
            }
            if (Object.values(artifacts).some(d => d.fileName?.endsWith('.pdf') || d.fileName?.endsWith('.pptx'))) {
                grouped.presentación.push(libro);
            }
        });

        return grouped;
    }, [librosDelTema]);

    return (
        <div style={{ minHeight: '70vh' }}>

            {/* ══════════ HEADER ══════════ */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.5rem',
                flexWrap: 'wrap',
                gap: '1rem'
            }}>
                <div>
                    <h2 style={{
                        color: NAVY,
                        fontSize: '1.6rem',
                        fontWeight: 800,
                        margin: 0,
                        letterSpacing: '-0.02em',
                        textAlign: 'left'
                    }}>
                        Base de Conocimiento FORESVI
                    </h2>
                    <p style={{
                        color: GRAY,
                        fontSize: '0.9rem',
                        margin: '0.25rem 0 0 0'
                    }}>
                        {totalLibrosAsignados} {totalLibrosAsignados === 1 ? 'libro asignado' : 'libros asignados'} · {libros.length} libros totales
                    </p>
                </div>

                {/* Toggle vista */}
                <div style={{
                    display: 'flex',
                    gap: '4px',
                    background: WHITE,
                    padding: '4px',
                    borderRadius: '10px',
                    border: `1px solid ${BORDER}`
                }}>
                    <button
                        onClick={() => { setViewMode('table'); }}
                        style={{
                            padding: '0.5rem 1.2rem',
                            borderRadius: '7px',
                            border: 'none',
                            background: viewMode === 'table' ? NAVY : 'transparent',
                            color: viewMode === 'table' ? WHITE : GRAY,
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            transition: 'all 0.2s'
                        }}
                    >
                        🏛️ Estructura
                    </button>
                    <button
                        onClick={() => { setViewMode('search'); }}
                        style={{
                            padding: '0.5rem 1.2rem',
                            borderRadius: '7px',
                            border: 'none',
                            background: viewMode === 'search' ? NAVY : 'transparent',
                            color: viewMode === 'search' ? WHITE : GRAY,
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            transition: 'all 0.2s'
                        }}
                    >
                        🔍 Búsqueda
                    </button>
                </div>
            </div>

            {/* ══════════ VISTA: TABLA + DETALLE ══════════ */}
            {viewMode === 'table' ? (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: selectedTema ? '420px 1fr' : '1fr',
                    gap: '2rem',
                    transition: 'all 0.3s ease'
                }}>

                    {/* ── TABLA DE NIVELES ── */}
                    <div style={{
                        background: WHITE,
                        borderRadius: '12px',
                        border: `1px solid ${BORDER}`,
                        overflow: 'hidden',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                        height: 'fit-content',
                        position: selectedTema ? 'sticky' : 'static',
                        top: '80px'
                    }}>
                        {/* Cabecera de la tabla */}
                        <div style={{
                            background: NAVY,
                            padding: '1rem 1.25rem',
                            display: 'grid',
                            gridTemplateColumns: '48px 1fr 80px',
                            gap: '0.5rem',
                            alignItems: 'center'
                        }}>
                            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Nivel
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Tema
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>
                                Libros
                            </span>
                        </div>

                        {/* Filas */}
                        {piramidaTemas.map((tema, idx) => {
                            const isSelected = selectedTema?.nivel === tema.nivel;
                            const count = librosPorTema[tema.nivel]?.length || 0;
                            const isEven = idx % 2 === 0;

                            return (
                                <div
                                    key={tema.nivel}
                                    onClick={() => onSelectTema(isSelected ? null : tema)}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '48px 1fr 80px',
                                        gap: '0.5rem',
                                        alignItems: 'center',
                                        padding: '0.85rem 1.25rem',
                                        cursor: 'pointer',
                                        background: isSelected ? 'rgba(226, 84, 84, 0.08)' : isEven ? WHITE : LIGHT_BG,
                                        borderLeft: isSelected ? `4px solid ${RED}` : '4px solid transparent',
                                        borderBottom: idx < piramidaTemas.length - 1 ? `1px solid ${BORDER}` : 'none',
                                        transition: 'all 0.2s ease'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isSelected) {
                                            e.currentTarget.style.background = 'rgba(0, 51, 73, 0.04)';
                                            e.currentTarget.style.borderLeftColor = NAVY;
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isSelected) {
                                            e.currentTarget.style.background = isEven ? WHITE : LIGHT_BG;
                                            e.currentTarget.style.borderLeftColor = 'transparent';
                                        }
                                    }}
                                >
                                    {/* Número de nivel */}
                                    <div style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '8px',
                                        background: isSelected ? RED : NAVY,
                                        color: WHITE,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.8rem',
                                        fontWeight: 800,
                                        transition: 'all 0.2s',
                                        boxShadow: isSelected ? '0 2px 6px rgba(226,84,84,0.3)' : '0 1px 3px rgba(0,51,73,0.2)'
                                    }}>
                                        {tema.nivel}
                                    </div>

                                    {/* Nombre y descripción */}
                                    <div style={{ overflow: 'hidden' }}>
                                        <div style={{
                                            fontSize: '0.95rem',
                                            fontWeight: isSelected ? 700 : 600,
                                            color: isSelected ? RED : NAVY,
                                            transition: 'color 0.2s',
                                            lineHeight: 1.3
                                        }}>
                                            {tema.nombre}
                                        </div>
                                        <div style={{
                                            fontSize: '0.78rem',
                                            color: GRAY,
                                            marginTop: '2px',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}>
                                            {tema.descripcion}
                                        </div>
                                    </div>

                                    {/* Contador */}
                                    <div style={{ textAlign: 'center' }}>
                                        {count > 0 ? (
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                minWidth: '28px',
                                                height: '28px',
                                                borderRadius: '14px',
                                                background: isSelected ? RED : '#16a34a',
                                                color: WHITE,
                                                fontSize: '0.8rem',
                                                fontWeight: 700,
                                                padding: '0 8px',
                                                boxShadow: isSelected ? '0 2px 4px rgba(226,84,84,0.25)' : '0 1px 3px rgba(22,163,74,0.25)'
                                            }}>
                                                {count}
                                            </span>
                                        ) : (
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                minWidth: '28px',
                                                height: '28px',
                                                borderRadius: '14px',
                                                background: '#f1f5f9',
                                                color: '#94a3b8',
                                                fontSize: '0.8rem',
                                                fontWeight: 600,
                                                border: `1px solid ${BORDER}`
                                            }}>
                                                0
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Footer de tabla */}
                        <div style={{
                            background: LIGHT_BG,
                            padding: '0.75rem 1.25rem',
                            borderTop: `1px solid ${BORDER}`,
                            display: 'grid',
                            gridTemplateColumns: '48px 1fr 80px',
                            gap: '0.5rem',
                            alignItems: 'center'
                        }}>
                            <div />
                            <div style={{ fontSize: '0.8rem', color: GRAY, fontWeight: 600 }}>
                                Total
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    minWidth: '28px',
                                    height: '28px',
                                    borderRadius: '14px',
                                    background: NAVY,
                                    color: WHITE,
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    padding: '0 8px'
                                }}>
                                    {totalLibrosAsignados}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* ── PANEL DERECHO: LIBROS DEL TEMA ── */}
                    {selectedTema && (
                        <div>
                            {/* Encabezado del tema seleccionado */}
                            <div style={{
                                background: WHITE,
                                borderRadius: '12px',
                                border: `1px solid ${BORDER}`,
                                padding: '1.5rem',
                                marginBottom: '1.5rem',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{
                                            width: '42px',
                                            height: '42px',
                                            borderRadius: '10px',
                                            background: RED,
                                            color: WHITE,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '1rem',
                                            fontWeight: 800,
                                            boxShadow: '0 2px 8px rgba(226,84,84,0.25)'
                                        }}>
                                            {selectedTema.nivel}
                                        </div>
                                        <div>
                                            <h3 style={{
                                                color: NAVY,
                                                fontSize: '1.4rem',
                                                fontWeight: 800,
                                                margin: 0,
                                                lineHeight: 1.2
                                            }}>
                                                {selectedTema.nombre}
                                            </h3>
                                            <p style={{
                                                color: GRAY,
                                                fontSize: '0.9rem',
                                                margin: 0
                                            }}>
                                                {selectedTema.descripcion}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Toggle Vista por Libros / Contenido */}
                                    {librosDelTema.length > 0 && (
                                        <div style={{
                                            display: 'flex',
                                            gap: '4px',
                                            background: LIGHT_BG,
                                            padding: '4px',
                                            borderRadius: '8px',
                                            border: `1px solid ${BORDER}`
                                        }}>
                                            <button
                                                onClick={() => setContentMode('books')}
                                                style={{
                                                    padding: '0.4rem 0.8rem',
                                                    background: contentMode === 'books' ? NAVY : 'transparent',
                                                    color: contentMode === 'books' ? WHITE : GRAY,
                                                    border: 'none',
                                                    borderRadius: '6px',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                                title="Ver por libros"
                                            >
                                                📚 Libros
                                            </button>
                                            <button
                                                onClick={() => setContentMode('content')}
                                                style={{
                                                    padding: '0.4rem 0.8rem',
                                                    background: contentMode === 'content' ? NAVY : 'transparent',
                                                    color: contentMode === 'content' ? WHITE : GRAY,
                                                    border: 'none',
                                                    borderRadius: '6px',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                                title="Ver por tipo de contenido"
                                            >
                                                📦 Contenidos
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.6rem 1rem',
                                    background: librosDelTema.length > 0 ? '#f0fdf4' : '#fef2f2',
                                    border: `1px solid ${librosDelTema.length > 0 ? '#86efac' : '#fca5a5'}`,
                                    borderRadius: '8px',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    color: librosDelTema.length > 0 ? '#166534' : '#991b1b'
                                }}>
                                    <span>{librosDelTema.length > 0 ? '📚' : '📭'}</span>
                                    <span>
                                        {librosDelTema.length} {librosDelTema.length === 1 ? 'libro encontrado' : 'libros encontrados'}
                                    </span>
                                </div>
                            </div>

                            {/* Contenido según modo seleccionado */}
                            {librosDelTema.length > 0 ? (
                                <>
                                    {contentMode === 'books' ? (
                                        /* VISTA POR LIBROS */
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                                            gap: '1.25rem'
                                        }}>
                                            {librosDelTema.map(libro => (
                                                <BookResultCard
                                                    key={libro.id}
                                                    libro={libro}
                                                />
                                            ))}
                                        </div>
                                    ) : (
                                        /* VISTA POR TIPO DE CONTENIDO */
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                                            gap: '1.5rem'
                                        }}>
                                            {['video', 'audio', 'infografía', 'documento', 'presentación'].map(tipo => {
                                                const librosDeEsteContenido = librosPorContenido[tipo];
                                                const iconos = {
                                                    video: '🎬',
                                                    audio: '🎧',
                                                    infografía: '🧩',
                                                    documento: '📄',
                                                    presentación: '📊'
                                                };
                                                const colores = {
                                                    video: '#ef4444',
                                                    audio: '#f59e0b',
                                                    infografía: '#8b5cf6',
                                                    documento: '#3b82f6',
                                                    presentación: '#ec4899'
                                                };

                                                return (
                                                    <div
                                                        key={tipo}
                                                        style={{
                                                            background: WHITE,
                                                            borderRadius: '12px',
                                                            border: `1px solid ${BORDER}`,
                                                            overflow: 'hidden',
                                                            transition: 'all 0.3s'
                                                        }}
                                                    >
                                                        {/* Encabezado por tipo */}
                                                        <div style={{
                                                            background: colores[tipo],
                                                            color: WHITE,
                                                            padding: '1rem',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.75rem'
                                                        }}>
                                                            <span style={{ fontSize: '1.5rem' }}>{iconos[tipo]}</span>
                                                            <div style={{ flex: 1 }}>
                                                                <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, textTransform: 'capitalize' }}>
                                                                    {tipo}
                                                                </p>
                                                                <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.9 }}>
                                                                    {librosDeEsteContenido.length} {librosDeEsteContenido.length === 1 ? 'recurso' : 'recursos'}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {/* Lista de libros */}
                                                        {librosDeEsteContenido.length > 0 ? (
                                                            <div style={{ padding: '1rem', maxHeight: '400px', overflowY: 'auto' }}>
                                                                {librosDeEsteContenido.map(libro => (
                                                                    <div
                                                                        key={libro.id}
                                                                        style={{
                                                                            padding: '0.75rem',
                                                                            marginBottom: '0.5rem',
                                                                            background: LIGHT_BG,
                                                                            borderRadius: '8px',
                                                                            fontSize: '0.9rem',
                                                                            borderLeft: `3px solid ${colores[tipo]}`,
                                                                            cursor: 'pointer',
                                                                            transition: 'all 0.2s',
                                                                            display: 'flex',
                                                                            justifyContent: 'space-between',
                                                                            alignItems: 'center'
                                                                        }}
                                                                        onMouseEnter={(e) => {
                                                                            e.currentTarget.style.background = 'white';
                                                                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                                                                        }}
                                                                        onMouseLeave={(e) => {
                                                                            e.currentTarget.style.background = LIGHT_BG;
                                                                            e.currentTarget.style.boxShadow = 'none';
                                                                        }}
                                                                    >
                                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                                            <p style={{
                                                                                margin: 0,
                                                                                fontWeight: 600,
                                                                                color: NAVY,
                                                                                whiteSpace: 'nowrap',
                                                                                overflow: 'hidden',
                                                                                textOverflow: 'ellipsis'
                                                                            }}>
                                                                                {libro.title}
                                                                            </p>
                                                                        </div>
                                                                        <span style={{
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            minWidth: '24px',
                                                                            height: '24px',
                                                                            borderRadius: '12px',
                                                                            background: colores[tipo],
                                                                            color: WHITE,
                                                                            fontSize: '0.7rem',
                                                                            fontWeight: 700,
                                                                            marginLeft: '0.5rem',
                                                                            flexShrink: 0
                                                                        }}>
                                                                            {iconos[tipo]}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <div style={{
                                                                padding: '2rem 1rem',
                                                                textAlign: 'center',
                                                                color: GRAY,
                                                                fontSize: '0.9rem'
                                                            }}>
                                                                No hay {tipo}s
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '3rem 2rem',
                                    background: WHITE,
                                    borderRadius: '12px',
                                    border: `2px dashed ${BORDER}`,
                                }}>
                                    <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📭</div>
                                    <p style={{
                                        fontSize: '1rem',
                                        fontWeight: 600,
                                        color: NAVY,
                                        margin: '0 0 0.5rem 0'
                                    }}>
                                        No hay libros en "{selectedTema.nombre}"
                                    </p>
                                    <p style={{
                                        fontSize: '0.9rem',
                                        color: GRAY,
                                        margin: 0,
                                        lineHeight: 1.5
                                    }}>
                                        Para asignar libros a este tema, edita un libro<br />
                                        en el Archivo y selecciona el "Tema de Pirámide"
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Mensaje cuando no hay tema seleccionado y tabla ocupa todo el ancho */}
                    {!selectedTema && (
                        <div style={{ display: 'none' }} />
                    )}
                </div>
            ) : (
                /* ══════════ VISTA: BÚSQUEDA AVANZADA ══════════ */
                <AdvancedSearch libros={libros} />
            )}
        </div>
    );
}
