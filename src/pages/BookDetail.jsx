import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// ============================================================================
// STEPPER COMPONENT: NotebookLM → Drive Sync → YouTube Link → Roadmap Ready
// ============================================================================
const PipelineStepper = ({ book }) => {
    const steps = [
        {
            id: 'notebook',
            label: 'NotebookLM',
            icon: '🧠',
            done: !!book.notebookId,
            active: !book.notebookId
        },
        {
            id: 'drive',
            label: 'Drive Sync',
            icon: '📁',
            done: !!book.driveSync,
            active: book.notebookId && !book.driveSync
        },
        {
            id: 'youtube',
            label: 'YouTube Link',
            icon: '📺',
            done: !!book.youtubeId,
            active: book.driveSync && !book.youtubeId
        },
        {
            id: 'roadmap',
            label: 'Roadmap Ready',
            icon: '🗺️',
            done: !!book.roadmap,
            active: book.driveSync && !book.roadmap
        }
    ];

    return (
        <div style={{
            display: 'flex',
            gap: '0',
            padding: '1.5rem 0',
            marginBottom: '1.5rem'
        }}>
            {steps.map((step, i) => (
                <div key={step.id} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        flex: 1
                    }}>
                        <div style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.2rem',
                            fontWeight: 'bold',
                            background: step.done ? 'linear-gradient(135deg, #10b981, #059669)' :
                                step.active ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : '#e2e8f0',
                            color: step.done || step.active ? 'white' : '#94a3b8',
                            boxShadow: step.done ? '0 4px 12px rgba(16, 185, 129, 0.3)' :
                                step.active ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none',
                            transition: 'all 0.3s ease'
                        }}>
                            {step.done ? '✓' : step.icon}
                        </div>
                        <span style={{
                            marginTop: '0.5rem',
                            fontSize: '0.7rem',
                            fontWeight: step.done || step.active ? '600' : '400',
                            color: step.done ? '#059669' : step.active ? '#2563eb' : '#94a3b8',
                            textAlign: 'center'
                        }}>{step.label}</span>
                    </div>
                    {i < steps.length - 1 && (
                        <div style={{
                            height: '2px',
                            flex: '0 0 40px',
                            background: steps[i + 1].done || steps[i + 1].active
                                ? 'linear-gradient(90deg, #10b981, #3b82f6)' : '#e2e8f0',
                            marginTop: '-1.5rem',
                            borderRadius: '2px'
                        }} />
                    )}
                </div>
            ))}
        </div>
    );
};

// ============================================================================
// YOUTUBE LINK INPUT COMPONENT
// ============================================================================
const YouTubeLinkInput = ({ bookId, currentYoutubeId, onLinked }) => {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!url.trim()) return;
        setLoading(true);
        setMessage(null);

        try {
            const res = await fetch(`${API_BASE}/api/books/${bookId}/youtube-link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ youtubeUrl: url })
            });
            const data = await res.json();
            if (data.success) {
                setMessage({ type: 'success', text: `✅ Vinculado: ${data.youtubeId}` });
                setUrl('');
                if (onLinked) onLinked(data.youtubeId);
            } else {
                setMessage({ type: 'error', text: data.error || 'Error desconocido' });
            }
        } catch (e) {
            setMessage({ type: 'error', text: 'Error de red: ' + e.message });
        } finally {
            setLoading(false);
        }
    };

    if (currentYoutubeId) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '10px',
                fontSize: '0.85rem',
                marginBottom: '1rem'
            }}>
                <span>✅</span>
                <span style={{ color: '#15803d', fontWeight: '500' }}>
                    Video vinculado:
                </span>
                <a
                    href={`https://youtu.be/${currentYoutubeId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#2563eb', fontWeight: '600' }}
                >
                    youtu.be/{currentYoutubeId}
                </a>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} style={{ marginBottom: '1rem' }}>
            <div style={{
                display: 'flex',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '10px'
            }}>
                <span style={{ fontSize: '1.1rem', alignSelf: 'center' }}>📺</span>
                <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Pega la URL de YouTube aquí..."
                    style={{
                        flex: 1,
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        fontSize: '0.85rem',
                        color: '#1e293b'
                    }}
                />
                <button
                    type="submit"
                    disabled={loading || !url.trim()}
                    style={{
                        padding: '0.4rem 1rem',
                        background: loading ? '#94a3b8' : '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: loading ? 'wait' : 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: '600'
                    }}
                >
                    {loading ? '...' : 'Vincular'}
                </button>
            </div>
            {message && (
                <p style={{
                    marginTop: '0.5rem',
                    fontSize: '0.8rem',
                    color: message.type === 'success' ? '#059669' : '#dc2626',
                    textAlign: 'center'
                }}>{message.text}</p>
            )}
        </form>
    );
};

