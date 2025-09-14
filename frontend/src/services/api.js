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
    // Puedes unificar mensajes aquí si quieres
    return Promise.reject(err);
  }
);
