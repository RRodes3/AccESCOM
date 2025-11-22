// frontend/src/pages/dashboards/UserDashboard.jsx
import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { api } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import '../../components/Common.css';


function QrPanel({ kind, onClose }) {
  const nav = useNavigate();
  const [pass, setPass] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const { data } = await api.get('/qr/my-active', {
        params: { kind, autocreate: '1' },
      });
      setPass(data.pass || null);
      if (!data.pass) setError('No hay QR disponible.');
    } catch (e) {
      setError(e?.response?.data?.error || 'No se pudo obtener el QR');
    }
  };

  useEffect(() => { load(); }, []);

  // refresca cerca de la caducidad (5s antes)
  useEffect(() => {
    if (!pass?.expiresAt) return;
    const end = new Date(pass.expiresAt).getTime();
    const id = setInterval(() => {
      const left = end - Date.now();
      if (left <= 5000) {
        clearInterval(id);
        load();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [pass]);

  if (error) {
    return (
      <div className="mt-3">
        <div className="alert alert-danger mb-3">{error}</div>
        <div className="d-flex gap-2 justify-content-center">
          <button
            className="btn btn-outline-secondary"
            onClick={onClose}
          >
            Regresar
          </button>
        </div>
      </div>
    );
  }
  if (!pass) return <div className="mt-3">Cargando…</div>;

  const leftSec = pass.expiresAt
    ? Math.max(0, Math.floor((new Date(pass.expiresAt).getTime() - Date.now()) / 1000))
    : null;

  return (
    <div className="text-center mt-3">
      <div className="mb-2"><b>QR de {kind === 'ENTRY' ? 'entrada' : 'salida'}</b></div>
      <div className="d-inline-block p-3 bg-white rounded">
        <QRCode value={pass.code} size={220} />
      </div>
      {leftSec !== null && <div className="mt-2 text-muted">Expira en {leftSec}s</div>}
      <div className="mt-3 d-flex gap-2 justify-content-center">
        <button className="btn btn-outline-secondary" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}

export default function UserDashboard() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const [showKind, setShowKind] = useState(null);

  useEffect(() => {
    // Escuchar cambios en localStorage (cuando vuelves de otra página)
    const handleStorageChange = () => {
      const updated = JSON.parse(localStorage.getItem('user') || 'null');
      setUser(updated);
    };
    
    // Llamar inmediatamente por si hubo cambios
    handleStorageChange();
    
    window.addEventListener('storage', handleStorageChange);
    // También escuchar evento personalizado para cambios en la misma pestaña
    window.addEventListener('userUpdated', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('userUpdated', handleStorageChange);
    };
  }, []);

  const openKind = async (kind) => {
    try { await api.post('/qr/ensure-both'); } catch {}
    setShowKind(kind);
  };

  return (
    <div className="container mt-3" style={{ maxWidth: 480 }}>

      {!showKind ? (
        <>
          <div className="bg-secondary bg-opacity-75 text-white rounded-3 p-3 mt-3 text-center">
            <p className="mb-3">Elige la acción que desees realizar:</p>
            <div className="d-flex gap-3 justify-content-center">
              <button className="btn btn-primary" onClick={() => openKind('ENTRY')}>
                Mostrar QR de entrada
              </button>
              <button className="btn btn-primary" onClick={() => openKind('EXIT')}>
                Mostrar QR de salida
              </button>
            </div>
          </div>

          {/* Mensaje de soporte */}
          <div className="soporte-box">
            <p className="soporte-texto">
              ¿Tienes alguna duda o comentario?{" "}
              <a href="mailto:AccESCOM.app@gmail.com" className="soporte-link">
                Contáctanos aquí
              </a>.
            </p>
          </div>
        </>
      ) : (
        <QrPanel kind={showKind} onClose={() => setShowKind(null)} />
      )}
    </div>
  );
}