// ============================================================================
// ROADMAP VIEWER COMPONENT
// ============================================================================
const RoadmapViewer = ({ roadmap, bookId, notebookId }) => {
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState(null);
    const [localRoadmap, setLocalRoadmap] = useState(roadmap);

    const handleGenerate = async () => {
        if (!notebookId) return alert('Este libro no tiene un NotebookLM asociado.');
        setGenerating(true);
        setError(null);

        try {
            const res = await fetch(`${API_BASE}/api/books/${bookId}/generate-roadmap`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (data.success) {
                setLocalRoadmap(data.roadmap);
            } else {
                setError(data.error || 'Error generando roadmap');
            }
        } catch (e) {
            setError('Error de red: ' + e.message);
        } finally {
            setGenerating(false);
        }
    };

    const r = localRoadmap;

    if (!r) {
        return (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
                <div style={{ fontSize: '4rem', marginBottom: '1rem', opacity: 0.5 }}>🗺️</div>
                <h3 style={{ marginBottom: '0.5rem', color: '#334155' }}>Roadmap no generado aún</h3>
                <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                    Genera un plan de acción estructurado basado en el contenido del libro.
                </p>
                <button
                    onClick={handleGenerate}
                    disabled={generating}
                    style={{
                        padding: '0.75rem 2rem',
                        background: generating ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '10px',
                        cursor: generating ? 'wait' : 'pointer',
                        fontSize: '1rem',
                        fontWeight: '600',
                        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
                    }}
                >
                    {generating ? '⏳ Generando...' : '🚀 Generar Roadmap'}
                </button>
                {error && <p style={{ color: '#dc2626', marginTop: '1rem', fontSize: '0.85rem' }}>{error}</p>}
            </div>
        );
    }

    const phaseConfig = [
        { key: 'fase_1_inmediato', label: 'Fase 1: Inmediato', icon: '🚀', color: '#10b981', bgColor: '#ecfdf5', borderColor: '#a7f3d0' },
        { key: 'fase_2_medio_plazo', label: 'Fase 2: Medio Plazo', icon: '📈', color: '#f59e0b', bgColor: '#fffbeb', borderColor: '#fde68a' },
        { key: 'fase_3_maestria', label: 'Fase 3: Maestría', icon: '🏆', color: '#8b5cf6', bgColor: '#f5f3ff', borderColor: '#ddd6fe' }
    ];

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            {/* Resumen Ejecutivo */}
            <div style={{
                background: 'linear-gradient(135deg, #f0f9ff, #e0f2fe)',
                border: '1px solid #bae6fd',
                borderRadius: '12px',
                padding: '1.5rem',
                marginBottom: '2rem'
            }}>
                <h3 style={{ fontSize: '1.1rem', color: '#0c4a6e', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    📋 Resumen Ejecutivo
                </h3>
                <p style={{ lineHeight: '1.7', color: '#1e3a5f', fontSize: '0.95rem' }}>{r.resumen_ejecutivo}</p>
            </div>

            {/* Aprendizajes Clave */}
            <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1.1rem', color: '#1e293b', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    💡 Aprendizajes Clave
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {r.aprendizajes_clave.map((a, i) => (
                        <div key={i} style={{
                            padding: '1rem 1.25rem',
                            background: 'white',
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px',
                            borderLeft: '4px solid #3b82f6'
                        }}>
                            <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '0.25rem' }}>{a.punto}</div>
                            <div style={{ fontSize: '0.9rem', color: '#64748b', lineHeight: '1.5' }}>{a.descripcion}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Roadmap Accionable */}
            <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1.1rem', color: '#1e293b', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    🗺️ Roadmap Accionable
                </h3>
                {phaseConfig.map(phase => {
                    const actions = r.roadmap_accionable?.[phase.key] || [];
                    if (actions.length === 0) return null;
                    return (
                        <div key={phase.key} style={{
                            background: phase.bgColor,
                            border: `1px solid ${phase.borderColor}`,
                            borderRadius: '12px',
                            padding: '1.25rem',
                            marginBottom: '1rem'
                        }}>
                            <h4 style={{ color: phase.color, fontWeight: '700', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {phase.icon} {phase.label}
                            </h4>
                            {actions.map((action, i) => (
                                <div key={i} style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '0.75rem',
                                    padding: '0.75rem',
                                    background: 'rgba(255,255,255,0.7)',
                                    borderRadius: '8px',
                                    marginBottom: i < actions.length - 1 ? '0.5rem' : 0
                                }}>
                                    <div style={{
                                        width: '24px',
                                        height: '24px',
                                        borderRadius: '6px',
                                        border: `2px solid ${phase.color}`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                        marginTop: '2px',
                                        cursor: 'pointer',
                                        fontSize: '0.7rem'
                                    }}>
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '0.9rem' }}>{action.accion}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.15rem' }}>→ {action.objetivo}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>

            {/* Indicadores de Éxito */}
            {r.indicadores_exito && r.indicadores_exito.length > 0 && (
                <div style={{
                    background: '#fefce8',
                    border: '1px solid #fde68a',
                    borderRadius: '12px',
                    padding: '1.25rem'
                }}>
                    <h3 style={{ fontSize: '1rem', color: '#92400e', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        🎯 Indicadores de Éxito
                    </h3>
                    <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                        {r.indicadores_exito.map((ind, i) => (
                            <li key={i} style={{ color: '#78350f', marginBottom: '0.4rem', fontSize: '0.9rem', lineHeight: '1.5' }}>{ind}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Regenerate Button */}
            <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                <button
                    onClick={handleGenerate}
                    disabled={generating}
                    style={{
                        padding: '0.5rem 1.5rem',
                        background: 'transparent',
                        color: '#64748b',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        cursor: generating ? 'wait' : 'pointer',
                        fontSize: '0.8rem'
                    }}
                >
                    {generating ? '⏳ Regenerando...' : '🔄 Regenerar Roadmap'}
                </button>
                {r.generatedAt && (
                    <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                        Generado: {new Date(r.generatedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                )}
            </div>
        </div>
    );
};

// ============================================================================
// MAIN COMPONENT: BookDetail
// ============================================================================
const BookDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    // Core State
    const [book, setBook] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // UI State
    const [activeTab, setActiveTab] = useState('audio');

    // Audio Player State
    const playerRef = useRef(null);

    // TTS State
    const [ttsState, setTtsState] = useState({
        isSpeaking: false,
        mode: 'summary'
    });
    const synth = window.speechSynthesis;

    // Text Reader State
    const [textMode, setTextMode] = useState('infinite');
    const [page, setPage] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [ttsProgress, setTtsProgress] = useState(0);

    // 1. LOAD DATA FROM FIRESTORE (with realtime updates)
    useEffect(() => {
        if (!id) return;
        setIsLoading(true);
        setError(null);

        const docRef = doc(db, "books", String(id));

        // Use onSnapshot for real-time updates
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setBook({
                    id: docSnap.id,
                    title: data.title || 'Sin Título',
                    channelTitle: data.channelTitle || 'Canal Desconocido',
                    thumbnail: data.thumbnail || 'https://via.placeholder.com/400x600?text=No+Image',
                    level: data.level || 'General',
                    summary: data.summary || 'No hay resumen disponible.',
                    transcription: data.transcription || 'No hay transcripción disponible.',
                    audioLength: Number(data.audioLength) || 300,
                    topicId: data.topicId,
                    // Artifact fields
                    audioUrl: data.audioUrl || data.audioUrlOriginal || null,
                    videoUrl: data.videoUrl || null,
                    youtubeId: data.youtubeId || null,
                    reportUrl: data.reportUrl || null,
                    reportContent: data.reportContent || null,
                    infographicUrl: data.infographicUrl || data.image || null,
                    // V2 fields
                    notebookId: data.notebookId || null,
                    driveSync: data.driveSync || false,
                    driveFolderUrl: data.driveFolderUrl || null,
                    driveAudioUrl: data.driveAudioUrl || null,
                    driveVideoUrl: data.driveVideoUrl || null,
                    driveInfographicUrl: data.driveInfographicUrl || null,
                    roadmap: data.roadmap || null,
                    status: data.status || null,
                    orchestrationStatus: data.orchestrationStatus || null
                });
                setError(null);
            } else {
                setError("El libro que buscas no existe o ha sido eliminado.");
            }
            setIsLoading(false);
        }, (err) => {
            console.error("🔥 Firebase Error:", err);
            setError("Error de conexión con la biblioteca en la nube.");
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [id]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            synth.cancel();
        };
    }, []);

    // TTS Functions
    const startTTS = (startIndex = 0) => {
        if (!book) return;
        synth.cancel();
        const fullText = ttsState.mode === 'transcription' ? book.transcription : book.summary;
        const textToRead = fullText.slice(startIndex);
        if (!textToRead.trim()) return;

        const utterance = new SpeechSynthesisUtterance(textToRead);
        utterance.lang = 'es-ES';
        utterance.rate = playbackSpeed;
        utterance.onboundary = (event) => {
            if (event.name === 'word') setTtsProgress(startIndex + event.charIndex);
        };
        utterance.onend = () => {
            if (!synth.speaking) {
                setTtsState(prev => ({ ...prev, isSpeaking: false }));
                setTtsProgress(0);
            }
        };
        synth.speak(utterance);
        setTtsState(prev => ({ ...prev, isSpeaking: true }));
    };

    const toggleTTS = () => {
        if (ttsState.isSpeaking) {
            synth.cancel();
            setTtsState(prev => ({ ...prev, isSpeaking: false }));
        } else {
            startTTS(ttsProgress);
        }
    };

    useEffect(() => {
        if (ttsState.isSpeaking) startTTS(ttsProgress);
    }, [playbackSpeed]);

    const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

    const renderTextWithBold = (text) => {
        if (!text) return null;
        return text.split(/(\*\*.*?\*\*)/g).map((part, i) =>
            part.startsWith('**') && part.endsWith('**')
                ? <strong key={i}>{part.slice(2, -2)}</strong>
                : part
        );
    };

    const reprocessBook = async () => {
        if (!window.confirm('¿Forzar sincronización con Google Drive?')) return;
        try {
            const res = await fetch(`${API_BASE}/api/process-artifacts/${id}?force=1`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    notebookId: book.notebookId,
                    title: book.title,
                    description: book.summary?.substring(0, 500) || "Sin descripción"
                })
            });
            const data = await res.json();
            if (res.status === 409) return alert('⚠️ Proceso bloqueado por otro worker.');
            if (res.status === 428) return alert('⚠️ Faltan credenciales de Google.');
            if (data.success) alert('🚀 Sincronización iniciada.');
            else alert('Error: ' + (data.message || 'Desconocido'));
        } catch (e) {
            alert('Error de red: ' + e.message);
        }
    };

    // LOADING
    if (isLoading) {
        return (
            <div style={{ paddingTop: '100px', textAlign: 'center', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔄</div>
                <h3>Cargando biblioteca...</h3>
            </div>
        );
    }

    // ERROR
    if (error || !book) {
        return (
            <div style={{ paddingTop: '100px', textAlign: 'center', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
                <h3>Algo salió mal</h3>
                <p style={{ color: '#666' }}>{error || "Error desconocido"}</p>
                <button onClick={() => navigate('/')} className="btn btn-primary" style={{ marginTop: '2rem' }}>
                    Volver al Inicio
                </button>
            </div>
        );
    }

    // CONTENT
    const contentText = ttsState.mode === 'transcription' ? book.transcription : book.summary;
    const paragraphs = contentText ? contentText.split('\n\n').filter(p => p.trim()) : [];
    const currentParagraph = paragraphs[page] || "";

    const SpeedSelector = () => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '0.75rem', color: '#64748b', fontWeight: 'bold' }}>
                <span>Lento</span>
                <span style={{ color: 'var(--accent-primary)', fontSize: '1rem' }}>x{playbackSpeed.toFixed(2)}</span>
                <span>Rápido</span>
            </div>
            <input type="range" min="0.5" max="3" step="0.1" value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent-primary)', cursor: 'pointer' }} />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                {[0.75, 0.9, 1, 1.25, 1.5, 2].map(val => (
                    <button key={val} onClick={() => setPlaybackSpeed(val)}
                        style={{ padding: '2px 8px', fontSize: '0.7rem', border: '1px solid #e2e8f0', borderRadius: '4px', background: playbackSpeed === val ? '#e0f2fe' : 'white', cursor: 'pointer' }}>
                        x{val}
                    </button>
                ))}
            </div>
        </div>
    );

    const tabs = [
        { id: 'audio', label: '🎙️ Audio' },
        { id: 'informe', label: '📄 Informe' },
        { id: 'roadmap', label: '🗺️ Roadmap' },
        { id: 'texto', label: '📝 Transcripción' },
        { id: 'video', label: '📺 Video' },
        { id: 'tts', label: '🗣️ Voz IA' }
    ];

    return (
        <div style={{ paddingTop: '80px', minHeight: '100vh', background: '#f8fafc', paddingBottom: '4rem' }}>
            {/* Header */}
            <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '2rem 0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                <div className="container" style={{ maxWidth: '1000px' }}>
                    <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                        <img src={book.thumbnail} alt={book.title}
                            style={{ width: '100px', height: '150px', objectFit: 'cover', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                            onError={(e) => e.target.src = 'https://via.placeholder.com/100x150?text=Error'} />
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <span style={{ fontSize: '0.7rem', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>{book.level}</span>
                                {book.driveSync && (
                                    <span style={{ fontSize: '0.7rem', background: '#f0fdf4', color: '#15803d', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>📁 Drive</span>
                                )}
                                {book.youtubeId && (
                                    <span style={{ fontSize: '0.7rem', background: '#fef2f2', color: '#dc2626', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>📺 YouTube</span>
                                )}
                            </div>
                            <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', lineHeight: '1.2' }}>{book.title}</h1>
                            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>{book.channelTitle} • Resumen Foresvi</p>
                        </div>
                    </div>

                    {/* Pipeline Stepper */}
                    <PipelineStepper book={book} />

                    {/* Drive Folder Link */}
                    {book.driveFolderUrl && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.5rem 1rem',
                            background: '#f0f9ff',
                            border: '1px solid #bae6fd',
                            borderRadius: '8px',
                            fontSize: '0.8rem'
                        }}>
                            <span>📁</span>
                            <a href={book.driveFolderUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#0369a1', fontWeight: '500' }}>
                                Abrir carpeta en Google Drive
                            </a>
                        </div>
                    )}
                </div>
            </div>

            <div className="container" style={{ maxWidth: '1000px', marginTop: '2rem' }}>
                {/* YouTube Link Input (for admins) */}
                {user?.role === 'admin' && (
                    <YouTubeLinkInput
                        bookId={id}
                        currentYoutubeId={book.youtubeId}
                        onLinked={() => {/* realtime snapshot will update */ }}
                    />
                )}

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '1px', flexWrap: 'wrap' }}>
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                background: 'none',
                                border: 'none',
                                borderBottom: activeTab === tab.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
                                color: activeTab === tab.id ? 'var(--accent-primary)' : '#64748b',
                                padding: '0.5rem 1rem',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                marginBottom: '-2px',
                                fontSize: '0.85rem'
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                <div className="card" style={{ padding: '2rem', minHeight: '400px' }}>

                    {/* AUDIO PLAYER */}
                    {activeTab === 'audio' && (
                        <div style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}>
                            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎧</div>
                            <h3 style={{ marginBottom: '0.5rem' }}>Audio Resumen</h3>

                            <div style={{ marginTop: '2rem', padding: '1rem', background: 'white', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                                {book.youtubeId ? (
                                    <div>
                                        <div style={{ aspectRatio: '16/9', borderRadius: '12px', overflow: 'hidden' }}>
                                            <iframe width="100%" height="100%"
                                                src={`https://www.youtube.com/embed/${book.youtubeId}?playsinline=1&modestbranding=1`}
                                                title="Audio Player (YouTube)" frameBorder="0"
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                allowFullScreen />
                                        </div>
                                        <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#64748b' }}>
                                            📺 Reproducción vía YouTube
                                        </p>
                                    </div>
                                ) : book.audioUrl ? (
                                    <div>
                                        <div style={{ background: '#f0f9ff', color: '#0369a1', padding: '0.75rem', fontSize: '0.85rem', marginBottom: '1rem', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                                            🎙️ Audio generado por NotebookLM
                                        </div>
                                        {book.infographicUrl && (
                                            <img src={book.infographicUrl} alt="Portada"
                                                style={{ width: '100%', maxWidth: '400px', borderRadius: '12px', marginBottom: '1rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                        )}
                                        <audio controls src={book.audioUrl}
                                            style={{ width: '100%', borderRadius: '50px' }}
                                            onError={(e) => console.error('Audio load error:', e)} />
                                        <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#64748b' }}>
                                            Duración estimada: {Math.floor((book.audioLength || 300) / 60)} minutos
                                        </p>
                                    </div>
                                ) : (
                                    <div style={{ padding: '3rem', background: '#f8fafc', borderRadius: '8px', color: '#64748b' }}>
                                        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
                                        <p style={{ fontWeight: 'bold' }}>Audio en proceso de generación</p>
                                        <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>El sistema está generando el contenido con NotebookLM.</p>
                                        {user?.role === 'admin' && (
                                            <button onClick={reprocessBook}
                                                style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#e2e8f0', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: '#475569' }}>
                                                🔄 Forzar Sincronización (Admin)
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* TEXT READER */}
                    {activeTab === 'texto' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button onClick={() => { setTtsState(s => ({ ...s, mode: 'summary' })); setPage(0); }}
                                        className={`btn ${ttsState.mode === 'summary' ? 'btn-primary' : 'btn-outline'}`} style={{ fontSize: '0.8rem' }}>Resumen</button>
                                    <button onClick={() => { setTtsState(s => ({ ...s, mode: 'transcription' })); setPage(0); }}
                                        className={`btn ${ttsState.mode === 'transcription' ? 'btn-primary' : 'btn-outline'}`} style={{ fontSize: '0.8rem' }}>Transcripción</button>
                                </div>
                                <select value={textMode} onChange={(e) => setTextMode(e.target.value)}
                                    style={{ padding: '0.4rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                    <option value="infinite">📜 Modo Infinito</option>
                                    <option value="paginated">📖 Modo Página</option>
                                </select>
                            </div>

                            <div style={{ fontSize: '1.1rem', lineHeight: '1.8', color: '#1e293b', whiteSpace: 'pre-line' }}>
                                {textMode === 'infinite' ? (
                                    paragraphs.map((p, i) => (
                                        <p key={i} style={{ marginBottom: '1.5rem' }}>{renderTextWithBold(p)}</p>
                                    ))
                                ) : (
                                    <div>
                                        <p>{renderTextWithBold(currentParagraph)}</p>
                                        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem' }}>
                                            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="btn btn-outline">Anterior</button>
                                            <span style={{ alignSelf: 'center', fontSize: '0.9rem', color: '#64748b' }}>{page + 1} / {paragraphs.length}</span>
                                            <button disabled={page >= paragraphs.length - 1} onClick={() => setPage(p => p + 1)} className="btn btn-outline">Siguiente</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* VIDEO PLAYER */}
                    {activeTab === 'video' && (
                        <div style={{ aspectRatio: '16/9', background: 'black', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
                            {book.youtubeId ? (
                                <iframe width="100%" height="100%"
                                    src={`https://www.youtube.com/embed/${book.youtubeId}?playsinline=1&rel=0`}
                                    title="Video Player" frameBorder="0"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen />
                            ) : book.audioUrl ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'white', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', textAlign: 'center', padding: '2rem' }}>
                                    {book.infographicUrl && (
                                        <img src={book.infographicUrl} alt="Portada" style={{ maxWidth: '200px', marginBottom: '1.5rem', borderRadius: '8px' }} />
                                    )}
                                    <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🎧</div>
                                    <p style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Video pendiente de vincular</p>
                                    <p style={{ fontSize: '0.85rem', opacity: 0.8, marginBottom: '1rem' }}>
                                        {book.driveVideoUrl
                                            ? 'Video disponible en Google Drive. Vincula tu video de YouTube arriba.'
                                            : 'Mientras tanto, puedes escuchar el audio:'}
                                    </p>
                                    {book.driveVideoUrl && (
                                        <a href={book.driveVideoUrl} target="_blank" rel="noopener noreferrer"
                                            style={{ padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.15)', borderRadius: '8px', color: 'white', fontSize: '0.85rem', textDecoration: 'none', marginBottom: '1rem' }}>
                                            📁 Ver en Drive
                                        </a>
                                    )}
                                    <audio controls src={book.audioUrl}
                                        style={{ width: '100%', maxWidth: '400px', borderRadius: '50px' }} />
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', background: '#1e293b' }}>
                                    <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📺</div>
                                    <p>Contenido en proceso de generación...</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* REPORT VIEWER */}
                    {activeTab === 'informe' && (
                        <div style={{ padding: '2rem', background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Informe Ejecutivo</h2>
                                {book.reportUrl && (
                                    <a href={book.reportUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline" style={{ fontSize: '0.9rem' }}>
                                        Abrir en NotebookLM ↗
                                    </a>
                                )}
                            </div>

                            {book.infographicUrl && (
                                <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
                                    <img src={book.infographicUrl} alt="Infografía" style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                </div>
                            )}

                            {book.reportContent ? (
                                <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', color: '#334155' }}>
                                    {renderTextWithBold(book.reportContent)}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8', background: '#f8fafc', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
                                    <p>El informe detallado aún no se ha generado para este libro.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ROADMAP TAB */}
                    {activeTab === 'roadmap' && (
                        <RoadmapViewer
                            roadmap={book.roadmap}
                            bookId={id}
                            notebookId={book.notebookId}
                        />
                    )}

                    {/* TTS PLAYER */}
                    {activeTab === 'tts' && (
                        <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🗣️</div>
                            <h3>Lectura en Voz Alta (IA)</h3>

                            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', margin: '2rem 0' }}>
                                <button onClick={() => setTtsState(s => ({ ...s, mode: 'summary' }))}
                                    className={`btn ${ttsState.mode === 'summary' ? 'btn-primary' : 'btn-outline'}`}>Resumen</button>
                                <button onClick={() => setTtsState(s => ({ ...s, mode: 'transcription' }))}
                                    className={`btn ${ttsState.mode === 'transcription' ? 'btn-primary' : 'btn-outline'}`}>Transcripción</button>
                            </div>

                            <SpeedSelector />

                            <button onClick={toggleTTS} className="btn btn-primary"
                                style={{ padding: '1rem 3rem', fontSize: '1.2rem', borderRadius: '50px', background: ttsState.isSpeaking ? '#ef4444' : 'var(--accent-primary)', borderColor: 'transparent' }}>
                                {ttsState.isSpeaking ? '🛑 Detener Voz' : '▶️ Escuchar Ahora'}
                            </button>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};

export default BookDetail;
