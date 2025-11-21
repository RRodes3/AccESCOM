import { Link } from 'react-router-dom';
import '../../components/Common.css';

export default function GuardDashboard() {
  return (
    <div className="container d-flex flex-column justify-content-center align-items-center text-center" style={{ minHeight: '80vh' }}>
      <div style={{ maxWidth: 400 }}>
        <h3 className="mb-3">Panel del Guardia</h3>
        <p className="mb-4">Escanea códigos desde aquí:</p>
        <Link className="btn btn-primary px-4 py-2" to="/guard-scan">
          Iniciar escaneo
        </Link>

        {/* Mensaje de soporte */}
        <div className="soporte-box">
          <p className="soporte-texto">
            ¿Tienes alguna duda o comentario?{" "}
            <a href="mailto:AccESCOM.app@gmail.com" className="soporte-link">
              Contáctanos aquí
            </a>.
          </p>
        </div>
      </div>
    </div>
  );
}
