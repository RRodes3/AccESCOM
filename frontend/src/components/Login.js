import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@demo.com');
  const [password, setPassword] = useState('123456');
  const [msg, setMsg] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      const { data } = await api.post('/auth/login', { email, password });
      // Guarda al usuario en el localStorage
      localStorage.setItem('user', JSON.stringify(data.user));
      // Redirige al dashboard; DashboardSwitch decidirá qué panel mostrar
      navigate('/dashboard');
    } catch (err) {
      console.log('LOGIN ERROR:', err?.response?.status, err?.response?.data);
      setMsg(err?.response?.data?.error || 'Error al iniciar sesión');
    }
  };

  return (
    <div className="container" style={{ maxWidth: 420, marginTop: 32 }}>
      <h3 className="mb-3">Iniciar sesión</h3>
      <form onSubmit={submit}>
        <input
          className="form-control mb-2"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Correo"
        />
        <input
          className="form-control mb-3"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
        />
        <button className="btn btn-primary w-100">Entrar</button>
      </form>
      {msg && <div className="alert alert-danger mt-3">{msg}</div>}
    </div>
  );
}
