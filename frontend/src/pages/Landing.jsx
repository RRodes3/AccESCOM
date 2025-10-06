// frontend/src/pages/Landing.jsx
import { Link } from 'react-router-dom';
import logo from '../assets/escudoESCOM.jpg';

export default function Landing() {
  return (
    <div className="container text-center mt-5" style={{ maxWidth: 420 }}>
      {/* Logo */}
      <img src={logo} alt="ESCOM" style={{ width: 160, marginBottom: 20 }} />

      <h2 className="fw-bold">AccESCOM</h2>
      <p className="text-muted">Bienvenidos ESCOMunidad</p>

      {/* Botón iniciar sesión */}
      <div className="d-grid gap-2 mt-4">
        <Link to="/login" className="btn btn-primary btn-lg">
          Iniciar sesión
        </Link>
      </div>

      {/* Botón registrarse (usuarios normales) */}
      <div className="d-grid gap-2 mt-3">
        <Link to="/register" className="btn btn-outline-primary btn-lg">
          Registrarse
        </Link>
        <small className="text-muted">¿No tienes cuenta?</small>
      </div>

      {/* Botón invitado */}
      <div className="d-grid gap-2 mt-3">
        <Link to="/guest/register" className="btn btn-outline-primary btn-lg">
          Regístrate como invitado
        </Link>
        <small className="text-muted">¿No eres miembro de la ESCOMunidad?</small>
      </div>
    </div>
  );
}
