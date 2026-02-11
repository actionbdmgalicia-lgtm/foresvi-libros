import React, { useEffect } from 'react';
// Version: 2.0.0 - 2026-01-31 07:45 - RBAC & NotebookLM Integration
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import BookDetail from './pages/BookDetail';
import AdminDashboard from './pages/AdminDashboard';
import Login from './pages/Login';

const ScrollToTop = () => { const { pathname } = useLocation(); useEffect(() => { window.scrollTo(0, 0); }, [pathname]); return null; };

const PrivateRoute = ({ children, requiredRole }) => {
  const { user, loading } = useAuth();
  if (loading) return <div>Cargando...</div>;
  if (!user) return <Navigate to="/login" />;
  if (requiredRole && user.role !== requiredRole && user.role !== 'admin') {
    // If user tries to access admin, redirect to home
    return <Navigate to="/" />;
  }
  return children;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <ScrollToTop />
        <Navbar />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<PrivateRoute><Home /></PrivateRoute>} />
          <Route path="/libro/:id" element={<PrivateRoute><BookDetail /></PrivateRoute>} />
          <Route path="/admin" element={<PrivateRoute requiredRole="admin"><AdminDashboard /></PrivateRoute>} />
        </Routes>
        <Footer />
      </Router>
    </AuthProvider>
  );
}

export default App;
