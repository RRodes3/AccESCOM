// frontend/src/pages/PerfilGuardia.jsx
import { useEffect, useState } from "react";
import { api } from "../services/api";
import ThemeToggle from "../components/ThemeToggle";

const API_BASE_URL = api.defaults.baseURL || "/api";
const ASSETS_BASE_URL =
  process.env.REACT_APP_ASSETS_BASE_URL ||
  API_BASE_URL.replace(/\/api\/?$/, "");

export default function PerfilGuardia() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setUser(parsed);
      } catch {
        console.warn("No se pudo parsear el usuario del localStorage");
      }
    }
  }, []);

  if (!user) {
    return (
      <div className="container mt-4">
        <h3>Mi perfil</h3>
        <p>Cargando datos...</p>
      </div>
    );
  }

  const fullName =
    [user.firstName, user.lastNameP, user.lastNameM]
      .filter(Boolean)
      .join(" ") || user.name || "—";

  const photoSrc = user.photoUrl
    ? (user.photoUrl.startsWith('http') ? user.photoUrl : `${ASSETS_BASE_URL}${user.photoUrl}`)
    : null;

  return (
    <div className="container mt-4" style={{ maxWidth: 960 }}>
      <h2 className="mb-4">Mi perfil</h2>

      {/* Bloque principal: foto + datos */}
      <div className="row mb-4">
        {/* Columna de la foto */}
        <div className="col-md-4 d-flex flex-column align-items-center mb-3 mb-md-0">
          <div
            style={{
              width: 160,
              height: 160,
              borderRadius: "50%",
              overflow: "hidden",
              background: "#d9a89c",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "0.75rem",
            }}
          >
            {photoSrc ? (
              <img
                src={photoSrc}
                alt="Foto de perfil"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onError={(e) => {
                  console.error("Error cargando foto de perfil:", photoSrc);
                  e.target.style.display = "none";
                  e.target.parentElement.innerHTML = `<span style="font-size: 3rem; color: #333; font-weight: bold;">${
                    (user.firstName?.[0] || user.name?.[0] || "G").toUpperCase()
                  }</span>`;
                }}
              />
            ) : (
              <span
                style={{
                  fontSize: "3rem",
                  color: "#333",
                  fontWeight: "bold",
                }}
              >
                {(user.firstName?.[0] || user.name?.[0] || "G").toUpperCase()}
              </span>
            )}
          </div>
          <div className="text-muted small" style={{ textAlign: 'center' }}>
            Foto no editable
          </div>
        </div>

        {/* Columna de datos del guardia */}
        <div className="col-md-8">
          <div className="card">
            <div className="card-body">
              <h5 className="card-title mb-3">{fullName}</h5>

              <p className="mb-1">
                <strong>Boleta:</strong> {user.boleta || "—"}
              </p>
              <p className="mb-1">
                <strong>Correo institucional:</strong> {user.email}
              </p>
              <p className="mb-1">
                <strong>Rol:</strong> Guardia
              </p>
              <p className="mb-0">
                <strong>Estado de cuenta:</strong>{" "}
                {user.isActive === false ? "Desactivada" : "Activa"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Modo oscuro */}
      <div className="card mb-4">
        <div className="card-body">
          <h5 className="card-title mb-3">Preferencias</h5>
          <ThemeToggle />
        </div>
      </div>

      {/* Botón cambiar contraseña */}
      <div className="d-flex justify-content-end mb-3">
        <button
          className="btn btn-outline-secondary btn-sm"
          onClick={() => {
            if (!window.confirm('¿Seguro que quieres cambiar tu contraseña?')) return;
            window.location.href = '/change-password';
          }}
        >
          Cambiar contraseña
        </button>
      </div>
    </div>
  );
}