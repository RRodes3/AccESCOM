// src/components/Navbar.jsx
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../services/api';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    localStorage.removeItem('user');
    navigate('/login', { replace: true });
  };

  // Títulos por ruta (ajusta/añade las que necesites)
  const titles = {
    '/register': 'Registro de datos generales',
    '/guest/register': 'Formulario de registro invitado',
    // '/login': 'Iniciar sesión', ...
  };
  const title = titles[location.pathname] || '';

    /**
   * Variantes de colores:
   *  <Navbar color="#007be4" />
   *  <Navbar color="#0047B6" />
   */

  return (
    <nav className="navbar navbar-dark" style={{ backgroundColor: '#0047B6' }}>
      {/* GRID a 3 columnas: izquierda = marca, centro = título, derecha = acciones */}
      <div
        className="container align-items-center"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          minHeight: 56,
        }}
      >
        {/* Izquierda */}
        <div className="justify-self-start">
          <Link className="navbar-brand m-0" to="/">AccESCOM</Link>
        </div>

        {/* Centro (si no hay título, no ocupa espacio extra) */}
        <div className="justify-self-center text-white fw-semibold text-center">
          {title}
        </div>

        {/* Derecha */}
        <div className="justify-self-end">
          {user && (
            <button className="btn btn-outline-light btn-sm" onClick={logout}>
              Cerrar sesión
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
