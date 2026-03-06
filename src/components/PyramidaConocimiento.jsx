import React, { useMemo } from 'react';
import BookResultCard from './BookResultCard';

export default function PyramidaConocimiento({ piramidaTemas, libros, selectedTema, onSelectTema }) {
    const NAVY = '#003349';
    const RED = '#E25454';
    const GRAY = '#717B8D';
    const WHITE = '#FFFFFF';

    // Agrupar libros por tema de pirámide
    const librosPorTema = useMemo(() => {
        const grouped = {};
        piramidaTemas.forEach(tema => {
            grouped[tema.nivel] = libros.filter(l => l.tema_piramide === tema.nivel);
        });
        return grouped;
    }, [libros, piramidaTemas]);

    const librosDelTema = selectedTema ? librosPorTema[selectedTema.nivel] : [];

    // Calcular posiciones para la pirámide (SVG)
    const calcularPuntos = (level, index) => {
        const width = 280;
        const baseY = 450;
        const levelHeight = 50;

        // Niveles 1-4: pirámide normal
        // Niveles 5.1-5.2: lado a lado
        // Niveles 6-9: base ancha

        const y = baseY - (level * levelHeight);

        if (level === 1) {
            // Tope (punto único)
            return [[140, y], [140, y], [160, y + levelHeight], [120, y + levelHeight]];
        } else if (level <= 4) {
            const widthFactor = (level / 4) * 100;
            return [
                [140 - widthFactor, y],
                [140 + widthFactor, y],
                [140 + widthFactor + 20, y + levelHeight],
                [140 - widthFactor - 20, y + levelHeight]
            ];
        } else if (level === 5.1 || level === 5.2) {
            // Nivel 5 dividido
            const xOffset = level === 5.1 ? -70 : 70;
            return [
                [xOffset - 40, y],
                [xOffset + 40, y],
                [xOffset + 50, y + levelHeight],
                [xOffset - 50, y + levelHeight]
            ];
        } else {
            // Niveles 6-9: base amplia
            const widthFactor = 120 - ((level - 6) * 10);
            return [
                [140 - widthFactor, y],
                [140 + widthFactor, y],
                [140 + widthFactor + 20, y + levelHeight],
                [140 - widthFactor - 20, y + levelHeight]
            ];
        }
    };

    const pointsToString = (points) => {
        return points.map(p => p.join(',')).join(' ');
    };

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: '320px 1fr',
            gap: '2rem',
            padding: '2rem',
            minHeight: '70vh'
        }}>
            {/* COLUMNA IZQUIERDA: Pirámide SVG */}
            <div style={{
                position: 'sticky',
                top: '2rem',
                height: 'fit-content',
                background: 'white',
                borderRadius: '12px',
                padding: '1rem',
                border: '1px solid #e2e8f0',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
            }}>
                <h3 style={{ color: NAVY, fontSize: '0.9rem', fontWeight: '700', marginBottom: '1rem' }}>
                    🏛️ Estructura FORESVI
                </h3>

                <svg
                    viewBox="0 0 280 550"
                    style={{
                        width: '100%',
                        cursor: 'pointer',
                        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
                    }}
                >
                    {/* Renderizar 9 niveles */}
                    {piramidaTemas.map((tema) => {
                        const isSelected = selectedTema?.nivel === tema.nivel;
                        const librosCount = librosPorTema[tema.nivel]?.length || 0;
                        const points = calcularPuntos(tema.nivel);
                        const pointsStr = pointsToString(points);

                        return (
                            <g
                                key={tema.nivel}
                                onClick={() => onSelectTema(isSelected ? null : tema)}
                                style={{
                                    cursor: 'pointer',
                                    transition: 'opacity 0.2s',
                                    opacity: !selectedTema || isSelected ? 1 : 0.3
                                }}
                            >
                                {/* Polígono */}
                                <polygon
                                    points={pointsStr}
                                    fill={isSelected ? RED : NAVY}
                                    stroke={WHITE}
                                    strokeWidth="2"
                                    style={{
                                        transition: 'all 0.3s ease',
                                        filter: isSelected ? 'drop-shadow(0 4px 8px rgba(226,84,84,0.3))' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
                                    }}
                                />

                                {/* Texto del nivel */}
                                <text
                                    x="140"
                                    y={calcularPuntos(tema.nivel)[0][1] + 25}
                                    textAnchor="middle"
                                    fill={WHITE}
                                    fontSize={tema.nivel > 5 ? '10' : '11'}
                                    fontWeight="700"
                                    style={{ pointerEvents: 'none' }}
                                >
                                    {tema.nombre}
                                </text>

                                {/* Contador de libros */}
                                {librosCount > 0 && (
                                    <circle
                                        cx="260"
                                        cy={calcularPuntos(tema.nivel)[1][1] - 8}
                                        r="10"
                                        fill="#16a34a"
                                        stroke={WHITE}
                                        strokeWidth="1"
                                    />
                                )}
                                {librosCount > 0 && (
                                    <text
                                        x="260"
                                        y={calcularPuntos(tema.nivel)[1][1] - 4}
                                        textAnchor="middle"
                                        fill={WHITE}
                                        fontSize="10"
                                        fontWeight="700"
                                        style={{ pointerEvents: 'none' }}
                                    >
                                        {librosCount}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </svg>

                <div style={{
                    marginTop: '1rem',
                    padding: '0.75rem',
                    background: '#f0f4ff',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    color: NAVY,
                    textAlign: 'center',
                    fontWeight: '500'
                }}>
                    Haz clic en un nivel para ver los libros
                </div>
            </div>

            {/* COLUMNA DERECHA: Resultados */}
            <div>
                {selectedTema && (
                    <>
                        {/* Encabezado */}
                        <div style={{ marginBottom: '2rem' }}>
                            <h2 style={{
                                color: NAVY,
                                fontSize: '1.8rem',
                                fontWeight: '800',
                                marginBottom: '0.5rem'
                            }}>
                                🏛️ {selectedTema.nombre}
                            </h2>
                            <p style={{
                                color: GRAY,
                                fontSize: '0.95rem',
                                marginBottom: '1rem'
                            }}>
                                {selectedTema.descripcion}
                            </p>
                            <div style={{
                                background: '#f0fdf4',
                                border: '1px solid #86efac',
                                borderRadius: '8px',
                                padding: '0.75rem 1rem',
                                fontSize: '0.9rem',
                                color: '#166534',
                                fontWeight: '600'
                            }}>
                                📚 {librosDelTema.length} {librosDelTema.length === 1 ? 'libro' : 'libros'} en esta categoría
                            </div>
                        </div>

                        {/* Grid de Libros */}
                        {librosDelTema.length > 0 ? (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                                gap: '1.5rem'
                            }}>
                                {librosDelTema.map(libro => (
                                    <BookResultCard
                                        key={libro.id}
                                        libro={libro}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div style={{
                                textAlign: 'center',
                                padding: '3rem 2rem',
                                background: '#f8fafc',
                                borderRadius: '12px',
                                border: '2px dashed #cbd5e1',
                                color: '#94a3b8'
                            }}>
                                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📚</div>
                                <p style={{ fontSize: '1.05rem', fontWeight: '600' }}>
                                    No hay libros en esta categoría
                                </p>
                                <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                                    Crea libros nuevos y asígnalos a este tema
                                </p>
                            </div>
                        )}
                    </>
                )}

                {!selectedTema && (
                    <div style={{
                        textAlign: 'center',
                        padding: '4rem 2rem',
                        background: 'linear-gradient(135deg, #f0f4ff 0%, #f8fafc 100%)',
                        borderRadius: '12px',
                        border: '2px dashed #cbd5e1'
                    }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏛️</div>
                        <h3 style={{
                            color: NAVY,
                            fontSize: '1.4rem',
                            fontWeight: '700',
                            marginBottom: '0.5rem'
                        }}>
                            Base de Conocimiento FORESVI
                        </h3>
                        <p style={{
                            color: GRAY,
                            fontSize: '1rem',
                            marginTop: '1rem',
                            lineHeight: '1.6'
                        }}>
                            Selecciona un nivel en la pirámide de la izquierda<br />
                            para explorar los libros organizados por tema
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
