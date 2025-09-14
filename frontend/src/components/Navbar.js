import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export default function Navbar() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    localStorage.removeItem('user');
    navigate('/login', { replace: true });
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark">
      <div className="container">
        <Link className="navbar-brand" to="/">AccESCOM</Link>

        <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNavbar">
          <span className="navbar-toggler-icon"></span>
        </button>

        <div className="collapse navbar-collapse" id="mainNavbar">
          <ul className="navbar-nav me-auto mb-2 mb-lg-0">
            {/* Dashboard SOLO si hay sesión */}
            {user && (
              <li className="nav-item">
                <Link className="nav-link" to="/dashboard">Dashboard</Link>
              </li>
            )}

            {/* USER: generar QR (ADMIN ya NO) */}
            {user?.role === 'USER' && (
              <li className="nav-item">
                <Link className="nav-link" to="/qr">Generar QR</Link>
              </li>
            )}

            {/* GUARD: escanear QR (ADMIN ya NO) */}
            {user?.role === 'GUARD' && (
              <li className="nav-item">
                <Link className="nav-link" to="/guard-scan">Escanear QR</Link>
              </li>
            )}

            {/* ADMIN: reporte */}
            {user?.role === 'ADMIN' && (
              <li className="nav-item">
                <Link className="nav-link" to="/access-report">Reporte</Link>
              </li>
            )}
          </ul>

          <ul className="navbar-nav ms-auto">
            {!user ? (
              <li className="nav-item">
                <Link className="btn btn-outline-light btn-sm" to="/login">Iniciar sesión</Link>
              </li>
            ) : (
              <>
                <li className="nav-item me-2">
                  <span className="navbar-text">
                    {user.name} <small className="text-muted">({user.role})</small>
                  </span>
                </li>
                <li className="nav-item">
                  <button className="btn btn-outline-light btn-sm" onClick={logout}>
                    Cerrar sesión
                  </button>
                </li>
              </>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}
