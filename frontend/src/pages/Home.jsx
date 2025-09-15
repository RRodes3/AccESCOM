// frontend/src/pages/Home.js (o .jsx)
import { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function Home() {
  const [msg, setMsg] = useState('Cargando…');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/health'); // -> /api/health
        setMsg(JSON.stringify(data));
      } catch (e) {
        console.log('HOME /health error:', e?.response?.status, e?.response?.data, e?.message);
        setMsg(`Error: ${e?.message || 'No se pudo conectar'}`);
      }
    })();
  }, []);

  return (
    <div className="container mt-4">
      <h2>Bienvenido a AccESCOM</h2>
      <p><b>Mensaje del backend:</b> {msg}</p>
    </div>
  );
}
