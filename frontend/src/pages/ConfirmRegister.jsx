// src/pages/ConfirmRegister.jsx
import { useLocation, useNavigate } from 'react-router-dom';
import { useMemo, useEffect, useState } from 'react';
import { api } from '../services/api';

export default function ConfirmRegister() {
  const location = useLocation();
  const nav = useNavigate();

  //SIEMPRE calcula form con un useMemo en la raíz
  const form = useMemo(() => {
    const f = location.state?.form;
    return f ? f : null;
  }, [location.state]);

  // estados necesarios
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);

  // Si no hay datos, renderiza un aviso simple (sin hooks adicionales)
  if (!form) {
    return (
      <div className="container mt-4" style={{ maxWidth: 520 }}>
        <div className="alert alert-warning">
          No hay datos para confirmar. Regresa al formulario.
        </div>
        <button className="btn btn-outline-primary" onClick={() => nav('/register', { replace: true })}>
          Regresar al formulario
        </button>
      </div>
    );
  }

  const handleConfirm = async () => {
    try {
      await api.post('/auth/register', {
        boleta: form.boleta,
        firstName: form.firstName,
        lastNameP: form.lastNameP,
        lastNameM: form.lastNameM,
        email: form.email,
        contactEmail: form.contactEmail, // ✅ Agregado
        password: form.password,
      });
      // listo -> a login
      setOk(true);
      setMsg('Cuenta creada con éxito. Por favor, inicia sesión.');
      // Pequeña pausa y redirección al login con un flash opcional
      setTimeout(() => {
        nav('/login', {
          replace: true,
          state: { flash: 'Tu cuenta fue creada. Inicia sesión.' },
        });
      }, 1600);
    } catch (e) {
      const server = e?.response?.data;
      setMsg(server?.error || 'No se pudo completar el registro.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="container mt-4" style={{ maxWidth: 520 }}>
      <div className="bg-secondary bg-opacity-75 text-white rounded-3 p-3">
        <h5 className="text-center mb-3">Verifica tus datos</h5>

        <div className="mb-2"><b>Boleta:</b> {form.boleta}</div>
        <div className="mb-2"><b>Nombre completo:</b> {`${form.firstName} ${form.lastNameP} ${form.lastNameM}`}</div>
        <div className="mb-2"><b>Correo institucional:</b> {form.email}</div>
        {form.contactEmail && (
          <div className="mb-2"><b>Correo de contacto:</b> {form.contactEmail}</div>
        )}
        <div className="mb-2"><b>Contraseña:</b> ••••••••••</div>

        {msg && <div className={`alert ${ok ? 'alert-success' : 'alert-danger'} mt-3`}>{msg}</div>}

        <div className="d-flex gap-2 mt-3">
          <button className="btn btn-outline-light flex-fill" onClick={() => nav('/register', { state: { form } })} disabled={sending}>
            Regresar
          </button>
          <button className="btn btn-primary flex-fill" onClick={handleConfirm} disabled={sending}>
            {sending ? 'Registrando...' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
