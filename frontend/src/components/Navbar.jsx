// src/components/Navbar.jsx
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../services/api';
import { useMemo, useEffect, useState } from 'react';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  // --- estado: usuario, invitado y menú móvil ---
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  });

  const [guestVisit, setGuestVisit] = useState(null);
  const [isNavOpen, setIsNavOpen] = useState(false);

  const isLogin = location.pathname === '/login';

  const isAdmin = user?.role === 'ADMIN';
  const isGuard = user?.role === 'GUARD';
  const isInstitutionalUser = user?.role === 'USER';

  // --- leer invitado de sessionStorage ---
  useEffect(() => {
    const read = () => {
      try {
        setGuestVisit(JSON.parse(sessionStorage.getItem('guestVisit') || 'null'));
      } catch {
        setGuestVisit(null);
      }
    };
    read();
    const onUpdate = () => read();
    window.addEventListener('guestVisitUpdate', onUpdate);
    return () => window.removeEventListener('guestVisitUpdate', onUpdate);
  }, []);

  const guestName = useMemo(() => {
    const v = guestVisit?.visitor;
    if (!v) return null;
    return [v.firstName, v.lastNameP, v.lastNameM].filter(Boolean).join(' ');
  }, [guestVisit]);

  // --- forzar logout cuando entras a /login y aún hay user guardado ---
  useEffect(() => {
    if (location.pathname !== '/login') return;
    if (!user) return;

    let cancelled = false;

    (async () => {
      try {
        await api.post('/auth/logout'); // si el cookie sigue vivo
      } catch {
        // aunque falle, limpiamos lado cliente
      }
      if (cancelled) return;
      localStorage.removeItem('user');
      setUser(null);
    })();

    return () => { cancelled = true; };
  }, [location.pathname, user]);

  // --- cada vez que cambie la ruta, recargamos user desde localStorage ---
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || 'null');
      setUser(u);
    } catch {
      setUser(null);
    }
  }, [location.pathname]);

  // --- cerrar menú móvil al cambiar de ruta ---
  useEffect(() => {
    setIsNavOpen(false);
  }, [location.pathname]);

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    localStorage.removeItem('user');
    setUser(null);
    navigate('/', { replace: true });
  };

  const guestExit = () => {
    sessionStorage.removeItem('guestVisit');
    window.dispatchEvent(new Event('guestVisitUpdate'));
    navigate('/', { replace: true });
  };

  const titles = {
    '/register': 'Registro de datos generales',
    '/guest/register': 'Registro de invitado',
    '/confirm-guest': 'Confirmar datos (invitado)',
    '/confirm-register': 'Confirmar datos',
    '/guest/dashboard': 'Invitado',
    '/guard-scan': 'Escaneo',
    '/last-accesses': 'Tabla de registros',
  };

  const isConfirmScreen = ['/confirm-guest', '/confirm-register'].includes(location.pathname);
  const navbarColor = isConfirmScreen ? '#005c9f' : '#007be4';
  const title = titles[location.pathname] || '';

  // No mostramos navbar en la landing raíz
  if (location.pathname === '/') return null;

  const isGuestDashboard = location.pathname.startsWith('/guest') && !!guestVisit;

  const adminLinks = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/admin/users', label: 'Usuarios' },
    { path: '/access-report', label: 'Reportes' },
    { path: '/last-accesses', label: 'Registros' },
  ];

  const guardLinks = [
    { path: '/guard-scan', label: 'Escanear' },
    { path: '/last-accesses', label: 'Registros' },
  ];

  const mustChangePassword = !!user?.mustChangePassword;
  const showChangePassword = isInstitutionalUser && mustChangePassword;

  const handleBrandClick = (e) => {
    e.preventDefault();

    // Sin sesión → landing
    if (!user) {
      navigate('/');
      return;
    }

    // ADMIN y GUARD → dashboard
    if (isAdmin || isGuard) {
      navigate('/dashboard');
      return;
    }

    // Usuario institucional u otros → dashboard también
    navigate('/dashboard');
  };

  const toggleNav = () => setIsNavOpen((prev) => !prev);

  // --- JSX ---
  return (
    <nav className="navbar navbar-expand-lg navbar-dark" style={{ backgroundColor: navbarColor }}>
      <div className="container">
        {/* Marca AccESCOM */}
        <Link
          className="navbar-brand"
          to="/"
          onClick={handleBrandClick}
          style={{ position: 'relative', zIndex: 1, textDecoration: 'none' }}
        >
          AccESCOM
        </Link>

        {/* Botón hamburguesa SOLO si no estamos en /login y hay usuario o invitado */}
        {(!isLogin && (user || isGuestDashboard || isAdmin)) && (
          <button
            className="navbar-toggler"
            type="button"
            onClick={toggleNav}
            aria-controls="mainNavbar"
            aria-expanded={isNavOpen ? 'true' : 'false'}
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon"></span>
          </button>
        )}

        <div
          className={`collapse navbar-collapse ${isNavOpen ? 'show' : ''}`}
          id="mainNavbar"
        >
          {/* Título centrado */}
          <div
            className="d-flex flex-column align-items-center text-center mx-auto"
            style={{ pointerEvents: 'none' }}
          >
            {isGuestDashboard ? (
              <span
                className="navbar-text fw-semibold text-white"
                style={{ pointerEvents: 'auto' }}
              >
                Bienvenido(a), {guestName || 'Invitado'}
              </span>
            ) : (
              <>
                <span
                  className="navbar-text fw-semibold text-white"
                  style={{ fontSize: '1.05rem', pointerEvents: 'auto' }}
                >
                  {title}
                </span>
                {isConfirmScreen && (
                  <small
                    className="fw-bold text-white mt-1"
                    style={{ pointerEvents: 'auto' }}
                  >
                    Verifica que tus datos sean correctos
                  </small>
                )}
              </>
            )}
          </div>

          {/* Zona derecha */}
          <ul
            className="navbar-nav ms-auto align-items-center gap-2"
            style={{ position: 'relative', zIndex: 1 }}
          >
            {/* En /login NO mostramos botones (solo la marca y el título) */}
            {!isLogin && (
              <>
                {/* ADMIN */}
                {isAdmin && (
                  <>
                    {adminLinks.map((lnk) => (
                      <li key={lnk.path} className="nav-item">
                        <Link
                          to={lnk.path}
                          className="btn btn-sm btn-outline-light"
                          style={{ pointerEvents: 'auto' }}
                        >
                          {lnk.label}
                        </Link>
                      </li>
                    ))}
                    <li className="nav-item">
                      <Link
                        to="/import-db"
                        className="nav-link btn btn-sm btn-outline-light"
                        style={{ pointerEvents: 'auto' }}
                      >
                        Importar BD
                      </Link>
                    </li>
                  </>
                )}

                {/* GUARD */}
                {isGuard && (
                  <>
                    {guardLinks.map((lnk) => (
                      <li key={lnk.path} className="nav-item">
                        <Link
                          to={lnk.path}
                          className="btn btn-sm btn-outline-light"
                          style={{ pointerEvents: 'auto' }}
                        >
                          {lnk.label}
                        </Link>
                      </li>
                    ))}
                  </>
                )}

                {/* INVITADO */}
                {isGuestDashboard ? (
                  <li className="nav-item">
                    <button
                      className="btn btn-outline-light btn-sm"
                      onClick={guestExit}
                      style={{ pointerEvents: 'auto' }}
                    >
                      Salir
                    </button>
                  </li>
                ) : user ? (
                  <>
                    <li className="nav-item me-2">
                      <span
                        className="navbar-text text-white"
                        style={{ pointerEvents: 'auto' }}
                      >
                        Bienvenido(a), {user.name}
                      </span>
                    </li>

                    {/* Mi perfil - Solo para usuarios institucionales */}
                    {isInstitutionalUser && (
                      <li className="nav-item">
                        <Link
                          className="nav-link btn btn-sm btn-outline-light"
                          to="/mi-perfil"
                          style={{ pointerEvents: 'auto' }}
                        >
                          Mi perfil
                        </Link>
                      </li>
                    )}

                    {showChangePassword && (
                      <li className="nav-item">
                        <Link
                          className="nav-link btn btn-sm btn-outline-light"
                          to="/change-password"
                          style={{ pointerEvents: 'auto' }}
                        >
                          Cambiar contraseña
                        </Link>
                      </li>
                    )}

                    <li className="nav-item">
                      <button
                        className="btn btn-outline-light btn-sm"
                        onClick={logout}
                        style={{ pointerEvents: 'auto' }}
                      >
                        Cerrar sesión
                      </button>
                    </li>
                  </>
                ) : null}
              </>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}
