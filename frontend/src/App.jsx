// src/App.jsx
import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';

import Navbar from './components/Navbar.jsx';
import SessionIdleWatcher from './components/SessionIdleWatcher.jsx';
import Landing from './pages/Landing.jsx';
import Login from './components/Login.jsx';

import Register from './pages/Register.jsx';
import GuestRegister from './pages/GuestRegister.jsx';

import ConfirmRegister from './pages/ConfirmRegister.jsx';
import ConfirmGuest from './pages/ConfirmGuest.jsx';

import ProtectedRoute from './components/ProtectedRoute.jsx';
import DashboardSwitch from './pages/DashboardSwitch.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import GenerateQR from './pages/GenerateQR.jsx';
import GuardScan from './pages/GuardScan.jsx';
import AccessReport from './pages/AccessReport.jsx';
import ImportDB from './pages/ImportDB.jsx';
import GuestDashboard from './pages/dashboards/GuestDashboard.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import ChangePassword from './pages/ChangePassword';
import LastAccesses from './pages/LastAccesses.jsx';
import PerfilUsuario from './pages/PerfilUsuario'; // Add this import


function AppLayout() {
  const location = useLocation();
  const hideNavbarOn = ['/']; // Oculta el navbar solo en la landing
  const showNavbar = !hideNavbarOn.includes(location.pathname);

  return (
    <>
      {showNavbar && <Navbar />}
      {/* Escucha inactividad global sin mostrar UI */}
      <SessionIdleWatcher />

      <div className="container mt-4">
        <Routes>
          {/* Públicas */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/guest/register" element={<GuestRegister />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/guest/dashboard" element={<GuestDashboard />} />
          <Route path="/register/confirm" element={<ConfirmRegister />} />
          <Route path="/confirm-guest" element={<ConfirmGuest />} />
          

          {/* Protegidas */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardSwitch />
              </ProtectedRoute>
            }
          />

          <Route
            path="/mi-perfil"
            element={
              <ProtectedRoute>
                <PerfilUsuario />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/users"
            element={
              <ProtectedRoute roles={['ADMIN']}>
                <AdminUsers />
              </ProtectedRoute>
            }
          />

          <Route
            path="/qr"
            element={
              <ProtectedRoute>
                <GenerateQR />
              </ProtectedRoute>
            }
          />

          <Route
            path="/guard-scan"
            element={
              <ProtectedRoute>
                <GuardScan />
              </ProtectedRoute>
            }
          />

          <Route
            path="/access-report"
            element={
              <ProtectedRoute roles={['ADMIN']}>
                <AccessReport />
              </ProtectedRoute>
            }
          />

          <Route
            path="/last-accesses"
            element={
              <ProtectedRoute roles={['ADMIN', 'GUARD']}>
                <LastAccesses />
              </ProtectedRoute>
            }
          />

          <Route
            path="/change-password"
            element={
              <ProtectedRoute>
                <ChangePassword />
              </ProtectedRoute>
            }
          />

          <Route
            path="/import-db"
            element={
              <ProtectedRoute roles={['ADMIN']}>
                <ImportDB />
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>
    </>
  );
}

export default function App() {
  return <AppLayout />;
}

// frontend/src/components/ProtectedRoute.jsx
import { Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function ProtectedRoute({ children, roles }) {
  const [loading, setLoading] = useState(true);
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    async function validateSession() {
      try {
        // Llamar al backend para verificar que la sesión es válida
        const { data } = await api.get('/auth/me');
        
        // Actualizar localStorage con datos frescos del servidor
        localStorage.setItem('user', JSON.stringify(data.user));
        
        // Validar roles si es requerido
        if (roles && roles.length > 0) {
          if (!roles.includes(data.user.role)) {
            console.warn(`Roles permitidos: ${roles.join(', ')}, rol actual: ${data.user.role}`);
            setIsValid(false);
            return;
          }
        }
        
        setIsValid(true);
      } catch (error) {
        console.error('Error validando sesión:', error);
        // Si falla (usuario eliminado, sesión expirada, etc.), limpiar
        localStorage.removeItem('user');
        setIsValid(false);
      } finally {
        setLoading(false);
      }
    }

    validateSession();
  }, [roles]);

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Validando sesión...</span>
        </div>
      </div>
    );
  }

  if (!isValid) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
