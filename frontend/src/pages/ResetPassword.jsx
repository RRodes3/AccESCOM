import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';

const RE_PASSWORD  = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const nav = useNavigate();

  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!token) setMsg('Enlace inválido.');
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    if (!token) { setMsg('Enlace inválido.'); return; }
    if (pwd !== pwd2) { setMsg('Las contraseñas no coinciden.'); return; }
    if (!RE_PASSWORD.test(pwd)) {
      setMsg('Contraseña débil. Mínimo 12 caracteres con mayúscula, minúscula, número y símbolo.');
      return;
    }
    setSending(true);
    try {
      const { data } = await api.post('/auth/reset-password', { token, password: pwd });
      setOk(true);
      setMsg(data?.message || 'Contraseña actualizada.');
      setTimeout(() => nav('/login'), 1200);
    } catch (err) {
      setOk(false);
      setMsg(err?.response?.data?.error || 'No se pudo restablecer la contraseña.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="container mt-4" style={{ maxWidth: 420 }}>
      <div className="bg-secondary bg-opacity-75 text-white rounded-3 p-3">
        <h5 className="text-center mb-3">Restablecer contraseña</h5>
        <form onSubmit={submit}>
          <label className="form-label">Nueva contraseña</label>
          <input
            type="password"
            className="form-control mb-2"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
          />

          <label className="form-label">Confirmar contraseña</label>
          <input
            type="password"
            className="form-control mb-2"
            value={pwd2}
            onChange={(e) => setPwd2(e.target.value)}
          />

          {msg && (
            <div className={`alert mt-2 ${ok ? 'alert-success' : 'alert-danger'}`}>
              {msg}
            </div>
          )}

          <div className="d-flex gap-2 mt-3">
            <Link to="/login" className="btn btn-outline-light flex-fill">Cancelar</Link>
            <button className="btn btn-primary flex-fill" disabled={sending || !token}>
              {sending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}