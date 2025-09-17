// frontend/src/pages/GenerateQR.jsx
import { useState } from 'react';
import { api } from '../services/api';
import QRCode from 'react-qr-code';

export default function GenerateQR() {
  const [kind, setKind] = useState('ENTRY');
  const [pass, setPass] = useState(null);
  const [msg, setMsg] = useState('');

  const issue = async () => {
    setMsg(''); setPass(null);
    try {
      const { data } = await api.post('/qr/issue', { kind }); // ← sin ttlMinutes
      setPass(data.pass);
    } catch (e) {
      const apiMsg = e?.response?.data?.error || e?.response?.data?.reason;
      setMsg(apiMsg || `Error: ${e?.message || 'No se pudo emitir el QR'}`);
    }
  };

  return (
    <div className="container mt-3" style={{ maxWidth: 520 }}>
      <h4>Generar QR (debug)</h4>

      <div className="d-flex gap-2 align-items-end mb-3">
        <div>
          <label className="form-label">Tipo</label>
          <select className="form-select" value={kind} onChange={e=>setKind(e.target.value)}>
            <option value="ENTRY">ENTRADA</option>
            <option value="EXIT">SALIDA</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={issue}>Emitir/Obtener</button>
      </div>

      {msg && <div className="alert alert-danger">{msg}</div>}

      {pass && (
        <div className="card p-3">
          <p className="mb-1"><b>Tipo:</b> {pass.kind}</p>
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
