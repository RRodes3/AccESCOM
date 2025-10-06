import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';

export default function GuestDashboard() {
  const nav = useNavigate();
  const [data, setData] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('guestVisit') || 'null');
    } catch { return null; }
  });

  // Si no hay datos (entraste directo), manda al formulario de invitado
  useEffect(() => {
    if (!data?.passes) nav('/guest/register', { replace: true });
  }, [data, nav]);

  const entry = data?.passes?.ENTRY || null;
  const exit  = data?.passes?.EXIT  || null;

  // Countdown simple (usa expiresAt si viene)
  const [left, setLeft] = useState(() => {
    const exp = entry?.expiresAt ? new Date(entry.expiresAt).getTime() : null;
    return exp ? Math.max(0, Math.floor((exp - Date.now())/1000)) : null;
  });
  useEffect(() => {
    if (!entry?.expiresAt) return;
    const exp = new Date(entry.expiresAt).getTime();
    const id = setInterval(() => {
      setLeft(Math.max(0, Math.floor((exp - Date.now())/1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [entry?.expiresAt]);

  const nice = (s) => s ? new Date(s).toLocaleString() : '—';

  if (!entry || !exit) {
    return <div className="container mt-4">Cargando…</div>;
  }

  return (
    <div className="container mt-4" style={{ maxWidth: 720 }}>
      <div className="bg-secondary bg-opacity-75 text-white rounded-3 p-3">
        <h5 className="text-center mb-3">Códigos QR de invitado</h5>
        <p className="mb-2"><b>Vigencia:</b> {nice(entry.expiresAt)}</p>
        {left !== null && <p className="text-muted">Expira en {left}s</p>}
        
        <div className="row g-3">
          <div className="col-12 col-md-6 text-center">
            <div className="fw-semibold mb-2">QR de entrada</div>
            <div className="d-inline-block p-2 bg-white rounded">
              <QRCode value={entry.code} size={200} />
            </div>
            <div className="small text-muted mt-1">{entry.code}</div>
          </div>
          <div className="col-12 col-md-6 text-center">
            <div className="fw-semibold mb-2">QR de salida</div>
            <div className="d-inline-block p-2 bg-white rounded">
              <QRCode value={exit.code} size={200} />
            </div>
            <div className="small text-muted mt-1">{exit.code}</div>
          </div>
        </div>

        <div className="alert alert-info mt-3 mb-2">
          Los QR de invitado son de <b>un solo uso cada uno</b> (entrada y salida).
          Si necesitas otra visita, registra un nuevo formulario.
        </div>

        <div className="d-flex gap-2">
          <button className="btn btn-outline-light" onClick={() => nav('/', { replace: true })}>
            Terminar
          </button>
          <button
            className="btn btn-outline-light ms-auto"
            onClick={() => { sessionStorage.removeItem('guestVisit'); nav('/guest/register', { replace: true }); }}
          >
            Registrar otra visita
          </button>
        </div>
      </div>
    </div>
  );
}
