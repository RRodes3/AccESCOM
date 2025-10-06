import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../services/api';
import QRCode from 'react-qr-code';

export default function ConfirmGuest() {
  const nav = useNavigate();
  const { state } = useLocation();
  const form = state?.form || null;

  // 1) Estado con los QR (si refrescan, intenta leer de sessionStorage)
  const [passes, setPasses] = useState(() => {
    const fromNav = state?.passes;
    if (fromNav) return fromNav;
    try {
      const s = JSON.parse(sessionStorage.getItem('guestVisit') || 'null');
      return s?.passes || null;
    } catch {
      return null;
    }
  });

  const entry = passes?.ENTRY || null;
  const exit  = passes?.EXIT  || null;

  // 2) **Hooks SIEMPRE antes de cualquier return**
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!form && (!entry || !exit)) {
      nav('/guest/register', { replace: true });
    }
  }, [form, entry, exit, nav]);

  // Guard de redirección: ya podemos cortar el render aquí
  if (!form && (!entry || !exit)) return null;

  // Si ya tenemos QR generados, muéstralos
  if (passes) {
    return (
      <div className="container mt-4" style={{ maxWidth: 720 }}>
        <div className="bg-secondary bg-opacity-75 text-white rounded-3 p-3">
          <h5 className="text-center mb-3">Códigos QR de invitado</h5>

          <div className="row g-3">
            <div className="col-12 col-md-6 text-center">
              <div className="fw-semibold mb-2">QR de entrada</div>
              <div className="d-inline-block p-2 bg-white rounded">
                <QRCode value={entry.code} size={200} />
              </div>
            </div>
            <div className="col-12 col-md-6 text-center">
              <div className="fw-semibold mb-2">QR de salida</div>
              <div className="d-inline-block p-2 bg-white rounded">
                <QRCode value={exit.code} size={200} />
              </div>
            </div>
          </div>

          <div className="d-flex gap-2 mt-3">
            <button
              className="btn btn-primary"
              onClick={() => nav('/guest/dashboard', { replace: true })}
            >
              Ir al dashboard de invitado
            </button>
            <button
              className="btn btn-outline-light"
              onClick={() => nav('/', { replace: true })}
            >
              Terminar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Submit para generar la visita + QR
  const submit = async () => {
    if (sending) return;
    setSending(true);
    setMsg('');
    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastNameP: form.lastNameP.trim(),
        lastNameM: form.lastNameM?.trim() || null,
        curp: form.curp.trim().toUpperCase(),
        reason: form.reason.trim(),
      };
      const { data } = await api.post('/guest/register', payload);
      if (data?.passes) {
        sessionStorage.setItem('guestVisit', JSON.stringify(data));
        setPasses(data.passes);
      } else {
        setMsg('No se recibieron QR de invitado.');
      }
    } catch (e) {
      const server = e?.response?.data;
      setMsg(server?.error || 'No se pudo registrar al invitado.');
    } finally {
      setSending(false);
    }
  };

  // Pantalla de verificación de datos (previa al POST)
  return (
    <div className="container mt-4" style={{ maxWidth: 520 }}>
      <div className="bg-secondary bg-opacity-75 text-white rounded-3 p-3 mt-3">
        <label className="form-label">Nombre(s)</label>
        <input className="form-control mb-2" readOnly value={form.firstName} />

        <label className="form-label">Apellido Paterno</label>
        <input className="form-control mb-2" readOnly value={form.lastNameP} />

        <label className="form-label">Apellido Materno</label>
        <input className="form-control mb-2" readOnly value={form.lastNameM || ''} />

        <label className="form-label">CURP</label>
        <input className="form-control mb-2" readOnly value={form.curp} />

        <label className="form-label">Motivo de visita</label>
        <input className="form-control mb-2" readOnly value={form.reason} />

        {msg && <div className="alert alert-danger mt-2">{msg}</div>}

        <div className="d-flex gap-2 mt-3">
          <button
            className="btn btn-outline-light flex-fill"
            onClick={() => nav('/guest/register', { state: { form }, replace: true })}
          >
            Regresar
          </button>
          <button className="btn btn-primary flex-fill" onClick={submit} disabled={sending}>
            {sending ? 'Registrando…' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
