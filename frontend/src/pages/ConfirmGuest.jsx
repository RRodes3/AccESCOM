// src/pages/ConfirmGuest.jsx
import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function ConfirmGuest() {
  const nav = useNavigate();
  const { state } = useLocation();
  const form = state?.form || null;

  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');

  // Si llegan sin datos, regrésalos al formulario
  useEffect(() => {
    if (!form) nav('/guest/register', { replace: true });
  }, [form, nav]);

  if (!form) return null;

  const submit = async () => {
    if (sending) return;
    setSending(true);
    setMsg('');
    try {
      // Validación + guardado en BD (backend) y emisión de QR (1 uso c/u)
      const { data } = await api.post('/guest/register', {
        firstName: form.firstName.trim(),
        lastNameP: form.lastNameP.trim(),
        lastNameM: form.lastNameM?.trim() || null,
        curp: form.curp.trim().toUpperCase(),
        reason: form.reason.trim(),
      });

      // Esperamos { ok:true, visitor, passes: { ENTRY, EXIT } }
      if (data?.passes?.ENTRY && data?.passes?.EXIT) {
        sessionStorage.setItem('guestVisit', JSON.stringify(data));
        window.dispatchEvent(new Event('guestVisitUpdate')); //avisa que hay sesión nueva
        nav('/guest/dashboard', { replace: true });
      } else {
        setMsg('No se recibieron QR del invitado.');
      }
    } catch (e) {
      const server = e?.response?.data;
      setMsg(server?.error || 'No se pudo registrar al invitado.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="container mt-4" style={{ maxWidth: 520 }}>
      <div className="bg-secondary bg-opacity-75 text-white rounded-3 p-3 mt-3">
        <h5 className="text-center mb-3">Verifica tus datos</h5>

        <label className="form-label">Nombre(s)</label>
        <input className="form-control mb-2" readOnly value={form.firstName} />

        <label className="form-label">Apellido Paterno</label>
        <input className="form-control mb-2" readOnly value={form.lastNameP} />

        <label className="form-label">Apellido Materno</label>
        <input className="form-control mb-2" readOnly value={form.lastNameM} />

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
            {sending ? 'Confirmando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
