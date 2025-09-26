import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Suspense } from 'react';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Landing from './pages/Landing';
import Register from './pages/Register';
import Login from './components/Login';
import GuestRegister from './pages/GuestRegister';
import HealthCheck from './pages/HealthCheck';
import DashboardSwitch from './pages/DashboardSwitch';
import GenerateQR from './pages/GenerateQR';
import GuardScan from './pages/GuardScan';
import AdminUsers from './pages/AdminUsers';
import AccessReport from './pages/AccessReport';

export default function App() {
  return (
    <Router>
      <Navbar />
      <div className="container mt-4">
        <Routes>
          {/* Públicas */}
          <Route path="/" element={<Landing />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/guest/register" element={<GuestRegister />} />
          <Route path="/healthcheck" element={<HealthCheck />} />

          {/* Protegidas */}
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute roles={['ADMIN']}>
                <AdminUsers />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardSwitch />
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

          {/* UNA sola ruta para GuardScan.
              Si quieres mostrar un fallback de carga, usa Suspense aquí. */}
          <Route
            path="/guard-scan"
            element={
              <ProtectedRoute>
                <Suspense fallback={<div className="container mt-3">Cargando lector…</div>}>
                  <GuardScan />
                </Suspense>
              </ProtectedRoute>
            }
          />

          <Route
            path="/access-report"
            element={
              <ProtectedRoute>
                <AccessReport />
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>
    </Router>
  );
}
