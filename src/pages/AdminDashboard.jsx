import React, { useState, useEffect, useRef } from 'react';
import ReactPlayer from 'react-player';
// Version: 1.2.0 - Build: 2026-03-05 - Added: Floating Progress Widget + FORESVI colors
import GenerationConfigPanel from '../components/GenerationConfigPanel';
import GenerationProgressWidget from '../components/GenerationProgressWidget';
import { db } from '../firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, setDoc, query, where, orderBy, limit, deleteField, onSnapshot } from "firebase/firestore";

const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

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
    const [activeTab, setActiveTab] = useState('database');

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
        },
        presentacion: {
            formato: 'Presentación detallada',
            idioma: 'Español',
            duracion: 'Corto',
            foco: 'Crea una presentación que resuma las principales ideas del libro para que un dueño o gerente de una PYME pueda aplicar en su entorno laboral. Utiliza ejemplos prácticos e imágenes unidas a los ejemplos utilizados en el libro, principalmente en el texto original del libro.'
        }
    });

    // NotebookLM Auth Status
    const [nlmStatus, setNlmStatus] = useState(null); // null=checking, true=ok, false=expired

    const checkNlmStatus = async () => {
        setNlmStatus(null);
        try {
            const res = await fetch(`${API_BASE}/api/nlm-status`);
            const data = await res.json();
            setNlmStatus(data.connected);
        } catch {
            setNlmStatus(false);
        }
    };

    // Orchestration Status
    // valid values: 'idle', 'generating_audio', 'generating_infographic', 'generating_video', 'merging', 'uploading', 'completed', 'error'
    const [orchestrationStatus, setOrchestrationStatus] = useState('idle');

    // ── Widget flotante de progreso ──────────────────────────────────────────
    const [activeGenId,      setActiveGenId]      = useState(null);   // bookId en curso
    const [activeGenTitle,   setActiveGenTitle]   = useState('');      // título del notebook
    const [activeGenStatus,  setActiveGenStatus]  = useState('idle');  // estado en tiempo real
    const [activeGenMessage, setActiveGenMessage] = useState('');      // mensaje del paso actual
    const [showWidget,       setShowWidget]       = useState(false);   // visibilidad del widget

    // Edit State
    const [editingVideoIdx, setEditingVideoIdx] = useState(-1);
    const [selectedTopic, setSelectedTopic] = useState('');
    const [selectedLevel, setSelectedLevel] = useState('Iniciación');
    const [isVisible, setIsVisible] = useState(true);
    const [isPublishing, setIsPublishing] = useState(false);

    // Persistent State (Now using local as fallback, but targeting Firestore)
    const [acceptedVideos, setAcceptedVideos] = useState([]);
    const [topics, setTopics] = useState([]);

    // Uploaded File Sources (PDFs, EPUBs)
    const [uploadedFiles, setUploadedFiles] = useState([]);

    // Import Notebook State
    const [importInput, setImportInput] = useState('');
    const [importStatus, setImportStatus] = useState('idle');
    const [importResult, setImportResult] = useState(null);
    const [importStage, setImportStage] = useState('');

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

        // Add uploaded file sources
        if (uploadedFiles.length > 0) {
            const fileSources = uploadedFiles.map(f => ({
                sourceType: 'file',
                filePath: f.path,
                fileName: f.name
            }));
            finalSources = [...finalSources, ...fileSources];
            console.log(`📎 Including ${fileSources.length} file source(s):`, fileSources.map(f => f.fileName));
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

            // Clean undefined fields to avoid Firebase crash
            Object.keys(newBook).forEach(key => {
                if (newBook[key] === undefined) delete newBook[key];
            });

            console.log("📝 Enviando datos a Firestore (sin bloquear)...", newBook);
            setDoc(doc(db, "books", customId), newBook, { merge: true }).catch(err => {
                console.error("⚠️ Error guardando en Firestore durante el inicio de generación:", err);
            });

            // Call Backend Orchestrator
            console.log("🚀 Llamando al orquestador backend en:", `${API_BASE}/api/generate-orchestrated`);
            const response = await fetch(`${API_BASE}/api/generate-orchestrated`, {
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

                // ── Activar widget flotante ──────────────────────────────────
                setActiveGenId(customId);
                setActiveGenTitle(title);
                setActiveGenStatus('initializing');
                setActiveGenMessage('Iniciando generación...');
                setShowWidget(true);
            } else {
                console.error('❌ Failed to launch');
                setOrchestrationStatus('error');
            }

        } catch (e) {
            console.error(e);
            setOrchestrationStatus('error');
        }
    };

    // ── Minimizar modal y dejar el widget flotante trabajar en segundo plano ──
    const handleMinimizeToWidget = () => {
        setSelectedVideo(null);
        resetProcessing();
    };

    const handleYouTubeUpload = async () => {
        if (!selectedVideo || !selectedVideo.youtubeAvailable) return;
        if (!confirm(`¿Subir "${selectedVideo.title}" a YouTube (No listado)?`)) return;

        try {
            alert('Funcionalidad de subida pendiente de completar (Backend Ready).');
            // await fetch(`${API_BASE}/api/youtube/upload`, { ... });
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

    // ── Sincronizar estado del widget con Firestore (independiente del modal) ─
    useEffect(() => {
        if (!activeGenId || !acceptedVideos.length) return;
        const book = acceptedVideos.find(v => v.id === activeGenId);
        if (book) {
            setActiveGenStatus(book.orchestrationStatus || 'idle');
            setActiveGenMessage(book.message || '');
        }
    }, [acceptedVideos, activeGenId]);

    // Check NotebookLM auth on mount
    useEffect(() => { checkNlmStatus(); }, []);

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
            const qBooks = query(collection(db, "books"));
            unsubscribeBooks = onSnapshot(qBooks,
                (snapshot) => {
                    const books = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));

                    // Client-side sorting guarantees we do not lose documents that lack a date field
                    books.sort((a, b) => {
                        const dateA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.acceptedDate ? new Date(a.acceptedDate).getTime() : 0);
                        const dateB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.acceptedDate ? new Date(b.acceptedDate).getTime() : 0);
                        return dateB - dateA;
                    });

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

    // Shared ref for polling — keeps current data without recreating effects
    const acceptedVideosRef = useRef(acceptedVideos);
    const pollingIntervalRef = useRef(null);
    const failedCheckCountRef = useRef({}); // Track consecutive failures per book
    const syncAttemptedRef = useRef(new Set()); // Track books that already triggered sync

    useEffect(() => {
        acceptedVideosRef.current = acceptedVideos;
    }, [acceptedVideos]);

    // 2. Poll for Progress (General Status) - Uses ref to avoid dependency loop
    useEffect(() => {
        const interval = setInterval(async () => {
            const currentVideos = acceptedVideosRef.current;
            if (!currentVideos) return;

            // Only poll processing items that have a job ID
            const videosProcessing = currentVideos.filter(v => (v.generationStatus === 'processing' || v.generationStatus === 'pending') && v.generationJobId);

            if (videosProcessing.length === 0) return;

            for (const vid of videosProcessing) {
                try {
                    const res = await fetch(`${API_BASE}/api/jobs/${vid.generationJobId}`);

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
                    // Silent fail to avoid spam
                }
            }
        }, 5000);
        return () => clearInterval(interval);
    }, []); // Empty deps — reads from acceptedVideosRef

    // 3. Dedicated Log Poller (High Frequency - 1s)
    useEffect(() => {
        if (!viewingLogsFor || !viewingLogsFor.generationJobId) return;

        const fetchLogs = async () => {
            try {
                const res = await fetch(`${API_BASE}/api/jobs/${viewingLogsFor.generationJobId}`);
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

    // Set up polling interval ONCE — reads from ref for current data
    useEffect(() => {
        const checkArtifacts = async () => {
            const currentVideos = acceptedVideosRef.current;
            if (!currentVideos || currentVideos.length === 0) return;

            const booksNeedingCheck = currentVideos.filter(v => {
                const needsCheck = v.orchestrationStatus === 'waiting_artifacts';
                const hasNotebook = !!v.notebookId;
                const notTooManyFailures = (failedCheckCountRef.current[v.id] || 0) < 10;
                const notAlreadySyncing = !syncAttemptedRef.current.has(v.id);
                return needsCheck && hasNotebook && notTooManyFailures && notAlreadySyncing;
            });

            if (booksNeedingCheck.length === 0) return;

            console.log(`[Artifact Poller] Checking ${booksNeedingCheck.length} book(s)...`);

            for (const book of booksNeedingCheck) {
                try {
                    if (!book.notebookId) continue;

                    const res = await fetch(`${API_BASE}/api/check-artifacts/${book.notebookId}`);

                    if (!res.ok) {
                        failedCheckCountRef.current[book.id] = (failedCheckCountRef.current[book.id] || 0) + 1;
                        const failCount = failedCheckCountRef.current[book.id];
                        console.warn(`[Artifact Poller] check-artifacts failed for "${book.title}" (${failCount}/10)`);
                        if (failCount >= 10) {
                            await updateDoc(doc(db, "books", book.id), {
                                orchestrationStatus: 'error',
                                message: '❌ Error: No se pudo verificar artefactos después de 10 intentos.'
                            });
                        }
                        continue;
                    }

                    failedCheckCountRef.current[book.id] = 0;

                    const data = await res.json();
                    const audioStatus = data.audio?.status?.toLowerCase() || 'pending';
                    const videoStatus = data.video?.status?.toLowerCase() || 'pending';

                    // Update Firestore (non-blocking, fire-and-forget)
                    updateDoc(doc(db, "books", book.id), {
                        artifactsStatus: { audio: audioStatus, video: videoStatus, lastChecked: new Date() }
                    }).catch(() => { });

                    // Wait until all artifacts have finished processing (none in progress)
                    // If everything failed, it will also trigger and download whatever succeeded
                    const isReadyForSync = data.summary?.in_progress === 0 && data.summary?.total > 0;
                    if (isReadyForSync) {
                        syncAttemptedRef.current.add(book.id);
                        console.log(`🚀 Artifacts Ready for "${book.title}". Triggering Drive Sync...`);

                        await updateDoc(doc(db, "books", book.id), {
                            orchestrationStatus: 'processing_drive',
                            message: '📂 Sincronizando con Google Drive...'
                        });

                        try {
                            const syncRes = await fetch(`${API_BASE}/api/process-artifacts/${book.id}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    notebookId: book.notebookId,
                                    title: book.title,
                                    description: book.summary
                                })
                            });

                            if (syncRes.ok) {
                                console.log("✅ Sync Result:", await syncRes.json());
                            } else {
                                console.error("❌ Sync HTTP Error:", syncRes.status);
                                await updateDoc(doc(db, "books", book.id), {
                                    orchestrationStatus: 'sync_error',
                                    message: `❌ Error de sincronización (HTTP ${syncRes.status}). Reintenta manualmente.`
                                });
                            }
                        } catch (syncErr) {
                            console.error("❌ Sync Network Error:", syncErr.message);
                            await updateDoc(doc(db, "books", book.id), {
                                orchestrationStatus: 'sync_error',
                                message: `❌ Error de red al sincronizar: ${syncErr.message}`
                            });
                        }
                    }

                } catch (e) {
                    console.error(`[Artifact Poller] Error checking ${book.id}:`, e);
                }
            }
        };

        // Initial delay to let Firestore data load, then every 30s
        const timer = setTimeout(() => checkArtifacts(), 5000);
        pollingIntervalRef.current = setInterval(checkArtifacts, 30000);

        return () => {
            clearTimeout(timer);
            if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        };
    }, []); // Empty deps — interval set once, reads from ref


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

                const response = await fetch(`${API_BASE}/api/generate`, {
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
        setOrchestrationStatus(video.orchestrationStatus || 'idle');
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
        setOrchestrationStatus('idle');
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
            const response = await fetch(`${API_BASE}/api/generate`, {
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
        const prompt = `Actúa como un instructor técnico experto de FORESVI.Basándote en el contenido del video "${selectedVideo.title}" y su descripción técnica(${selectedVideo.description}), reconstruye una LECCIÓN MAESTRA COMPLETA y EXHAUSTIVA.

                OBJETIVO: El lector debe poder aprender todo el procedimiento técnico sin necesidad de ver el video original.
                REGLAS:
                - No menciones que eres una IA.
        - No digas que no puedes proporcionar el contenido.Redacta la lección técnica paso a paso.
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
        📌 ** RESUMEN ESTRATÉGICO **
        🎯 ** OBJETIVO PRINCIPAL **
        💡 ** IDEAS CLAVE ** (lista detallada de puntos técnicos con negritas)
        ✅ ** CONCLUSIÓN PARA EL PROFESIONAL **
    Básate en esta descripción: ${selectedVideo.description}.
IMPORTANTE: Usa negritas con el formato ** texto ** para resaltar conceptos críticos.`;

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
        <>
        <div style={{ paddingTop: '60px', minHeight: '100vh', background: 'var(--bg-secondary)' }}>
            <div className="container" style={{ maxWidth: '1400px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', padding: '1rem 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <h2 style={{ margin: 0, fontSize: '1.8rem' }}>FORESVI Libros <span style={{ fontSize: '0.75rem', opacity: 0.4, fontWeight: 400 }}>v3.0</span></h2>
                        {/* NotebookLM Auth Badge */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                                background: nlmStatus === true ? '#f0fdf4' : nlmStatus === false ? '#fef2f2' : '#f8fafc',
                                border: `1px solid ${nlmStatus === true ? '#86efac' : nlmStatus === false ? '#fca5a5' : '#e2e8f0'}`,
                                color: nlmStatus === true ? '#16a34a' : nlmStatus === false ? '#dc2626' : '#94a3b8',
                            }}>
                                <span>{nlmStatus === true ? '🟢' : nlmStatus === false ? '🔴' : '⏳'}</span>
                                <span>NotebookLM</span>
                            </div>
                            {nlmStatus === false && (
                                <button
                                    onClick={async () => {
                                        try {
                                            await fetch(`${API_BASE}/api/nlm-relogin`, { method: 'POST' });
                                            alert('Terminal abierta. Acepta el permiso en el navegador y luego haz clic en "Verificar".');
                                        } catch { alert('Error al abrir terminal. Ejecuta manualmente: nlm login'); }
                                    }}
                                    style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid #fca5a5', background: '#fff1f1', color: '#dc2626' }}
                                    title="Re-autenticar NotebookLM"
                                >🔑 Re-autenticar</button>
                            )}
                            {nlmStatus === false && (
                                <button
                                    onClick={checkNlmStatus}
                                    style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2563eb' }}
                                    title="Verificar conexión"
                                >🔄 Verificar</button>
                            )}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', background: 'white', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                        <button onClick={() => { setActiveTab('search'); setSelectedVideo(null); resetProcessing(); }} className={`btn ${activeTab === 'search' ? 'btn-primary' : ''} `} style={{ border: 'none', background: activeTab === 'search' ? 'var(--accent-primary)' : 'transparent', color: activeTab === 'search' ? 'white' : 'var(--text-secondary)', padding: '0.5rem 1rem', borderRadius: '8px' }}>🔍 Nuevo Libro</button>
                        <button onClick={() => { setActiveTab('database'); setSelectedVideo(null); }} className={`btn ${activeTab === 'database' ? 'btn-primary' : ''} `} style={{ border: 'none', background: activeTab === 'database' ? 'var(--accent-primary)' : 'transparent', color: activeTab === 'database' ? 'white' : 'var(--text-secondary)', padding: '0.5rem 1rem', borderRadius: '8px' }}>📚 Biblioteca</button>
                        <button onClick={() => setActiveTab('config')} className={`btn ${activeTab === 'config' ? 'btn-primary' : ''} `} style={{ border: 'none', background: activeTab === 'config' ? 'var(--accent-primary)' : 'transparent', color: activeTab === 'config' ? 'white' : 'var(--text-secondary)', padding: '0.5rem 1rem', borderRadius: '8px' }}>⚙️ Ajustes</button>
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
                                <button
                                    onClick={() => setSearchMode('import')}
                                    style={{
                                        padding: '0.5rem 1.5rem',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: searchMode === 'import' ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' : 'transparent',
                                        color: searchMode === 'import' ? 'white' : 'var(--text-secondary)',
                                        fontWeight: '600',
                                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    📥 Importar Notebook
                                </button>
                            </div>
                        </div>

                        {/* IMPORT NOTEBOOK SECTION */}
                        {searchMode === 'import' && (() => {

                            const handleImport = async () => {
                                if (!importInput.trim()) return alert('Pega la URL o ID del Notebook');

                                // Extract ID from URL if needed
                                let nbId = importInput.trim();
                                if (nbId.includes('/notebook/')) {
                                    const match = nbId.match(/\/notebook\/([a-zA-Z0-9-_]+)/);
                                    if (match) nbId = match[1];
                                }

                                setImportStatus('importing');
                                setImportStage('Conectando con NotebookLM...');

                                try {
                                    const res = await fetch(`${API_BASE}/api/import-notebook`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            notebookId: nbId,
                                            topicId: selectedTopic,
                                            level: selectedLevel
                                        })
                                    });

                                    const data = await res.json();

                                    if (res.ok && data.success) {
                                        setImportStatus('success');
                                        setImportResult(data);
                                    } else {
                                        setImportStatus('error');
                                        setImportResult({ error: data.error || 'Unknown error' });
                                    }
                                } catch (err) {
                                    setImportStatus('error');
                                    setImportResult({ error: err.message });
                                }
                            };

                            return (
                                <div className="card" style={{ padding: '2rem', maxWidth: '700px', margin: '0 auto' }}>
                                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                                        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📥</div>
                                        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.3rem' }}>Importar Notebook Existente</h3>
                                        <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>
                                            Importa un cuaderno de NotebookLM que ya tengas creado. Se descargará el audio, vídeo, infografía e informes a Google Drive y se añadirá a tu biblioteca.
                                        </p>
                                    </div>

                                    {importStatus === 'idle' && (
                                        <>
                                            <div style={{ marginBottom: '1.5rem' }}>
                                                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#334155', marginBottom: '0.5rem' }}>
                                                    URL o ID del Notebook
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="https://notebooklm.google.com/notebook/xxxxx o pegue el ID directamente"
                                                    value={importInput}
                                                    onChange={(e) => setImportInput(e.target.value)}
                                                    onKeyPress={(e) => e.key === 'Enter' && handleImport()}
                                                    style={{
                                                        width: '100%',
                                                        padding: '0.8rem 1rem',
                                                        borderRadius: '10px',
                                                        border: '2px solid #e2e8f0',
                                                        outline: 'none',
                                                        fontSize: '0.95rem',
                                                        transition: 'border-color 0.2s',
                                                        boxSizing: 'border-box'
                                                    }}
                                                    onFocus={(e) => e.target.style.borderColor = '#16a34a'}
                                                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                                                />
                                                <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                                                    Acepta URL completa de NotebookLM o solo el ID (UUID del notebook)
                                                </p>
                                            </div>

                                            <button
                                                onClick={handleImport}
                                                disabled={!importInput.trim()}
                                                style={{
                                                    width: '100%',
                                                    padding: '1rem',
                                                    borderRadius: '12px',
                                                    border: 'none',
                                                    background: importInput.trim() ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' : '#e2e8f0',
                                                    color: importInput.trim() ? 'white' : '#94a3b8',
                                                    fontWeight: 700,
                                                    fontSize: '1rem',
                                                    cursor: importInput.trim() ? 'pointer' : 'not-allowed',
                                                    transition: 'all 0.2s',
                                                    boxShadow: importInput.trim() ? '0 4px 12px rgba(22, 163, 74, 0.3)' : 'none'
                                                }}
                                            >
                                                📥 Importar a Biblioteca
                                            </button>
                                        </>
                                    )}

                                    {importStatus === 'importing' && (
                                        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                                            <div style={{ marginBottom: '1.5rem' }}>
                                                <svg style={{ width: '48px', height: '48px', animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="#16a34a" strokeWidth="4"></circle>
                                                    <path style={{ opacity: 0.75 }} fill="#16a34a" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                            </div>
                                            <h4 style={{ margin: '0 0 0.5rem 0', color: '#16a34a' }}>Importando Notebook...</h4>
                                            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>{importStage}</p>
                                            <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left', maxWidth: '350px', margin: '1.5rem auto 0' }}>
                                                {['Obteniendo info del notebook', 'Verificando artefactos', 'Descargando audio', 'Descargando vídeo', 'Descargando infografía', 'Guardando informes', 'Creando entrada en biblioteca'].map((step, i) => (
                                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#64748b' }}>
                                                        <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#f1f5f9', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem' }}>
                                                            {i + 1}
                                                        </span>
                                                        {step}
                                                    </div>
                                                ))}
                                            </div>
                                            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '1rem' }}>Este proceso puede tardar 1-3 minutos...</p>
                                        </div>
                                    )}

                                    {importStatus === 'success' && importResult && (
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ background: '#f0fdf4', borderRadius: '16px', padding: '2rem', border: '1px solid #bbf7d0', marginBottom: '1.5rem' }}>
                                                <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>✅</div>
                                                <h3 style={{ margin: '0 0 0.5rem 0', color: '#166534' }}>¡Importación Completada!</h3>
                                                <p style={{ fontWeight: 600, color: '#334155', margin: '0 0 0.25rem 0' }}>{importResult.title}</p>
                                                <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                                    {importResult.downloaded} artefactos descargados de {importResult.total} posibles
                                                </p>
                                            </div>

                                            {/* Downloaded artifacts summary */}
                                            {importResult.artifacts && (
                                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
                                                    {Object.entries(importResult.artifacts).map(([key, val]) => (
                                                        <span key={key} style={{
                                                            padding: '0.3rem 0.8rem',
                                                            borderRadius: '20px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 600,
                                                            background: val.status === 'downloaded' ? '#dcfce7' : '#f1f5f9',
                                                            color: val.status === 'downloaded' ? '#166534' : '#94a3b8'
                                                        }}>
                                                            {val.status === 'downloaded' ? '✅' : '⏭️'} {val.title || key}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Sources found */}
                                            {importResult.sources && importResult.sources.length > 0 && (
                                                <details style={{ textAlign: 'left', marginBottom: '1rem' }}>
                                                    <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#475569' }}>
                                                        📚 {importResult.sources.length} fuente(s) encontradas
                                                    </summary>
                                                    <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', fontSize: '0.8rem' }}>
                                                        {importResult.sources.map((s, i) => (
                                                            <div key={i} style={{ marginBottom: '0.3rem', color: '#64748b' }}>
                                                                {s.type === 'YouTube' ? '📺' : s.type === 'Website' ? '🌐' : '📄'} {s.title}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </details>
                                            )}

                                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                                                <button
                                                    onClick={() => { setImportStatus('idle'); setImportInput(''); setImportResult(null); }}
                                                    className="btn btn-outline"
                                                    style={{ padding: '0.6rem 1.5rem' }}
                                                >
                                                    📥 Importar otro
                                                </button>
                                                <button
                                                    onClick={() => setActiveTab('database')}
                                                    className="btn btn-primary"
                                                    style={{ padding: '0.6rem 1.5rem' }}
                                                >
                                                    📚 Ver en Biblioteca
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {importStatus === 'error' && (
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ background: '#fef2f2', borderRadius: '16px', padding: '2rem', border: '1px solid #fecaca', marginBottom: '1.5rem' }}>
                                                <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>❌</div>
                                                <h3 style={{ margin: '0 0 0.5rem 0', color: '#991b1b' }}>Error en la Importación</h3>
                                                <p style={{ fontSize: '0.85rem', color: '#dc2626', wordBreak: 'break-all' }}>
                                                    {importResult?.error || 'Error desconocido'}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => { setImportStatus('idle'); }}
                                                className="btn btn-outline"
                                                style={{ padding: '0.6rem 1.5rem' }}
                                            >
                                                🔄 Reintentar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {searchMode !== 'import' && (
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
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Duración:</label>
                                        <select value={searchFilters.duration} onChange={e => setSearchFilters({ ...searchFilters, duration: e.target.value })} style={{ padding: '4px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '0.75rem' }}>
                                            <option value="any">Cualquiera</option>
                                            <option value="short">Corto (&lt; 4m)</option>
                                            <option value="medium">Medio (4-20m)</option>
                                            <option value="long">Largo (&gt; 20m)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* RESULTADOS */}
                        {searchMode !== 'import' && (<>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                                {searchResults.map((video) => {
                                    const stars = calculateStars(video.views);
                                    const isSelected = selectedSources.some(s => s.id === video.id);
                                    return (
                                        <div
                                            key={video.id}
                                            className="card"
                                            style={{
                                                padding: 0,
                                                overflow: 'hidden',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                border: selectedSources.some(s => s.id === video.id) ? '2px solid #3b82f6' : '1px solid var(--border-subtle)',
                                                cursor: searchMode === 'notebooklm' ? 'pointer' : 'default',
                                                transform: selectedSources.some(s => s.id === video.id) ? 'scale(1.02)' : 'none',
                                                background: selectedSources.some(s => s.id === video.id) ? '#eff6ff' : 'white',
                                                transition: 'all 0.2s ease'
                                            }}
                                            onClick={() => {
                                                if (searchMode === 'notebooklm') {
                                                    setSelectedSources(prev => {
                                                        const isSelected = prev.some(s => s.id === video.id);
                                                        if (isSelected) {
                                                            return prev.filter(s => s.id !== video.id);
                                                        } else {
                                                            return [...prev, video];
                                                        }
                                                    });
                                                }
                                            }}
                                        >
                                            <div
                                                style={{
                                                    position: 'relative', height: '160px', background: 'black',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}
                                            >
                                                <img src={video.thumbnail || undefined} alt={video.title} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: isSelected ? 0.7 : 1 }} />

                                                {searchMode === 'notebooklm' && (
                                                    <div style={{
                                                        position: 'absolute', top: 10, left: 10,
                                                        width: '24px', height: '24px', borderRadius: '50%',
                                                        background: isSelected ? '#3b82f6' : 'rgba(0,0,0,0.4)',
                                                        border: '2px solid white',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: 'white', fontWeight: 'bold'
                                                    }}>
                                                        {isSelected && '✓'}
                                                    </div>
                                                )}

                                                {(searchMode === 'youtube' || searchMode === 'notebooklm') && (
                                                    <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(0,0,0,0.8)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>
                                                        👁️ {video.views > 1000 ? (video.views / 1000).toFixed(1) + 'k' : video.views} | 🎙️ {Math.floor(video.durationSec / 60)}m
                                                    </div>
                                                )}

                                                <div style={{ position: 'absolute', top: '8px', right: '8px', background: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', color: '#fbbf24', fontWeight: 'bold' }}>
                                                    {"⭐".repeat(Math.min(5, Math.max(1, stars)))}
                                                </div>
                                                <button onClick={(e) => { e.stopPropagation(); setSelectedVideo(video); setSelectedTopic(topics[0]?.id || ''); setOrchestrationStatus('idle'); }} style={{ position: 'absolute', bottom: '8px', right: '8px', width: '30px', height: '30px', borderRadius: '50%', background: 'var(--accent-primary)', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>

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
                                                    <button onClick={(e) => { e.stopPropagation(); handleReject(video); }} className="btn btn-outline" style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', color: '#ef4444', borderColor: '#fee2e2' }}>Descartar</button>
                                                    <button onClick={(e) => { e.stopPropagation(); setSelectedVideo(video); setSelectedTopic(topics[0]?.id || ''); setOrchestrationStatus('idle'); }} className="btn btn-primary" style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem' }}>
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
                                                title: searchQuery ? `Investigación: ${searchQuery} ` : "Nueva Investigación",
                                                description: `Cuaderno generado a partir de ${selectedSources.length} fuentes seleccionadas.`,
                                                sources: selectedSources.map(s => `https://www.youtube.com/watch?v=${s.id}`),
                                                isNotebook: true,
                                                thumbnail: '/notebook_lm_product_icon.svg'
                                            };
                                            setSelectedVideo(mockVideo);
                                            setOrchestrationStatus('idle');
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
                                    </button >
                                </div >
                            )}
                        </>)}
                    </div>
                )}

                {/* PLAYLIST SYNC TAB */}
                {
                    activeTab === 'playlist' && (
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
                                            const res = await fetch(`${API_BASE}/api/youtube/sync-playlist`, { method: 'POST' });
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
                    )
                }

                {/* DATABASE TAB — rediseño en cards */}
                {activeTab === 'database' && (() => {
                    // ── Hitos de progreso ──────────────────────────────────────────
                    const MILESTONES = [
                        { label: 'Notebook',    icon: '🧠' },
                        { label: 'Fuentes',     icon: '📚' },
                        { label: 'Audio',       icon: '🎧' },
                        { label: 'Infografía',  icon: '🧩' },
                        { label: 'Vídeo',       icon: '🎬' },
                        { label: 'Drive',       icon: '☁️' },
                    ];

                    const getMilestone = (status) => {
                        switch (status) {
                            case 'initializing':            return 0;
                            case 'generating_audio':        return 1;
                            case 'generating_infographic':
                            case 'generating_report':
                            case 'generating_presentation': return 2;
                            case 'generating_video':
                            case 'waiting_artifacts':       return 3;
                            case 'processing_drive':        return 4;
                            case 'completed':
                            case 'drive_synced':            return 6; // todos hechos
                            default:                        return -1;
                        }
                    };

                    // ── Paleta corporativa ─────────────────────────────────────────
                    const NAVY  = '#003349';
                    const RED   = '#E25454';
                    const GREEN = '#16a34a';
                    const GRAY  = '#717B8D';

                    return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {acceptedVideos.map((video, idx) => {
                                const os           = video.orchestrationStatus || 'idle';
                                const isComplete   = os === 'completed' || os === 'drive_synced';
                                const isFailed     = os === 'failed' || os === 'error';
                                const isGenerating = !isComplete && !isFailed && os !== 'idle';
                                const activeMil    = isComplete ? 6 : getMilestone(os);

                                const downloads     = video.artifactDownloads || {};
                                const vals          = Object.values(downloads);
                                const hasAudio      = vals.some(d => d.fileName?.endsWith('.mp3'));
                                const hasVideo      = vals.some(d => d.fileName?.endsWith('.mp4'));
                                const hasInfographic= vals.some(d => d.fileName?.endsWith('.png'));
                                const hasReport     = vals.some(d => d.fileName?.endsWith('.docx') || d.fileName?.endsWith('.md'));
                                const hasPptx       = vals.some(d => d.fileName?.endsWith('.pptx'));

                                // Inicial para el avatar
                                const initial = (video.title || 'F').replace(/^(investigaci[oó]n|resumen)[:\s]*/i, '').trim()[0]?.toUpperCase() || 'F';

                                // Color del borde izquierdo por estado
                                const accentColor = isComplete ? GREEN : isFailed ? '#ef4444' : isGenerating ? NAVY : '#e2e8f0';

                                return (
                                    <div key={video.id} style={{
                                        background: isComplete ? '#f0fdf4' : isFailed ? '#fef2f2' : 'white',
                                        borderRadius: 12,
                                        border: `1px solid ${isComplete ? '#bbf7d0' : isFailed ? '#fca5a5' : '#e2e8f0'}`,
                                        borderLeft: `4px solid ${accentColor}`,
                                        padding: '14px 18px',
                                        fontFamily: 'Inter, system-ui, sans-serif',
                                    }}>

                                        {/* ── Fila 1: Avatar + Título + Acciones ─────────────────── */}
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>

                                            {/* Avatar corporativo */}
                                            <div style={{
                                                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                                                background: `linear-gradient(135deg, ${NAVY}, #005577)`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: 'white', fontWeight: 800, fontSize: 20,
                                                boxShadow: '0 2px 8px rgba(0,51,73,0.25)',
                                                border: `2px solid ${accentColor === '#e2e8f0' ? 'rgba(0,51,73,0.15)' : accentColor}`,
                                            }}>
                                                {initial}
                                            </div>

                                            {/* Título + metadatos */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    fontWeight: 700, fontSize: 14, color: '#0f172a',
                                                    lineHeight: 1.45, marginBottom: 4,
                                                    wordBreak: 'break-word',
                                                }}>
                                                    {video.title}
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11 }}>
                                                    {video.notebookId && (
                                                        <a
                                                            href={`https://notebooklm.google.com/notebook/${video.notebookId}`}
                                                            target="_blank" rel="noopener noreferrer"
                                                            style={{ color: NAVY, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}
                                                        >
                                                            🧠 NotebookLM ↗
                                                        </a>
                                                    )}
                                                    {video.driveFolderName && (
                                                        <span style={{ color: GREEN, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 3 }}>
                                                            📁 {video.driveFolderName}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Acciones */}
                                            <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                                                <button
                                                    onClick={() => handleEdit(video, idx)}
                                                    style={{ padding: '5px 12px', borderRadius: 8, border: `1px solid ${NAVY}`, background: 'white', color: NAVY, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                                >
                                                    ✏️ Editar
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        if (window.confirm('¿Eliminar este libro?')) {
                                                            try {
                                                                await deleteDoc(doc(db, "books", video.id));
                                                            } catch (err) {
                                                                alert('Error: ' + err.message);
                                                            }
                                                        }
                                                    }}
                                                    style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fff1f1', color: '#ef4444', fontSize: 13, cursor: 'pointer' }}
                                                    title="Eliminar"
                                                >🗑</button>
                                            </div>
                                        </div>

                                        {/* ── Fila 2: Barra de hitos + Contenidos (solo si no está completo) ── */}
                                        {!isComplete && <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>

                                            {/* Barra de hitos */}
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                                    {MILESTONES.map((m, i) => {
                                                        const done   = isComplete || activeMil > i;
                                                        const active = !isComplete && !isFailed && activeMil === i;
                                                        const dotBg  = isFailed && i <= Math.max(activeMil, 0) ? '#ef4444'
                                                                     : done    ? NAVY
                                                                     : active  ? RED
                                                                     : '#e2e8f0';
                                                        return (
                                                            <React.Fragment key={i}>
                                                                {i > 0 && (
                                                                    <div style={{
                                                                        flex: 1, height: 2,
                                                                        background: done ? NAVY : '#e2e8f0',
                                                                        transition: 'background 0.5s',
                                                                        minWidth: 10,
                                                                    }} />
                                                                )}
                                                                <div
                                                                    title={m.label}
                                                                    style={{
                                                                        width: 26, height: 26, borderRadius: '50%',
                                                                        background: dotBg,
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                        fontSize: done ? 12 : 13,
                                                                        color: done || active ? 'white' : '#94a3b8',
                                                                        flexShrink: 0,
                                                                        boxShadow: active ? `0 0 0 3px rgba(226,84,84,0.25)` : 'none',
                                                                        transition: 'all 0.4s',
                                                                        fontWeight: done ? 800 : 400,
                                                                    }}
                                                                >
                                                                    {done ? '✓' : m.icon}
                                                                </div>
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </div>
                                                {/* Etiqueta del estado actual */}
                                                <div style={{ marginTop: 5, fontSize: 10.5, color: isComplete ? GREEN : isFailed ? '#ef4444' : isGenerating ? NAVY : GRAY, fontWeight: 500 }}>
                                                    {isComplete   ? '✅ Completado — todos los contenidos descargados a Drive'
                                                   : isFailed     ? '❌ Error en la generación'
                                                   : isGenerating ? `⚙️ ${MILESTONES[Math.min(activeMil, 5)]?.label || 'Procesando'}...`
                                                   : '○ Pendiente de generar'}
                                                </div>
                                            </div>

                                            {/* Indicadores de contenido */}
                                            <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                                                {[
                                                    { label: '🎧', title: 'Audio',        done: hasAudio      },
                                                    { label: '🎬', title: 'Vídeo',        done: hasVideo      },
                                                    { label: '🧩', title: 'Infografía',   done: hasInfographic},
                                                    { label: '📄', title: 'Informe',      done: hasReport     },
                                                    { label: '📊', title: 'Presentación', done: hasPptx       },
                                                ].map(c => (
                                                    <div key={c.title} title={c.title} style={{
                                                        width: 30, height: 30, borderRadius: 8,
                                                        background: c.done ? '#f0fdf4' : '#f8fafc',
                                                        border: `1.5px solid ${c.done ? '#86efac' : '#e2e8f0'}`,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: 14, cursor: 'default',
                                                        opacity: c.done ? 1 : 0.35,
                                                        position: 'relative',
                                                    }}>
                                                        {c.label}
                                                        {c.done && (
                                                            <div style={{
                                                                position: 'absolute', bottom: -3, right: -3,
                                                                width: 11, height: 11, borderRadius: '50%',
                                                                background: GREEN, color: 'white',
                                                                fontSize: 7, fontWeight: 800,
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                border: '1.5px solid white',
                                                            }}>✓</div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>}
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}

                {
                    activeTab === 'config' && (
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
                                            <img src={video.thumbnail || undefined} style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '6px' }} alt="" />
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
                    )
                }
                {/* MODAL COMPACTO */}
                {
                    selectedVideo && (
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                            <div className="bg-white w-full max-w-6xl max-h-[90vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl">
                                <div className={`h-60 shrink-0 relative flex items-center justify-center ${searchMode === 'notebooklm' || selectedVideo.isNotebook ? '' : 'bg-black'
                                    }`}
                                    style={searchMode === 'notebooklm' || selectedVideo.isNotebook ? {
                                        background: 'linear-gradient(135deg, #f0f6f8 0%, #ffffff 60%, #fdf0f0 100%)',
                                        borderBottom: '4px solid #003349'
                                    } : {}}>
                                    {searchMode === 'notebooklm' || selectedVideo.isNotebook ? (
                                        <div className="flex flex-col items-center justify-center w-full h-full px-6">
                                            {/* Franja roja superior */}
                                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '5px', background: '#E25454', borderRadius: '0' }} />
                                            {/* Logo FORESVI */}
                                            <img
                                                src="/foresvi-logo.png"
                                                alt="FORESVI"
                                                style={{ height: '90px', objectFit: 'contain', marginBottom: '12px', filter: 'drop-shadow(0 2px 8px rgba(0,51,73,0.12))' }}
                                            />
                                            {/* Subtítulo */}
                                            <p style={{ color: '#717B8D', fontSize: '0.9rem', margin: 0, fontWeight: 500, letterSpacing: '0.04em' }}>
                                                Generador de Contenido IA · NotebookLM
                                            </p>
                                        </div>
                                    ) : (
                                        <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${selectedVideo.id}?rel=0&modestbranding=1`} frameBorder="0" allowFullScreen></iframe>
                                    )}
                                    {/* Botón cerrar + minimizar */}
                                    <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: 6 }}>
                                        {showWidget && (
                                            <button
                                                onClick={handleMinimizeToWidget}
                                                title="Minimizar — el progreso sigue en el widget"
                                                style={{ background: 'rgba(226,84,84,0.85)', color: 'white', border: 'none', borderRadius: '20px', padding: '4px 12px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
                                            >
                                                ↙ Seguir buscando
                                            </button>
                                        )}
                                        <button onClick={() => { setSelectedVideo(null); resetProcessing(); }} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}>×</button>
                                    </div>
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
                                                driveFolderPath={selectedVideo.driveFolderPath}
                                                driveFolderName={selectedVideo.driveFolderName}
                                                artifactDownloads={selectedVideo.artifactDownloads}
                                                uploadedFiles={uploadedFiles}
                                                setUploadedFiles={setUploadedFiles}
                                            /></>
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


                                    {/* DRIVE CONTENT VIEWER - For completed books */}
                                    {(orchestrationStatus === 'completed' || orchestrationStatus === 'drive_synced') && selectedVideo.driveFolderPath && (
                                        <div style={{ marginTop: '1.5rem', padding: '1.5rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                            <h4 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#1e293b' }}>
                                                📂 Contenidos Generados en Google Drive
                                            </h4>

                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                                                {/* Audio Player */}
                                                {(() => {
                                                    const audioFile = Object.values(selectedVideo.artifactDownloads || {}).find(d => d.fileName?.endsWith('.mp3'));
                                                    if (!audioFile) return null;
                                                    return (
                                                        <div style={{ background: 'white', borderRadius: '10px', padding: '1rem', border: '1px solid #e2e8f0' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                                                <span style={{ fontSize: '1.2rem' }}>🎧</span>
                                                                <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#334155' }}>Audio Overview</span>
                                                                <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: 'auto' }}>{(audioFile.size / 1024 / 1024).toFixed(1)} MB</span>
                                                            </div>
                                                            <audio
                                                                controls
                                                                src={`http://localhost:3001/api/drive-file?path=${encodeURIComponent(audioFile.path)}`}
                                                                style={{ width: '100%', height: '40px', borderRadius: '20px' }}
                                                                preload="metadata"
                                                            />
                                                        </div>
                                                    );
                                                })()}

                                                {/* Video Player */}
                                                {(() => {
                                                    const videoFile = Object.values(selectedVideo.artifactDownloads || {}).find(d => d.fileName?.endsWith('.mp4'));
                                                    if (!videoFile) return null;
                                                    return (
                                                        <div style={{ background: 'white', borderRadius: '10px', padding: '1rem', border: '1px solid #e2e8f0' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                                                <span style={{ fontSize: '1.2rem' }}>🎬</span>
                                                                <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#334155' }}>Video Overview</span>
                                                                <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: 'auto' }}>{(videoFile.size / 1024 / 1024).toFixed(1)} MB</span>
                                                            </div>
                                                            <video
                                                                controls
                                                                src={`http://localhost:3001/api/drive-file?path=${encodeURIComponent(videoFile.path)}`}
                                                                style={{ width: '100%', borderRadius: '8px', maxHeight: '200px' }}
                                                                preload="metadata"
                                                            />
                                                        </div>
                                                    );
                                                })()}

                                                {/* Infographic Preview */}
                                                {(() => {
                                                    const imgFile = Object.values(selectedVideo.artifactDownloads || {}).find(d => d.fileName?.endsWith('.png'));
                                                    if (!imgFile) return null;
                                                    return (
                                                        <div style={{ background: 'white', borderRadius: '10px', padding: '1rem', border: '1px solid #e2e8f0' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                                                <span style={{ fontSize: '1.2rem' }}>🧩</span>
                                                                <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#334155' }}>Infografía</span>
                                                                <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: 'auto' }}>{(imgFile.size / 1024 / 1024).toFixed(1)} MB</span>
                                                            </div>
                                                            <img
                                                                src={`http://localhost:3001/api/drive-file?path=${encodeURIComponent(imgFile.path)}`}
                                                                alt="Infografía"
                                                                style={{ width: '100%', borderRadius: '8px', cursor: 'pointer', maxHeight: '300px', objectFit: 'contain', background: '#f1f5f9' }}
                                                                onClick={() => window.open(`http://localhost:3001/api/drive-file?path=${encodeURIComponent(imgFile.path)}`, '_blank')}
                                                                title="Click para ver en tamaño completo"
                                                            />
                                                        </div>
                                                    );
                                                })()}

                                                {/* Report Download */}
                                                {(() => {
                                                    const reportFile = Object.values(selectedVideo.artifactDownloads || {}).find(d => d.fileName?.endsWith('.docx') || d.fileName?.endsWith('.md'));
                                                    if (!reportFile) return null;
                                                    return (
                                                        <div style={{ background: 'white', borderRadius: '10px', padding: '1rem', border: '1px solid #e2e8f0' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                                                <span style={{ fontSize: '1.2rem' }}>📄</span>
                                                                <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#334155' }}>Informe</span>
                                                                <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: 'auto' }}>{(reportFile.size / 1024).toFixed(0)} KB</span>
                                                            </div>
                                                            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 0.5rem 0' }}>{reportFile.title || reportFile.fileName}</p>
                                                            <a
                                                                href={`http://localhost:3001/api/drive-file?path=${encodeURIComponent(reportFile.path)}&download=true`}
                                                                download={reportFile.fileName}
                                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0.4rem 0.8rem', borderRadius: '6px', background: '#3b82f6', color: 'white', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 500 }}
                                                            >
                                                                ⬇️ Descargar {reportFile.fileName?.endsWith('.docx') ? 'DOCX' : 'MD'}
                                                            </a>
                                                        </div>
                                                    );
                                                })()}
                                            </div>

                                            {/* Evaluation Actions */}
                                            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '0.8rem', color: '#64748b', alignSelf: 'center' }}>¿Los contenidos son válidos?</span>
                                                <button
                                                    onClick={async () => {
                                                        await updateDoc(doc(db, "books", selectedVideo.id), { contentApproved: true, approvedAt: new Date() });
                                                        setSelectedVideo({ ...selectedVideo, contentApproved: true });
                                                        alert('✅ Contenidos aprobados');
                                                    }}
                                                    style={{ padding: '0.4rem 1rem', borderRadius: '8px', border: 'none', background: selectedVideo.contentApproved ? '#16a34a' : '#dcfce7', color: selectedVideo.contentApproved ? 'white' : '#166534', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                                                >
                                                    {selectedVideo.contentApproved ? '✅ Aprobados' : '👍 Aprobar'}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setActiveTab('search'); // Will switch to the generation config
                                                        setOrchestrationStatus('idle'); // Force UI to allow regenerations
                                                    }}
                                                    style={{ padding: '0.4rem 1rem', borderRadius: '8px', border: '1px solid #f97316', background: 'white', color: '#f97316', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                                                >
                                                    🔄 Regenerar
                                                </button>
                                                <button
                                                    onClick={async (e) => {
                                                        const btn = e.currentTarget;
                                                        const originalText = btn.innerHTML;
                                                        btn.innerHTML = '⏳ Descargando...';
                                                        btn.disabled = true;
                                                        try {
                                                            const syncRes = await fetch(`${API_BASE}/api/process-artifacts/${selectedVideo.id}`, {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({
                                                                    notebookId: selectedVideo.notebookId,
                                                                    title: selectedVideo.title,
                                                                    description: selectedVideo.summary
                                                                })
                                                            });
                                                            if (syncRes.ok) {
                                                                alert('✅ Artefactos descargados y sincronizados correctamente.');
                                                            } else {
                                                                alert('❌ Error al sincronizar los artefactos.');
                                                            }
                                                        } catch (err) {
                                                            alert('❌ Error de red: ' + err.message);
                                                        } finally {
                                                            btn.innerHTML = originalText;
                                                            btn.disabled = false;
                                                        }
                                                    }}
                                                    style={{ padding: '0.4rem 1rem', borderRadius: '8px', border: '1px solid #3b82f6', background: 'white', color: '#3b82f6', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.2s ease' }}
                                                    onMouseOver={(e) => { if (!e.currentTarget.disabled) { e.currentTarget.style.background = '#eff6ff'; } }}
                                                    onMouseOut={(e) => { if (!e.currentTarget.disabled) { e.currentTarget.style.background = 'white'; } }}
                                                >
                                                    ⬇️ Forzar Descarga (Sync)
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* BOTTOM BAR */}
                                    <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                                        <button onClick={() => { setSelectedVideo(null); resetProcessing(); }} className="btn btn-outline" style={{ padding: '0.6rem 1.5rem' }}>Cerrar</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* LOG VIEWER MODAL */}
                {
                    viewingLogsFor && (
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
                    )
                }
            </div >
        </div >

        {/* ── Widget flotante de progreso (persiste aunque el modal esté cerrado) ── */}
        {showWidget && activeGenId && activeGenStatus !== 'idle' && (
            <GenerationProgressWidget
                status={activeGenStatus}
                message={activeGenMessage}
                title={activeGenTitle}
                onClose={() => {
                    setShowWidget(false);
                    setActiveGenId(null);
                    setActiveGenStatus('idle');
                }}
                onReopen={() => {
                    const book = acceptedVideos.find(v => v.id === activeGenId);
                    if (book) {
                        setSelectedVideo(book);
                        setSearchMode('notebooklm');
                        setOrchestrationStatus(book.orchestrationStatus || 'idle');
                    }
                }}
            />
        )}
        </>
    );
};

export default AdminDashboard;
