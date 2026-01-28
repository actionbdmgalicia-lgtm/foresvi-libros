import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, getDocs, doc, setDoc, deleteDoc, query, orderBy, onSnapshot } from 'firebase/firestore';

const YOUTUBE_API_KEY = 'AIzaSyDE4YPTEBBzctr4XWvihvZH-3jQgxTfQbY';
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

// OpenAI Service
const callOpenAI = async (prompt) => {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "system", content: "Eres un experto en resúmenes técnicos para FORESVI." }, { role: "user", content: prompt }],
                temperature: 0.7
            })
        });
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (err) {
        console.error("OpenAI Error:", err);
        return null;
    }
};

// Real YouTube Search Service
const searchYouTube = async (query, filters = {}) => {
    if (YOUTUBE_API_KEY === 'TU_CLAVE_API_AQUI') {
        alert("⚠️ Falta la API Key de YouTube.");
        return [];
    }

    try {
        let videoId = null;
        // Detect direct URL or ID
        const urlMatch = query.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
        if (urlMatch) videoId = urlMatch[1];

        let url;
        if (videoId) {
            // If it's a direct ID, fetch that specific video
            url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`;
        } else {
            // General Search with filters
            let filterParams = '';
            if (filters.year) {
                const startOfYear = `${filters.year}-01-01T00:00:00Z`;
                filterParams += `&publishedAfter=${startOfYear}`;
            }
            if (filters.duration && filters.duration !== 'any') {
                filterParams += `&videoDuration=${filters.duration}`;
            }
            if (filters.lang && filters.lang !== 'any') {
                filterParams += `&relevanceLanguage=${filters.lang}`;
            }

            url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=12&q=${query}&type=video&order=relevance${filterParams}&key=${YOUTUBE_API_KEY}`;
        }

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) throw new Error(data.error.message);

        let items = data.items;
        if (!videoId) {
            // For search, we need to fetch stats separately
            const ids = items.map(item => item.id.videoId).join(',');
            const statsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${ids}&key=${YOUTUBE_API_KEY}`);
            const statsData = await statsRes.json();
            items = items.map(item => ({
                ...item,
                id: item.id.videoId, // Normalize ID
                contentDetails: statsData.items.find(s => s.id === item.id.videoId)?.contentDetails,
                statistics: statsData.items.find(s => s.id === item.id.videoId)?.statistics
            }));
        } else {
            // For direct ID, it's already in the top level
            items = items.map(item => ({
                ...item,
                statistics: item.statistics,
                contentDetails: item.contentDetails
            }));
        }

        return items.map(item => {
            const durationISO = item.contentDetails?.duration || 'PT0M0S';
            const match = durationISO.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
            const h = parseInt(match[1]) || 0;
            const m = parseInt(match[2]) || 0;
            const s = parseInt(match[3]) || 0;

            return {
                id: item.id,
                platform: 'YouTube',
                url: `https://www.youtube.com/watch?v=${item.id}`,
                title: item.snippet.title,
                views: parseInt(item.statistics?.viewCount || 0),
                durationSec: h * 3600 + m * 60 + s,
                thumbnail: item.snippet.thumbnails.high.url,
                description: item.snippet.description,
                channelTitle: item.snippet.channelTitle
            };
        });

    } catch (error) {
        console.error("Error searchYouTube:", error);
        alert("Error de YouTube: " + error.message);
        return [];
    }
};

