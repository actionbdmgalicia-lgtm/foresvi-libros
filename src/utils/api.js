// ─────────────────────────────────────────────────────────────────────────────
// Configuración del backend en CALIENTE (sin reconstruir/redeploy).
//
// La URL del backend y el token de seguridad se leen de localStorage, con
// fallback a las variables de entorno de build. Esto permite cambiar la URL del
// túnel (cloudflared/ngrok) desde la pantalla de Ajustes sin volver a desplegar.
//
// - foresvi_api_base  → URL del backend (ej: https://algo.trycloudflare.com)
// - foresvi_api_token → token secreto que exige el backend (opcional)
// ─────────────────────────────────────────────────────────────────────────────

const LS_BASE = 'foresvi_api_base';
const LS_TOKEN = 'foresvi_api_token';

/** URL base del backend, sin barra final. '' = mismo origen (dev local con proxy Vite). */
export function getApiBase() {
    let v = '';
    try {
        v = (localStorage.getItem(LS_BASE) || import.meta.env.VITE_API_BASE_URL || '').trim();
    } catch {
        v = (import.meta.env.VITE_API_BASE_URL || '').trim();
    }
    return v.replace(/\/+$/, ''); // quitar barra(s) final(es)
}

/** Token secreto para autenticar contra el backend expuesto. '' = sin token. */
export function getApiToken() {
    try {
        return (localStorage.getItem(LS_TOKEN) || '').trim();
    } catch {
        return '';
    }
}

/** Guarda la configuración (usado por la pantalla de Ajustes). */
export function setApiConfig({ base, token } = {}) {
    try {
        if (base != null) localStorage.setItem(LS_BASE, String(base).trim());
        if (token != null) localStorage.setItem(LS_TOKEN, String(token).trim());
    } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Interceptor de fetch: añade el header del token SOLO a las peticiones dirigidas
// al backend remoto configurado. No toca:
//   - llamadas en modo local (base === '')
//   - llamadas a otros dominios (Firebase, Google APIs, OpenAI, YouTube...)
// Se instala una sola vez al importar este módulo.
// ─────────────────────────────────────────────────────────────────────────────
function installFetchInterceptor() {
    if (typeof window === 'undefined' || !window.fetch) return;
    if (window.__foresviFetchPatched) return;
    window.__foresviFetchPatched = true;

    const nativeFetch = window.fetch.bind(window);

    window.fetch = (input, init = {}) => {
        try {
            const base = getApiBase();
            const token = getApiToken();

            // Solo actuamos si hay backend remoto (http/https) y token configurado
            if (base && /^https?:\/\//i.test(base) && token) {
                const url = typeof input === 'string' ? input : (input && input.url) || '';
                if (url && url.startsWith(base)) {
                    const headers = new Headers((init && init.headers) || (typeof input !== 'string' && input.headers) || {});
                    if (!headers.has('x-foresvi-token')) headers.set('x-foresvi-token', token);
                    return nativeFetch(input, { ...init, headers });
                }
            }
        } catch { /* si algo falla, seguimos con fetch normal */ }
        return nativeFetch(input, init);
    };
}

installFetchInterceptor();
