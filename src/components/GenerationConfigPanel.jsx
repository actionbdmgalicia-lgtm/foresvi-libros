import React, { useState } from 'react';

const GenerationConfigPanel = ({ config, setConfig, onLaunch, status, notebookId, message, artifactsStatus }) => {
    const [activeTab, setActiveTab] = useState('audio');

    const handleConfigChange = (type, field, value) => {
        setConfig(prev => ({
            ...prev,
            [type]: {
                ...prev[type],
                [field]: value
            }
        }));
    };

    const isGenerating = status !== 'idle' && status !== 'error' && status !== 'completed';

    // Mapeo de estados a etapas visuales
    const orchestrationSteps = [
        { id: 'notebook', label: 'Creación del Notebook', status: ['initializing', 'generating_audio', 'generating_infographic', 'generating_video', 'generating_report', 'waiting_artifacts', 'ready_for_download', 'processing_youtube', 'completed'].includes(status) ? 'completed' : 'pending' },
        { id: 'sources', label: 'Indexación de fuentes', status: ['generating_audio', 'generating_infographic', 'generating_video', 'generating_report', 'waiting_artifacts', 'ready_for_download', 'processing_youtube', 'completed'].includes(status) ? 'completed' : 'pending' },
        { id: 'audio', label: 'Generación de audio', status: artifactsStatus?.audio === 'completed' ? 'completed' : (artifactsStatus?.audio === 'in_progress' || artifactsStatus?.audio === 'queued') ? 'in_progress' : 'pending' },
        { id: 'infographic', label: 'Generación de infografía', status: artifactsStatus?.infographic === 'completed' ? 'completed' : (artifactsStatus?.infographic === 'in_progress' || artifactsStatus?.infographic === 'queued') ? 'in_progress' : 'pending' },
        { id: 'report', label: 'Generación de informe', status: artifactsStatus?.report === 'completed' ? 'completed' : (artifactsStatus?.report === 'in_progress' || artifactsStatus?.report === 'queued') ? 'in_progress' : 'pending' },
        { id: 'video', label: 'Generación de vídeo', status: artifactsStatus?.video === 'completed' ? 'completed' : (artifactsStatus?.video === 'in_progress' || artifactsStatus?.video === 'queued') ? 'in_progress' : artifactsStatus?.video === 'failed' ? 'failed' : 'pending' },
        { id: 'drive', label: 'Sincronización Cloud', status: status === 'completed' || status === 'drive_synced' ? 'completed' : status === 'processing_drive' ? 'in_progress' : 'pending' },
    ];

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
                                <select
                                    value={config.audio.formato}
                                    onChange={(e) => handleConfigChange('audio', 'formato', e.target.value)}
                                    disabled={isGenerating}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm"
                                >
                                    <option>Información detallada</option>
                                    <option>Breve</option>
                                    <option>Crítica</option>
                                    <option>Debate</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Idioma</label>
                                <select
                                    value={config.audio.idioma}
                                    onChange={(e) => handleConfigChange('audio', 'idioma', e.target.value)}
                                    disabled={isGenerating}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm"
                                >
                                    <option>Español</option>
                                    <option>Inglés</option>
                                    <option>Francés</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Duración</label>
                                <select
                                    value={config.audio.duracion}
                                    onChange={(e) => handleConfigChange('audio', 'duracion', e.target.value)}
                                    disabled={isGenerating}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm"
                                >
                                    <option>Predeterminada</option>
                                    <option>Corto</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Foco / Prompt</label>
                                <textarea
                                    value={config.audio.foco}
                                    onChange={(e) => handleConfigChange('audio', 'foco', e.target.value)}
                                    disabled={isGenerating}
                                    rows={3}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm"
                                    placeholder="Opcional: enfoque específico para el audio"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Video Card */}
                <div className={`bg-white rounded-xl border-2 transition-all ${activeTab === 'video' ? 'border-foresvi-blue shadow-lg' : 'border-gray-200'} ${isGenerating ? 'opacity-60 pointer-events-none' : ''}`}>
                    <button
                        onClick={() => setActiveTab('video')}
                        className="w-full p-4 flex items-center gap-3 text-left"
                    >
                        <span className="text-2xl">🎬</span>
                        <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">Video</h4>
                            <p className="text-xs text-gray-500">{config.video.idioma} · {config.video.formato}</p>
                        </div>
                        {activeTab === 'video' && <span className="text-foresvi-blue">▼</span>}
                    </button>
                    {activeTab === 'video' && (
                        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Formato</label>
                                <select
                                    value={config.video.formato}
                                    onChange={(e) => handleConfigChange('video', 'formato', e.target.value)}
                                    disabled={isGenerating}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm"
                                >
                                    <option>Vídeo explicativo</option>
                                    <option>Breve</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Idioma</label>
                                <select
                                    value={config.video.idioma}
                                    onChange={(e) => handleConfigChange('video', 'idioma', e.target.value)}
                                    disabled={isGenerating}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm"
                                >
                                    <option>Español</option>
                                    <option>Inglés</option>
                                    <option>Francés</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Foco / Prompt</label>
                                <textarea
                                    value={config.video.foco}
                                    onChange={(e) => handleConfigChange('video', 'foco', e.target.value)}
                                    disabled={isGenerating}
                                    rows={3}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm"
                                    placeholder="Opcional: enfoque específico para el video"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Infographic Card */}
                <div className={`bg-white rounded-xl border-2 transition-all ${activeTab === 'infografia' ? 'border-foresvi-blue shadow-lg' : 'border-gray-200'} ${isGenerating ? 'opacity-60 pointer-events-none' : ''}`}>
                    <button
                        onClick={() => setActiveTab('infografia')}
                        className="w-full p-4 flex items-center gap-3 text-left"
                    >
                        <span className="text-2xl">🧩</span>
                        <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">Infografía</h4>
                            <p className="text-xs text-gray-500">{config.infografia.idioma} · {config.infografia.orientacion}</p>
                        </div>
                        {activeTab === 'infografia' && <span className="text-foresvi-blue">▼</span>}
                    </button>
                    {activeTab === 'infografia' && (
                        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Idioma</label>
                                <select
                                    value={config.infografia.idioma}
                                    onChange={(e) => handleConfigChange('infografia', 'idioma', e.target.value)}
                                    disabled={isGenerating}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm"
                                >
                                    <option>Español</option>
                                    <option>Inglés</option>
                                    <option>Francés</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Orientación</label>
                                <select
                                    value={config.infografia.orientacion}
                                    onChange={(e) => handleConfigChange('infografia', 'orientacion', e.target.value)}
                                    disabled={isGenerating}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm"
                                >
                                    <option>Cuadrado</option>
                                    <option>Vertical</option>
                                    <option>Horizontal</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nivel de Detalle</label>
                                <select
                                    value={config.infografia.nivel_detalle}
                                    onChange={(e) => handleConfigChange('infografia', 'nivel_detalle', e.target.value)}
                                    disabled={isGenerating}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm"
                                >
                                    <option>Conciso</option>
                                    <option>Estándar</option>
                                    <option>Detallado</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Descripción / Prompt</label>
                                <textarea
                                    value={config.infografia.descripcion}
                                    onChange={(e) => handleConfigChange('infografia', 'descripcion', e.target.value)}
                                    disabled={isGenerating}
                                    rows={3}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm"
                                    placeholder="Opcional: enfoque específico para la infografía"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Report Card */}
                <div className={`bg-white rounded-xl border-2 transition-all ${activeTab === 'informe' ? 'border-foresvi-blue shadow-lg' : 'border-gray-200'} ${isGenerating ? 'opacity-60 pointer-events-none' : ''}`}>
                    <button
                        onClick={() => setActiveTab('informe')}
                        className="w-full p-4 flex items-center gap-3 text-left"
                    >
                        <span className="text-2xl">📄</span>
                        <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">Informe</h4>
                            <p className="text-xs text-gray-500">{config.informe?.idioma || 'Español'} · {config.informe?.tipo || 'Ejecutivo'}</p>
                        </div>
                        {activeTab === 'informe' && <span className="text-foresvi-blue">▼</span>}
                    </button>
                    {activeTab === 'informe' && (
                        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo</label>
                                <select
                                    value={config.informe?.tipo || 'Ejecutivo'}
                                    onChange={(e) => handleConfigChange('informe', 'tipo', e.target.value)}
                                    disabled={isGenerating}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm"
                                >
                                    <option>Ejecutivo</option>
                                    <option>Detallado</option>
                                    <option>Bullet Points</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Idioma</label>
                                <select
                                    value={config.informe?.idioma || 'Español'}
                                    onChange={(e) => handleConfigChange('informe', 'idioma', e.target.value)}
                                    disabled={isGenerating}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm"
                                >
                                    <option>Español</option>
                                    <option>Inglés</option>
                                    <option>Francés</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Foco / Prompt</label>
                                <textarea
                                    value={config.informe?.foco || ''}
                                    onChange={(e) => handleConfigChange('informe', 'foco', e.target.value)}
                                    disabled={isGenerating}
                                    rows={3}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-foresvi-blue focus:ring-foresvi-blue text-sm"
                                    placeholder="Opcional: enfoque específico para el informe"
                                />
                            </div>
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
                                {/* Icon */}
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
                                            step.status === 'in_progress' ? 'bg-foresvi-blue' :
                                                'bg-gray-200'
                                            }`} />
                                    )}
                                </div>
                                {/* Label */}
                                <div className="flex-1 pt-2">
                                    <p className={`font-medium ${step.status === 'completed' ? 'text-green-700' :
                                        step.status === 'in_progress' ? 'text-foresvi-blue' :
                                            step.status === 'failed' ? 'text-red-700' :
                                                'text-gray-400'
                                        }`}>
                                        {step.label}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        {step.status === 'completed' ? 'Completado' :
                                            step.status === 'in_progress' ? 'En progreso...' :
                                                step.status === 'failed' ? 'Falló (opcional)' :
                                                    'Pendiente'}
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
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-foresvi-blue/10 text-foresvi-blue">
                                    Audio
                                </span>
                                <span className="text-gray-300">·</span>
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-foresvi-blue/10 text-foresvi-blue">
                                    Infografía
                                </span>
                                <span className="text-gray-300">·</span>
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-foresvi-blue/10 text-foresvi-blue">
                                    Vídeo
                                </span>
                            </div>
                            <p className="text-sm text-gray-500">Esto puede tardar entre 10–15 minutos</p>
                            {message && (
                                <p className="text-xs text-gray-400 mt-3 font-mono">{message}</p>
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

                    {/* Technical Details (Collapsible) */}
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
