// frontend/src/pages/Landing.jsx
import { Link } from 'react-router-dom';
import escudoESCOM from '../assets/escudoESCOM.jpg';

export default function Landing() {
  return (
    <div className="container text-center mt-5" style={{ maxWidth: 480 }}>
      <img src={escudoESCOM} alt="Escudo ESCOM" style={{ width: 220, marginBottom: 16 }} />
      <h1 className="fw-bold">AccESCOM</h1>
      <p className="text-muted">Bienvenidos ESCOMunidad</p>

      <div className="d-grid gap-3 mt-4">
        <Link to="/login" className="btn btn-primary">Iniciar sesión</Link>
        <Link to="/guest/register" className="btn btn-outline-primary">
          Regístrate como invitado
        </Link>
      </div>

      <hr className="my-4" />

    
      <small className="text-muted">Selecciona tu rol en la parte superior de la aplicación</small>
    </div>
  );
}
