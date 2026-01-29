import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import ReactPlayer from 'react-player';

const BookDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    // Core State
    const [book, setBook] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // UI State
    const [activeTab, setActiveTab] = useState('audio'); // 'audio', 'texto', 'video', 'tts'

    // Audio Player State
    const playerRef = useRef(null);

    // TTS State
    const [ttsState, setTtsState] = useState({
        isSpeaking: false,
        mode: 'summary' // 'summary' or 'transcription'
    });
    const synth = window.speechSynthesis;

    // Text Reader State
    const [textMode, setTextMode] = useState('infinite'); // 'infinite' or 'paginated'
    const [page, setPage] = useState(0);

    // 1. LOAD DATA FROM FIRESTORE
    useEffect(() => {
        const fetchBook = async () => {
            console.log("📚 Fetching book from Firebase. ID:", id);
            setIsLoading(true);
            setError(null);

            try {
                const docRef = doc(db, "books", String(id));
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    console.log("✅ Book Found:", data.title);

                    const sanitizedBook = {
                        id: docSnap.id,
                        title: data.title || 'Sin Título',
                        channelTitle: data.channelTitle || 'Canal Desconocido',
                        thumbnail: data.thumbnail || 'https://via.placeholder.com/400x600?text=No+Image',
                        level: data.level || 'General',
                        summary: data.summary || 'No hay resumen disponible.',
                        transcription: data.transcription || 'No hay transcripción disponible.',
                        audioLength: Number(data.audioLength) || 300,
                        topicId: data.topicId
                    };

                    setBook(sanitizedBook);
                    setMediaState(prev => ({ ...prev, duration: sanitizedBook.audioLength }));
                } else {
                    console.warn("❌ Book Not Found in Cloud");
                    setError("El libro que buscas no existe o ha sido eliminado.");
                }
            } catch (err) {
                console.error("🔥 Firebase Error:", err);
                setError("Error de conexión con la biblioteca en la nube.");
            } finally {
                setIsLoading(false);
            }
        };

        if (id) fetchBook();
    }, [id]);

    // 2. AUDIO LOGIC (Sync with ReactPlayer)
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [mediaState, setMediaState] = useState({
        isPlaying: false,
        currentTime: 0,
        duration: 300
    });

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            synth.cancel();
            setMediaState(prev => ({ ...prev, isPlaying: false }));
        };
    }, []);

    // Stop background audio when entering video tab
    useEffect(() => {
        if (activeTab === 'video' && mediaState.isPlaying) {
            setMediaState(prev => ({ ...prev, isPlaying: false }));
        }
    }, [activeTab]);

    // Speed Sync for TTS
    const [ttsProgress, setTtsProgress] = useState(0);

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
            if (event.name === 'word') {
                setTtsProgress(startIndex + event.charIndex);
            }
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
        if (ttsState.isSpeaking) {
            startTTS(ttsProgress);
        }
    }, [playbackSpeed]);

    // 4. HELPER: Time Formatter
    const formatTime = (s) => {
        const mins = Math.floor(s / 60);
        const secs = s % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const renderTextWithBold = (text) => {
        if (!text) return null;
        const parts = text.split(/(\*\*.*?\*\*)/g);
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={i}>{part.slice(2, -2)}</strong>;
            }
            return part;
        });
    };

    const handleSeek = (newTime) => {
        if (playerRef.current) {
            playerRef.current.seekTo(newTime, 'seconds');
        }
        setMediaState(prev => ({
            ...prev,
            currentTime: newTime
        }));
        if (!mediaState.isPlaying) {
            setMediaState(prev => ({ ...prev, isPlaying: true }));
        }
    };

    // 5. RENDER - LOADING & ERROR STATES
    if (isLoading) {
        return (
            <div style={{ paddingTop: '100px', textAlign: 'center', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔄</div>
                <h3>Cargando biblioteca...</h3>
            </div>
        );
    }

    if (error || !book) {
        return (
            <div style={{ paddingTop: '100px', textAlign: 'center', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
                <h3>Algo salió mal</h3>
                <p style={{ color: '#666' }}>{error || "Error desconocido"}</p>
                <button
                    onClick={() => navigate('/')}
                    className="btn btn-primary"
                    style={{ marginTop: '2rem' }}
                >
                    Volver al Inicio
                </button>
            </div>
        );
    }

    // 6. RENDER - MAIN CONTENT
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
            <input
                type="range"
                min="0.5"
                max="3"
                step="0.1"
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                {[0.75, 0.9, 1, 1.25, 1.5, 2].map(val => (
                    <button
                        key={val}
                        onClick={() => setPlaybackSpeed(val)}
                        style={{ padding: '2px 8px', fontSize: '0.7rem', border: '1px solid #e2e8f0', borderRadius: '4px', background: playbackSpeed === val ? '#e0f2fe' : 'white', cursor: 'pointer' }}
                    >x{val}</button>
                ))}
            </div>
        </div>
    );

    return (
        <div style={{ paddingTop: '80px', minHeight: '100vh', background: '#f8fafc', paddingBottom: '4rem' }}>
            {/* Header */}
            <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '2rem 0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                <div className="container" style={{ display: 'flex', gap: '2rem', alignItems: 'center', maxWidth: '1000px' }}>
                    <img
                        src={book.thumbnail}
                        alt={book.title}
                        style={{ width: '100px', height: '150px', objectFit: 'cover', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                        onError={(e) => e.target.src = 'https://via.placeholder.com/100x150?text=Error'}
                    />
                    <div>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.7rem', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>{book.level}</span>
                        </div>
                        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', lineHeight: '1.2' }}>{book.title}</h1>
                        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>{book.channelTitle} • Resumen Foresvi</p>
                    </div>
                </div>
            </div>

            <div className="container" style={{ maxWidth: '1000px', marginTop: '2rem' }}>
                {/* Tabs */}
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '1px' }}>
                    {[
                        { id: 'audio', label: '🎙️ Audio' },
                        { id: 'texto', label: '📝 Texto' },
                        { id: 'video', label: '📺 Video' },
                        { id: 'tts', label: '🗣️ Voz IA' }
                    ].map(tab => (
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
                                marginBottom: '-2px'
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
                        <div style={{ textAlign: 'center', maxWidth: '500px', margin: '0 auto' }}>
                            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎧</div>
                            <h3 style={{ marginBottom: '0.5rem' }}>Reproductor de Audio</h3>
                            <p style={{ color: '#64748b', marginBottom: '2rem' }}>Escucha el contenido extraído del video</p>

                            <SpeedSelector />

                            {/* Progress Bar */}
                            <div
                                style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', marginBottom: '1rem', cursor: 'pointer', position: 'relative' }}
                                onClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const pct = (e.clientX - rect.left) / rect.width;
                                    handleSeek(Math.floor(pct * mediaState.duration));
                                }}
                            >
                                <div style={{ width: `${(mediaState.currentTime / mediaState.duration) * 100}%`, height: '100%', background: 'var(--accent-primary)', borderRadius: '4px' }}></div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#64748b', marginBottom: '2rem' }}>
                                <span>{formatTime(mediaState.currentTime)}</span>
                                <span>{formatTime(mediaState.duration)}</span>
                            </div>

                            {/* Controls */}
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center', marginBottom: '2rem' }}>
                                <button onClick={() => handleSeek(Math.max(0, mediaState.currentTime - 15))} className="btn btn-outline" style={{ borderRadius: '50%', width: '40px', height: '40px', padding: 0 }}>-15</button>
                                <button
                                    onClick={() => setMediaState(s => ({ ...s, isPlaying: !s.isPlaying }))}
                                    className="btn btn-primary"
                                    style={{ borderRadius: '50%', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}
                                >
                                    {mediaState.isPlaying ? '⏸' : '▶'}
                                </button>
                                <button onClick={() => handleSeek(Math.min(mediaState.duration, mediaState.currentTime + 15))} className="btn btn-outline" style={{ borderRadius: '50%', width: '40px', height: '40px', padding: 0 }}>+15</button>
                            </div>

                            <button
                                onClick={() => alert("Descarga iniciada... En producción, esto descargará un archivo .mp3 optimizado.")}
                                className="btn btn-outline"
                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.8rem' }}
                            >
                                ⬇️ Descargar Audio para modo Offline
                            </button>

                        </div>
                    )}

                    {/* PERSISTENT BACKGROUND AUDIO PLAYER (Hidden visually but active) */}
                    <div style={{ position: 'fixed', top: '-9999px', left: '-9999px', opacity: 0, pointerEvents: 'none' }}>
                        <ReactPlayer
                            ref={playerRef}
                            url={`https://www.youtube.com/watch?v=${book.id}`}
                            playing={mediaState.isPlaying && activeTab !== 'video'}
                            playbackRate={playbackSpeed}
                            onProgress={(state) => {
                                setMediaState(prev => ({ ...prev, currentTime: Math.floor(state.playedSeconds) }));
                            }}
                            onDuration={(d) => setMediaState(prev => ({ ...prev, duration: d }))}
                        />
                    </div>

                    {/* TEXT READER */}
                    {activeTab === 'texto' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button onClick={() => { setTtsState(s => ({ ...s, mode: 'summary' })); setPage(0); }} className={`btn ${ttsState.mode === 'summary' ? 'btn-primary' : 'btn-outline'}`} style={{ fontSize: '0.8rem' }}>Resumen</button>
                                    <button onClick={() => { setTtsState(s => ({ ...s, mode: 'transcription' })); setPage(0); }} className={`btn ${ttsState.mode === 'transcription' ? 'btn-primary' : 'btn-outline'}`} style={{ fontSize: '0.8rem' }}>Transcripción</button>
                                </div>
                                <select value={textMode} onChange={(e) => setTextMode(e.target.value)} style={{ padding: '0.4rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                    <option value="infinite">📜 Modo Infinito</option>
                                    <option value="paginated">📖 Modo Pagina</option>
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
                        <div style={{ aspectRatio: '16/9', background: 'black', borderRadius: '12px', overflow: 'hidden' }}>
                            <ReactPlayer
                                url={`https://www.youtube.com/watch?v=${book.id}`}
                                width="100%"
                                height="100%"
                                controls
                                playbackRate={playbackSpeed}
                                playing={false}
                            />
                        </div>
                    )}

                    {/* TTS PLAYER */}
                    {activeTab === 'tts' && (
                        <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🗣️</div>
                            <h3>Lectura en Voz Alta (IA)</h3>

                            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', margin: '2rem 0' }}>
                                <button onClick={() => setTtsState(s => ({ ...s, mode: 'summary' }))} className={`btn ${ttsState.mode === 'summary' ? 'btn-primary' : 'btn-outline'}`}>Resumen</button>
                                <button onClick={() => setTtsState(s => ({ ...s, mode: 'transcription' }))} className={`btn ${ttsState.mode === 'transcription' ? 'btn-primary' : 'btn-outline'}`}>Transcripción</button>
                            </div>

                            <SpeedSelector />

                            <button
                                onClick={toggleTTS}
                                className="btn btn-primary"
                                style={{ padding: '1rem 3rem', fontSize: '1.2rem', borderRadius: '50px', background: ttsState.isSpeaking ? '#ef4444' : 'var(--accent-primary)', borderColor: 'transparent' }}
                            >
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
