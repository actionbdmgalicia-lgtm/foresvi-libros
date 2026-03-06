import React, { useState, useMemo } from 'react';
import BookResultCard from './BookResultCard';

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

export default function AdvancedSearch({ libros = [] }) {
    const [searchText, setSearchText] = useState('');
    const [selectedHashtags, setSelectedHashtags] = useState([]);
    const [selectedTema, setSelectedTema] = useState(null);
    const [selectedLevel, setSelectedLevel] = useState(null);

    // Extraer todos los hashtags únicos
    const allHashtags = useMemo(() => {
        const tags = new Set();
        libros.forEach(libro => {
            (libro.hashtags || []).forEach(tag => tags.add(tag));
        });
        return Array.from(tags).sort();
    }, [libros]);

    // Búsqueda inteligente
    const resultados = useMemo(() => {
        return libros.filter(libro => {
            const matchesText =
                !searchText ||
                libro.title.toLowerCase().includes(searchText.toLowerCase()) ||
                libro.hashtags?.some(h => h.toLowerCase().includes(searchText.toLowerCase()));

            const matchesHashtags =
                selectedHashtags.length === 0 ||
                selectedHashtags.every(h => libro.hashtags?.includes(h));

            const matchesTema = !selectedTema || libro.tema_piramide === selectedTema;
            const matchesLevel = !selectedLevel || libro.level === selectedLevel;

            return matchesText && matchesHashtags && matchesTema && matchesLevel;
        });
    }, [searchText, selectedHashtags, selectedTema, selectedLevel, libros]);

    const toggleHashtag = (tag) => {
        setSelectedHashtags(prev =>
            prev.includes(tag) ? prev.filter(h => h !== tag) : [...prev, tag]
        );
    };

    return (
        <div>
            {/* Panel de Búsqueda */}
            <div style={{
                background: 'white',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                padding: '2rem',
                marginBottom: '2rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
            }}>
                {/* Input Principal */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{
                        display: 'block',
                        fontSize: '0.9rem',
                        fontWeight: '600',
                        color: '#003349',
                        marginBottom: '0.5rem'
                    }}>
                        🔍 Buscar por título o hashtag
                    </label>
                    <input
                        type="text"
                        placeholder="Ej: marketing, ventas, pymes..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '0.75rem 1rem',
                            fontSize: '1rem',
                            border: '2px solid #e2e8f0',
                            borderRadius: '8px',
                            transition: 'all 0.2s',
                            boxSizing: 'border-box',
                            ':focus': {
                                outline: 'none',
                                borderColor: '#003349',
                                boxShadow: '0 0 0 3px rgba(0, 51, 73, 0.1)'
                            }
                        }}
                        onFocus={(e) => {
                            e.target.style.borderColor = '#003349';
                            e.target.style.boxShadow = '0 0 0 3px rgba(0, 51, 73, 0.1)';
                        }}
                        onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0';
                            e.target.style.boxShadow = 'none';
                        }}
                    />
                </div>

                {/* Filtros */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                    gap: '1.5rem'
                }}>
                    {/* Tema de Pirámide */}
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '0.9rem',
                            fontWeight: '600',
                            color: '#003349',
                            marginBottom: '0.5rem'
                        }}>
                            🏛️ Tema de Pirámide
                        </label>
                        <select
                            value={selectedTema || ''}
                            onChange={(e) => setSelectedTema(e.target.value ? parseInt(e.target.value) || parseFloat(e.target.value) : null)}
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                border: '1px solid #cbd5e1',
                                borderRadius: '8px',
                                fontSize: '0.95rem',
                                background: 'white',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            <option value="">Todos los temas</option>
                            {PIRAMIDE_TEMAS.map(t => (
                                <option key={t.nivel} value={t.nivel}>
                                    {t.nombre}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Nivel */}
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: '0.9rem',
                            fontWeight: '600',
                            color: '#003349',
                            marginBottom: '0.5rem'
                        }}>
                            📚 Nivel de Dificultad
                        </label>
                        <select
                            value={selectedLevel || ''}
                            onChange={(e) => setSelectedLevel(e.target.value || null)}
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                border: '1px solid #cbd5e1',
                                borderRadius: '8px',
                                fontSize: '0.95rem',
                                background: 'white',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            <option value="">Todos los niveles</option>
                            <option value="Iniciación">Iniciación</option>
                            <option value="Intermedio">Intermedio</option>
                            <option value="Avanzado">Avanzado</option>
                            <option value="Experto">Experto</option>
                        </select>
                    </div>
                </div>

                {/* Hashtags */}
                {allHashtags.length > 0 && (
                    <div style={{ marginTop: '1.5rem' }}>
                        <label style={{
                            display: 'block',
                            fontSize: '0.9rem',
                            fontWeight: '600',
                            color: '#003349',
                            marginBottom: '0.75rem'
                        }}>
                            #️⃣ Filtrar por Hashtags
                        </label>
                        <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '0.5rem'
                        }}>
                            {allHashtags.slice(0, 15).map(tag => {
                                const isSelected = selectedHashtags.includes(tag);
                                return (
                                    <button
                                        key={tag}
                                        onClick={() => toggleHashtag(tag)}
                                        style={{
                                            padding: '0.5rem 0.9rem',
                                            background: isSelected ? '#003349' : '#f1f5f9',
                                            color: isSelected ? 'white' : '#475569',
                                            border: isSelected ? '1px solid #003349' : '1px solid #cbd5e1',
                                            borderRadius: '20px',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem',
                                            fontWeight: '500',
                                            transition: 'all 0.2s ease',
                                            ':hover': {
                                                transform: 'scale(1.05)',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                            }
                                        }}
                                        onMouseEnter={(e) => {
                                            e.target.style.transform = 'scale(1.05)';
                                            e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.target.style.transform = 'scale(1)';
                                            e.target.style.boxShadow = 'none';
                                        }}
                                    >
                                        {tag}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Estadísticas */}
                <div style={{
                    marginTop: '1.5rem',
                    padding: '0.75rem 1rem',
                    background: '#f0f4ff',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    color: '#003349',
                    fontWeight: '600',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <span>🔍 Resultados encontrados</span>
                    <span style={{
                        background: '#003349',
                        color: 'white',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '12px',
                        fontSize: '0.85rem'
                    }}>
                        {resultados.length}
                    </span>
                </div>

                {/* Botón Limpiar Filtros */}
                {(searchText || selectedHashtags.length > 0 || selectedTema || selectedLevel) && (
                    <button
                        onClick={() => {
                            setSearchText('');
                            setSelectedHashtags([]);
                            setSelectedTema(null);
                            setSelectedLevel(null);
                        }}
                        style={{
                            marginTop: '1rem',
                            padding: '0.5rem 1rem',
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            color: '#475569',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: '500',
                            transition: 'all 0.2s'
                        }}
                    >
                        ✕ Limpiar filtros
                    </button>
                )}
            </div>

            {/* Resultados */}
            {resultados.length > 0 ? (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: '1.5rem'
                }}>
                    {resultados.map(libro => (
                        <BookResultCard
                            key={libro.id}
                            libro={libro}
                        />
                    ))}
                </div>
            ) : searchText || selectedHashtags.length > 0 || selectedTema || selectedLevel ? (
                <div style={{
                    textAlign: 'center',
                    padding: '3rem 2rem',
                    background: '#f8fafc',
                    borderRadius: '12px',
                    border: '2px dashed #cbd5e1',
                    color: '#94a3b8'
                }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔎</div>
                    <p style={{ fontSize: '1.05rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                        No se encontraron resultados
                    </p>
                    <p style={{ fontSize: '0.9rem' }}>
                        Intenta con otros términos o filtros
                    </p>
                </div>
            ) : (
                <div style={{
                    textAlign: 'center',
                    padding: '3rem 2rem',
                    background: 'linear-gradient(135deg, #f0f4ff 0%, #f8fafc 100%)',
                    borderRadius: '12px',
                    border: '2px dashed #cbd5e1'
                }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📚</div>
                    <p style={{ fontSize: '1.05rem', fontWeight: '600', color: '#003349', marginBottom: '0.5rem' }}>
                        Biblioteca de Libros FORESVI
                    </p>
                    <p style={{ fontSize: '0.9rem', color: '#717B8D' }}>
                        Usa los filtros de arriba para buscar y explorar libros por tema, nivel o hashtags
                    </p>
                </div>
            )}
        </div>
    );
}
