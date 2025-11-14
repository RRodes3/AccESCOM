// src/components/ChangePassword.jsx (o src/pages/ChangePassword.jsx)
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export default function ChangePassword() {
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword]       = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validaciones básicas en front
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Por favor completa todos los campos.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('La nueva contraseña y la confirmación no coinciden.');
      return;
    }

    // (Opcional) Checar longitud mínima antes de mandar
    if (newPassword.length < 12) {
      setError('La contraseña debe tener al menos 12 caracteres.');
      return;
    }

    setLoading(true);
    try {
      // 👇 Ajusta si tu backend usa otros nombres, pero normalmente es así:
      await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });

      // ✅ Si el backend no lanzó error, asumimos cambio correcto
      // 1) Actualizamos el user en localStorage para apagar mustChangePassword
      try {
        const stored = JSON.parse(localStorage.getItem('user') || 'null');
        if (stored) {
          stored.mustChangePassword = false;
          localStorage.setItem('user', JSON.stringify(stored));
        }
      } catch {
        // si falla el parse no pasa nada grave
      }

      // 2) Mensaje bonito
      setSuccess('Tu contraseña se actualizó correctamente.');

      // 3) Redirigir al dashboard después de un momento
      setTimeout(() => {
        navigate('/dashboard');
      }, 1200);
    } catch (e) {
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        'No se pudo cambiar la contraseña.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mt-4" style={{ maxWidth: 480 }}>
      <h3>Cambiar contraseña</h3>
      <p className="text-muted">
        Por seguridad, te recomendamos usar una contraseña única, con al menos 12 caracteres,
        incluyendo mayúsculas, minúsculas, números y símbolos.
      </p>

      {error && (
        <div className="alert alert-danger">
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label className="form-label">Contraseña actual</label>
          <input
            type="password"
            className="form-control"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Nueva contraseña</label>
          <input
            type="password"
            className="form-control"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
          <div className="form-text">
            Debe tener al menos 12 caracteres, con mayúsculas, minúsculas, número y símbolo.
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label">Confirmar nueva contraseña</label>
          <input
            type="password"
            className="form-control"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
        >
          {loading ? 'Guardando…' : 'Cambiar contraseña'}
        </button>
      </form>
    </div>
  );
}
