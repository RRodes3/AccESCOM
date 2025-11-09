import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { api } from '../services/api';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [flash, setFlash] = useState(location.state?.flash || '');
  const [email, setEmail] = useState('admin@demo.com');
  const [password, setPassword] = useState('123456');
  const [msg, setMsg] = useState('');

  // Limpia el formulario cada vez que entras al login
  useEffect(() => {
    setEmail('');
    setPassword('');
    setMsg('');
  }, [location.pathname]);

  // Limpia el state para que al refrescar no reaparezca
  useEffect(() => {
    if (location.state?.flash) {
      const t = setTimeout(() => setFlash(''), 2500); // oculta después de 2.5s
      // Reemplaza el history state para no mantener 'flash'
      navigate(location.pathname, { replace: true, state: null });
      return () => clearTimeout(t);
    }
  }, [location, navigate]);

  const onChange = (e) => {
    const { name, value } = e.target;
    if (name === 'email') setEmail(value);
    else if (name === 'password') setPassword(value);
  };

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
    <div className="container mt-4" style={{ maxWidth: 420 }}>
      {flash && <div className="alert alert-success">{flash}</div>}
      {msg && <div className="alert alert-danger">{msg}</div>}

      <form onSubmit={submit} autoComplete="off">
        <label className="form-label">Correo institucional</label>
        <input
          type="email"
          name="email"
          className="form-control mb-2"
          placeholder="usuario@alumno.ipn.mx"
          value={email}
          onChange={onChange}
          autoComplete="off" //Evita que Chrome recuerde
        />

        <label className="form-label">Contraseña</label>
        <input
          type="password"
          name="password"
          className="form-control mb-3"
          placeholder="••••••••"
          value={password}
          onChange={onChange}
          autoComplete="new-password" //Evita autocompletar
        />

        <button className="btn btn-primary w-100" type="submit">
          Iniciar sesión
        </button>

        <div className="text-center mt-3">
          <span style={{ color: '#000000ff' }}>¿Olvidaste tu contraseña? </span>
          <Link
            to="/forgot-password"
            className="text-decoration-underline"
            style={{ color: '#4c78f5', fontWeight: 600 }}
          >
            Presiona aquí
          </Link>
        </div>

      </form>
    </div>
  );
}
