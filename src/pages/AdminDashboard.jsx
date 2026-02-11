import React, { useState, useEffect, useRef } from 'react';
import ReactPlayer from 'react-player';
// Version: 1.1.0 - Build: 2026-02-10 20:45 - Implemented: Vercel Deploy Ready (Relative API)
import GenerationConfigPanel from '../components/GenerationConfigPanel';
import { db } from '../firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, setDoc, query, where, orderBy, limit, deleteField, onSnapshot } from "firebase/firestore";

const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

// OpenAI Service
const callOpenAI = async (prompt) => {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY} `
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

const extractVideoId = (query) => {
    if (!query) return null;
    query = query.trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(query)) return query;
    // Robust regex for all YT formats
    const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = query.match(regExp);
    return (match && match[1].length === 11) ? match[1] : null;
};

// Real YouTube Search Service
const searchYouTube = async (query, filters = {}, pageToken = '') => {
    if (YOUTUBE_API_KEY === 'TU_CLAVE_API_AQUI') {
        alert("⚠️ Falta la API Key de YouTube.");
        return { items: [], nextPageToken: null };
    }

    try {
        const videoId = extractVideoId(query);
        console.log("📺 YouTube ID detectado:", videoId);

        let url;
        if (videoId) {
            console.log("🎯 Buscando video directo id:", videoId);
            url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`;
        } else {
            // General Search with filters
            let filterParams = '';
            if (filters.year) {
                filterParams += `&publishedAfter=${filters.year}-01-01T00:00:00Z`;
            }
            if (filters.duration && filters.duration !== 'any') {
                filterParams += `&videoDuration=${filters.duration}`;
            }
            if (filters.lang && filters.lang !== 'any') {
                filterParams += `&relevanceLanguage=${filters.lang}`;
            }
            if (pageToken) {
                filterParams += `&pageToken=${pageToken}`;
            }

            url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=12&q=${query}&type=video&order=viewCount${filterParams}&key=${YOUTUBE_API_KEY}`;
        }

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) throw new Error(data.error.message);
        if (videoId && (!data.items || data.items.length === 0)) {
            alert("⚠️ No se pudo encontrar el video directo. Puede ser un enlace incorrecto o video privado.");
            return { items: [], nextPageToken: null };
        }

        let items = data.items || [];
        if (!videoId) {
            if (items.length === 0) return { items: [], nextPageToken: null };
            // For search, we need to fetch stats separately
            const ids = items.map(item => item.id.videoId).join(',');
            const statsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${ids}&key=${YOUTUBE_API_KEY}`);
            const statsData = await statsRes.json();
            items = items.map(item => {
                const stats = statsData.items?.find(s => s.id === item.id.videoId);
                return {
                    ...item,
                    id: item.id.videoId,
                    contentDetails: stats?.contentDetails,
                    statistics: stats?.statistics
                };
            });
        }

        const mappedItems = items.map(item => {
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

        return { items: mappedItems, nextPageToken: data.nextPageToken };

    } catch (error) {
        console.error("Error searchYouTube:", error);
        alert("Error de YouTube: " + error.message);
        return { items: [], nextPageToken: null };
    }
};

