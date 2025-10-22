import { useState } from 'react';
import { api } from '../services/api';
import { Link } from 'react-router-dom';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const [sending, setSending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    if (!email.trim()) {
      setMsg('Ingresa tu correo institucional.');
      return;
    }
    setSending(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setOk(true);
      setMsg(data?.message || 'Si el correo existe, enviaremos un enlace.');
    } catch (err) {
      setOk(true); // igual mostramos éxito para no filtrar
      setMsg('Si el correo existe, enviaremos un enlace.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="container mt-4" style={{ maxWidth: 420 }}>
      <div className="bg-secondary bg-opacity-75 text-white rounded-3 p-3">
        <h5 className="text-center mb-3">¿Olvidaste tu contraseña?</h5>
        <form onSubmit={submit}>
          <label className="form-label">Correo institucional</label>
          <input
            type="email"
            className="form-control mb-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="usuario@alumno.ipn.mx"
          />
          {msg && (
            <div className={`alert mt-2 ${ok ? 'alert-success' : 'alert-danger'}`}>
              {msg}
            </div>
          )}
          <div className="d-flex gap-2 mt-3">
            <Link to="/login" className="btn btn-outline-light flex-fill">Regresar</Link>
            <button className="btn btn-primary flex-fill" disabled={sending}>
              {sending ? 'Enviando…' : 'Enviar enlace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}