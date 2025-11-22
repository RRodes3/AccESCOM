// src/pages/PerfilUsuario.jsx
import { useEffect, useState } from "react";
import { api, getMyAccessLogs } from "../services/api";

// Misma lógica que usamos en GuardScan.jsx
const API_BASE_URL = api.defaults.baseURL || "/api";
const ASSETS_BASE_URL =
  process.env.REACT_APP_ASSETS_BASE_URL ||
  API_BASE_URL.replace(/\/api\/?$/, "");

export default function PerfilUsuario() {
  const [user, setUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // 🔹 1) Cargar usuario logueado
  useEffect(() => {
    // Ajusta esta clave al nombre que tú usas
    // (por ejemplo "usuario", "user", etc.)
    const stored = localStorage.getItem("usuario") || localStorage.getItem("user");
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        console.warn("No se pudo parsear el usuario del localStorage");
      }
    }

    // Si quieres, como refuerzo, podrías llamar a /auth/me aquí:
    // api.get("/auth/me").then(res => setUser(res.data.user));
  }, []);

  // 🔹 2) Cargar mis accesos (endpoint /qr/my-access que ya hiciste)
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await getMyAccessLogs();
        if (res.data?.ok) {
          setLogs(res.data.logs || []);
        } else if (Array.isArray(res.data)) {
          // por si tu backend devuelve directamente el array
          setLogs(res.data);
        }
      } catch (err) {
        console.error("Error cargando mis accesos:", err);
      } finally {
        setLoadingLogs(false);
      }
    };

    fetchLogs();
  }, []);

  if (!user) {
    return (
      <div className="container mt-4">
        <h3>Mi perfil</h3>
        <p>Cargando datos de usuario...</p>
      </div>
    );
  }

  const fullName =
    [user.firstName, user.lastNameP, user.lastNameM]
      .filter(Boolean)
      .join(" ") || user.name || "—";

  // construir URL de foto con el mismo esquema del scan
  const photoSrc = user.photoUrl ? `${ASSETS_BASE_URL}${user.photoUrl}` : null;

  return (
    <div className="container mt-4" style={{ maxWidth: 960 }}>
      <h2 className="mb-4">Mi perfil</h2>

      {/* Bloque principal: foto + datos */}
      <div className="row align-items-center mb-4">
        <div className="col-md-4 d-flex justify-content-center mb-3 mb-md-0">
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
                    (user.firstName?.[0] || user.name?.[0] || "U").toUpperCase()
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
                {(user.firstName?.[0] || user.name?.[0] || "U").toUpperCase()}
              </span>
            )}
          </div>
        </div>

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
                <strong>Correo de contacto:</strong>{" "}
                {user.contactEmail || "No registrado"}
              </p>
              <p className="mb-1">
                <strong>Tipo institucional:</strong>{" "}
                {user.institutionalType || "—"}
              </p>
              <p className="mb-0">
                <strong>Estado de cuenta:</strong>{" "}
                {user.isActive === false ? "Desactivada" : "Activa"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de últimos accesos */}
      <h4 className="mt-4 mb-3">Mis últimos accesos</h4>

      <div className="card">
        <div className="card-body">
          {loadingLogs ? (
            <p>Cargando registros...</p>
          ) : logs.length === 0 ? (
            <p className="text-muted mb-0">
              Aún no hay registros de entrada/salida.
            </p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Acción</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const created = new Date(log.createdAt);
                    const tipo =
                      log.qr?.kind === "ENTRY"
                        ? "Entrada"
                        : log.qr?.kind === "EXIT"
                        ? "Salida"
                        : log.kind || "-";

                    const accion = log.action || log.result || "-";

                    return (
                      <tr key={log.id}>
                        <td>{created.toLocaleString("es-MX")}</td>
                        <td>{tipo}</td>
                        <td>{accion}</td>
                        <td>{log.reason || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
