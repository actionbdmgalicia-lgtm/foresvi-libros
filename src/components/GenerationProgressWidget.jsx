import React, { useState, useEffect, useRef } from 'react';

// ── Pasos del flujo de orquestación con tiempos estimados ────────────────────
const STEPS = [
    { status: 'initializing',            label: 'Creando Notebook',          icon: '🧠', secs: 25  },
    { status: 'generating_audio',        label: 'Indexando fuentes',          icon: '📚', secs: 35  },
    { status: 'generating_infographic',  label: 'Generando Audio',            icon: '🎧', secs: 480 },
    { status: 'generating_report',       label: 'Generando Infografía',       icon: '🧩', secs: 300 },
    { status: 'generating_presentation', label: 'Creando Presentación PPTX',  icon: '📊', secs: 90  },
    { status: 'generating_video',        label: 'Generando Vídeo',            icon: '🎬', secs: 600 },
    { status: 'waiting_artifacts',       label: 'Verificando artefactos',     icon: '⏳', secs: 60  },
    { status: 'processing_drive',        label: 'Descargando a Drive',        icon: '☁️', secs: 45  },
    { status: 'completed',               label: '¡Completado!',               icon: '✅', secs: 0   },
];

const TOTAL_SECS = STEPS.reduce((a, s) => a + s.secs, 0);

const getStepIndex = (status) => {
    if (status === 'drive_synced') return 8;
    const idx = STEPS.findIndex(s => s.status === status);
    return idx >= 0 ? idx : 0;
};

const fmt = (secs) => {
    if (secs <= 0) return 'Finalizando...';
    const m = Math.floor(secs / 60);
    const s = Math.round(secs % 60);
    return m > 0 ? `~${m} min ${s > 0 ? s + 's' : ''}` : `~${s}s`;
};

// ── Estilos compartidos ───────────────────────────────────────────────────────
const S = {
    NAVY:  '#003349',
    RED:   '#E25454',
    GREEN: '#22c55e',
    GRAY:  '#717B8D',
    LIGHT: '#f8fafc',
    BORDER:'#e2e8f0',
};

