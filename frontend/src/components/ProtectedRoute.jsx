import { Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function ProtectedRoute({ children, requiredRole }) {
  const [loading, setLoading] = useState(true);
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    async function validateSession() {
      try {
        // Llamar al backend para verificar que la sesión es válida
        const { data } = await api.get('/auth/me');

        // Actualizar localStorage con datos frescos del servidor
        localStorage.setItem('user', JSON.stringify(data.user));

        // Validar rol si es requerido
        if (requiredRole && data.user.role !== requiredRole) {
          console.warn(`Rol requerido: ${requiredRole}, rol actual: ${data.user.role}`);
          setIsValid(false);
        } else {
          setIsValid(true);
        }
      } catch (error) {
        console.error('Error validando sesión:', error);
        // Si falla (usuario eliminado, sesión expirada, etc.), limpiar
        localStorage.removeItem('user');
        setIsValid(false);
      } finally {
        setLoading(false);
      }
    }

    validateSession();
  }, [requiredRole]);

  if (loading) {
    return (
      <div
        className="d-flex justify-content-center align-items-center"
        style={{ minHeight: '100vh' }}
      >
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Validando sesión...</span>
        </div>
      </div>
    );
  }

  if (!isValid) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