const AdminDashboard = () => {
    // State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [searchFilters, setSearchFilters] = useState({ year: '', duration: 'any', lang: 'es' });

    // UI State
    const [activeTab, setActiveTab] = useState('search');

    // Processing State (Summary/Audio)
    const [isProcessing, setIsProcessing] = useState(false);
    const [aiSummary, setAiSummary] = useState('');
    const [rawTranscription, setRawTranscription] = useState('');
    const [hasAudio, setHasAudio] = useState(false);
    const [audioLength, setAudioLength] = useState(0);
    const [isRecommended, setIsRecommended] = useState(false);
    const [isFavorite, setIsFavorite] = useState(false);

    // Edit State
    const [editingVideoIdx, setEditingVideoIdx] = useState(-1);
    const [selectedTopic, setSelectedTopic] = useState('');
    const [selectedLevel, setSelectedLevel] = useState('Iniciación');
    const [isVisible, setIsVisible] = useState(true);
    const [isPublishing, setIsPublishing] = useState(false);

    // Persistent State (Now using local as fallback, but targeting Firestore)
    const [acceptedVideos, setAcceptedVideos] = useState([]);
    const [archivedVideos, setArchivedVideos] = useState([]);
    const [topics, setTopics] = useState([]);

    // 1. CLOUD SYNC LOGIC (Firestore)
    useEffect(() => {
        if (!db) {
            console.error("❌ Firebase Database not initialized correctly.");
            return;
        }

        console.log("📥 Iniciando sincronización en tiempo real con Firestore...");

        // Listen to Books
        let unsubscribeBooks = () => { };
        try {
            const qBooks = query(collection(db, "books"), orderBy("acceptedDate", "desc"));
            unsubscribeBooks = onSnapshot(qBooks,
                (snapshot) => {
                    const books = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                    setAcceptedVideos(books);
                },
                (err) => console.error("Firestore Books Error:", err)
            );
        } catch (err) {
            console.error("Error setting up books listener:", err);
        }

        // Listen to Topics
        let unsubscribeTopics = () => { };
        try {
            unsubscribeTopics = onSnapshot(collection(db, "topics"),
                (snapshot) => {
                    if (snapshot.empty) {
                        const defaultTopics = [
                            { name: 'Energía Solar', subthemes: ['Instalación', 'Mantenimiento', 'Normativa'] },
                            { name: 'Electricidad Industrial', subthemes: ['Circuitos', 'Protecciones', 'Motores'] },
                            { name: 'Seguridad', subthemes: ['EPIs', 'Trabajos en Altura', 'Riesgo Eléctrico'] }
                        ];
                        defaultTopics.forEach(t => addDoc(collection(db, "topics"), t));
                    } else {
                        const fetchedTopics = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                        setTopics(fetchedTopics);
                    }
                },
                (err) => console.error("Firestore Topics Error:", err)
            );
        } catch (err) {
            console.error("Error setting up topics listener:", err);
        }

        return () => {
            unsubscribeBooks();
            unsubscribeTopics();
        };
    }, []);

    const saveToCloud = async (video) => {
        setIsPublishing(true);
        try {
            console.log("☁️ Intentando guardar en Firebase:", video);
            const videoId = String(video.id);
            if (!videoId || videoId === 'undefined') {
                throw new Error("ID de video no válido");
            }

            // Clean object for Firestore (remove undefined and ensure serializable)
            const cleanVideo = JSON.parse(JSON.stringify(video));

            await setDoc(doc(db, "books", videoId), cleanVideo);
            console.log("✅ Guardado correctamente en Firestore");
            return true;
        } catch (err) {
            console.error("❌ Error al guardar en Firestore:", err);
            alert("⚠️ Error al publicar: " + err.message);
            return false;
        } finally {
            setIsPublishing(false);
        }
    };

    // Auto-select first topic IF none selected and topics exist
    useEffect(() => {
        if (topics.length > 0 && (!selectedTopic || selectedTopic === '')) {
            console.log("🎯 Auto-seleccionando primera categoría:", topics[0].name);
            setSelectedTopic(topics[0].id);
        }
    }, [topics, selectedTopic]);

    const handleSearch = async () => {
        if (!searchQuery) return;
        setSearchResults([]);
        const results = await searchYouTube(searchQuery, searchFilters);
        setSearchResults(results);
        setSelectedVideo(null);
    };

    const handleAccept = async (video, topicId, subtheme, levelOverride, summary, transcription, audioLen, recommended, favorite, visible) => {
        console.log("🚀 Iniciando proceso de Publicación...");

        if (!topicId) {
            alert("⚠️ Por favor, selecciona una Categoría antes de publicar.");
            return;
        }

        if (!summary || summary.length < 10) {
            alert("⚠️ El libro necesita un Resumen. Pulsa 'Extraer Contenido' antes de publicar.");
            return;
        }

        const newVideo = {
            ...video,
            topicId,
            subtheme,
            level: levelOverride,
            summary,
            transcription,
            audioLength: audioLen,
            recommended,
            isFavorite: favorite,
            isVisible: visible,
            hasAudio: true,
            acceptedDate: video.acceptedDate || new Date().toISOString(),
            validatedBy: 'Experto FORESVI'
        };

        const success = await saveToCloud(newVideo);
        if (success) {
            alert("🎉 ¡Libro publicado con éxito!");
            setSelectedVideo(null);
            setEditingVideoIdx(-1);
            resetProcessing();
            setActiveTab('database');
        }
    };

    const handleEdit = (video, index) => {
        setEditingVideoIdx(index);
        setSelectedVideo(video);
        setAiSummary(video.summary || '');
        setRawTranscription(video.transcription || '');
        setAudioLength(video.audioLength || 0);
        setIsRecommended(video.recommended || false);
        setIsFavorite(video.isFavorite || false);
        setSelectedTopic(video.topicId || (topics[0]?.id || ''));
        setSelectedLevel(video.level || 'Iniciación');
        setIsVisible(video.isVisible !== undefined ? video.isVisible : true);
    };

    const resetProcessing = () => {
        setIsProcessing(false);
        setAiSummary('');
        setRawTranscription('');
        setHasAudio(false);
        setAudioLength(0);
        setIsRecommended(false);
        setIsFavorite(false);
        setIsVisible(true);
        setEditingVideoIdx(-1);
        setSelectedTopic(topics[0]?.id || '');
        setSelectedLevel('Iniciación');
    };

    const handleReject = async (video) => {
        try {
            await setDoc(doc(db, "archived", String(video.id)), { ...video, rejectedDate: new Date().toISOString() });
            setSearchResults(searchResults.filter(v => v.id !== video.id));
            setSelectedVideo(null);
        } catch (err) {
            console.error("Error archiving video:", err);
        }
    };

    const addTopic = async (name) => {
        try {
            await addDoc(collection(db, "topics"), { name, subthemes: [] });
        } catch (err) {
            console.error("Error adding topic:", err);
        }
    };
    const deleteTopic = async (topicId) => {
        try {
            await deleteDoc(doc(db, "topics", topicId));
        } catch (err) {
            console.error("Error deleting topic:", err);
        }
    };

    // AI Processing Functions (Real OpenAI Integration)
    const generateTranscription = async () => {
        setIsProcessing(true);
        const prompt = `Actúa como un instructor técnico experto de FORESVI. Basándote en el contenido del video "${selectedVideo.title}" y su descripción técnica (${selectedVideo.description}), reconstruye una LECCIÓN MAESTRA COMPLETA y EXHAUSTIVA.
        
        OBJETIVO: El lector debe poder aprender todo el procedimiento técnico sin necesidad de ver el video original.
        REGLAS:
        - No menciones que eres una IA.
        - No digas que no puedes proporcionar el contenido. Redacta la lección técnica paso a paso.
        - Usa un lenguaje profesional y directo.
        - El texto debe ser largo y detallado.`;

        const result = await callOpenAI(prompt);
        if (result) setRawTranscription(result);
        setIsProcessing(false);
    };

    const generateSummary = async () => {
        setIsProcessing(true);
        const prompt = `Crea un resumen corporativo de alto impacto para el video "${selectedVideo.title}". 
        Usa exactamente este formato de secciones: 
        📌 **RESUMEN ESTRATÉGICO**
        🎯 **OBJETIVO PRINCIPAL**
        💡 **IDEAS CLAVE** (lista detallada de puntos técnicos con negritas)
        ✅ **CONCLUSIÓN PARA EL PROFESIONAL**
        Básate en esta descripción: ${selectedVideo.description}. 
        IMPORTANTE: Usa negritas con el formato **texto** para resaltar conceptos críticos.`;

        const result = await callOpenAI(prompt);
        if (result) setAiSummary(result);
        setIsProcessing(false);
    };

    const runFullAnalysis = async () => {
        setIsProcessing(true);
        await generateTranscription();
        await generateSummary();
        setHasAudio(true);
        setAudioLength(selectedVideo.durationSec || 600);
        setIsProcessing(false);
    };

    const calculateStars = (views) => {
        const v = parseInt(views) || 0;
        if (v > 100000) return 5;
        if (v > 50000) return 4;
        if (v > 10000) return 3;
        if (v > 1000) return 2;
        return 1;
    };

    if (!db) return <div style={{ padding: '100px', textAlign: 'center' }}>⚠️ Error: Firebase no se pudo inicializar. Revisa tus variables de entorno y reinicia el servidor.</div>;

    return (
        <div style={{ paddingTop: '60px', minHeight: '100vh', background: 'var(--bg-secondary)' }}>
            <div className="container" style={{ maxWidth: '1400px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', padding: '1rem 0' }}>
                    <h2 style={{ margin: 0, fontSize: '1.8rem' }}>Panel de Expertos 🛡️</h2>
                    <div style={{ display: 'flex', gap: '0.5rem', background: 'white', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                        <button onClick={() => setActiveTab('search')} className={`btn ${activeTab === 'search' ? 'btn-primary' : ''}`} style={{ border: 'none', background: activeTab === 'search' ? 'var(--accent-primary)' : 'transparent', color: activeTab === 'search' ? 'white' : 'var(--text-secondary)', padding: '0.5rem 1rem', borderRadius: '8px' }}>🔍 Buscar</button>
                        <button onClick={() => setActiveTab('database')} className={`btn ${activeTab === 'database' ? 'btn-primary' : ''}`} style={{ border: 'none', background: activeTab === 'database' ? 'var(--accent-primary)' : 'transparent', color: activeTab === 'database' ? 'white' : 'var(--text-secondary)', padding: '0.5rem 1rem', borderRadius: '8px' }}>📚 Biblioteca</button>
                        <button onClick={() => setActiveTab('config')} className={`btn ${activeTab === 'config' ? 'btn-primary' : ''}`} style={{ border: 'none', background: activeTab === 'config' ? 'var(--accent-primary)' : 'transparent', color: activeTab === 'config' ? 'white' : 'var(--text-secondary)', padding: '0.5rem 1rem', borderRadius: '8px' }}>⚙️ Ajustes</button>
                    </div>
                </div>

                {/* SEARCH TAB */}
                {activeTab === 'search' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '1rem' }}>
                        <div className="card" style={{ padding: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                <input
                                    type="text"
                                    placeholder="Pega un enlace de YouTube o busca temas técnicos..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                                    style={{ flex: 1, padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', outline: 'none' }}
                                />
                                <button onClick={handleSearch} className="btn btn-primary" style={{ padding: '0.6rem 1.5rem' }}>Buscar</button>
                            </div>

                            {/* NEW FILTERS */}
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Año:</label>
                                    <select value={searchFilters.year} onChange={e => setSearchFilters({ ...searchFilters, year: e.target.value })} style={{ padding: '4px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '0.75rem' }}>
                                        <option value="">Cualquiera</option>
                                        <option value="2025">2025</option>
                                        <option value="2024">2024</option>
                                        <option value="2023">2023</option>
                                        <option value="2022">2022</option>
                                    </select>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Duración:</label>
                                    <select value={searchFilters.duration} onChange={e => setSearchFilters({ ...searchFilters, duration: e.target.value })} style={{ padding: '4px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '0.75rem' }}>
                                        <option value="any">Cualquiera</option>
                                        <option value="short">Corto (&lt; 4m)</option>
                                        <option value="medium">Medio (4-20m)</option>
                                        <option value="long">Largo (&gt; 20m)</option>
                                    </select>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Idioma:</label>
                                    <select value={searchFilters.lang} onChange={e => setSearchFilters({ ...searchFilters, lang: e.target.value })} style={{ padding: '4px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '0.75rem' }}>
                                        <option value="any">Cualquiera</option>
                                        <option value="es">Español</option>
                                        <option value="en">Inglés</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                            {searchResults.map((video) => {
                                const stars = calculateStars(video.views);
                                return (
                                    <div key={video.id} className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid var(--border-subtle)' }}>
                                        <div style={{ position: 'relative', height: '160px', background: 'black' }}>
                                            <img src={video.thumbnail} alt={video.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(0,0,0,0.8)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>
                                                👁️ {video.views > 1000 ? (video.views / 1000).toFixed(1) + 'k' : video.views} | 🎙️ {Math.floor(video.durationSec / 60)}m
                                            </div>
                                            <div style={{ position: 'absolute', top: '8px', right: '8px', background: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', color: '#fbbf24', fontWeight: 'bold' }}>
                                                {"⭐".repeat(Math.min(5, Math.max(1, stars)))}
                                            </div>
                                            <button onClick={() => { setSelectedVideo(video); setSelectedTopic(topics[0]?.id || ''); }} style={{ position: 'absolute', bottom: '8px', right: '8px', width: '30px', height: '30px', borderRadius: '50%', background: 'var(--accent-primary)', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                                        </div>
                                        <div style={{ padding: '0.75rem', flex: 1 }}>
                                            <h4 style={{ fontSize: '0.9rem', marginBottom: '0.4rem', lineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{video.title}</h4>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{video.channelTitle}</div>
                                            <div style={{ marginTop: '0.8rem', display: 'flex', gap: '0.4rem' }}>
                                                <button onClick={() => handleReject(video)} className="btn btn-outline" style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', color: '#ef4444', borderColor: '#fee2e2' }}>Descartar</button>
                                                <button onClick={() => { setSelectedVideo(video); setSelectedTopic(topics[0]?.id || ''); }} className="btn btn-primary" style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem' }}>Crear</button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* DATABASE TAB */}
                {activeTab === 'database' && (
                    <div className="card" style={{ padding: '1rem' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border-subtle)' }}>
                                        <th style={{ padding: '0.75rem' }}>Libro / Audiolibro</th>
                                        <th style={{ padding: '0.75rem' }}>Categoría</th>
                                        <th style={{ padding: '0.75rem' }}>Visibilidad</th>
                                        <th style={{ padding: '0.75rem' }}>Estatus</th>
                                        <th style={{ padding: '0.75rem' }}>Gestión</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {acceptedVideos.map((video, idx) => (
                                        <tr key={video.id} style={{ borderBottom: '1px solid var(--border-subtle)', background: !video.isVisible ? '#f8fafc' : 'white', opacity: !video.isVisible ? 0.7 : 1 }}>
                                            <td style={{ padding: '0.75rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                                <img src={video.thumbnail} style={{ width: '60px', borderRadius: '4px', filter: !video.isVisible ? 'grayscale(100%)' : 'none' }} alt="" />
                                                <div>
                                                    <div style={{ fontWeight: '600' }}>{video.title} {!video.isVisible && '(Oculto)'}</div>
                                                    <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.7rem' }}>
                                                        {video.recommended && <span style={{ color: 'var(--accent-gold)' }}>🌟 Recomendado</span>}
                                                        {video.isFavorite && <span style={{ color: '#ef4444' }}>❤️ Favorito</span>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.75rem' }}>{topics.find(t => t.id == video.topicId)?.name || 'General'}</td>
                                            <td style={{ padding: '0.75rem' }}>
                                                <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '10px', background: video.isVisible ? '#dcfce7' : '#f1f5f9', color: video.isVisible ? '#166534' : '#64748b', fontWeight: 'bold' }}>
                                                    {video.isVisible ? 'Público' : 'Borrador'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.75rem' }}>🎙️ {Math.floor(video.audioLength / 60)}m | 📝 {video.summary?.length} ch</td>
                                            <td style={{ padding: '0.75rem' }}>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button onClick={() => handleEdit(video, idx)} style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer' }}>✏️</button>
                                                    <button onClick={async () => {
                                                        if (window.confirm('¿Estás seguro de que quieres eliminar este audiolibro?')) {
                                                            try {
                                                                await deleteDoc(doc(db, "books", video.id));
                                                                alert("Libro eliminado.");
                                                            } catch (err) {
                                                                alert("Error al eliminar: " + err.message);
                                                            }
                                                        }
                                                    }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>🗑️</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'config' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        <div className="card">
                            <h3 style={{ marginBottom: '1.5rem' }}>Gestión de Categorías ⚙️</h3>
                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                                <input type="text" id="newTopic" placeholder="Nombre de categoría..." style={{ flex: 1, padding: '0.6rem', border: '1px solid var(--border-subtle)', borderRadius: '8px' }} />
                                <button className="btn btn-primary" onClick={() => {
                                    const i = document.getElementById('newTopic');
                                    if (i.value) { addTopic(i.value); i.value = ''; }
                                }}>Añadir</button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                                {topics.map(t => (
                                    <div key={t.id} style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                        <span>{t.name}</span>
                                        <button onClick={() => deleteTopic(t.id)} style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="card">
                            <h3 style={{ marginBottom: '1rem' }}>Libros Recomendados (Destacados en Home) 🌟</h3>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Gestiona qué libros aparecen en la sección principal de Recomendados.</p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                                {acceptedVideos.map((video, idx) => (
                                    <div key={video.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', background: video.recommended ? '#fffbeb' : 'white', borderRadius: '10px', border: video.recommended ? '1px solid #fde68a' : '1px solid var(--border-subtle)' }}>
                                        <img src={video.thumbnail} style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '6px' }} alt="" />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', lineClamp: 1, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{video.title}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{topics.find(t => t.id == video.topicId)?.name}</div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const updated = [...acceptedVideos];
                                                updated[idx].recommended = !updated[idx].recommended;
                                                setAcceptedVideos(updated);
                                            }}
                                            className={`btn ${video.recommended ? 'btn-primary' : 'btn-outline'}`}
                                            style={{ padding: '0.4rem 0.6rem', fontSize: '0.7rem', whiteSpace: 'nowrap' }}
                                        >
                                            {video.recommended ? '🌟 Quitar' : '⭐ Destacar'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* MODAL COMPACTO */}
            {selectedVideo && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ background: 'white', width: '100%', maxWidth: '1100px', maxHeight: '90vh', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ background: 'black', height: '240px', flexShrink: 0, position: 'relative' }}>
                            <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${selectedVideo.id}?rel=0&modestbranding=1`} frameBorder="0" allowFullScreen></iframe>
                            <button onClick={() => { setSelectedVideo(null); resetProcessing(); }} style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer' }}>×</button>
                        </div>

                        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem' }}>
                                <div>
                                    <h3 style={{ marginBottom: '1rem', fontSize: '1.2rem' }}>{editingVideoIdx >= 0 ? 'Editar Libro' : 'Sincronización Inteligente'} 🧠</h3>
                                    {!aiSummary && editingVideoIdx < 0 ? (
                                        <div style={{ textAlign: 'center', padding: '2rem', background: '#f8fafc', borderRadius: '12px' }}>
                                            <p style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>Pulsa para extraer transcripción, audio y generar resumen.</p>
                                            <button onClick={runFullAnalysis} className="btn btn-primary" disabled={isProcessing}>
                                                {isProcessing ? '⚡ Analizando...' : 'Extraer Contenido'}
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                                                    <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Transcripción Técnica Limpia (Editable)</label>
                                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                                        <button onClick={generateTranscription} style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '0.7rem', cursor: 'pointer' }}>🔄 Regenerar</button>
                                                        <button onClick={() => setRawTranscription('')} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.7rem', cursor: 'pointer' }}>Limpiar</button>
                                                    </div>
                                                </div>
                                                <textarea
                                                    value={rawTranscription}
                                                    onChange={e => setRawTranscription(e.target.value)}
                                                    placeholder="Edita la transcripción aquí..."
                                                    style={{ width: '100%', height: '120px', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontSize: '0.85rem', fontFamily: 'monospace', lineHeight: '1.5' }}
                                                />
                                            </div>
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                                                    <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Resumen Validado (Editable)</label>
                                                    <button onClick={generateSummary} style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '0.7rem', cursor: 'pointer' }}>🔄 Regenerar</button>
                                                </div>
                                                <textarea
                                                    value={aiSummary}
                                                    onChange={e => setAiSummary(e.target.value)}
                                                    placeholder="Edita el resumen ejecutivo aquí..."
                                                    style={{ width: '100%', height: '140px', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontSize: '0.9rem', lineHeight: '1.5' }}
                                                />
                                            </div>
                                            <div style={{ background: '#f0fdf4', padding: '0.5rem', borderRadius: '6px', fontSize: '0.75rem', color: '#166534', fontWeight: '600' }}>
                                                ✅ Audio Extraído: {Math.floor(audioLength / 60)}m {audioLength % 60}s
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '12px', height: 'fit-content' }}>
                                    <h4 style={{ marginBottom: '1rem' }}>Configuración de Publicación</h4>

                                    <div style={{ marginBottom: '0.75rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Categoría</label>
                                        <select
                                            value={selectedTopic}
                                            onChange={e => setSelectedTopic(e.target.value)}
                                            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd' }}
                                        >
                                            {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                        </select>
                                    </div>

                                    <div style={{ marginBottom: '1rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Nivel</label>
                                        <select
                                            value={selectedLevel}
                                            onChange={e => setSelectedLevel(e.target.value)}
                                            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd' }}
                                        >
                                            <option value="Iniciación">Iniciación</option>
                                            <option value="Intermedio">Intermedio</option>
                                            <option value="Avanzado">Avanzado</option>
                                        </select>
                                    </div>

                                    <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '1rem 0' }} />

                                    <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0' }}>
                                        <input type="checkbox" id="visCheck" checked={isVisible} onChange={e => setIsVisible(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: '#16a34a' }} />
                                        <div>
                                            <label htmlFor="visCheck" style={{ fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', display: 'block' }}>👁️ Libro Visible (Público)</label>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Si lo desmarcas, solo tú podrás verlo en este panel.</div>
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0' }}>
                                        <input type="checkbox" id="recCheck" checked={isRecommended} onChange={e => setIsRecommended(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: '#fbbf24' }} />
                                        <label htmlFor="recCheck" style={{ fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' }}>🌟 Recomendado</label>
                                    </div>

                                    <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0' }}>
                                        <input type="checkbox" id="favCheck" checked={isFavorite} onChange={e => setIsFavorite(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: '#ef4444' }} />
                                        <label htmlFor="favCheck" style={{ fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' }}>❤️ Favorito</label>
                                    </div>

                                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                                        <button onClick={() => { setSelectedVideo(null); resetProcessing(); }} className="btn btn-outline" style={{ flex: 1 }}>Cerrar</button>
                                        <button
                                            onClick={() => {
                                                if (isPublishing) return;
                                                console.log("Click en Publicar. TopicID:", selectedTopic);
                                                handleAccept(selectedVideo, selectedTopic, 'General', selectedLevel, aiSummary, rawTranscription, audioLength, isRecommended, isFavorite, isVisible);
                                            }}
                                            className="btn btn-primary"
                                            style={{
                                                flex: 2,
                                                background: isPublishing ? '#64748b' : (!aiSummary ? '#94a3b8' : 'var(--accent-primary)'),
                                                cursor: isPublishing ? 'not-allowed' : 'pointer'
                                            }}
                                        >
                                            {isPublishing ? '⚡ Publicando...' : (editingVideoIdx >= 0 ? 'Guardar Cambios' : 'Publicar')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;
