import React, { useState, useRef } from 'react';
import { getApiBase } from '../utils/api';

const API_BASE = getApiBase();

const GenerationConfigPanel = ({ config, setConfig, onLaunch, status, notebookId, message, artifactsStatus, driveFolderPath, driveFolderName, artifactDownloads, onRegenerate, uploadedFiles, setUploadedFiles, customPrompts = null, setCustomPrompts = null, bookId = null }) => {
    const [activeTab, setActiveTab] = useState('audio');
    const [isUploading, setIsUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [showCustomPrompts, setShowCustomPrompts] = useState(false);
    const [editingPrompts, setEditingPrompts] = useState(customPrompts || {});
    const fileInputRef = useRef(null);

    const handleConfigChange = (type, field, value) => {
        setConfig(prev => ({
            ...prev,
            [type]: {
                ...prev[type],
                [field]: value
            }
        }));
    };

    const handleFileUpload = async (file) => {
        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch(`${API_BASE}/api/upload-source`, {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            if (data.success) {
                setUploadedFiles(prev => [...prev, data.file]);
            } else {
                alert('Error al subir: ' + (data.error || 'Error desconocido'));
            }
        } catch (err) {
            alert('Error al subir archivo: ' + err.message);
        } finally {
            setIsUploading(false);
        }
    };

    const isGenerating = status !== 'idle' && status !== 'error' && status !== 'completed' && status !== 'drive_synced';
    const isCompleted = status === 'completed' || status === 'drive_synced';

    // Mapeo de estados a etapas visuales
    const orchestrationSteps = [
        {
            id: 'notebook',
            label: 'Creación del Notebook',
            status: ['generating_audio', 'generating_infographic', 'generating_video', 'generating_report', 'waiting_artifacts', 'ready_for_download', 'processing_drive', 'processing_youtube', 'completed', 'drive_synced'].includes(status) ? 'completed' :
                status === 'initializing' ? 'in_progress' : 'pending'
        },
        {
            id: 'sources',
            label: 'Indexación de fuentes',
            status: ['generating_infographic', 'generating_video', 'generating_report', 'waiting_artifacts', 'ready_for_download', 'processing_drive', 'processing_youtube', 'completed', 'drive_synced'].includes(status) ? 'completed' :
                status === 'generating_audio' ? 'in_progress' : 'pending'
        },
        { id: 'audio', label: 'Generación de audio', status: artifactsStatus?.audio === 'completed' || isCompleted ? 'completed' : (artifactsStatus?.audio === 'in_progress' || artifactsStatus?.audio === 'queued') ? 'in_progress' : 'pending' },
        { id: 'infographic', label: 'Generación de infografía', status: artifactsStatus?.infographic === 'completed' || isCompleted ? 'completed' : (artifactsStatus?.infographic === 'in_progress' || artifactsStatus?.infographic === 'queued') ? 'in_progress' : 'pending' },
        { id: 'video', label: 'Generación de vídeo', status: artifactsStatus?.video === 'completed' || isCompleted ? 'completed' : (artifactsStatus?.video === 'in_progress' || artifactsStatus?.video === 'queued') ? 'in_progress' : artifactsStatus?.video === 'failed' ? 'failed' : 'pending' },
        { id: 'presentation', label: 'Generación de presentación (PDF)', status: isCompleted ? 'completed' : ['generating_presentation', 'generating_video', 'waiting_artifacts', 'processing_drive'].includes(status) ? 'in_progress' : 'pending' },
        { id: 'drive', label: 'Descarga a Google Drive', status: isCompleted ? 'completed' : status === 'processing_drive' ? 'in_progress' : 'pending' },
    ];

    // =========================================================================
    // COMPLETED VIEW — Show results with links
    // =========================================================================
    if (isCompleted) {
        const downloads = artifactDownloads || {};
        const downloadEntries = Object.entries(downloads).filter(([, v]) => v.status === 'downloaded');

        return (
            <div className="space-y-4">
                {/* Compact Success Header */}
                <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                    <span className="text-2xl">✅</span>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-green-800">Generación Completada</p>
                        <p className="text-xs text-green-600">Todos los contenidos están listos</p>
                    </div>
                </div>

                {/* Compact Status Indicators */}
                <div className="flex gap-2 flex-wrap">
                    {notebookId && (
                        <a
                            href={`https://notebooklm.google.com/notebook/${notebookId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200 hover:shadow-sm transition-all text-xs font-medium text-amber-900 hover:bg-amber-100"
                        >
                            <span>🧠</span> NotebookLM
                        </a>
                    )}

                    {driveFolderName && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200 text-xs font-medium text-blue-900">
                            <span>📁</span> {driveFolderName}
                        </div>
                    )}
                </div>

                {/* Main: Downloaded Files */}
                {downloadEntries.length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">📥 Archivos Descargados</h3>
                        <div className="space-y-3">
                            {downloadEntries.map(([key, val]) => {
                                const ext = val.fileName?.split('.').pop()?.toLowerCase() || '';
                                const icon = ext === 'mp3' ? '🎧' : ext === 'mp4' ? '🎬' : ext === 'png' ? '🧩' : ext === 'docx' ? '📄' : ext === 'pptx' ? '📊' : ext === 'pdf' ? '📑' : '📎';
                                const sizeMB = val.size ? `${(val.size / 1024 / 1024).toFixed(1)} MB` : '';
                                return (
                                    <div key={key} className="flex items-center gap-4 p-4 bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all">
                                        <span className="text-3xl">{icon}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-gray-900 truncate">{val.fileName}</p>
                                            <p className="text-sm text-gray-500 mt-1">{val.title || ''}</p>
                                            <p className="text-xs text-gray-400 mt-1">{sizeMB}</p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <span className="text-green-600 text-xl">✓</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Regenerate Section */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                    <h4 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        🔄 Regenerar Contenidos
                    </h4>
                    <p className="text-sm text-gray-500 mb-4">
                        Puedes lanzar una nueva generación con un prompt diferente. Se creará una versión 2 sin borrar la anterior.
                    </p>

                    {/* Show current config as reference */}
                    <details className="mb-4 bg-gray-50 rounded-lg border border-gray-200">
                        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                            📝 Ver prompt original
                        </summary>
                        <div className="px-4 pb-4 pt-2 space-y-2 text-xs">
                            {config?.audio?.foco && (
                                <div><span className="text-gray-500">Audio:</span> <span className="text-gray-800">{config.audio.foco}</span></div>
                            )}
                            {config?.video?.foco && (
                                <div><span className="text-gray-500">Video:</span> <span className="text-gray-800">{config.video.foco}</span></div>
                            )}
                            {config?.infografia?.descripcion && (
                                <div><span className="text-gray-500">Infografía:</span> <span className="text-gray-800">{config.infografia.descripcion}</span></div>
                            )}
                            {config?.informe?.foco && (
                                <div><span className="text-gray-500">Informe:</span> <span className="text-gray-800">{config.informe.foco}</span></div>
                            )}
                            {!config?.audio?.foco && !config?.video?.foco && !config?.infografia?.descripcion && !config?.informe?.foco && (
                                <p className="text-gray-400 italic">Sin prompts personalizados (se usaron los valores por defecto)</p>
                            )}
                        </div>
                    </details>

                    {/* Custom Prompts Editor */}
                    <details className="mb-4 bg-blue-50 rounded-lg border border-blue-200">
                        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-blue-900 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-2">
                            ✏️ Editar Prompts Personalizados
                        </summary>
                        <div className="px-4 pb-4 pt-2 space-y-3 text-sm">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Prompt Audio</label>
                                <textarea
                                    value={editingPrompts.audio || config?.audio?.foco || ''}
                                    onChange={(e) => setEditingPrompts(prev => ({ ...prev, audio: e.target.value }))}
                                    placeholder="Personaliza el prompt para audio..."
                                    className="w-full px-2 py-2 rounded border border-gray-300 text-xs font-mono focus:border-blue-400 focus:ring-blue-300 focus:outline-none"
                                    rows="3"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Prompt Vídeo</label>
                                <textarea
                                    value={editingPrompts.video || config?.video?.foco || ''}
                                    onChange={(e) => setEditingPrompts(prev => ({ ...prev, video: e.target.value }))}
                                    placeholder="Personaliza el prompt para vídeo..."
                                    className="w-full px-2 py-2 rounded border border-gray-300 text-xs font-mono focus:border-blue-400 focus:ring-blue-300 focus:outline-none"
                                    rows="3"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Prompt Infografía</label>
                                <textarea
                                    value={editingPrompts.infografia || config?.infografia?.descripcion || ''}
                                    onChange={(e) => setEditingPrompts(prev => ({ ...prev, infografia: e.target.value }))}
                                    placeholder="Personaliza el prompt para infografía..."
                                    className="w-full px-2 py-2 rounded border border-gray-300 text-xs font-mono focus:border-blue-400 focus:ring-blue-300 focus:outline-none"
                                    rows="3"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Prompt Informe</label>
                                <textarea
                                    value={editingPrompts.informe || config?.informe?.foco || ''}
                                    onChange={(e) => setEditingPrompts(prev => ({ ...prev, informe: e.target.value }))}
                                    placeholder="Personaliza el prompt para informe..."
                                    className="w-full px-2 py-2 rounded border border-gray-300 text-xs font-mono focus:border-blue-400 focus:ring-blue-300 focus:outline-none"
                                    rows="3"
                                />
                            </div>

                            <button
                                onClick={async () => {
                                    if (setCustomPrompts && bookId) {
                                        try {
                                            setCustomPrompts(editingPrompts);
                                            alert('✅ Prompts guardados localmente. Se usarán en la regeneración.');
                                        } catch (error) {
                                            alert('❌ Error al guardar prompts');
                                        }
                                    }
                                }}
                                className="w-full py-2 rounded-lg font-semibold text-white shadow-md transition-all bg-gradient-to-r from-blue-500 to-blue-600 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99]"
                            >
                                💾 Guardar Prompts
                            </button>
                        </div>
                    </details>

                    <button
                        onClick={onLaunch}
                        className="w-full py-3 rounded-xl font-bold text-white shadow-lg transition-all transform bg-gradient-to-r from-amber-500 to-orange-500 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                    >
                        🔄 REGENERAR (Nueva Versión)
                    </button>
                </div>

                {/* Technical Details */}
                {notebookId && (
                    <details className="bg-gray-50 rounded-lg border border-gray-200">
                        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                            Detalles Técnicos
                        </summary>
                        <div className="px-4 pb-4 pt-2 space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-gray-600">Notebook ID:</span>
                                <code className="bg-white px-2 py-1 rounded border border-gray-200 font-mono text-gray-800">{notebookId}</code>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-600">Estado:</span>
                                <span className="font-medium text-green-700">Completado ✓</span>
                            </div>
                            {driveFolderPath && (
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-600">Carpeta:</span>
                                    <code className="bg-white px-2 py-1 rounded border border-gray-200 font-mono text-gray-800 text-[10px] max-w-[250px] truncate">{driveFolderPath}</code>
                                </div>
                            )}
                        </div>
                    </details>
                )}
            </div>
        );
    }

    // =========================================================================
    // GENERATING / CONFIG VIEW
    // =========================================================================
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
            {/* LEFT PANEL - Configuration */}
            <div className="lg:col-span-1 space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuración de Contenidos</h3>

                {/* Audio Card */}
                <div className={`bg-white rounded-xl border-2 transition-all ${activeTab === 'audio' ? 'border-foresvi-blue shadow-lg' : 'border-gray-200'} ${isGenerating ? 'opacity-60 pointer-events-none' : ''}`}>
                    <button
                        onClick={() => setActiveTab('audio')}
                        className="w-full p-4 flex items-center gap-3 text-left"
                    >
                        <span className="text-2xl">🎧</span>
                        <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">Audio</h4>
                            <p className="text-xs text-gray-500">{config.audio.idioma} · {config.audio.formato}</p>
                        </div>
                        {activeTab === 'audio' && <span className="text-foresvi-blue">▼</span>}
                    </button>
                    {activeTab === 'audio' && (
                        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Formato</label>
                                <select value={config.audio.formato} onChange={(e) => handleConfigChange('audio', 'formato', e.target.value)} disabled={isGenerating} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm">
                                    <option>Información detallada</option><option>Breve</option><option>Crítica</option><option>Debate</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Idioma</label>
                                <select value={config.audio.idioma} onChange={(e) => handleConfigChange('audio', 'idioma', e.target.value)} disabled={isGenerating} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm">
                                    <option>Español</option><option>Inglés</option><option>Francés</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Duración</label>
                                <select value={config.audio.duracion} onChange={(e) => handleConfigChange('audio', 'duracion', e.target.value)} disabled={isGenerating} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm">
                                    <option>Predeterminada</option><option>Corto</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Foco / Prompt</label>
                                <textarea value={config.audio.foco} onChange={(e) => handleConfigChange('audio', 'foco', e.target.value)} disabled={isGenerating} rows={3} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm" placeholder="Opcional: enfoque específico para el audio" />
                            </div>
                        </div>
                    )}
                </div>

                {/* Video Card */}
                <div className={`bg-white rounded-xl border-2 transition-all ${activeTab === 'video' ? 'border-foresvi-blue shadow-lg' : 'border-gray-200'} ${isGenerating ? 'opacity-60 pointer-events-none' : ''}`}>
                    <button onClick={() => setActiveTab('video')} className="w-full p-4 flex items-center gap-3 text-left">
                        <span className="text-2xl">🎬</span>
                        <div className="flex-1"><h4 className="font-semibold text-gray-900">Video</h4><p className="text-xs text-gray-500">{config.video.idioma} · {config.video.formato}</p></div>
                        {activeTab === 'video' && <span className="text-foresvi-blue">▼</span>}
                    </button>
                    {activeTab === 'video' && (
                        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Formato</label>
                                <select value={config.video.formato} onChange={(e) => handleConfigChange('video', 'formato', e.target.value)} disabled={isGenerating} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm">
                                    <option>Vídeo explicativo</option><option>Breve</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Idioma</label>
                                <select value={config.video.idioma} onChange={(e) => handleConfigChange('video', 'idioma', e.target.value)} disabled={isGenerating} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm">
                                    <option>Español</option><option>Inglés</option><option>Francés</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Foco / Prompt</label>
                                <textarea value={config.video.foco} onChange={(e) => handleConfigChange('video', 'foco', e.target.value)} disabled={isGenerating} rows={3} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm" placeholder="Opcional: enfoque específico para el video" />
                            </div>
                        </div>
                    )}
                </div>

                {/* Infographic Card */}
                <div className={`bg-white rounded-xl border-2 transition-all ${activeTab === 'infografia' ? 'border-foresvi-blue shadow-lg' : 'border-gray-200'} ${isGenerating ? 'opacity-60 pointer-events-none' : ''}`}>
                    <button onClick={() => setActiveTab('infografia')} className="w-full p-4 flex items-center gap-3 text-left">
                        <span className="text-2xl">🧩</span>
                        <div className="flex-1"><h4 className="font-semibold text-gray-900">Infografía</h4><p className="text-xs text-gray-500">{config.infografia.idioma} · {config.infografia.orientacion}</p></div>
                        {activeTab === 'infografia' && <span className="text-foresvi-blue">▼</span>}
                    </button>
                    {activeTab === 'infografia' && (
                        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Idioma</label>
                                <select value={config.infografia.idioma} onChange={(e) => handleConfigChange('infografia', 'idioma', e.target.value)} disabled={isGenerating} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm">
                                    <option>Español</option><option>Inglés</option><option>Francés</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Orientación</label>
                                <select value={config.infografia.orientacion} onChange={(e) => handleConfigChange('infografia', 'orientacion', e.target.value)} disabled={isGenerating} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm">
                                    <option>Cuadrado</option><option>Vertical</option><option>Horizontal</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nivel de Detalle</label>
                                <select value={config.infografia.nivel_detalle} onChange={(e) => handleConfigChange('infografia', 'nivel_detalle', e.target.value)} disabled={isGenerating} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm">
                                    <option>Conciso</option><option>Estándar</option><option>Detallado</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Descripción / Prompt</label>
                                <textarea value={config.infografia.descripcion} onChange={(e) => handleConfigChange('infografia', 'descripcion', e.target.value)} disabled={isGenerating} rows={3} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm" placeholder="Opcional: enfoque específico para la infografía" />
                            </div>
                        </div>
                    )}
                </div>

                {/* Report Card */}
                <div className={`bg-white rounded-xl border-2 transition-all ${activeTab === 'informe' ? 'border-foresvi-blue shadow-lg' : 'border-gray-200'} ${isGenerating ? 'opacity-60 pointer-events-none' : ''}`}>
                    <button onClick={() => setActiveTab('informe')} className="w-full p-4 flex items-center gap-3 text-left">
                        <span className="text-2xl">📄</span>
                        <div className="flex-1"><h4 className="font-semibold text-gray-900">Informe</h4><p className="text-xs text-gray-500">{config.informe?.idioma || 'Español'} · {config.informe?.tipo || 'Ejecutivo'}</p></div>
                        {activeTab === 'informe' && <span className="text-foresvi-blue">▼</span>}
                    </button>
                    {activeTab === 'informe' && (
                        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Formato</label>
                                <select value={config.informe?.tipo || 'Ejecutivo'} onChange={(e) => handleConfigChange('informe', 'tipo', e.target.value)} disabled={isGenerating} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm">
                                    <option value="Ejecutivo">Ejecutivo (Briefing Doc)</option>
                                    <option value="Estudio">Guía de Estudio (Study Guide)</option>
                                    <option value="Blog">Blog Post</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Idioma</label>
                                <select value={config.informe?.idioma || 'Español'} onChange={(e) => handleConfigChange('informe', 'idioma', e.target.value)} disabled={isGenerating} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm">
                                    <option>Español</option><option>Inglés</option><option>Francés</option><option>Alemán</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Foco / Prompt personalizado</label>
                                <textarea value={config.informe?.foco || ''} onChange={(e) => handleConfigChange('informe', 'foco', e.target.value)} disabled={isGenerating} rows={3} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm" placeholder="Opcional: si escribes aquí un prompt, se usará formato personalizado (Create Your Own)" />
                            </div>
                        </div>
                    )}
                </div>

                {/* Presentation Card */}
                <div className={`bg-white rounded-xl border-2 transition-all ${activeTab === 'presentacion' ? 'border-foresvi-blue shadow-lg' : 'border-gray-200'} ${isGenerating ? 'opacity-60 pointer-events-none' : ''}`}>
                    <button onClick={() => setActiveTab('presentacion')} className="w-full p-4 flex items-center gap-3 text-left">
                        <span className="text-2xl">📊</span>
                        <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">Presentación</h4>
                            <p className="text-xs text-gray-500">{config.presentacion?.idioma || 'Español'} · {config.presentacion?.formato || 'Presentación detallada'} · {config.presentacion?.duracion || 'Corto'}</p>
                        </div>
                        {activeTab === 'presentacion' && <span className="text-foresvi-blue">▼</span>}
                    </button>
                    {activeTab === 'presentacion' && (
                        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Formato</label>
                                <select value={config.presentacion?.formato || 'Presentación detallada'} onChange={(e) => handleConfigChange('presentacion', 'formato', e.target.value)} disabled={isGenerating} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm">
                                    <option value="Presentación detallada">Presentación detallada (Detailed Deck)</option>
                                    <option value="Diapositivas del presentador">Diapositivas del presentador (Presenter Slides)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Idioma</label>
                                <select value={config.presentacion?.idioma || 'Español'} onChange={(e) => handleConfigChange('presentacion', 'idioma', e.target.value)} disabled={isGenerating} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm">
                                    <option>Español</option><option>Inglés</option><option>Francés</option><option>Alemán</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Duración</label>
                                <select value={config.presentacion?.duracion || 'Corto'} onChange={(e) => handleConfigChange('presentacion', 'duracion', e.target.value)} disabled={isGenerating} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm">
                                    <option value="Corto">Corto (short)</option>
                                    <option value="Predeterminado">Predeterminado (default)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Foco / Prompt</label>
                                <textarea
                                    value={config.presentacion?.foco || ''}
                                    onChange={(e) => handleConfigChange('presentacion', 'foco', e.target.value)}
                                    disabled={isGenerating}
                                    rows={4}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm"
                                    placeholder="Crea una presentación que resuma las principales ideas del libro para que un dueño o gerente de una PYME pueda aplicar en su entorno laboral. Utiliza ejemplos prácticos e imágenes unidas a los ejemplos del libro..."
                                />
                                <p className="text-xs text-gray-400 mt-1">Si dejas vacío, se usará el prompt FORESVI por defecto</p>
                            </div>
                            <p className="text-xs text-foresvi-gray bg-blue-50 rounded-lg p-2 border border-blue-100">
                                📊 Generado por NotebookLM Studio (<code className="text-[10px]">slide_deck_create</code>) — descarga automática en PDF
                            </p>
                        </div>
                    )}
                </div>

                {isGenerating && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                        <p className="font-medium">⚠️ Configuración bloqueada</p>
                        <p className="text-amber-700 mt-1">No se puede modificar durante la generación</p>
                    </div>
                )}
            </div>

            {/* CENTER PANEL - Orchestration Status */}
            <div className="lg:col-span-2 space-y-6">
                <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl border border-gray-200 p-8 shadow-sm">
                    <h3 className="text-2xl font-bold text-gray-900 mb-6">Estado de Orquestación</h3>

                    {/* Progress Stepper */}
                    <div className="space-y-4 mb-8">
                        {orchestrationSteps.map((step, index) => (
                            <div key={step.id} className="flex items-start gap-4">
                                <div className="flex flex-col items-center">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-all ${step.status === 'completed' ? 'bg-green-500 text-white' :
                                        step.status === 'in_progress' ? 'bg-foresvi-blue text-white animate-pulse' :
                                            step.status === 'failed' ? 'bg-red-500 text-white' :
                                                'bg-gray-200 text-gray-400'
                                        }`}>
                                        {step.status === 'completed' ? '✓' :
                                            step.status === 'in_progress' ? '⏳' :
                                                step.status === 'failed' ? '✗' :
                                                    index + 1}
                                    </div>
                                    {index < orchestrationSteps.length - 1 && (
                                        <div className={`w-0.5 h-12 mt-2 ${step.status === 'completed' ? 'bg-green-500' :
                                            step.status === 'in_progress' ? 'bg-foresvi-blue' : 'bg-gray-200'
                                            }`} />
                                    )}
                                </div>
                                <div className="flex-1 pt-2">
                                    <p className={`font-medium ${step.status === 'completed' ? 'text-green-700' :
                                        step.status === 'in_progress' ? 'text-foresvi-blue' :
                                            step.status === 'failed' ? 'text-red-700' : 'text-gray-400'
                                        }`}>
                                        {step.label}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        {step.status === 'completed' ? 'Completado' :
                                            step.status === 'in_progress' ? 'En progreso...' :
                                                step.status === 'failed' ? 'Falló (opcional)' : 'Pendiente'}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Status Card */}
                    {isGenerating && (
                        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
                            <div className="inline-flex items-center justify-center w-16 h-16 bg-foresvi-blue/10 rounded-full mb-4">
                                <svg className="animate-spin h-8 w-8 text-foresvi-blue" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            </div>
                            <h4 className="text-lg font-semibold text-gray-900 mb-2">Generando contenidos</h4>
                            <div className="flex items-center justify-center gap-2 mb-3">
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-foresvi-blue/10 text-foresvi-blue">Audio</span>
                                <span className="text-gray-300">·</span>
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-foresvi-blue/10 text-foresvi-blue">Infografía</span>
                                <span className="text-gray-300">·</span>
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-foresvi-blue/10 text-foresvi-blue">Vídeo</span>
                            </div>
                            <p className="text-sm text-gray-500">Esto puede tardar entre 10–15 minutos</p>
                            {message && <p className="text-xs text-gray-400 mt-3 font-mono">{message}</p>}
                        </div>
                    )}

                    {/* ============================================ */}
                    {/* PDF/EPUB Upload Section */}
                    {/* ============================================ */}
                    {!isGenerating && (
                        <div className="bg-white rounded-xl border-2 border-dashed border-gray-200 p-4 transition-all hover:border-foresvi-blue/40"
                            style={dragOver ? { borderColor: '#003349', background: '#f0f7ff' } : {}}
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={async (e) => {
                                e.preventDefault();
                                setDragOver(false);
                                const files = Array.from(e.dataTransfer.files);
                                for (const file of files) {
                                    await handleFileUpload(file);
                                }
                            }}
                        >
                            <div className="text-center">
                                <div className="text-2xl mb-2">📎</div>
                                <p className="text-sm font-semibold text-gray-700">Añadir texto del libro (opcional)</p>
                                <p className="text-xs text-gray-400 mt-1">PDF, EPUB, TXT o DOCX — Se incluirá como fuente en NotebookLM</p>
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="mt-3 px-4 py-2 text-sm font-medium text-foresvi-blue bg-foresvi-blue/10 rounded-lg hover:bg-foresvi-blue/20 transition-colors"
                                >
                                    Seleccionar archivo
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf,.epub,.txt,.doc,.docx"
                                    style={{ display: 'none' }}
                                    onChange={async (e) => {
                                        if (e.target.files[0]) {
                                            await handleFileUpload(e.target.files[0]);
                                            e.target.value = '';
                                        }
                                    }}
                                />
                            </div>

                            {isUploading && (
                                <div className="mt-3 flex items-center justify-center gap-2 text-sm text-foresvi-blue">
                                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Subiendo archivo...
                                </div>
                            )}

                            {/* Uploaded Files List */}
                            {uploadedFiles && uploadedFiles.length > 0 && (
                                <div className="mt-3 space-y-2">
                                    {uploadedFiles.map((f, idx) => (
                                        <div key={idx} className="flex items-center gap-2 bg-green-50 rounded-lg p-2 border border-green-200">
                                            <span className="text-lg">
                                                {f.type === 'pdf' ? '📕' : f.type === 'epub' ? '📗' : f.type === 'txt' ? '📄' : '📘'}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-800 truncate">{f.name}</p>
                                                <p className="text-xs text-gray-400">{(f.size / 1024 / 1024).toFixed(1)} MB</p>
                                            </div>
                                            <button
                                                onClick={() => setUploadedFiles(prev => prev.filter((_, i) => i !== idx))}
                                                className="text-red-400 hover:text-red-600 text-sm"
                                                title="Eliminar"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Action Button */}
                    <button
                        onClick={onLaunch}
                        disabled={isGenerating}
                        className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transition-all transform ${isGenerating
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-gradient-to-r from-foresvi-blue to-foresvi-dark hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]'
                            }`}
                    >
                        {isGenerating ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                PROCESANDO...
                            </span>
                        ) : '🚀 LANZAR GENERACIÓN COMPLETA'}
                    </button>

                    {/* Technical Details */}
                    {notebookId && (
                        <details className="mt-6 bg-gray-50 rounded-lg border border-gray-200">
                            <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                                Detalles Técnicos
                            </summary>
                            <div className="px-4 pb-4 pt-2 space-y-2 text-xs">
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-600">Notebook ID:</span>
                                    <code className="bg-white px-2 py-1 rounded border border-gray-200 font-mono text-gray-800">{notebookId}</code>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-600">Estado:</span>
                                    <span className="font-medium text-gray-800">{status.replace('_', ' ')}</span>
                                </div>
                            </div>
                        </details>
                    )}

                    {status === 'error' && (
                        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
                            <p className="font-medium">❌ Error en la generación</p>
                            <p className="text-red-700 mt-1">Revisa la consola o intenta de nuevo</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GenerationConfigPanel;
