// src/pages/PerfilUsuario.jsx
import { useEffect, useState } from "react";
import { api, getMyAccessLogs, updateContactEmail } from "../services/api";

const API_BASE_URL = api.defaults.baseURL || "/api";
const ASSETS_BASE_URL =
  process.env.REACT_APP_ASSETS_BASE_URL ||
  API_BASE_URL.replace(/\/api\/?$/, "");

const translateInstitutionalType = (type) => {
  const translations = {
    STUDENT: 'Estudiante',
    TEACHER: 'Profesor',
    PAE: 'PAE'
  };
  return translations[type] || type || '—';
};

export default function PerfilUsuario() {
  const [user, setUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [editingEmail, setEditingEmail] = useState(false);
  const [contactEmailDraft, setContactEmailDraft] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem("usuario") || localStorage.getItem("user");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setUser(parsed);
        if (parsed?.contactEmail) {
          setContactEmailDraft(parsed.contactEmail);
        }
      } catch {
        console.warn("No se pudo parsear el usuario del localStorage");
      }
    }
  }, []);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await getMyAccessLogs();
        if (res.data?.ok) {
          setLogs(res.data.logs || []);
        } else if (Array.isArray(res.data)) {
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

  const handleSaveContactEmail = async () => {
    setEmailError('');
    setEmailSuccess('');
    const val = contactEmailDraft.trim();
    if (!val) {
      setEmailError('Ingresa un correo de contacto.');
      return;
    }
    setSavingEmail(true);
    try {
      const res = await updateContactEmail(val);
      if (res.data?.ok) {
        const updated = res.data.user;
        setUser(prev => ({ ...prev, contactEmail: updated.contactEmail }));
        try {
          const stored = JSON.parse(localStorage.getItem('user') || 'null');
          if (stored) {
            stored.contactEmail = updated.contactEmail;
            localStorage.setItem('user', JSON.stringify(stored));
          }
        } catch {}
        setEmailSuccess('Correo actualizado.');
        setEditingEmail(false);
      } else {
        setEmailError(res.data?.message || 'No se pudo actualizar.');
      }
    } catch (e) {
      setEmailError(
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        'Error al actualizar.'
      );
    } finally {
      setSavingEmail(false);
    }
  };

  const handleCancelEmail = () => {
    setEmailError('');
    setEmailSuccess('');
    setContactEmailDraft(user.contactEmail || '');
    setEditingEmail(false);
  };

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

  const photoSrc = user.photoUrl
    ? (user.photoUrl.startsWith('http') ? user.photoUrl : `${ASSETS_BASE_URL}${user.photoUrl}`)
    : null;

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
              <p className="mb-1 d-flex align-items-start">
                <strong className="me-1">Correo de contacto:</strong>
                {!editingEmail ? (
                  <>
                    <span>{user.contactEmail || 'No registrado'}</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-link text-decoration-none ms-2"
                      onClick={() => {
                        setEditingEmail(true);
                        setContactEmailDraft(user.contactEmail || '');
                      }}
                      aria-label="Editar correo de contacto"
                    >
                      ✏️
                    </button>
                  </>
                ) : (
                  <div style={{ flex: 1 }}>
                    <input
                      type="email"
                      className="form-control form-control-sm mb-2"
                      value={contactEmailDraft}
                      onChange={(e) => setContactEmailDraft(e.target.value)}
                      placeholder="correo@ejemplo.com"
                      disabled={savingEmail}
                      autoComplete="off"
                    />
                    {emailError && <div className="text-danger small mb-1">{emailError}</div>}
                    {emailSuccess && <div className="text-success small mb-1">{emailSuccess}</div>}
                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={handleSaveContactEmail}
                        disabled={savingEmail}
                      >
                        {savingEmail ? 'Guardando...' : 'Aceptar'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={handleCancelEmail}
                        disabled={savingEmail}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </p>
              <p className="mb-1">
                <strong>Tipo institucional:</strong>{" "}
                {translateInstitutionalType(user.institutionalType)}
              </p>
              <p className="mb-0">
                <strong>Estado de cuenta:</strong>{" "}
                {user.isActive === false ? "Desactivada" : "Activa"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="d-flex justify-content-end mb-3">
        <button
          className="btn btn-outline-secondary btn-sm"
          onClick={() => window.location.href = '/change-password'}
        >
          Cambiar contraseña
        </button>
      </div>

      <h4 className="mt-2 mb-3">Mis últimos accesos</h4>

      {/* Tabla de últimos accesos con diseño mejorado */}
      <div className="card" style={{ backgroundColor: '#f8f9fa', border: '1px solid #dee2e6' }}>
        <div className="card-body">
          {loadingLogs ? (
            <p>Cargando registros...</p>
          ) : logs.length === 0 ? (
            <p className="text-muted mb-0">
              Aún no hay registros de entrada/salida.
            </p>
          ) : (
            <div className="table-responsive">
              <table className="table table-striped align-middle mb-0" style={{ backgroundColor: 'white' }}>
                <thead style={{ backgroundColor: '#e9ecef' }}>
                  <tr>
                    <th style={{ fontWeight: 600 }}>Fecha</th>
                    <th style={{ fontWeight: 600 }}>Tipo</th>
                    <th style={{ fontWeight: 600 }}>Acción</th>
                    <th style={{ fontWeight: 600 }}>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    // Formatear fecha correctamente
                    const created = new Date(log.createdAt);
                    const fechaFormateada = !isNaN(created.getTime()) 
                      ? created.toLocaleString("es-MX", {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: true
                        })
                      : '—';

                    // Tipo de acceso (ENTRY/EXIT)
                    const tipo = log.accessType === "ENTRY" 
                      ? "Entrada" 
                      : log.accessType === "EXIT"
                      ? "Salida"
                      : "—";

                    // Resultado con colores
                    const resultado = log.result || "—";
                    let colorClass = '';
                    let backgroundColor = '';
                    
                    if (resultado === 'ALLOWED') {
                      colorClass = 'text-white';
                      backgroundColor = '#28a745'; // Verde
                    } else if (resultado.includes('DENIED') || resultado.includes('INVALID') || resultado.includes('EXPIRED')) {
                      colorClass = 'text-white';
                      backgroundColor = '#dc3545'; // Rojo
                    } else {
                      colorClass = 'text-dark';
                      backgroundColor = '#6c757d'; // Gris
                    }

                    return (
                      <tr key={log.id}>
                        <td style={{ fontSize: '0.9rem' }}>{fechaFormateada}</td>
                        <td style={{ fontSize: '0.9rem' }}>
                          <span className="badge bg-secondary">{tipo}</span>
                        </td>
                        <td>
                          <span 
                            className={`badge ${colorClass}`}
                            style={{ 
                              backgroundColor,
                              padding: '0.5rem 0.75rem',
                              fontSize: '0.85rem',
                              fontWeight: 600
                            }}
                          >
                            {resultado}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.9rem' }}>{log.reason || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {photoSrc && (
        <div className="mt-2 d-flex gap-2">
          <label className="btn btn-sm btn-primary mb-0">
            Reemplazar
            <input
              type="file"
              accept="image/jpeg,image/png"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                  if (!file) return;
                  const form = new FormData();
                  // usar boleta preferentemente
                  form.append('boletaOrEmail', user.boleta || user.email);
                  form.append('photo', file);
                  try {
                    const { data } = await api.post('/admin/import/photos', form, {
                      headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    if (data.ok) {
                      setUser(prev => ({ ...prev, photoUrl: data.photoUrl }));
                      const stored = JSON.parse(localStorage.getItem('user') || 'null');
                      if (stored) {
                        stored.photoUrl = data.photoUrl;
                        localStorage.setItem('user', JSON.stringify(stored));
                      }
                    } else {
                      alert(data.error || 'Error subiendo foto');
                    }
                  } catch (err) {
                    alert(err?.response?.data?.error || 'Error subiendo foto');
                  } finally {
                    e.target.value = '';
                  }
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            onClick={async () => {
              if (!confirm('¿Eliminar foto de perfil?')) return;
              try {
                const { data } = await api.delete(`/admin/import/photos/${user.boleta || user.email}`);
                if (data.ok) {
                  setUser(prev => ({ ...prev, photoUrl: null }));
                  const stored = JSON.parse(localStorage.getItem('user') || 'null');
                  if (stored) {
                    stored.photoUrl = null;
                    localStorage.setItem('user', JSON.stringify(stored));
                  }
                } else {
                  alert(data.error || 'Error eliminando foto');
                }
              } catch (err) {
                alert(err?.response?.data?.error || 'Error eliminando foto');
              }
            }}
          >
            Eliminar
          </button>
        </div>
      )}
    </div>
  );
}