const AdminDashboard = () => {
    // State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [searchMode, setSearchMode] = useState('youtube'); // 'youtube' | 'notebooklm'
    const [searchFilters, setSearchFilters] = useState({ year: '', duration: 'any', lang: 'es' });
    const [selectedSources, setSelectedSources] = useState([]); // For NotebookLM Multi-select
    const [nextPageToken, setNextPageToken] = useState(null);
    const [previewVideo, setPreviewVideo] = useState(null);

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

    // Generation Configuration (Spec 3.0)
    const [generationConfig, setGenerationConfig] = useState({
        audio: {
            formato: 'Información detallada',
            idioma: 'Español',
            duracion: 'Predeterminada',
            foco: `Crear un resumen enfocado en un dueño de negocio o gerente que quiere aplicar estos conocimientos en su negocio, equipo y empresa.\nUtiliza ejemplos prácticos y situaciones reales para facilitar la comprensión y ayudar a recordar las enseñanzas.`
        },
        video: {
            formato: 'Vídeo explicativo',
            idioma: 'Español',
            foco: `Crear un resumen enfocado en un dueño de negocio o gerente que quiere aplicar estos conocimientos en su negocio, equipo y empresa.\nUtiliza ejemplos prácticos y situaciones reales para facilitar la comprensión y ayudar a recordar las enseñanzas.`
        },
        infografia: {
            idioma: 'Español',
            orientacion: 'Cuadrado',
            nivel_detalle: 'Conciso',
            descripcion: `Crear una portada que aglutine el NOMBRE del texto resumido, alguna imagen representativa del contenido y usar los colores:\nAzul Foresvi #003349, Rojo Foresvi #E25454, Blanco #FFFFFF y Gris Medio #717B8D.\nUsa la tipografía Glancyr para titulares y destacados y la tipografía Inter para textos generales.\nEl estilo debe ser profesional, claro y alineado con los contenidos empresariales.`
        },
        informe: {
            idioma: 'Español',
            tipo: 'Ejecutivo',
            extension: 'Medio',
            foco: 'Resumen ejecutivo enfocado en aplicación práctica para gerentes.'
        }
    });

    // Orchestration Status
    // valid values: 'idle', 'generating_audio', 'generating_infographic', 'generating_video', 'merging', 'uploading', 'completed', 'error'
    const [orchestrationStatus, setOrchestrationStatus] = useState('idle');

    // Edit State
    const [editingVideoIdx, setEditingVideoIdx] = useState(-1);
    const [selectedTopic, setSelectedTopic] = useState('');
    const [selectedLevel, setSelectedLevel] = useState('Iniciación');
    const [isVisible, setIsVisible] = useState(true);
    const [isPublishing, setIsPublishing] = useState(false);

    // Persistent State (Now using local as fallback, but targeting Firestore)
    const [acceptedVideos, setAcceptedVideos] = useState([]);
    const [topics, setTopics] = useState([]);

    // Debug / Logs State
    const [viewingLogsFor, setViewingLogsFor] = useState(null); // video object
    const [liveLogs, setLiveLogs] = useState([]);

    // Orchestrated Generation Launch
    const handleLaunchGeneration = async () => {
        if (!selectedVideo && !searchQuery) {
            alert('Por favor selecciona un vídeo o escribe una búsqueda primero.');
            return;
        }

        setOrchestrationStatus('initializing');

        const title = selectedVideo?.title || searchQuery;
        const sources = selectedSources.length > 0
            ? selectedSources
            : (selectedVideo?.url ? [selectedVideo.url] : []);

        // Automatic search fallback if no sources
        let finalSources = sources;
        if (sources.length === 0 && searchQuery) {
            try {
                const ytResults = await searchYouTube(searchQuery);
                if (ytResults && ytResults.length > 0) {
                    finalSources = ytResults.slice(0, 5).map(v => `https://www.youtube.com/watch?v=${v.id}`);
                }
            } catch (e) {
                console.warn('Auto-search failed');
            }
        }

        const customId = selectedVideo?.id || `notebook-${Date.now()}`;

        try {
            // Create/Update Book entry
            const newBook = {
                title: title,
                generationConfig: generationConfig,
                orchestrationStatus: 'initializing',
                createdAt: new Date(),
                acceptedDate: new Date().toISOString(),
                // Retain existing fields if updating
                ...selectedVideo
            };

            await setDoc(doc(db, "books", customId), newBook, { merge: true });

            // Call Backend Orchestrator
            const response = await fetch('/api/generate-orchestrated', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bookId: customId,
                    title: title,
                    sources: finalSources,
                    config: generationConfig,
                    searchQuery: searchQuery
                })
            });

            if (response.ok) {
                const data = await response.json();
                setOrchestrationStatus('generating_audio');
                console.log('✅ Orchestration launched:', data);
            } else {
                console.error('❌ Failed to launch');
                setOrchestrationStatus('error');
            }

        } catch (e) {
            console.error(e);
            setOrchestrationStatus('error');
        }
    };

    const handleYouTubeUpload = async () => {
        if (!selectedVideo || !selectedVideo.youtubeAvailable) return;
        if (!confirm(`¿Subir "${selectedVideo.title}" a YouTube (No listado)?`)) return;

        try {
            alert('Funcionalidad de subida pendiente de completar (Backend Ready).');
            // await fetch('/api/youtube/upload', { ... });
        } catch (e) {
            alert('Error en subida: ' + e.message);
        }
    };

    // Sync selectedVideo with live data
    useEffect(() => {
        if (selectedVideo && acceptedVideos.length > 0) {
            const updated = acceptedVideos.find(v => v.id === selectedVideo.id);
            if (updated && updated.orchestrationStatus !== selectedVideo.orchestrationStatus) {
                console.log(`🔄 Syncing selected status to: ${updated.orchestrationStatus}`);
                setSelectedVideo(prev => ({ ...prev, ...updated }));
                setOrchestrationStatus(updated.orchestrationStatus);
            }
        }
    }, [acceptedVideos, selectedVideo]);

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

    // 2. Poll for Progress (General Status) - Optimized with 404 handling
    useEffect(() => {
        const interval = setInterval(async () => {
            // Only poll processing items that have a job ID
            const videosProcessing = acceptedVideos.filter(v => (v.generationStatus === 'processing' || v.generationStatus === 'pending') && v.generationJobId);

            if (videosProcessing.length === 0) return;

            for (const vid of videosProcessing) {
                try {
                    const res = await fetch(`/api/jobs/${vid.generationJobId}`);

                    if (res.status === 404) {
                        console.warn(`⚠️ Job ${vid.generationJobId} not found server-side (likely restart). Marking as failed.`);
                        await updateDoc(doc(db, "books", vid.id), {
                            generationStatus: 'error',
                            summary: `[Error del Sistema] El trabajo se perdió por un reinicio del servidor. Por favor, reintenta la generación.`,
                            generationProgress: 0
                        });
                        continue;
                    }

                    if (res.ok) {
                        const job = await res.json();
                        // Only update Firestore if significantly changed to avoid loops
                        if (job.progress !== vid.generationProgress || job.status !== vid.generationStatus) {
                            await updateDoc(doc(db, "books", vid.id), {
                                generationProgress: job.progress,
                                generationStatus: job.status === 'completed' ? 'done' :
                                    job.status === 'failed' ? 'error' : 'processing',
                                summary: job.notebookId ? `Notebook Created. ID: ${job.notebookId}` : vid.summary,
                                notebookId: job.notebookId || null
                            });
                        }
                    }
                } catch (e) {
                    console.error("Polling error (network?):", e);
                    // Silent fail on main poller to avoid spam, won't stop polling unless it's a permanent network error
                }
            }
        }, 5000); // Increased to 5s to reduce load
        return () => clearInterval(interval);
    }, [acceptedVideos]);

    // 3. Dedicated Log Poller (High Frequency - 1s)
    useEffect(() => {
        if (!viewingLogsFor || !viewingLogsFor.generationJobId) return;

        const fetchLogs = async () => {
            try {
                const res = await fetch(`/api/jobs/${viewingLogsFor.generationJobId}`);
                if (res.status === 404) {
                    setLiveLogs(prev => [...prev, { time: new Date(), msg: `❌ El trabajo ya no existe en el servidor.` }]);
                    return;
                }
                if (res.ok) {
                    const job = await res.json();
                    setLiveLogs(job.logs || []);
                }
            } catch (e) {
                // setLiveLogs(prev => [...prev, { time: new Date(), msg: `Error fetching logs: ${e.message}` }]);
                // Don't spam UI with connection errors on logs
            }
        };

        fetchLogs(); // Initial
        const interval = setInterval(fetchLogs, 1000);
        return () => clearInterval(interval);
    }, [viewingLogsFor]);

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

    // ============================================================================
    // Polling para verificar artefactos de NotebookLM (V2: Drive + Roadmap)
    // ============================================================================
    const pollingIntervalRef = useRef(null);
    const lastCheckRef = useRef({});

    useEffect(() => {
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }

        // Estados activos
        const ACTIVE_ORCHESTRATION_STATES = [
            'initializing', 'generating_audio', 'generating_video',
            'waiting_artifacts', 'processing_drive'
        ];

        const booksInProgress = acceptedVideos.filter(v => {
            const hasActiveStatus = ACTIVE_ORCHESTRATION_STATES.includes(v.orchestrationStatus);
            const hasNotebook = !!v.notebookId;
            // Also check if roadmap is missing but artifacts are done (for reprocessing)
            // or if artifacts are stuck
            return (hasActiveStatus && hasNotebook);
        });

        if (booksInProgress.length === 0) return;

        const checkArtifacts = async () => {
            for (const book of booksInProgress) {
                try {
                    if (!book.notebookId) continue;

                    // 1. Check NotebookLM Status
                    const res = await fetch(`/api/check-artifacts/${book.notebookId}`);
                    if (!res.ok) continue;

                    const data = await res.json();
                    const audioStatus = data.audio?.status?.toLowerCase() || 'pending';
                    const videoStatus = data.video?.status?.toLowerCase() || 'pending';

                    // Update Progress in Firestore
                    await updateDoc(doc(db, "books", book.id), {
                        artifactsStatus: {
                            audio: audioStatus,
                            video: videoStatus,
                            lastChecked: new Date()
                        }
                    });

                    // 2. Trigger Sync if Ready & Not yet syncing
                    const isReadyForSync = (audioStatus === 'completed' || audioStatus === 'unknown') &&
                        book.orchestrationStatus !== 'processing_drive' &&
                        book.orchestrationStatus !== 'drive_synced';

                    if (isReadyForSync) {
                        console.log(`🚀 Artifacts Ready for "${book.title}". Triggering Drive Sync...`);

                        await updateDoc(doc(db, "books", book.id), {
                            orchestrationStatus: 'processing_drive',
                            message: '📂 Sincronizando con Google Drive...'
                        });

                        // Call Backend V4
                        fetch(`/api/process-artifacts/${book.id}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                notebookId: book.notebookId,
                                title: book.title,
                                description: book.summary
                            })
                        }).then(r => r.json()).then(d => {
                            console.log("Sync Result:", d);
                        }).catch(err => console.error("Sync Error:", err));
                    }

                } catch (e) {
                    console.error(`Error checking ${book.id}:`, e);
                }
            }
        };

        checkArtifacts();
        pollingIntervalRef.current = setInterval(checkArtifacts, 15000);

        return () => {
            if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        };
    }, [acceptedVideos]);


    const handleSearch = async () => {
        if (!searchQuery) return;
        setSearchResults([]);

        if (searchMode === 'youtube' || searchMode === 'notebooklm') {
            const { items, nextPageToken: nextToken } = await searchYouTube(searchQuery, searchFilters);
            setSearchResults(items);
            setNextPageToken(nextToken);
            if (searchMode === 'notebooklm') {
                setSelectedSources([]); // Reset selection on new search
            }
        }

        setSelectedVideo(null);
    };


    const handleAccept = async (video, topicId, subtheme, levelOverride, summary, transcription, audioLen, recommended, favorite, visible) => {
        console.log("🚀 Iniciando proceso de Publicación...");

        if (!topicId) {
            alert("⚠️ Por favor, selecciona una Categoría antes de publicar.");
            return;
        }

        if ((!summary || summary.length < 10) && searchMode !== 'notebooklm') {
            alert("⚠️ El libro necesita un Resumen. Pulsa 'Extraer Contenido' antes de publicar.");
            return;
        }

        // TRIGGER NOTEBOOKLM GENERATION (BRIDGE)
        let generationStatus = 'pending';
        let bridgeJobId = null;

        if (video.isNotebook && searchMode === 'notebooklm') {
            try {
                // 1. SMART SEARCH: Use Selected Sources OR Fallback to Search
                let sources = [];

                if (video.sources && video.sources.length > 0) {
                    // Sources passed directly from Floating Bar
                    sources = video.sources;
                    console.log(`✅ Usando ${sources.length} fuentes seleccionadas manualmente.`);
                } else {
                    // Fallback: Automatic Search
                    try {
                        console.log(`🔍 Deep Search Auto: Buscando fuentes para "${searchQuery || video.title}"...`);
                        const ytResults = await searchYouTube(searchQuery || video.title);
                        if (ytResults && ytResults.length > 0) {
                            sources = ytResults.slice(0, 5).map(v => `https://www.youtube.com/watch?v=${v.id}`);
                        }
                    } catch (e) {
                        console.warn("⚠️ Fallo en búsqueda automática:", e);
                    }
                }

                if (sources.length === 0) {
                    alert("⚠️ Advertencia: No hay fuentes seleccionadas ni encontradas. El cuaderno estará vacío.");
                }

                console.log("📤 Enviando petición a Bridge...", { title: video.title, sources });

                const response = await fetch('/api/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: video.title || searchQuery,
                        description: video.description || `Investigación sobre ${searchQuery}`,
                        options: generationOptions,
                        sources: sources,
                        apiKey: import.meta.env.VITE_OPENAI_API_KEY // Pass API Key for Image Gen
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    bridgeJobId = data.jobId;
                    generationStatus = 'processing';
                    console.log("✅ Trabajo NotebookLM iniciado:", bridgeJobId);
                } else {
                    console.error("❌ Error iniciando trabajo en Bridge");
                }
            } catch (err) {
                console.error("❌ Error de conexión con Bridge Server:", err);
                alert("⚠️ No se pudo conectar con el servidor de IA (Bridge 3001). Asegúrate de que esté corriendo.");
            }
        }

        const newVideo = {
            ...video,
            topicId,
            subtheme,
            level: levelOverride,
            summary: summary || 'Generando contenido IA... (0%)',
            transcription,
            audioLength: audioLen || 0,
            recommended,
            isFavorite: favorite,
            isVisible: visible,
            hasAudio: true,
            sourceType: video.isNotebook ? 'notebooklm' : 'youtube',
            generationFlags: video.isNotebook ? generationOptions : null,
            generationJobId: bridgeJobId,
            generationStatus: generationStatus,
            generationProgress: 0,
            acceptedDate: video.acceptedDate || new Date().toISOString(),
            validatedBy: 'Experto FORESVI'
        };

        const success = await saveToCloud(newVideo);
        if (success) {
            alert("🎉 ¡Libro publicado con éxito! Procesando generación en segundo plano...");
            setSelectedVideo(null);
            setEditingVideoIdx(-1);
            resetProcessing();
            setActiveTab('database');
        }
    };

    const handleEdit = (video, index) => {
        setEditingVideoIdx(index);

        // Try to recover Notebook ID if missing but present in summary
        let recoveredNotebookId = video.notebookId;
        if (!recoveredNotebookId && video.summary && video.summary.includes('Notebook Created. ID: ')) {
            const match = video.summary.match(/ID:\s*([a-zA-Z0-9-_]+)/);
            if (match) {
                recoveredNotebookId = match[1];
                console.log("recovered notebook id:", recoveredNotebookId);
            }
        }

        setSelectedVideo({ ...video, notebookId: recoveredNotebookId || video.notebookId });
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
        if (!confirm("¿Estás seguro de eliminar este libro?")) return;
        try {
            await deleteDoc(doc(db, "books", video.id));
        } catch (e) {
            console.error("Error deleting:", e);
        }
    };

    const handleRetry = async (video) => {
        if (!confirm("¿Reintentar la generación? Esto creará un nuevo trabajo.")) return;

        // Reset status to pending
        await updateDoc(doc(db, "books", video.id), {
            generationStatus: 'pending',
            generationProgress: 0,
            summary: 'Reiniciando...'
        });

        // Trigger generation again
        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: video.title,
                    description: video.description,
                    options: video.generationFlags || generationOptions,
                    sources: video.sources || [],
                    apiKey: import.meta.env.VITE_OPENAI_API_KEY
                })
            });

            if (response.ok) {
                const data = await response.json();
                await updateDoc(doc(db, "books", video.id), {
                    generationJobId: data.jobId,
                    generationStatus: 'processing',
                    generationProgress: 1
                });
                alert("✅ Reintento iniciado.");
            } else {
                alert("❌ Error al contactar servidor.");
            }
        } catch (e) {
            console.error("Retry Error:", e);
            alert("Error: " + e.message);
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
                    <h2 style={{ margin: 0, fontSize: '1.8rem' }}>Panel de Expertos <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>v1.1.0 ONLINE</span> 🛡️</h2>
                    <div style={{ display: 'flex', gap: '0.5rem', background: 'white', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                        <button onClick={() => setActiveTab('search')} className={`btn ${activeTab === 'search' ? 'btn-primary' : ''}`} style={{ border: 'none', background: activeTab === 'search' ? 'var(--accent-primary)' : 'transparent', color: activeTab === 'search' ? 'white' : 'var(--text-secondary)', padding: '0.5rem 1rem', borderRadius: '8px' }}>🔍 Buscar</button>
                        <button onClick={() => setActiveTab('database')} className={`btn ${activeTab === 'database' ? 'btn-primary' : ''}`} style={{ border: 'none', background: activeTab === 'database' ? 'var(--accent-primary)' : 'transparent', color: activeTab === 'database' ? 'white' : 'var(--text-secondary)', padding: '0.5rem 1rem', borderRadius: '8px' }}>📚 Biblioteca</button>
                        <button onClick={() => setActiveTab('playlist')} className={`btn ${activeTab === 'playlist' ? 'btn-primary' : ''}`} style={{ border: 'none', background: activeTab === 'playlist' ? 'var(--accent-primary)' : 'transparent', color: activeTab === 'playlist' ? 'white' : 'var(--text-secondary)', padding: '0.5rem 1rem', borderRadius: '8px' }}>📺 Playlist Sync</button>
                        <button onClick={() => setActiveTab('playlist')} className={`btn ${activeTab === 'playlist' ? 'btn-primary' : ''}`} style={{ border: 'none', background: activeTab === 'playlist' ? 'var(--accent-primary)' : 'transparent', color: activeTab === 'playlist' ? 'white' : 'var(--text-secondary)', padding: '0.5rem 1rem', borderRadius: '8px' }}>📺 Playlist Sync</button>
                        <button onClick={() => setActiveTab('config')} className={`btn ${activeTab === 'config' ? 'btn-primary' : ''}`} style={{ border: 'none', background: activeTab === 'config' ? 'var(--accent-primary)' : 'transparent', color: activeTab === 'config' ? 'white' : 'var(--text-secondary)', padding: '0.5rem 1rem', borderRadius: '8px' }}>⚙️ Ajustes</button>
                        <button onClick={() => setActiveTab('help')} className={`btn ${activeTab === 'help' ? 'btn-primary' : ''}`} style={{ border: 'none', background: activeTab === 'help' ? 'var(--accent-primary)' : 'transparent', color: activeTab === 'help' ? 'white' : 'var(--text-secondary)', padding: '0.5rem 1rem', borderRadius: '8px' }}>❓ Ayuda</button>
                    </div>
                </div>

                {/* HELP TAB */}
                {activeTab === 'help' && (
                    <div className="card" style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
                        <h2 style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '2rem' }}>📖 Guía de Uso del Panel de Expertos v4</h2>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>

                            {/* SECTION 1: WORKFLOW */}
                            <div>
                                <h3 style={{ color: '#2563eb', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ background: '#eff6ff', padding: '0.5rem', borderRadius: '8px' }}>🔄</span>
                                    Flujo de Trabajo
                                </h3>
                                <div style={{ borderLeft: '3px solid #e2e8f0', paddingLeft: '1.5rem', marginTop: '1rem' }}>
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <h4 style={{ margin: '0 0 0.5rem 0' }}>1. Búsqueda y Selección</h4>
                                        <p style={{ fontSize: '0.9rem', color: '#64748b' }}>Usa la pestaña <strong>"Buscar"</strong> para encontrar contenido en YouTube o investigar temas complejos con NotebookLM. Selecciona un video o fuentes para iniciar.</p>
                                    </div>
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <h4 style={{ margin: '0 0 0.5rem 0' }}>2. Generación con IA</h4>
                                        <p style={{ fontSize: '0.9rem', color: '#64748b' }}>Configura los parámetros (idioma, nivel) y lanza la generación. El sistema creará un Notebook, Audio, Video e Infografía.</p>
                                    </div>
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <h4 style={{ margin: '0 0 0.5rem 0' }}>3. Sincronización Drive (¡NUEVO!)</h4>
                                        <p style={{ fontSize: '0.9rem', color: '#64748b' }}>Ya no se sube automáticamente a YouTube. Ahora, al finalizar, los archivos se envían a una carpeta organizada en <strong>Google Drive</strong>.</p>
                                    </div>
                                    <div>
                                        <h4 style={{ margin: '0 0 0.5rem 0' }}>4. Roadmap y Publicación</h4>
                                        <p style={{ fontSize: '0.9rem', color: '#64748b' }}>Genera el <strong>"Roadmap de Acción"</strong> para crear una guía interactiva. Finalmente, haz visible el libro para los usuarios.</p>
                                    </div>
                                </div>
                            </div>

                            {/* SECTION 2: STATUS & ICONS */}
                            <div>
                                <h3 style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ background: '#f0fdf4', padding: '0.5rem', borderRadius: '8px' }}>🏷️</span>
                                    Estados e Iconos
                                </h3>
                                <ul style={{ listStyle: 'none', padding: 0, marginTop: '1rem', fontSize: '0.9rem' }}>
                                    <li style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', padding: '0.5rem', background: '#f8fafc', borderRadius: '8px' }}>
                                        <span style={{ fontSize: '1.5rem' }}>🟢</span>
                                        <div><strong>Listo / Completado</strong><br /><span style={{ color: '#64748b', fontSize: '0.8rem' }}>El recurso está disponible y verificado.</span></div>
                                    </li>
                                    <li style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', padding: '0.5rem', background: '#f8fafc', borderRadius: '8px' }}>
                                        <span style={{ fontSize: '1.5rem' }}>🟡</span>
                                        <div><strong>En Progreso / Pendiente</strong><br /><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Se está generando o esperando acción.</span></div>
                                    </li>
                                    <li style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', padding: '0.5rem', background: '#f8fafc', borderRadius: '8px' }}>
                                        <span style={{ fontSize: '1.5rem' }}>✅</span>
                                        <div><strong>Drive OK</strong><br /><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Los archivos están seguros en Google Drive.</span></div>
                                    </li>
                                    <li style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0', padding: '0.5rem', background: '#f8fafc', borderRadius: '8px' }}>
                                        <span style={{ fontSize: '1.5rem' }}>🗺️</span>
                                        <div><strong>Roadmap OK</strong><br /><span style={{ color: '#64748b', fontSize: '0.8rem' }}>El plan de acción JSON se ha generado correctamente.</span></div>
                                    </li>
                                </ul>
                            </div>

                            {/* SECTION 3: YOUTUBE & DRIVE */}
                            <div style={{ gridColumn: '1 / -1', background: '#eef2ff', padding: '1.5rem', borderRadius: '12px', marginTop: '1rem' }}>
                                <h3 style={{ color: '#4f46e5', margin: '0 0 1rem 0' }}>📺 Gestión de YouTube vs Drive</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                    <div>
                                        <strong>📂 Google Drive (Almacenamiento)</strong>
                                        <p style={{ fontSize: '0.9rem', color: '#4338ca', marginTop: '0.5rem' }}>
                                            Es el lugar donde se guardan <strong>automáticamente</strong> todos los archivos originales (MP4, MP3, PNG).<br />
                                            Usa el enlace "📂 Abrir Carpeta" en la biblioteca para acceder a ellos.
                                        </p>
                                    </div>
                                    <div>
                                        <strong>YouTube (Visualización)</strong>
                                        <p style={{ fontSize: '0.9rem', color: '#4338ca', marginTop: '0.5rem' }}>
                                            La subida es <strong>MANUAL</strong> o mediante <strong>Playlist Sync</strong>.<br />
                                            1. Descarga el video de Drive.<br />
                                            2. Súbelo a tu canal de YouTube.<br />
                                            3. Pega el enlace en la app o usa "Playlist Sync" para vincularlo automáticamente.
                                        </p>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                )}

                {/* SEARCH TAB */}
                {activeTab === 'search' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '1rem' }}>

                        {/* SEARCH MODE TOGGLE */}
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                            <div style={{ background: 'white', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-subtle)', display: 'flex' }}>
                                <button
                                    onClick={() => setSearchMode('youtube')}
                                    style={{
                                        padding: '0.5rem 1.5rem',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: searchMode === 'youtube' ? '#ef4444' : 'transparent',
                                        color: searchMode === 'youtube' ? 'white' : 'var(--text-secondary)',
                                        fontWeight: '600',
                                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    📺 YouTube Search
                                </button>
                                <button
                                    onClick={() => setSearchMode('notebooklm')}
                                    style={{
                                        padding: '0.5rem 1.5rem',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: searchMode === 'notebooklm' ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'transparent',
                                        color: searchMode === 'notebooklm' ? 'white' : 'var(--text-secondary)',
                                        fontWeight: '600',
                                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    🧠 NotebookLM Deep Search
                                </button>
                            </div>
                        </div>

                        <div className="card" style={{ padding: '0.75rem', marginBottom: '1rem', border: searchMode === 'notebooklm' ? '2px solid #3b82f6' : '1px solid var(--border-subtle)' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                <input
                                    type="text"
                                    placeholder={searchMode === 'youtube' ? "Pega un enlace de YouTube o busca temas técnicos..." : "Introduce un tema complejo para investigación profunda..."}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                                    style={{ flex: 1, padding: '0.8rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', outline: 'none', fontSize: '1rem' }}
                                />
                                <button onClick={() => setSearchQuery('')} className="btn btn-outline" style={{ padding: '0.6rem 1rem' }}>Limpiar</button>
                                <button onClick={handleSearch} className="btn btn-primary" style={{ padding: '0.6rem 1.5rem', background: searchMode === 'notebooklm' ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : undefined }}>
                                    {searchMode === 'notebooklm' ? '🔬 Investigar' : 'Buscar'}
                                </button>
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
                                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Idioma:</label>
                                    <select value={searchFilters.lang} onChange={e => setSearchFilters({ ...searchFilters, lang: e.target.value })} style={{ padding: '4px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '0.75rem' }}>
                                        <option value="any">Cualquiera</option>
                                        <option value="es">Español</option>
                                        <option value="en">Inglés</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* RESULTADOS */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                            {searchResults.map((video) => {
                                const stars = searchMode === 'youtube' ? calculateStars(video.views) : 5;
                                return (
                                    <div key={video.id} className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid var(--border-subtle)' }}>
                                        <div
                                            style={{
                                                position: 'relative', height: '160px', background: 'black',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: searchMode === 'notebooklm' ? 'pointer' : 'default',
                                                borderBottom: searchMode === 'notebooklm' && selectedSources.find(s => s.id === video.id) ? '4px solid #3b82f6' : 'none'
                                            }}
                                            onClick={() => {
                                                if (searchMode === 'notebooklm') {
                                                    const exists = selectedSources.find(s => s.id === video.id);
                                                    if (exists) {
                                                        setSelectedSources(selectedSources.filter(s => s.id !== video.id));
                                                    } else {
                                                        setSelectedSources([...selectedSources, video]);
                                                    }
                                                }
                                            }}
                                        >
                                            <img src={video.thumbnail} alt={video.title} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: searchMode === 'notebooklm' && selectedSources.find(s => s.id === video.id) ? 0.7 : 1 }} />

                                            {searchMode === 'notebooklm' && (
                                                <div style={{
                                                    position: 'absolute', top: 10, left: 10,
                                                    width: '24px', height: '24px', borderRadius: '50%',
                                                    background: selectedSources.find(s => s.id === video.id) ? '#3b82f6' : 'rgba(0,0,0,0.4)',
                                                    border: '2px solid white',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: 'white', fontWeight: 'bold'
                                                }}>
                                                    {selectedSources.find(s => s.id === video.id) && '✓'}
                                                </div>
                                            )}

                                            {searchMode === 'youtube' && (
                                                <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(0,0,0,0.8)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>
                                                    👁️ {video.views > 1000 ? (video.views / 1000).toFixed(1) + 'k' : video.views} | 🎙️ {Math.floor(video.durationSec / 60)}m
                                                </div>
                                            )}

                                            <div style={{ position: 'absolute', top: '8px', right: '8px', background: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', color: '#fbbf24', fontWeight: 'bold' }}>
                                                {"⭐".repeat(Math.min(5, Math.max(1, stars)))}
                                            </div>
                                            <button onClick={() => { setSelectedVideo(video); setSelectedTopic(topics[0]?.id || ''); }} style={{ position: 'absolute', bottom: '8px', right: '8px', width: '30px', height: '30px', borderRadius: '50%', background: 'var(--accent-primary)', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>

                                            {/* PLAY BUTTON OVERLAY */}
                                            <div
                                                style={{
                                                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                                    width: '50px', height: '50px', background: 'rgba(0,0,0,0.6)', borderRadius: '50%',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                                    border: '2px solid white', zIndex: 5
                                                }}
                                                onClick={(e) => { e.stopPropagation(); setPreviewVideo(video); }}
                                            >
                                                <span style={{ color: 'white', fontSize: '1.5rem', marginLeft: '4px' }}>▶</span>
                                            </div>

                                        </div>
                                        <div style={{ padding: '0.75rem', flex: 1 }}>
                                            <h4 style={{ fontSize: '0.9rem', marginBottom: '0.4rem', lineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{video.title}</h4>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{video.channelTitle || 'NotebookLM AI'}</div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem', height: '40px', overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', lineClamp: 2 }}>
                                                {video.description}
                                            </div>
                                            <div style={{ marginTop: '0.8rem', display: 'flex', gap: '0.4rem' }}>
                                                <button onClick={() => handleReject(video)} className="btn btn-outline" style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', color: '#ef4444', borderColor: '#fee2e2' }}>Descartar</button>
                                                <button onClick={() => { setSelectedVideo(video); setSelectedTopic(topics[0]?.id || ''); }} className="btn btn-primary" style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem' }}>
                                                    {searchMode === 'notebooklm' ? 'Configurar' : 'Crear'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* LOAD MORE BUTTON */}
                        {nextPageToken && (
                            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
                                <button
                                    onClick={async () => {
                                        const { items, nextPageToken: newOne } = await searchYouTube(searchQuery, searchFilters, nextPageToken);
                                        setSearchResults([...searchResults, ...items]);
                                        setNextPageToken(newOne);
                                    }}
                                    className="btn btn-outline"
                                    style={{ padding: '0.8rem 2rem', background: 'white' }}
                                >
                                    ⬇️ Cargar Más Videos
                                </button>
                            </div>
                        )}

                        {/* FLOATING ACTION BAR FOR NOTEBOOKLM */}
                        {searchMode === 'notebooklm' && selectedSources.length > 0 && (
                            <div style={{
                                position: 'fixed', bottom: '40px', left: '50%', transform: 'translateX(-50%)',
                                background: 'white', padding: '1rem 2rem', borderRadius: '50px',
                                boxShadow: '0 10px 30px rgba(0,0,0,0.2)', border: '1px solid var(--border-subtle)',
                                display: 'flex', alignItems: 'center', gap: '1.5rem', zIndex: 9999,
                                animation: 'slideUp 0.3s ease-out'
                            }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontWeight: '800', color: 'var(--text-primary)' }}>{selectedSources.length} Fuentes seleccionadas</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Listas para tu cuaderno</span>
                                </div>
                                <button
                                    onClick={() => {
                                        const mockVideo = {
                                            id: 'notebook-' + Date.now(),
                                            title: searchQuery ? `Investigación: ${searchQuery}` : "Nueva Investigación",
                                            description: `Cuaderno generado a partir de ${selectedSources.length} fuentes seleccionadas.`,
                                            sources: selectedSources.map(s => `https://www.youtube.com/watch?v=${s.id}`),
                                            isNotebook: true,
                                            thumbnail: '/notebook_lm_product_icon.svg'
                                        };
                                        setSelectedVideo(mockVideo);
                                        // Need to ensure topic selected usually, handleAccept will check
                                    }}
                                    className="btn"
                                    style={{
                                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                        color: 'white', padding: '0.8rem 1.5rem', borderRadius: '30px',
                                        fontWeight: 'bold', border: 'none', cursor: 'pointer',
                                        boxShadow: '0 4px 15px rgba(37, 99, 235, 0.4)'
                                    }}
                                >
                                    🚀 GENERAR CUADERNO
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* PLAYLIST SYNC TAB */}
                {activeTab === 'playlist' && (
                    <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
                        <h3 style={{ marginBottom: '1rem' }}>Sincronización de YouTube Playlist</h3>
                        <p style={{ color: '#64748b', marginBottom: '2rem' }}>
                            Escanea la lista de reproducción configurada en el servidor para vincular automáticamente videos de YouTube a los libros existentes por coincidencia de título.
                        </p>

                        <div style={{ maxWidth: '600px', margin: '0 auto', background: '#f8fafc', padding: '2rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📺 ➡️ 📚</div>
                            <button
                                onClick={async () => {
                                    if (isProcessing) return;
                                    setIsProcessing(true);
                                    try {
                                        const res = await fetch('/api/youtube/sync-playlist', { method: 'POST' });
                                        const data = await res.json();
                                        if (data.success) {
                                            alert(`Sincronización completada.\n\nLibros actualizados: ${data.updatedCount}\nErrores: ${data.errors.length}`);
                                        } else {
                                            alert('Error: ' + data.error);
                                        }
                                    } catch (e) {
                                        alert('Error de red: ' + e.message);
                                    } finally {
                                        setIsProcessing(false);
                                    }
                                }}
                                disabled={isProcessing}
                                className="btn btn-primary"
                                style={{ fontSize: '1.2rem', padding: '1rem 2rem', width: '100%' }}
                            >
                                {isProcessing ? 'Sincronizando...' : 'Iniciar Sincronización Masiva'}
                            </button>
                            <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                                * Esto buscará videos en la playlist "FORESVI - Audiolibros" y actualizará los registros en Firestore si encuentra coincidencias de título exactas.
                            </p>
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
                                        <th style={{ padding: '0.75rem' }}>Drive & Roadmap</th>
                                        <th style={{ padding: '0.75rem' }}>Estatus</th>
                                        <th style={{ padding: '0.75rem' }}>Gestión</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {acceptedVideos.map((video, idx) => (
                                        <tr key={video.id} style={{ borderBottom: '1px solid var(--border-subtle)', background: !video.isVisible ? '#f8fafc' : 'white', opacity: !video.isVisible ? 0.7 : 1 }}>
                                            <td style={{ padding: '0.75rem', display: 'flex', gap: '0.75rem', alignItems: 'center', maxWidth: '300px' }}>
                                                <img src={video.thumbnail} style={{ width: '60px', borderRadius: '4px', filter: !video.isVisible ? 'grayscale(100%)' : 'none' }} alt="" />
                                                <div>
                                                    <div style={{ fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>{video.title} {!video.isVisible && '(Oculto)'}</div>
                                                    <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.7rem' }}>
                                                        {video.recommended && <span style={{ color: 'var(--accent-gold)' }}>🌟 Rec</span>}
                                                        {video.notebookId && <span style={{ color: '#2563eb' }}>🧠 NB</span>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.75rem' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    {video.driveSync ? (
                                                        <a href={video.driveFolderUrl} target="_blank" style={{ fontSize: '0.75rem', color: '#166534', textDecoration: 'none', fontWeight: 'bold' }}>✅ Drive OK</a>
                                                    ) : (
                                                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>🚫 Sin Drive</span>
                                                    )}

                                                    {video.roadmap ? (
                                                        <span style={{ fontSize: '0.75rem', color: '#8b5cf6', fontWeight: 'bold' }}>🗺️ Roadmap OK</span>
                                                    ) : (
                                                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>🚫 Sin Mapa</span>
                                                    )}

                                                    {video.youtubeId ? (
                                                        <a href={`https://youtu.be/${video.youtubeId}`} target="_blank" style={{ fontSize: '0.75rem', color: '#ef4444', textDecoration: 'none', fontWeight: 'bold' }}>📺 YouTube OK</a>
                                                    ) : (
                                                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>🚫 Sin Video</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.75rem' }}>
                                                {video.generationStatus === 'processing' ? (
                                                    <div style={{ width: '120px' }}>
                                                        <div style={{ fontSize: '0.7rem', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', color: '#3b82f6', fontWeight: 'bold' }}>
                                                            <span style={{ fontSize: '0.65rem' }}>
                                                                {video.generationStatus === 'creating_notebook' ? 'Creando Cuaderno...' :
                                                                    video.generationStatus === 'generating_image' ? 'Generando Portada...' :
                                                                        video.generationStatus === 'adding_sources' ? 'Añadiendo Fuentes...' :
                                                                            video.generationStatus === 'generating_audio' ? 'Creando Audio...' :
                                                                                'Procesando...'}
                                                            </span>
                                                            <span>{video.generationProgress || 0}%</span>
                                                        </div>
                                                        <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                                                            <div style={{ width: `${video.generationProgress || 0}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6, #2563eb)', transition: 'width 0.5s ease' }}></div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: '#64748b' }}>
                                                        <span style={{ fontSize: '0.8rem' }}>
                                                            {video.generationStatus === 'error' ? '❌ Error' :
                                                                video.generationStatus === 'done' ? '✅ Listo' :
                                                                    '⏳ Pendiente'}
                                                        </span>
                                                        <span style={{ fontSize: '0.7rem' }}>
                                                            🎙️ {Math.floor(video.audioLength / 60)}m | 📝 {video.summary?.length > 20 ? 'OK' : 'Pend'}
                                                        </span>
                                                        {video.sourceType === 'notebooklm' && <span style={{ display: 'block', fontSize: '0.7rem', color: '#2563eb', fontWeight: 'bold' }}>🧠 NotebookLM</span>}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.75rem' }}>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    {(video.generationStatus === 'error' || video.generationStatus === 'processing' || video.generationStatus === 'pending') && (
                                                        <button onClick={() => handleRetry(video)} style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '1.1rem' }} title="Forzar Reintento / Reiniciar">
                                                            🔄
                                                        </button>
                                                    )}
                                                    <button onClick={() => { setViewingLogsFor(video); setLiveLogs([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }} title="Ver Logs del Servidor">
                                                        📜
                                                    </button>
                                                    <button onClick={() => handleEdit(video, idx)} className="btn btn-outline" style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        ✏️ Editar
                                                    </button>
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
                {/* MODAL COMPACTO */}
                {selectedVideo && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                        <div className="bg-white w-full max-w-6xl max-h-[90vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl">
                            <div className={`h-60 shrink-0 relative flex items-center justify-center ${searchMode === 'notebooklm' || selectedVideo.isNotebook ? 'bg-gradient-to-br from-blue-900 to-blue-800' : 'bg-black'
                                }`}>
                                {searchMode === 'notebooklm' || selectedVideo.isNotebook ? (
                                    <div className="text-white text-center">
                                        <div className="text-5xl opacity-80 mb-2">🧠</div>
                                        <h2 className="text-3xl font-bold m-0">NotebookLM Generator</h2>
                                        <p className="opacity-80">Configura la generación de contenido IA</p>
                                    </div>
                                ) : (
                                    <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${selectedVideo.id}?rel=0&modestbranding=1`} frameBorder="0" allowFullScreen></iframe>
                                )}
                                <button onClick={() => { setSelectedVideo(null); resetProcessing(); }} style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer' }}>×</button>
                            </div>

                            <div className="p-6 overflow-y-auto flex-1">
                                <h3 className="text-xl font-semibold text-gray-800 mb-6">{editingVideoIdx >= 0 ? 'Editar Libro' : 'Sincronización Inteligente'}</h3>
                                {
                                    searchMode === 'notebooklm' || selectedVideo.isNotebook ? (
                                        <><GenerationConfigPanel
                                            config={generationConfig}
                                            setConfig={setGenerationConfig}
                                            onLaunch={handleLaunchGeneration}
                                            status={orchestrationStatus}
                                            notebookId={selectedVideo.notebookId}
                                            message={selectedVideo.message}
                                            artifactsStatus={selectedVideo.artifactsStatus}
                                        />

                                            {/* RESULTADO ORQUESTACIÓN */}
                                            {orchestrationStatus === 'completed' && selectedVideo.localVideoUrl && (
                                                <div style={{ marginTop: '1.5rem', background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #bbf7d0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#166534', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        ✅ Generación Completada
                                                    </h3>

                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                                                        <div>
                                                            <h4 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Previsualización MP4</h4>
                                                            <video
                                                                key={selectedVideo.localVideoUrl}
                                                                controls
                                                                src={`http://localhost:3001${selectedVideo.localVideoUrl}`}
                                                                style={{ width: '100%', borderRadius: '0.5rem', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                                                            />
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                            <a href={`http://localhost:3001${selectedVideo.localVideoUrl}`} target="_blank" download style={{ background: '#f3f4f6', padding: '0.75rem', borderRadius: '0.25rem', textAlign: 'center', textDecoration: 'none', color: '#374151', fontWeight: '500' }}>
                                                                ⬇️ Descargar Vídeo (MP4)
                                                            </a>
                                                            <a href={`http://localhost:3001${selectedVideo.localAudioUrl}`} target="_blank" download style={{ background: '#f3f4f6', padding: '0.75rem', borderRadius: '0.25rem', textAlign: 'center', textDecoration: 'none', color: '#374151', fontWeight: '500' }}>
                                                                ⬇️ Descargar Audio (M4A)
                                                            </a>

                                                            <hr style={{ margin: '0.5rem 0', borderColor: '#e5e7eb' }} />

                                                            <hr style={{ margin: '0.5rem 0', borderColor: '#e5e7eb' }} />

                                                            {/* DRIVE SYNC STATUS */}
                                                            {selectedVideo.driveSync ? (
                                                                <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: '#15803d', fontWeight: 'bold' }}>
                                                                        <span>✅ Sincronizado con Drive</span>
                                                                    </div>
                                                                    {selectedVideo.driveFolderUrl && (
                                                                        <a href={selectedVideo.driveFolderUrl} target="_blank" rel="noopener noreferrer"
                                                                            style={{ display: 'block', textDecoration: 'none', color: '#2563eb', fontSize: '0.85rem' }}>
                                                                            📂 Abrir Carpeta
                                                                        </a>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    onClick={async () => {
                                                                        if (!confirm(`¿Sincronizar "${selectedVideo.title}" con Google Drive?`)) return;
                                                                        try {
                                                                            alert('Iniciando sincronización...');
                                                                            await fetch(`/api/process-artifacts/${selectedVideo.id}`, {
                                                                                method: 'POST',
                                                                                headers: { 'Content-Type': 'application/json' },
                                                                                body: JSON.stringify({
                                                                                    notebookId: selectedVideo.notebookId,
                                                                                    title: selectedVideo.title,
                                                                                    description: selectedVideo.summary
                                                                                })
                                                                            });
                                                                        } catch (e) { alert('Error: ' + e.message); }
                                                                    }}
                                                                    style={{
                                                                        width: '100%',
                                                                        padding: '0.75rem',
                                                                        borderRadius: '0.5rem',
                                                                        fontWeight: 'bold',
                                                                        color: 'white',
                                                                        background: '#0ea5e9',
                                                                        cursor: 'pointer',
                                                                        border: 'none',
                                                                        marginBottom: '1rem'
                                                                    }}
                                                                >
                                                                    📂 Sincronizar con Drive
                                                                </button>
                                                            )}

                                                            {/* ROADMAP GENERATION */}
                                                            {selectedVideo.driveSync && !selectedVideo.roadmap && (
                                                                <button
                                                                    onClick={async () => {
                                                                        if (!confirm(`¿Generar Roadmap para "${selectedVideo.title}"?`)) return;
                                                                        try {
                                                                            const res = await fetch(`/api/books/${selectedVideo.id}/generate-roadmap`, { method: 'POST' });
                                                                            const d = await res.json();
                                                                            if (d.success) alert('Roadmap generado correctamente.');
                                                                            else alert('Error: ' + d.error);
                                                                        } catch (e) { alert('Error: ' + e.message); }
                                                                    }}
                                                                    style={{
                                                                        width: '100%',
                                                                        padding: '0.75rem',
                                                                        borderRadius: '0.5rem',
                                                                        fontWeight: 'bold',
                                                                        color: 'white',
                                                                        background: '#8b5cf6',
                                                                        cursor: 'pointer',
                                                                        border: 'none'
                                                                    }}
                                                                >
                                                                    🗺️ Generar Roadmap
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}</>
                                    ) : (
                                        <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #e2e8f0' }}>
                                            <p style={{ margin: 0, fontSize: '0.9rem', color: '#334155' }}>Analizando video de YouTube...</p>
                                        </div>
                                    )
                                }

                                {/* COMMON FORM FIELDS */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '0.3rem', color: '#475569' }}>Categoría</label>
                                        <select
                                            value={selectedTopic}
                                            onChange={(e) => setSelectedTopic(e.target.value)}
                                            style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                        >
                                            <option value="">Seleccionar Categoría...</option>
                                            {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '0.3rem', color: '#475569' }}>Nivel</label>
                                        <select
                                            value={selectedLevel}
                                            onChange={(e) => setSelectedLevel(e.target.value)}
                                            style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                                        >
                                            <option>Iniciación</option>
                                            <option>Intermedio</option>
                                            <option>Avanzado</option>
                                            <option>Experto</option>
                                        </select>
                                    </div>
                                </div>

                                {/* NOTEBOOK CONNECTION SECTION */}
                                <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#475569' }}>Conexión NotebookLM 🔗</h4>
                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                        <input
                                            type="text"
                                            placeholder="Pegar Notebook ID aquí..."
                                            value={selectedVideo.notebookId || ''}
                                            onChange={(e) => setSelectedVideo({ ...selectedVideo, notebookId: e.target.value })}
                                            style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                        />
                                        <button
                                            className="btn btn-outline"
                                            onClick={async () => {
                                                let idToSave = selectedVideo.notebookId;
                                                if (!idToSave) return alert("Ingresa un ID");

                                                // Auto-clean URL if pasted
                                                if (idToSave.includes('/notebook/')) {
                                                    const match = idToSave.match(/\/notebook\/([a-zA-Z0-9-_]+)/);
                                                    if (match) idToSave = match[1];
                                                }

                                                // Update State & DB
                                                setSelectedVideo({ ...selectedVideo, notebookId: idToSave });
                                                await updateDoc(doc(db, "books", selectedVideo.id), { notebookId: idToSave });
                                                alert("ID Guardado Correctamente: " + idToSave);
                                            }}
                                            style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                                        >
                                            Guardar ID
                                        </button>
                                    </div>
                                    <p style={{ fontSize: '0.7rem', color: '#94a3b8', margin: 0 }}>
                                        * Si el botón de sincronizar audio no aparece, pega aquí el ID de la URL de NotebookLM (la parte después de /notebook/).
                                    </p>
                                </div>

                                {selectedVideo && selectedVideo.notebookId && (
                                    <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                        <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            Estado de Recursos 📦
                                        </h4>
                                        {selectedVideo.audioUrl ? (
                                            /* VIEW 1: Audio is Hosted locally in Firebase */
                                            <div style={{ marginTop: '1rem' }}>
                                                <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#166534', fontWeight: 'bold' }}>
                                                            <span style={{ fontSize: '1.2rem' }}>🔊</span>
                                                            <span>AUDIO FORESVI</span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>Alojado en Cloud ☁️</span>
                                                            <button
                                                                className="btn btn-outline-danger"
                                                                style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', border: 'none', background: 'transparent' }}
                                                                title="Eliminar Audio y Reintentar"
                                                                onClick={async () => {
                                                                    if (!confirm("¿Estás seguro de eliminar este audio y su transcripción? Tendrás que volver a descargarlo.")) return;

                                                                    // Update Firestore to remove audioUrl
                                                                    try {
                                                                        await updateDoc(doc(db, "books", selectedVideo.id), {
                                                                            audioUrl: deleteField(),
                                                                            transcription: deleteField()
                                                                        });
                                                                        // Update local state
                                                                        setSelectedVideo({
                                                                            ...selectedVideo,
                                                                            audioUrl: null,
                                                                            transcription: null
                                                                        });
                                                                    } catch (e) {
                                                                        alert("Error al eliminar: " + e.message);
                                                                    }
                                                                }}
                                                            >
                                                                🗑️
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <audio
                                                        controls
                                                        key={selectedVideo.audioUrl}
                                                        preload="metadata"
                                                        src={selectedVideo.audioUrl}
                                                        onError={(e) => console.error("Audio Player Error:", e.target.error, selectedVideo.audioUrl)}
                                                        style={{ width: '100%', height: '40px', borderRadius: '20px', marginBottom: '1rem' }}
                                                    >
                                                        Tu navegador no soporta audio.
                                                    </audio>

                                                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>
                                                        <a href={selectedVideo.audioUrl} download target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', textDecoration: 'none', color: '#3b82f6' }}>
                                                            ⬇️ Descargar MP3
                                                        </a>
                                                        {selectedVideo.notebookId && (
                                                            <a
                                                                href={`https://notebooklm.google.com/notebook/${selectedVideo.notebookId}${selectedVideo.artifactId ? `?audioArtifactId=${selectedVideo.artifactId}` : ''}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', textDecoration: 'none', color: '#64748b' }}
                                                            >
                                                                🧠 Fuente NotebookLM
                                                            </a>
                                                        )}
                                                    </div>

                                                    {/* TRANSCRIPTION SECTION */}
                                                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>
                                                        <details>
                                                            <summary style={{ cursor: 'pointer', fontWeight: '600', color: '#475569', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                📝 Ver Transcripción
                                                            </summary>
                                                            <div style={{
                                                                marginTop: '0.75rem',
                                                                maxHeight: '300px',
                                                                overflowY: 'auto',
                                                                padding: '1rem',
                                                                background: '#f8fafc',
                                                                borderRadius: '8px',
                                                                border: '1px solid #e2e8f0',
                                                                whiteSpace: 'pre-wrap',
                                                                fontSize: '0.9rem',
                                                                lineHeight: '1.6',
                                                                color: '#334155'
                                                            }}>
                                                                {selectedVideo.transcription ? selectedVideo.transcription : (
                                                                    <em style={{ color: '#94a3b8' }}>No hay transcripción disponible para este audio.</em>
                                                                )}
                                                            </div>
                                                        </details>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            /* VIEW 2: Audio is NOT hosted yet (show status + download actions) */
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                                                {/* Status Indicator */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    {selectedVideo.generationStatus === 'done' ? (
                                                        <div style={{ color: '#166534', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
                                                            <input type="checkbox" checked readOnly style={{ accentColor: '#166534' }} />
                                                            <span>Audio Listo en NotebookLM</span>
                                                        </div>
                                                    ) : (
                                                        <span style={{ color: '#64748b', fontStyle: 'italic', fontSize: '0.9rem' }}>
                                                            {selectedVideo.generationStatus === 'processing' ? '⏳ Generando audio...' : '⚠️ Audio no generado aún'}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Action Buttons Row */}
                                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    {/* Link to NotebookLM */}
                                                    <a
                                                        href={`https://notebooklm.google.com/notebook/${selectedVideo.notebookId}${selectedVideo.artifactId ? `?audioArtifactId=${selectedVideo.artifactId}` : ''}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="btn btn-outline"
                                                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', textDecoration: 'none' }}
                                                    >
                                                        🧠 Abrir en NotebookLM
                                                    </a>

                                                    {/* DOWNLOAD BUTTON */}
                                                    <button
                                                        className="btn btn-primary"
                                                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                                                        onClick={async (e) => {
                                                            const btn = e.currentTarget;
                                                            const originalText = btn.innerHTML; // Save icon too

                                                            // Prevention double click
                                                            if (btn.disabled) return;
                                                            btn.disabled = true;
                                                            btn.textContent = '⏳ Descargando...';

                                                            try {
                                                                const bookId = selectedVideo.id ? String(selectedVideo.id).trim() : '';
                                                                const notebookId = selectedVideo.notebookId ? String(selectedVideo.notebookId).trim() : '';

                                                                // 1. Ping Check
                                                                try {
                                                                    const ping = await fetch('/api/ping');
                                                                    if (!ping.ok) throw new Error(`Ping failed: ${ping.status}`);
                                                                    await ping.json();
                                                                } catch (e) {
                                                                    throw new Error("El servidor backend no responde (/api/ping). Asegúrate de que 'npm run dev' esté corriendo.");
                                                                }

                                                                // 2. Download Request
                                                                const res = await fetch(`/api/download-upload-audio/${bookId}`, {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ notebookId: notebookId })
                                                                });

                                                                const data = await res.json();

                                                                if (res.ok && data.success) {
                                                                    btn.textContent = '✅ ¡Guardado!';
                                                                    alert(`¡Éxito completado!\n\nAudio alojado en Firebase.\nURL: ${data.audioUrl}`);

                                                                    // Update UI immediately (show player)
                                                                    setSelectedVideo({
                                                                        ...selectedVideo,
                                                                        audioUrl: data.audioUrl,
                                                                        artifactId: data.artifactId,
                                                                        transcription: data.transcription
                                                                    });
                                                                } else {
                                                                    throw new Error(data.error || 'Error desconocido del servidor');
                                                                }
                                                            } catch (error) {
                                                                console.error(error);
                                                                alert("Error al descargar: " + error.message);
                                                                btn.innerHTML = originalText;
                                                                btn.disabled = false;
                                                            }
                                                        }}
                                                    >
                                                        💾 Descargar y Guardar Audio (Firebase)
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                                    <button onClick={() => { setSelectedVideo(null); resetProcessing(); }} className="btn btn-outline" style={{ padding: '0.6rem 1.5rem' }}>Cancelar</button>
                                    <button
                                        className="btn btn-primary"
                                        style={{ padding: '0.6rem 2rem', fontSize: '1rem', background: searchMode === 'notebooklm' ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' : undefined }}
                                        onClick={() => handleAccept(selectedVideo, selectedTopic, '', selectedLevel, aiSummary, rawTranscription, audioLength, isRecommended, isFavorite, isVisible)}
                                        disabled={!selectedTopic}
                                    >
                                        {isPublishing ? 'Publicando...' : (searchMode === 'notebooklm' || selectedVideo.isNotebook ? '🚀 Generar Cuaderno IA' : 'Publicar Libro')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* LOG VIEWER MODAL */}
                {viewingLogsFor && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', padding: '1rem' }}>
                        <div style={{ background: '#1e1e1e', width: '100%', maxWidth: '800px', height: '600px', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #333', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
                            <div style={{ padding: '1rem', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between' }}>
                                <h3 style={{ margin: 0, color: '#e5e5e5' }}>Log Viewer: {viewingLogsFor.generationJobId}</h3>
                                <button onClick={() => setViewingLogsFor(null)} style={{ color: 'white', background: 'none', border: 'none', cursor: 'pointer' }}>✖️</button>
                            </div>
                            <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', background: 'black', color: '#00ff00', fontFamily: 'monospace' }}>
                                {liveLogs.length === 0 && <div>Waiting for logs...</div>}
                                {liveLogs.map((log, i) => (
                                    <div key={i} style={{ marginBottom: '4px' }}>
                                        <span style={{ color: '#666', marginRight: '10px' }}>[{new Date(log.time).toLocaleTimeString()}]</span>
                                        {log.msg}
                                    </div>
                                ))}
                            </div>
                            <div style={{ padding: '1rem', borderTop: '1px solid #333', textAlign: 'right' }}>
                                <button onClick={() => setViewingLogsFor(null)} className="btn btn-primary">Cerrar</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
};

export default AdminDashboard;
