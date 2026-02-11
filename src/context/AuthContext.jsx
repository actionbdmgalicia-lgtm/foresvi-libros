import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check local storage for persisted session
        const storedUser = localStorage.getItem('foresvi_user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
        setLoading(false);
    }, []);

    const login = (username, password) => {
        // Simple Hardcoded Auth for Prototype
        // Admin Access
        if (username === 'juanrepresa@foresvi.com' && password === 'admin') {
            const u = { username: 'Juan Represa', email: username, role: 'admin' };
            setUser(u);
            localStorage.setItem('foresvi_user', JSON.stringify(u));
            return true;
        }

        // Legacy Admin fallback (optional, removing for strictness as requested)
        // if (username === 'admin' && password === 'foresvi_admin') ...

        // User Access
        if (password === 'foresvi2026') {
            const u = { username, role: 'user' };
            setUser(u);
            localStorage.setItem('foresvi_user', JSON.stringify(u));
            return true;
        }

        return false;
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('foresvi_user');
    };

    const value = {
        user,
        login,
        logout,
        loading
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
