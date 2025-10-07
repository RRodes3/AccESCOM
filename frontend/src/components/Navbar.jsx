// src/components/Navbar.jsx
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../services/api';
import { useMemo, useEffect, useState } from 'react';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  const user = JSON.parse(localStorage.getItem('user') || 'null');

  const [guestVisit, setGuestVisit] = useState(null);

  useEffect(() => {
    const read = () => {
      try {
        setGuestVisit(JSON.parse(sessionStorage.getItem('guestVisit') || 'null'));
      } catch {
        setGuestVisit(null);
      }
    };

    //lee al montar y cada vez que cambia la ruta
    read();
  
    //escucha un evento custom para refrescar sin cambiar de ruta
    const onUpdate = () => read();
    window.addEventListener('guestVisitUpdate', onUpdate);
    return () => {
      window.removeEventListener('guestVisitUpdate', onUpdate)
    };
  }, [location.pathname]);

  const guestName = useMemo(() => {
    const v = guestVisit?.visitor;
    if (!v) return null;
    return [v.firstName, v.lastNameP, v.lastNameM].filter(Boolean).join(' ');
  }, [guestVisit]);

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {}
    localStorage.removeItem('user');
    navigate('/', { replace: true });
  };

const guestExit = () => {
  try { sessionStorage.removeItem('guestVisit'); } catch {}
  localStorage.removeItem('user');     // por si acaso
  setGuestVisit(null);                 // 🔹 actualiza estado del navbar ya
  window.dispatchEvent(new Event('guestVisitUpdate'));
  navigate('/', { replace: true });
  setTimeout(() => window.location.reload(), 50);
};


  // Rutas → títulos
  const titles = {
    '/register': 'Registro de datos generales',
    '/guest/register': 'Registro de invitado',
    '/confirm-guest': 'Confirmar datos (invitado)',
    '/confirm-register': 'Confirmar datos',
    '/dashboard': 'Dashboard',
    '/guest/dashboard': 'Invitado',
    '/guard-scan': 'Escaneo',
  };

  // Detectar si estamos en una pantalla de confirmación
  const isConfirmScreen = ['/confirm-guest', '/confirm-register'].includes(location.pathname);
  
  //color base
  const navbarColor = isConfirmScreen ? '#005c9f' : '#007be4'; // #005c9f = azul más profundo y serio; puedes probar también '#0066cc' o '#0047B6'

  const title = titles[location.pathname] || '';

  // No mostrar navbar en landing
  if (location.pathname === '/') return null;

  
  // ✅ Detectar si estamos en CUALQUIER pantalla de invitado con sesión de invitado cargada
    const isGuestView = location.pathname.startsWith('/guest') && !!guestVisit;


  return (
  <nav className="navbar navbar-expand-lg navbar-dark" style={{ backgroundColor: navbarColor }}>
    <div className="container position-relative">  {/* <- añade position-relative */}
      <Link className="navbar-brand" to="/">AccESCOM</Link>

      <div className="collapse navbar-collapse show">
        {/* Centro */}
        <div
          className="navbar-nav w-100 text-center justify-content-center align-items-center position-absolute start-0 end-0"
          style={{pointerEvents: 'none' }}
        >
          {isGuestView ? (
            <span className="navbar-text fw-semibold text-white">
              Bienvenido(a), {guestName || 'Invitado'}
            </span>
          ) : (
            <div className="d-flex flex-column align-items-center w-100">
              <span
                className="navbar-text fw-semibold text-white"
                style={{ fontSize: '1.05rem', lineHeight: 1 }}
              >
                {title}
              </span>

              {isConfirmScreen && (
                <small
                  className="fw-bold text-white"
                  style={{
                    fontSize: '0.9rem',
                    opacity: 0.95,
                    marginTop: '2px',
                  }}
                >
                  Verifica que tus datos sean correctos
                </small>
              )}
            </div>
          )}
        </div>

        {/* Derecha */}
        <ul className="navbar-nav ms-auto">
          {isGuestView ? (
            <li className="nav-item">
              <button className="btn btn-outline-light btn-sm" onClick={guestExit}>
                Salir
              </button>
            </li>
          ) : user ? (
            <>
              <li className="nav-item me-2">
                <span className="navbar-text">Bienvenido(a), {user.name}</span>
              </li>
              <li className="nav-item">
                <button className="btn btn-outline-light btn-sm" onClick={logout}>
                  Cerrar sesión
                </button>
              </li>
            </>
          ) : null}
        </ul>
      </div>
    </div>
  </nav>
);
}
