import { useState, useEffect } from 'react';

/**
 * Devuelve true cuando el viewport es menor o igual que `breakpoint` (px).
 * Por defecto 768px (tablet/móvil). Usa 480px para diferenciar móvil estrecho.
 *
 * Uso:
 *   const isMobile = useIsMobile();        // <= 768px
 *   const isPhone  = useIsMobile(480);     // <= 480px
 */
export default function useIsMobile(breakpoint = 768) {
    const query = `(max-width: ${breakpoint}px)`;

    const getMatch = () =>
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia(query).matches
            : false;

    const [isMobile, setIsMobile] = useState(getMatch);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

        const mql = window.matchMedia(query);
        const handler = (e) => setIsMobile(e.matches);

        // Sincroniza por si el breakpoint cambió entre renders
        setIsMobile(mql.matches);

        // addEventListener es el API moderno; addListener es el fallback antiguo (Safari viejo)
        if (mql.addEventListener) {
            mql.addEventListener('change', handler);
            return () => mql.removeEventListener('change', handler);
        } else {
            mql.addListener(handler);
            return () => mql.removeListener(handler);
        }
    }, [query]);

    return isMobile;
}
