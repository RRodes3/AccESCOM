import { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function HealthCheck() {
  const [msg, setMsg] = useState('Cargando…');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/health');
        setMsg(JSON.stringify(data));
      } catch (e) {
        setMsg(`Error: ${e?.message || 'No se pudo conectar'}`);
      }
    })();
  }, []);

  return (
    <div className="container mt-4">
      <h2>HealthCheck</h2>
      <p><b>Mensaje del backend:</b> {msg}</p>
    </div>
  );
}
