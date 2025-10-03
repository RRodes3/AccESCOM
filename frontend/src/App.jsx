import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Login from './components/Login';            
import Register from './pages/Register';           
import Landing from './pages/Landing';             
import GuestRegister from './pages/GuestRegister'; 
import HealthCheck from './pages/HealthCheck';     
import AdminUsers from './pages/AdminUsers';
import DashboardSwitch from './pages/DashboardSwitch';
import GenerateQR from './pages/GenerateQR';
import GuardScan from './pages/GuardScan';
import AccessReport from './pages/AccessReport';
import ProtectedRoute from './components/ProtectedRoute'; 
import { Suspense } from 'react';


// Wrapper para ocultar el Navbar en ciertas páginas
function Layout({ children }) {
  const location = useLocation();
  const hideNavbarOn = ['/']; // páginas donde NO quieres navbar (landing)

  return (
    <>
      {!hideNavbarOn.includes(location.pathname) && <Navbar color="#007be4" />}
      <div className="container mt-4">{children}</div>
    </>
  );
}

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Landing />} /> {/* Landing sin navbar */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
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
      </Layout>
    </Router>
  );
}
