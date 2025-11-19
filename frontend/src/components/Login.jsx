import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { api } from '../services/api';

const SITE_KEY = process.env.REACT_APP_RECAPTCHA_SITE_KEY;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Detectar si viene de sesión expirada
  const params = new URLSearchParams(location.search);
  const expired = params.get('expired') === '1';
  
  const [flash, setFlash] = useState(location.state?.flash || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaError, setCaptchaError] = useState('');

  // Limpia el formulario cada vez que entras al login
  useEffect(() => {
    setEmail('');
    setPassword('');
    setMsg('');
    setCaptchaError('');
  }, [location.pathname]);

  // Limpia el state flash
  useEffect(() => {
    if (location.state?.flash) {
      const t = setTimeout(() => setFlash(''), 2500);
      navigate(location.pathname, { replace: true, state: null });
      return () => clearTimeout(t);
    }
  }, [location, navigate]);

  // Cerrar sesión al entrar
  useEffect(() => {
    (async () => {
      try { await api.post('/auth/logout'); } catch {}
      try {
        localStorage.removeItem('user');
        localStorage.removeItem('lastActivity');
      } catch {}
    })();
  }, []);

  const getCaptchaToken = () =>
    new Promise((resolve, reject) => {
      if (!window.grecaptcha || !SITE_KEY) {
        return reject(new Error('reCAPTCHA no disponible'));
      }
      window.grecaptcha.ready(() => {
        window.grecaptcha
          .execute(SITE_KEY, { action: 'login' })
          .then(resolve)
          .catch(reject);
      });
    });

  const onChange = (e) => {
    const { name, value } = e.target;
    if (name === 'email') setEmail(value);
    else if (name === 'password') setPassword(value);
  };

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    setCaptchaError('');
    setLoading(true);
    try {
      const captcha = await getCaptchaToken();
      const { data } = await api.post('/auth/login', { email, password, captcha });
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/dashboard');
    } catch (err) {
      if (err?.message?.includes('reCAPTCHA')) {
        setCaptchaError(err.message);
      } else if (err?.response?.status === 403) {
        setMsg('Tu cuenta ha sido deshabilitada. Contacta al administrador.');
      } else if (err?.response?.status === 401) {
        setMsg(err?.response?.data?.error || 'Correo o contraseña incorrectos.');
      } else {
        setMsg(err?.response?.data?.error || 'Error al iniciar sesión');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mt-4" style={{ maxWidth: 420 }}>
      {expired && (
        <div className="alert alert-warning text-center">
          Tu sesión expiró por inactividad.
        </div>
      )}
      
      {flash && <div className="alert alert-success">{flash}</div>}
      {msg && <div className="alert alert-danger">{msg}</div>}
      {captchaError && <div className="alert alert-warning">{captchaError}</div>}

      <form onSubmit={submit} autoComplete="off">
        <label className="form-label">Correo institucional</label>
        <input
          type="email"
          name="email"
          className="form-control mb-2"
          placeholder="usuario@alumno.ipn.mx"
          value={email}
          onChange={onChange}
          autoComplete="off"
          disabled={loading}
        />

        <label className="form-label">Contraseña</label>
        <input
          type="password"
          name="password"
          className="form-control mb-3"
          placeholder="••••••••"
          value={password}
          onChange={onChange}
          autoComplete="new-password"
          disabled={loading}
        />

        <button className="btn btn-primary w-100" type="submit" disabled={loading}>
          {loading ? 'Iniciando...' : 'Iniciar sesión'}
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
