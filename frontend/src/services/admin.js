// frontend/src/services/admin.js
import { api } from './api';

/** Lista de usuarios (con filtros/paginación) */
export function listUsers({ query = '', role = '', take = 20, skip = 0, includeInactive = false } = {}) {
  const params = { take, skip };
  if (query) params.query = query;
  if (role) params.role = role;
  if (includeInactive) params.includeInactive = 'true';
  return api.get('/admin/users', { params });
}

/** Crea usuario (ADMIN) */
export function createUser(payload) {
  return api.post('/admin/users', payload);
}

/** Baja lógica (desactivar) */
export function deactivateUser(id) {
  return api.patch(`/admin/users/${id}/deactivate`);
}

/** Reactivar (quitar baja lógica) */
export function restoreUser(id) {
  return api.patch(`/admin/users/${id}/restore`);
}

/** Eliminación definitiva (si no tiene relaciones) */
export function deleteUser(id) {
  return api.delete(`/admin/users/${id}`);
}
