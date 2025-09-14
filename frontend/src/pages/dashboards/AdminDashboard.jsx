import { useEffect, useState } from 'react';
import { api } from '../../services/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/qr/stats');
        setStats(data);
      } catch (e) {
        setMsg(e?.response?.data?.error || 'No se pudieron cargar estadísticas');
      }
    })();
  }, []);

  return (
    <div className="container mt-3">
      <h3>Panel de Administración</h3>
      {msg && <div className="alert alert-danger">{msg}</div>}
      {!stats ? <p>Cargando…</p> : (
        <div className="row g-3">
          <div className="col-sm-6 col-md-4">
            <div className="card p-3"><b>Usuarios</b><div>{stats.users}</div></div>
          </div>
          <div className="col-sm-6 col-md-4">
            <div className="card p-3"><b>QR emitidos</b><div>{stats.passes}</div></div>
          </div>
          <div className="col-sm-6 col-md-4">
            <div className="card p-3"><b>Logs</b><div>{stats.logs}</div></div>
          </div>
          <div className="col-sm-6 col-md-4">
            <div className="card p-3"><b>Accesos permitidos</b><div>{stats.allowed}</div></div>
          </div>
          <div className="col-sm-6 col-md-4">
            <div className="card p-3"><b>Accesos denegados</b><div>{stats.denied}</div></div>
          </div>
        </div>
      )}
    </div>
  );
}
