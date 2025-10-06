// src/App.jsx
import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';

import Navbar from './components/Navbar.jsx';
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
import GuestDashboard from './pages/dashboards/GuestDashboard.jsx';


function AppLayout() {
  const location = useLocation();
  const hideNavbarOn = ['/']; // Oculta el navbar solo en la landing
  const showNavbar = !hideNavbarOn.includes(location.pathname);

  return (
    <>
      {showNavbar && <Navbar />}
      <div className="container mt-4">
        <Routes>
          {/* Públicas */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/guest/register" element={<GuestRegister />} />
          <Route path="/guest/dashboard" element={<GuestDashboard />} />
          <Route path="/register/confirm" element={<ConfirmRegister />} />
          <Route path="/guest/confirm" element={<ConfirmGuest />} />

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
        </Routes>
      </div>
    </>
  );
}

export default function App() {
  // ❌ Nada de <BrowserRouter> aquí
  return <AppLayout />;
}
