// src/components/SessionIdleWatcher.jsx
import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../services/api';

// 15 minutos en ms
const IDLE_MS = 15 * 60 * 1000;

function readUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

export default function SessionIdleWatcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const timerRef = useRef(null);

  useEffect(() => {
    // 🔐 Logout real por inactividad (solo si NO es guardia)
    const doLogout = async () => {
      const u = readUser();
      if (!u || u.role === 'GUARD') return;

      try {
        await api.post('/auth/logout');
      } catch {}

      localStorage.removeItem('user');

      navigate('/login?expired=1', { replace: true });
    };

    // 🔁 Reinicia el temporizador en cada actividad
    const resetTimer = () => {
      const u = readUser();

      // sin usuario o guardia logueado → no queremos contar inactividad
      if (!u || u.role === 'GUARD') {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        return;
      }

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(doLogout, IDLE_MS);
    };

    // Eventos que consideramos "actividad del usuario"
    const events = ['click', 'mousemove', 'keydown', 'scroll', 'touchstart'];

    events.forEach((ev) => window.addEventListener(ev, resetTimer));

    // Al montar, inicializamos el timer según el usuario actual
    resetTimer();

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // 👀 Dependemos de location.pathname para que al cambiar de ruta
    // se re-evalúe el usuario (por si se loguea / desloguea)
  }, [navigate, location.pathname]);

  return null; // no renderiza nada en pantalla
}
