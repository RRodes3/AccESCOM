// frontend/src/services/api.js
import axios from 'axios';

/**
 * Modo DEV (local):
 *  - Si tienes "proxy" en package.json → usa rutas relativas: baseURL = "/api"
 *
 * Modo PROD (deploy):
 *  - Define REACT_APP_API_URL (p.ej. "https://mi-backend.com/api")
 *  - Se usará automáticamente cuando exista la variable
 */
const baseURL =
  (process.env.REACT_APP_API_URL && process.env.REACT_APP_API_URL.trim()) ||
  '/api';

export const api = axios.create({
  baseURL,
  withCredentials: true,       // ← para enviar/recibir cookie JWT
  timeout: 15000,              // opcional: 15s
});

// (Opcional) Interceptor de errores legible
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    const msg = err?.response?.data?.error || '';

    if (status === 401) {
      // Si fue por inactividad, mostramos mensaje más claro
      if (msg.toLowerCase().includes('inactividad')) {
        alert('Tu sesión ha expirado por inactividad. Vuelve a iniciar sesión.');
      }
      // Limpia usuario y manda al login
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

// Obtener últimos accesos con paginación
export const getLastAccesses = (params = {}) => {
  const { take = 10, skip = 0 } = params;
  return api.get(`/qr/last-accesses?take=${take}&skip=${skip}`);
};

/**
 * Actualizar usuario (ADMIN)
 * @param {number} id - ID numérico del usuario
 * @param {object} payload - Campos a actualizar (name, email, etc.)
 */
export function adminUpdateUser(id, payload) {
  return api.patch(`/admin/users/${id}`, payload);
}
