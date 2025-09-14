import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import QRCode from 'react-qr-code';

export default function UserDashboard() {
  const [active, setActive] = useState(null);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setMsg('');
    try {
      const { data } = await api.get('/qr/my-active');
      setActive(data.pass || null);
    } catch (e) {
      setMsg(e?.response?.data?.error || 'No se pudo consultar tu QR activo');
    }
  };

  const issue = async () => {
    setMsg('');
    try {
      const { data } = await api.post('/qr/issue', { ttlMinutes: 30 });
      setActive(data.pass);
    } catch (e) {
      setMsg(e?.response?.data?.error || 'No se pudo emitir');
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="container mt-3">
      <h3>Mi Panel</h3>
      {msg && <div className="alert alert-danger">{msg}</div>}

      {!active ? (
        <button className="btn btn-primary" onClick={issue}>Emitir QR (30 min)</button>
      ) : (
        <div className="card p-3" style={{maxWidth:520}}>
          <p className="mb-1"><b>Estado:</b> {active.status}</p>
          <p><b>Expira:</b> {active.expiresAt ? new Date(active.expiresAt).toLocaleString() : '—'}</p>
          <div className="d-flex justify-content-center">
            <QRCode value={active.code} size={220} />
          </div>
          <small className="text-muted d-block mt-2">Contenido: {active.code}</small>
        </div>
      )}
    </div>
  );
}
