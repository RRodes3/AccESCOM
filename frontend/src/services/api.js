// frontend/src/services/api.js
import axios from 'axios';

/**
 * Para desarrollo local:
 * - con "proxy" en package.json usamos baseURL '/api'
 * - si prefieres variable: REACT_APP_API_URL=http://localhost:4000/api
 */
const baseURL = process.env.REACT_APP_API_URL?.trim() || '/api';

export const api = axios.create({
  baseURL,
  withCredentials: true, // para enviar/recibir cookie JWT
});
