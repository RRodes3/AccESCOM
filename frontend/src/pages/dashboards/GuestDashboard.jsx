import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import QRCode from 'react-qr-code';

function QrPanel({ visitId, kind, onClose }) {
  const [pass, setPass] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    setPass(null);
    try {
      const { data } = await api.get('/guest/my-active', {
        params: { visitId, kind }
      });
      setPass(data.pass || null);
      if (!data.pass) setError('No hay QR disponible.');
    } catch (e) {
      setError(e?.response?.data?.error || 'No se pudo obtener el QR');
    }
  };

  useEffect(() => { load(); /* carga al abrir */ }, [visitId, kind]);

  const leftSec = pass?.expiresAt
    ? Math.max(0, Math.floor((new Date(pass.expiresAt).getTime() - Date.now()) / 1000))
    : null;

  if (error) return (
    <div className="text-center mt-3">
      <div className="alert alert-danger">{error}</div>
      <button className="btn btn-outline-secondary mt-2" onClick={onClose}>Cerrar</button>
    </div>
  );
  if (!pass) return <div className="mt-3 text-center">Cargando…</div>;

  return (
    <div className="text-center mt-3">
      <div className="mb-2"><b>QR de {kind === 'ENTRY' ? 'entrada' : 'salida'}</b></div>
      <div className="d-inline-block p-3 bg-white rounded">
        <QRCode value={pass.code} size={220} />
      </div>
      {leftSec !== null && <div className="mt-2 text-muted">Expira en {leftSec}s</div>}
      <div className="mt-3">
        <button className="btn btn-outline-secondary" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}

export default function GuestDashboard() {
  const nav = useNavigate();

  // tomamos lo guardado en sessionStorage por ConfirmGuest (o por GuestRegister si reusaste)
  const visit = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem('guestVisit') || 'null'); }
    catch { return null; }
  }, []);

  // id de visita para pedir los QR
  const visitId = visit?.visitor?.id || visit?.id || null;

  const [showKind, setShowKind] = useState(null); // 'ENTRY' | 'EXIT' | null
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!visitId) {
      // sin visita en sesión → manda a registrar invitado
      nav('/guest/register', { replace: true });
    }
  }, [visitId, nav]);

  if (!visitId) return null;

  const openKind = (kind) => {
    setMsg('');
    setShowKind(kind);
  };

  return (
    <div className="container mt-3" style={{ maxWidth: 520 }}>
      {!showKind ? (
        <div className="bg-secondary bg-opacity-75 text-white rounded-3 p-3 mt-3 text-center">
          <p className="mb-3">Elige la acción que desees realizar:</p>
          {msg && <div className="alert alert-danger py-2">{msg}</div>}
          <div className="d-flex gap-3 justify-content-center flex-wrap">
            <button 
              className="w-full max-w-[300px] px-4 py-3 text-white bg-blue-600 rounded-lg text-center text-lg font-semibold hover:bg-blue-700 transition-colors"
              onClick={() => openKind('ENTRY')}
            >
              Mostrar QR de entrada
            </button>
            <button 
              className="w-full max-w-[300px] px-4 py-3 text-white bg-blue-600 rounded-lg text-center text-lg font-semibold hover:bg-blue-700 transition-colors"
              onClick={() => openKind('EXIT')}
            >
              Mostrar QR de salida
            </button>
          </div>
        </div>
      ) : (
        <QrPanel
          visitId={visitId}
          kind={showKind}
          onClose={() => setShowKind(null)}
        />
      )}
    </div>
  );
}
