import { Link } from 'react-router-dom';

export default function GuardDashboard() {
  return (
    <div className="container mt-3">
      <h3>Panel del Guardia</h3>
      <p>Escanea códigos desde aquí:</p>
      <Link className="btn btn-primary" to="/guard-scan">Ir al lector de QR</Link>
    </div>
  );
}
