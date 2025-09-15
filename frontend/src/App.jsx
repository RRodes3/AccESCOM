import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import DashboardSwitch from './pages/DashboardSwitch';
import Login from './components/Login';
import ProtectedRoute from './components/ProtectedRoute';
import GenerateQR from './pages/GenerateQR';
//import GuardScan from './pages/GuardScan';
import AccessReport from './pages/AccessReport';
import { Suspense, lazy } from 'react';
const GuardScan = lazy(() => import('./pages/GuardScan'));
import Register from './pages/Register';
import AdminUsers from './pages/AdminUsers';


function App() {
  return (
    <Router>
      <Navbar />
      <div className="container mt-4">
        <Routes>
          <Route path="/" element={<Home />} /> //pagina principal
          <Route path="/register" element={<Register />} /> //registro usuario
          <Route path="/login" element={<Login />} /> //login usuario

    // Rutas protegidas

          //Ruta protegida solo para ADMIN
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
                <GuardScan />
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
        </Routes>
      </div>
    </Router>
    
  );
}

export default App;
