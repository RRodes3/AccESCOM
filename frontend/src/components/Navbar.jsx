// src/components/Navbar.jsx
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';

function baseTitleFor(pathname) {
  if (pathname === '/register') return 'Registro de datos generales';
  if (pathname === '/guest/register') return 'Formulario de registro invitado';
  if (pathname === '/register/confirm' || pathname === '/confirm-register') return 'Confirmar datos';
  if (pathname === '/guest/confirm' || pathname === '/confirm-guest') return 'Confirmar datos';
  if (pathname === '/guard-scan') return 'Escaneo de QR (Guardia)';
  if (pathname === '/admin/users') return 'Administración de usuarios';
  if (pathname === '/access-report') return 'Reporte de accesos';
  if (pathname === '/guest/dashboard') return 'Invitado: códigos QR';
  return '';
}

export default function Navbar() {
  const location = useLocation();
  const nav = useNavigate();

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }, []);

  // Muestra "Bienvenido(a): nombre" en dashboard
  const pageTitle = useMemo(() => {
    if (location.pathname === '/dashboard' && user?.name) {
      return `Bienvenido(a): ${user.name}`;
    }
    return baseTitleFor(location.pathname);
  }, [location.pathname, user]);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    nav('/', { replace: true });
  };

  return (
    <nav className="navbar navbar-dark" style={{ background: '#2c47b6' }}>
      <div className="container-fluid d-flex align-items-center justify-content-between position-relative">

        {/* IZQUIERDA */}
        <Link to={user ? '/dashboard' : '/'} className="navbar-brand m-0 text-white">
          AccESCOM
        </Link>

        {/* CENTRO ABSOLUTO → siempre centrado visualmente */}
        {pageTitle && (
          <div
            className="position-absolute top-50 start-50 translate-middle text-white fw-semibold text-center"
            style={{ transform: 'translate(-50%, -50%)' }}
          >
            {pageTitle}
          </div>
        )}

        {/* DERECHA */}
        {user && (
          <button
            type="button"
            className="btn btn-outline-light btn-sm"
            onClick={logout}
          >
            Cerrar sesión
          </button>
        )}
      </div>
    </nav>
  );
}
