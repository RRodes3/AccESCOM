// frontend/src/services/api.js
import axios from 'axios';

/**
 * Base URL:
 * - Siempre usamos "/api" y dejamos que Vercel haga el rewrite a Railway.
 */
const baseURL = '/api';

export const api = axios.create({
  baseURL,
  withCredentials: true,      // ← Necesario para enviar/recibir cookies
  timeout: 60000,             // 15s
});

// ------------------
// Interceptor de errores
// ------------------
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    const msg = err?.response?.data?.error || '';

    if (status === 401) {
      // Si fue por inactividad, mensaje claro
      if (msg.toLowerCase().includes('inactividad')) {
        alert('Tu sesión ha expirado por inactividad. Vuelve a iniciar sesión.');
      }

      // Limpiar usuario y redirigir al login
      try {
        localStorage.removeItem('user');
      } catch {}

      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(err);
  }
);

// ------------------
// Helpers
// ------------------

// Obtener últimos accesos con paginación
export const getLastAccesses = (params = {}) => {
  const { take = 10, skip = 0 } = params;
  return api.get(`/qr/last-accesses?take=${take}&skip=${skip}`);
};

// Actualizar usuario (ADMIN)
export function adminUpdateUser(id, payload) {
  return api.patch(`/admin/users/${id}`, payload);
}

// Logs del usuario
export function getMyAccessLogs() {
  return api.get('/qr/my-access');
}

// Actualizar email de contacto
export function updateContactEmail(contactEmail) {
  return api.put('/auth/contact-email', { contactEmail });
}
