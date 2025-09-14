import { useState } from 'react';
import { api } from '../services/api';
import QRCode from 'react-qr-code';

export default function GenerateQR() {
  const [pass, setPass] = useState(null);
  const [msg, setMsg] = useState('');

  const issue = async () => {
    setMsg('');
    setPass(null);
    try {
      const { data } = await api.post('/qr/issue', { ttlMinutes: 30 });
      setPass(data.pass);
    } catch (e) {
      console.log('ISSUE ERROR →', e?.response?.status, e?.response?.data, e?.message);
      const apiMsg = e?.response?.data?.error || e?.response?.data?.reason;
      setMsg(apiMsg || `Error: ${e?.message || 'No se pudo emitir el QR'}`);
    }
  };

  return (
    <div className="container mt-3" style={{ maxWidth: 520 }}>
      <h4>Generar QR</h4>
      <button className="btn btn-primary mb-3" onClick={issue}>Emitir QR (30 min)</button>
      {msg && <div className="alert alert-danger">{msg}</div>}

      {pass && (
        <div className="card p-3">
          <p className="mb-1"><b>Estado:</b> {pass.status}</p>
          <p className="mb-3"><b>Expira:</b> {pass.expiresAt ? new Date(pass.expiresAt).toLocaleString() : '—'}</p>
          <div className="d-flex justify-content-center">
            <QRCode value={pass.code} size={220} />
          </div>
          <small className="text-muted d-block mt-2">Contenido: {pass.code}</small>
        </div>
      )}
    </div>
  );
}
