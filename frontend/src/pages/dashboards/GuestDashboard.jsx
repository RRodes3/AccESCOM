import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import QRCode from 'react-qr-code';

function formatExpiry(expiresAt) {
  if (!expiresAt) return null;
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return 'Ya expiró';
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 1) return 'Caduca hoy (se regenerará automáticamente)';
  const whole = Math.ceil(diffDays);
  return `Expira en ${whole} día${whole !== 1 ? 's' : ''}`;
}

function QrPanel({ visitId, kind, onClose }) {
  const nav = useNavigate();
  const [pass, setPass] = useState(null);
  const [error, setError] = useState('');
  const [allUsed, setAllUsed] = useState(false);

  const load = async () => {
    setError('');
    setPass(null);
    setAllUsed(false);
    try {
      const { data } = await api.get('/guest/my-active', {
        params: { visitId, kind }
      });
      setPass(data.pass || null);
      if (!data.pass) setError('No hay QR disponible.');
    } catch (e) {
      const errorData = e?.response?.data;
      setError(errorData?.error || 'No se pudo obtener el QR');
      if (errorData?.allUsed) {
        setAllUsed(true);
      }
    }
  };

  useEffect(() => { load(); }, [visitId, kind]);

  if (error) return (
    <div className="text-center mt-3">
      <div className="alert alert-warning">{error}</div>
      {allUsed && (
        <button 
          className="btn btn-primary mt-2" 
          onClick={() => {
            sessionStorage.removeItem('guestVisit');
            window.dispatchEvent(new Event('guestVisitUpdate')); // Notificar al navbar
            nav('/guest/register', { replace: true });
          }}
        >
          Ir al formulario de registro
        </button>
      )}
      <button className="btn btn-outline-secondary mt-2 ms-2" onClick={onClose}>Cerrar</button>
    </div>
  );
  if (!pass) return <div className="mt-3 text-center">Cargando…</div>;

  const expiryMsg = formatExpiry(pass.expiresAt);

  return (
    <div className="text-center mt-3">
      <div className="mb-2"><b>QR de {kind === 'ENTRY' ? 'entrada' : 'salida'}</b></div>
      <div className="d-inline-block p-3 bg-white rounded">
        <QRCode value={pass.code} size={220} />
      </div>
      {expiryMsg && (
        <div className="mt-2 text-muted" style={{ fontSize: '.9rem' }}>
          {expiryMsg}
        </div>
      )}
      <div className="mt-2 text-warning" style={{ fontSize: '.85rem' }}>
        Código de único uso — si desea volver a ingresar, debe llenar un nuevo formulario.
      </div>
      <div className="mt-3">
        <button className="btn btn-outline-secondary" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}

export default function GuestDashboard() {
  const nav = useNavigate();

  const visit = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem('guestVisit') || 'null'); }
    catch { return null; }
  }, []);

  const visitId = visit?.visitor?.id || visit?.id || null;

  const [showKind, setShowKind] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!visitId) {
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
          <div className="d-flex gap-3 justify-content-center">
            <button className="btn btn-primary" onClick={() => openKind('ENTRY')}>
              Mostrar QR de entrada
            </button>
            <button className="btn btn-primary" onClick={() => openKind('EXIT')}>
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
