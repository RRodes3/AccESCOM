// src/pages/ConfirmRegister.jsx
import { useLocation, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { api } from '../services/api';

export default function ConfirmRegister() {
  const location = useLocation();
  const nav = useNavigate();

  // ✅ SIEMPRE calcula form con un useMemo en la raíz
  const form = useMemo(() => {
    const f = location.state?.form;
    return f ? f : null;
  }, [location.state]);

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
        password: form.password,
      });
      // listo -> a login
      nav('/login', { replace: true });
    } catch (e) {
      alert(e?.response?.data?.error || 'No se pudo completar el registro');
    }
  };

  return (
    <div className="container mt-4" style={{ maxWidth: 520 }}>
      <div className="bg-secondary bg-opacity-75 text-white rounded-3 p-3">
        <h5 className="text-center mb-3">Verifica tus datos</h5>

        <div className="mb-2"><b>Boleta:</b> {form.boleta}</div>
        <div className="mb-2"><b>Nombre completo:</b> {`${form.firstName} ${form.lastNameP} ${form.lastNameM}`}</div>
        <div className="mb-2"><b>Correo institucional:</b> {form.email}</div>
        <div className="mb-2"><b>Contraseña:</b> ••••••••••</div>

        <div className="d-flex gap-2 mt-3">
          <button className="btn btn-outline-light flex-fill" onClick={() => nav('/register', { state: { form } })}>
            Regresar
          </button>
          <button className="btn btn-primary flex-fill" onClick={handleConfirm}>
            Registrar
          </button>
        </div>
      </div>
    </div>
  );
}