// ─────────────────────────────────────────────────────────────────────────────
export default function GenerationProgressWidget({ status, message, title, onClose, onReopen }) {
    const [collapsed, setCollapsed]   = useState(false);
    const [progress, setProgress]     = useState(0);
    const [stepStart, setStepStart]   = useState(Date.now());
    const prevStatus = useRef(status);
    const timerRef   = useRef(null);

    // Resetear el temporizador interno cuando cambia el paso real
    useEffect(() => {
        if (status !== prevStatus.current) {
            setStepStart(Date.now());
            prevStatus.current = status;
        }
    }, [status]);

    // Ticker de progreso suave (cada 800 ms)
    useEffect(() => {
        clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            const idx = getStepIndex(status);
            if (idx >= 8) { setProgress(100); return; }
            const secsElapsed  = (Date.now() - stepStart) / 1000;
            const step         = STEPS[idx];
            const completedSec = STEPS.slice(0, idx).reduce((a, s) => a + s.secs, 0);
            const frac         = step.secs > 0 ? Math.min(secsElapsed / step.secs, 0.93) : 0;
            setProgress(Math.min(((completedSec + frac * step.secs) / TOTAL_SECS) * 100, 97));
        }, 800);
        return () => clearInterval(timerRef.current);
    }, [status, stepStart]);

    const idx         = getStepIndex(status);
    const isCompleted = idx >= 8;
    const isError     = status === 'error';
    const curStep     = STEPS[Math.min(idx, 8)];
    const pct         = isCompleted ? 100 : progress;
    const remaining   = Math.max(0, TOTAL_SECS * (1 - pct / 100));

    // ── Vista de error ────────────────────────────────────────────────────────
    if (isError) {
        return (
            <div style={wrapStyle({ border: `2px solid ${S.RED}`, background: '#fff1f1' })}>
                <span style={{ fontSize: 20 }}>❌</span>
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: S.RED, fontSize: 13 }}>Error en la generación</div>
                    <div style={{ fontSize: 11, color: S.GRAY }}>{message || 'Revisa los logs del servidor'}</div>
                </div>
                <CloseBtn onClick={onClose} />
            </div>
        );
    }

    // ── Vista colapsada (píldora) ─────────────────────────────────────────────
    if (collapsed) {
        return (
            <div
                onClick={() => setCollapsed(false)}
                style={{
                    position: 'fixed', bottom: 24, right: 12, zIndex: 9999,
                    background: S.NAVY, color: 'white',
                    borderRadius: 50, padding: '10px 18px',
                    display: 'flex', alignItems: 'center', gap: 12,
                    boxShadow: '0 4px 28px rgba(0,51,73,0.45)',
                    cursor: 'pointer', minWidth: 0, maxWidth: 'min(380px, calc(100vw - 24px))',
                    border: '2px solid rgba(255,255,255,0.08)',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    userSelect: 'none',
                }}
            >
                <span style={{ fontSize: 18 }}>{curStep.icon}</span>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: 10, opacity: 0.55, letterSpacing: '0.06em', marginBottom: 1 }}>
                        FORESVI · {isCompleted ? 'COMPLETADO' : 'GENERANDO'}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 170 }}>
                        {curStep.label}{!isCompleted ? '...' : ''}
                    </div>
                    {/* Mini barra */}
                    <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 4, height: 3, marginTop: 5, overflow: 'hidden' }}>
                        <div style={{ background: isCompleted ? S.GREEN : S.RED, width: `${pct}%`, height: '100%', borderRadius: 4, transition: 'width 1.2s ease' }} />
                    </div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: isCompleted ? S.GREEN : S.RED, minWidth: 34, textAlign: 'right' }}>
                    {Math.round(pct)}%
                </span>
                <span style={{ opacity: 0.5, fontSize: 11 }}>▲</span>
            </div>
        );
    }

    // ── Vista expandida ───────────────────────────────────────────────────────
    return (
        <div style={{
            position: 'fixed', bottom: 24, right: 12, zIndex: 9999,
            background: 'white', borderRadius: 16, width: 'min(370px, calc(100vw - 24px))',
            boxShadow: '0 8px 48px rgba(0,51,73,0.22)',
            border: `1px solid ${S.BORDER}`, overflow: 'hidden',
            fontFamily: 'Inter, system-ui, sans-serif',
        }}>
            {/* ── Header ── */}
            <div style={{ background: S.NAVY, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src="/foresvi-logo.png" alt="FORESVI" style={{ height: 24, filter: 'brightness(0) invert(1)', flexShrink: 0 }} />
                <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em' }}>
                        {isCompleted ? 'GENERACIÓN COMPLETADA' : 'GENERANDO CONTENIDO · IA'}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 210 }}>
                        {title || 'Procesando...'}
                    </div>
                </div>
                <button
                    onClick={() => setCollapsed(true)}
                    title="Minimizar"
                    style={iconBtn}
                >−</button>
                {isCompleted && <CloseBtn onClick={onClose} />}
            </div>

            {/* ── Franja roja de acento ── */}
            <div style={{ height: 3, background: `linear-gradient(90deg, ${S.RED}, ${S.NAVY})` }} />

            {/* ── Lista de pasos ── */}
            <div style={{ padding: '10px 14px 4px', maxHeight: 268, overflowY: 'auto' }}>
                {STEPS.slice(0, 8).map((step, i) => {
                    const isDone   = i < idx || isCompleted;
                    const isActive = i === idx && !isCompleted;
                    const isPend   = i > idx && !isCompleted;
                    return (
                        <div key={step.status} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '5px 0', opacity: isPend ? 0.32 : 1 }}>
                            {/* Icono de estado */}
                            <div style={{
                                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                background: isDone ? S.GREEN : isActive ? S.NAVY : S.BORDER,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: isDone ? 13 : 14,
                                color: isDone || isActive ? 'white' : '#94a3b8',
                                boxShadow: isActive ? `0 0 0 3px rgba(0,51,73,0.18)` : 'none',
                                transition: 'all 0.4s',
                                marginTop: 1,
                            }}>
                                {isDone ? '✓' : step.icon}
                            </div>

                            {/* Texto */}
                            <div style={{ flex: 1, paddingTop: 2 }}>
                                <div style={{
                                    fontSize: 12.5, fontWeight: isActive ? 700 : isDone ? 500 : 400,
                                    color: isDone ? '#16a34a' : isActive ? S.NAVY : '#94a3b8',
                                    lineHeight: 1.3,
                                }}>
                                    {step.label}
                                </div>
                                {isActive && message && (
                                    <div style={{ fontSize: 10.5, color: S.GRAY, marginTop: 2, lineHeight: 1.4 }}>
                                        {message}
                                    </div>
                                )}
                                {isActive && !message && (
                                    <div style={{ fontSize: 10.5, color: S.GRAY, marginTop: 2 }}>
                                        En proceso...
                                    </div>
                                )}
                            </div>

                            {/* Spinner activo */}
                            {isActive && (
                                <div style={{
                                    width: 15, height: 15, borderRadius: '50%',
                                    border: `2.5px solid ${S.NAVY}`, borderTopColor: 'transparent',
                                    animation: 'foresviSpin 0.75s linear infinite',
                                    flexShrink: 0, marginTop: 6,
                                }} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ── Footer con barra de progreso ── */}
            <div style={{ padding: '10px 14px 14px', borderTop: `1px solid ${S.BORDER}`, background: S.LIGHT }}>
                {/* Barra de progreso total */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: S.GRAY, fontWeight: 500 }}>Progreso estimado</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: S.NAVY }}>{Math.round(pct)}%</span>
                </div>
                <div style={{ background: S.BORDER, borderRadius: 6, height: 7, overflow: 'hidden' }}>
                    <div style={{
                        background: isCompleted ? S.GREEN : `linear-gradient(90deg, ${S.NAVY}, ${S.RED})`,
                        width: `${pct}%`, height: '100%', borderRadius: 6,
                        transition: 'width 1.2s ease',
                    }} />
                </div>

                {/* Tiempo restante */}
                {!isCompleted && (
                    <div style={{ fontSize: 10.5, color: S.GRAY, marginTop: 5, textAlign: 'right' }}>
                        ⏱ {fmt(remaining)} restantes
                    </div>
                )}
                {isCompleted && (
                    <div style={{ fontSize: 12, color: '#16a34a', marginTop: 6, fontWeight: 600, textAlign: 'center' }}>
                        ✅ Contenidos descargados a Google Drive
                    </div>
                )}

                {/* Botón ver detalles */}
                <button
                    onClick={onReopen}
                    style={{
                        marginTop: 10, width: '100%', padding: '8px 0',
                        background: S.NAVY, color: 'white',
                        border: 'none', borderRadius: 8,
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#001f2e'}
                    onMouseLeave={e => e.currentTarget.style.background = S.NAVY}
                >
                    🔍 Ver detalles completos
                </button>
            </div>
        </div>
    );
}

// ── Helpers de estilo ─────────────────────────────────────────────────────────
function wrapStyle(extra = {}) {
    return {
        position: 'fixed', bottom: 24, right: 12, zIndex: 9999,
        background: 'white', borderRadius: 12,
        padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center',
        boxShadow: '0 4px 20px rgba(0,51,73,0.2)',
        minWidth: 0, maxWidth: 'calc(100vw - 24px)',
        fontFamily: 'Inter, system-ui, sans-serif',
        ...extra,
    };
}

const iconBtn = {
    background: 'rgba(255,255,255,0.12)',
    border: 'none', color: 'rgba(255,255,255,0.7)',
    cursor: 'pointer', borderRadius: 6,
    width: 26, height: 26, fontSize: 15,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
};

function CloseBtn({ onClick }) {
    return (
        <button onClick={onClick} style={iconBtn} title="Cerrar">×</button>
    );
}
