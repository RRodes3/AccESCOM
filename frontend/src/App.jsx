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
import PerfilUsuario from './pages/PerfilUsuario';


function AppLayout() {
  const location = useLocation();
  const hideNavbarOn = ['/'];
  const showNavbar = !hideNavbarOn.includes(location.pathname);

  return (
    <>
      {showNavbar && <Navbar />}
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
