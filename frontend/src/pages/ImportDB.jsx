import { useState } from "react";
import { api } from "../services/api";
import "./ImportDB.css";

export default function ImportDB() {
  const [tab, setTab] = useState("users"); // users | guests (guests aún no implementado)
  const [mode, setMode] = useState("csv"); // csv | zip | photos
  const [file, setFile] = useState(null);
  const [conflictAction, setConflictAction] = useState("exclude"); // exclude | overwrite | delete
  const [loading, setLoading] = useState(false);

  // Estados de resultados
  const [validationResult, setValidationResult] = useState(null); // dry-run csv/zip
  const [showConflictOptions, setShowConflictOptions] = useState(false);
  const [importResult, setImportResult] = useState(null); // resultado final csv/zip
  const [photosResult, setPhotosResult] = useState(null); // resultado fotos
  const [err, setErr] = useState("");
  const [status, setStatus] = useState(""); // mensaje rápido al importar directo

  // NUEVO: estados para flujo "subir solo fotos válidas"
  const [hasInvalidPhotos, setHasInvalidPhotos] = useState(false);
  const [forcingValidPhotos, setForcingValidPhotos] = useState(false);

  // Determinar endpoint
  function getEndpoint() {
    if (mode === "photos") return "/admin/import-photos";
    if (mode === "zip") return "/admin/import/zip";
    if (mode === "csv") {
      if (tab === "users") return "/admin/users";
      return "/admin/guests"; // placeholder si luego se implementa
    }
    return "/admin/users";
  }

  // Tipos aceptados
  function getFileAccept() {
    if (mode === "photos") {
      return ".zip,.jpg,.jpeg,.png,image/jpeg,image/png,application/zip,application/x-zip-compressed";
    }
    if (mode === "zip") {
      return ".zip,application/zip,application/x-zip-compressed";
    }
    return ".csv,.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }

  // Validación (dry-run) excepto fotos
  async function handleValidation(e) {
    e.preventDefault();
    if (!file) {
      setErr("Selecciona un archivo");
      return;
    }

    if (mode === "zip" && !file.name.toLowerCase().endsWith(".zip")) {
      setErr("Debes seleccionar un archivo ZIP en modo ZIP");
      return;
    }
    if (mode === "csv" && file.name.toLowerCase().endsWith(".zip")) {
      setErr("Selecciona CSV/XLSX en modo CSV");
      return;
    }
    if (mode === "photos") {
      // Fotos se procesan directo
      await handleSubmit(e);
      return;
    }

    setErr("");
    setStatus("");
    setValidationResult(null);
    setShowConflictOptions(false);
    setImportResult(null);
    setPhotosResult(null);
    setHasInvalidPhotos(false);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const endpoint = getEndpoint();
      const url = `${endpoint}?dryRun=true&conflictAction=${conflictAction}`;
      const { data } = await api.post(url, formData);

      setValidationResult(data);
      const summary = data.summary || data;
      const totalConflicts =
        (summary.conflicts?.excluded || 0) +
        (summary.conflicts?.deleted || 0) +
        (summary.conflicts?.overwritten || 0);

      if (totalConflicts > 0) {
        setShowConflictOptions(true);
      }
    } catch (e) {
      const data = e?.response?.data;
      setErr(data?.error || "Error al validar");
      setValidationResult(data || null);
    } finally {
      setLoading(false);
    }
  }

  // Importación directa (sin dry-run) para csv, zip y fotos
  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("");
    setErr(""); // ✅ Limpiar error anterior
    setHasInvalidPhotos(false);

    if (!file) {
      setStatus("Selecciona un archivo primero");
      return;
    }

    try {
      setLoading(true);

      // Importación directa para fotos
      if (mode === "photos") {
        const formData = new FormData();
        formData.append("file", file);

        const { data } = await api.post("/admin/import-photos", formData, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 120000, // 120s solo para esta petición
        });


        console.log("📥 Respuesta del backend:", data); // ✅ LOG DE DEPURACIÓN

        if (data.ok) {
          // Para ZIP (respuesta con stats)
          if (data.stats) {
            const { processed, updated, skippedNoUser, errors, photoErrors } =
              data.stats;

            let statusMsg = `✅ ${updated || 0} fotos asociadas exitosamente.`;

            if (skippedNoUser > 0) {
              statusMsg += ` ⚠️ ${skippedNoUser} sin usuario coincidente.`;
            }

            if (errors > 0) {
              statusMsg += ` ❌ ${errors} errores.`;
            }

            setStatus(statusMsg);
            setPhotosResult({
              ok: true,
              processed: processed || 0,
              updated: updated || 0,
              notMatched: [],
              skipped: [],
              errors: errors || 0,
              photoErrors: photoErrors || [],
              stats: data.stats,
            });
            setHasInvalidPhotos(
              Array.isArray(photoErrors) && photoErrors.length > 0
            );
          }
          // Para imagen individual
          else {
            setStatus(`✅ ${data.message || "Foto importada correctamente"}`);
            setPhotosResult({
              ok: true,
              processed: 1,
              message: data.message,
              photoUrl: data.photoUrl,
            });
            setHasInvalidPhotos(false);
          }

          setImportResult(null);
          setValidationResult(null);
        } else {
          // Backend devolvió ok: false
          setErr(data.error || "Error al importar fotos");
          const photoErrors = data.photoErrors || [];
          setPhotosResult({
            ok: false,
            error: data.error,
            photoErrors,
          });
          if (photoErrors.length > 0) {
            setHasInvalidPhotos(true);
          }
        }
        return;
      }

      // CSV / ZIP directo
      const formData = new FormData();
      formData.append("file", file);
      const endpoint = getEndpoint();
      const url =
        mode === "zip" || mode === "csv"
          ? `${endpoint}?dryRun=false&conflictAction=${conflictAction}`
          : endpoint;

      const { data } = await api.post(url, formData);
      setImportResult(data);
      setValidationResult(null);
      setPhotosResult(null);
      setHasInvalidPhotos(false);

      if (mode === "zip" && data?.photosProcessed !== undefined) {
        setStatus(
          `Usuarios importados: ${
            data.upserted || data.data?.created || 0
          }. Fotos procesadas: ${data.photosProcessed}.`
        );
      } else {
        setStatus(
          `Usuarios importados: ${
            data.upserted || data.data?.created || 0
          }.` +
            (data.conflicts
              ? ` Conflictos: excluidos=${data.conflicts.excluded || 0}, sobrescritos=${
                  data.conflicts.overwritten || 0
                }, eliminados=${data.conflicts.deleted || 0}.`
              : "")
        );
      }

      setTimeout(() => {
        setFile(null);
        const fi = document.getElementById("fileInput");
        if (fi) fi.value = "";
      }, 150);
    } catch (err) {
      console.error("Error completo:", err);
      console.error("Error response:", err?.response?.data);

      const errorMsg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        "Error desconocido en la importación";

      setErr(errorMsg); // ✅ Usar setErr en lugar de setStatus

      // Si hay errores de fotos, mostrarlos
      if (err?.response?.data?.photoErrors) {
        const photoErrors = err.response.data.photoErrors;
        setPhotosResult({
          ok: false,
          error: errorMsg,
          photoErrors,
        });
        if (photoErrors.length > 0) {
          setHasInvalidPhotos(true);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  // 🔁 NUEVO: Importar solo fotos válidas (ignorando las inválidas)
  async function handleForcePhotosValid() {
    if (!file) return;

    setForcingValidPhotos(true);
    setErr("");
    setStatus("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const { data } = await api.post(
        "/admin/import-photos?ignoreInvalid=true",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 120000,
        }
      );

      console.log("📥 Respuesta FORZADA (solo válidas):", data);

      if (data.ok) {
        if (data.stats) {
          const { processed, updated, skippedNoUser, errors, photoErrors } =
            data.stats;

          let statusMsg = `✅ ${updated || 0} fotos asociadas exitosamente (solo válidas).`;

          if (skippedNoUser > 0) {
            statusMsg += ` ⚠️ ${skippedNoUser} sin usuario coincidente.`;
          }
          if (errors > 0) {
            statusMsg += ` ❌ ${errors} errores.`;
          }

          setStatus(statusMsg);
          setPhotosResult({
            ok: true,
            processed: processed || 0,
            updated: updated || 0,
            notMatched: [],
            skipped: [],
            errors: errors || 0,
            photoErrors: photoErrors || [],
            stats: data.stats,
          });
          setHasInvalidPhotos(
            Array.isArray(photoErrors) && photoErrors.length > 0
          );
        } else {
          setStatus(
            `✅ ${data.message || "Fotos válidas importadas correctamente"}`
          );
          setPhotosResult({
            ok: true,
            processed: data.processed || 1,
            message: data.message,
          });
          setHasInvalidPhotos(false);
        }
      } else {
        const photoErrors = data.photoErrors || [];
        setErr(data.error || "Error al importar solo fotos válidas");
        setPhotosResult({
          ok: false,
          error: data.error,
          photoErrors,
        });
        if (photoErrors.length > 0) {
          setHasInvalidPhotos(true);
        }
      }
    } catch (err) {
      console.error("Error FORZANDO válidas:", err);
      const errorMsg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        "Error al importar solo fotos válidas";
      setErr(errorMsg);

      if (err?.response?.data?.photoErrors) {
        const photoErrors = err.response.data.photoErrors;
        setPhotosResult({
          ok: false,
          error: errorMsg,
          photoErrors,
        });
        if (photoErrors.length > 0) {
          setHasInvalidPhotos(true);
        }
      }
    } finally {
      setForcingValidPhotos(false);
    }
  }

  // Importación final según acción (tras dry-run)
  async function handleImport(selectedAction) {
    setLoading(true);
    setErr("");
    setStatus("");
    setShowConflictOptions(false);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const endpoint = getEndpoint();
      const url =
        mode === "zip" || mode === "csv"
          ? `${endpoint}?dryRun=false&conflictAction=${selectedAction}`
          : endpoint;

      const { data } = await api.post(url, formData);

      setImportResult(data);
      setValidationResult(null);
      setPhotosResult(null);
      setHasInvalidPhotos(false);

      setTimeout(() => {
        setFile(null);
        const fileInput = document.getElementById("fileInput");
        if (fileInput) fileInput.value = "";
      }, 100);
    } catch (e) {
      const data = e?.response?.data;
      setErr(data?.error || "Error al importar");
      setImportResult(data || null);
    } finally {
      setLoading(false);
    }
  }

  // Reset
  function handleReset() {
    setFile(null);
    setValidationResult(null);
    setImportResult(null);
    setPhotosResult(null);
    setShowConflictOptions(false);
    setErr("");
    setStatus("");
    setConflictAction("exclude");
    setHasInvalidPhotos(false);
    setForcingValidPhotos(false);
    const fileInput = document.getElementById("fileInput");
    if (fileInput) fileInput.value = "";
  }

  // Cambio de modo
  function handleModeChange(newMode) {
    setMode(newMode);
    setFile(null);
    setValidationResult(null);
    setImportResult(null);
    setPhotosResult(null);
    setShowConflictOptions(false);
    setErr("");
    setStatus("");
    setHasInvalidPhotos(false);
    setForcingValidPhotos(false);
    const fileInput = document.getElementById("fileInput");
    if (fileInput) fileInput.value = "";
  }

  const validationSummary = validationResult?.summary || validationResult;
  const importSummary = importResult;

  return (
    <div className="importdb container py-3">
      <h2 className="mb-3">Importación de BD</h2>

      {/* Tabs */}
      <div className="btn-group mb-3">
        <button
          className={`btn ${
            tab === "users" ? "btn-primary" : "btn-outline-primary"
          }`}
          onClick={() => setTab("users")}
        >
          Usuarios institucionales
        </button>
        <button
          className={`btn ${
            tab === "guests" ? "btn-primary" : "btn-outline-primary"
          }`}
          onClick={() => setTab("guests")}
          disabled
        >
          Invitados (no disponible)
        </button>
      </div>

      {/* Form principal */}
      {!importResult && !photosResult && (
        <div className="card shadow-sm mb-3">
          <div className="card-body">
            <h5 className="card-title">Paso 1: Seleccionar archivo</h5>

            <div className="mb-3">
              <label htmlFor="modeSelect" className="form-label">
                <strong>Modo de importación:</strong>
              </label>
              <select
                id="modeSelect"
                className="form-select"
                value={mode}
                onChange={(e) => handleModeChange(e.target.value)}
              >
                <option value="csv">📄 CSV/XLSX (solo datos)</option>
                <option value="zip">📦 ZIP (CSV/XLSX + fotos)</option>
                <option value="photos">🖼️ Fotos (solo imágenes o ZIP)</option>
              </select>
              <div className="form-text">
                {mode === "csv" &&
                  "Importa únicamente los datos de usuarios desde CSV/XLSX."}
                {mode === "zip" &&
                  "Importa datos y fotos empaquetados en un ZIP (CSV/XLSX + imágenes)."}
                {mode === "photos" &&
                  "Sube solo fotos (imagen suelta o ZIP). Coincide por nombre de archivo = boleta."}
              </div>
            </div>

            <form onSubmit={handleValidation}>
              <div className="row g-3 align-items-end">
                <div className="col-md-10">
                  <label htmlFor="fileInput" className="form-label">
                    {mode === "photos"
                      ? "Archivo de fotos (ZIP o imagen)"
                      : mode === "zip"
                      ? "Archivo ZIP"
                      : "Archivo CSV/XLSX"}
                  </label>
                  <input
                    id="fileInput"
                    type="file"
                    className="form-control mt-3"
                    accept={getFileAccept()}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f && f.size > 50 * 1024 * 1024) {
                        setErr("Archivo demasiado grande (>50MB)");
                        e.target.value = "";
                        setFile(null);
                        return;
                      }
                      setFile(f || null);
                      setPhotosResult(null);
                      setHasInvalidPhotos(false);
                    }}
                  />
                </div>
                <div className="col-md-2">
                  <button
                    className="btn btn-primary w-100"
                    disabled={loading || !file}
                  >
                    {loading
                      ? "Procesando..."
                      : mode === "photos"
                      ? "Importar fotos"
                      : "Validar"}
                  </button>
                </div>
              </div>

              {mode !== "photos" && file && (
                <div className="mt-3">
                  <button
                    type="button"
                    className="btn btn-outline-success"
                    disabled={loading}
                    onClick={handleSubmit}
                  >
                    {loading ? "..." : "Importar directo (sin validación)"}
                  </button>
                </div>
              )}
            </form>

            <div className="mt-3 small text-muted">
              {tab === "users" && mode !== "photos" && (
                <>
                  <strong>Columnas CSV/XLSX:</strong> boleta, firstName,
                  lastNameP, lastNameM, email, role (ADMIN|GUARD|USER),
                  institutionalType (STUDENT|TEACHER|PAE), photoUrl (opcional)
                  {mode === "zip" && (
                    <div className="mt-2">
                      <strong>Estructura ZIP:</strong> CSV/XLSX + fotos
                      nombradas <code>boleta.jpg</code> o{" "}
                      <code>boleta.png</code>
                    </div>
                  )}
                </>
              )}
              {mode === "photos" && (
                <>
                  <strong>Fotos:</strong> Cada imagen debe llamarse
                  <code> boleta.jpg</code> o <code>boleta.png</code>. Si usas
                  ZIP, se procesan todas. El usuario debe existir.
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Status rápido */}
      {status && !err && (
        <div className="alert alert-info alert-dismissible fade show">
          {status}
          <button
            type="button"
            className="btn-close"
            onClick={() => setStatus("")}
          ></button>
        </div>
      )}

      {/* Error */}
      {err && (
        <div className="alert alert-danger alert-dismissible fade show">
          <strong>Error:</strong> {err}
          <button
            type="button"
            className="btn-close"
            onClick={() => setErr("")}
            aria-label="Close"
          ></button>
        </div>
      )}

      {/* Validación CSV/ZIP */}
      {validationResult &&
        !importResult &&
        !photosResult &&
        mode !== "photos" && (
          <div className="card shadow-sm mb-3">
            <div className="card-body">
              <h5 className="card-title">📋 Resultado de validación</h5>

              {/* Resumen */}
              <div className="row g-3 mb-4">
                <div className="col-md-3">
                  <div className="p-3 bg-light rounded text-center">
                    <h3 className="mb-0">{validationSummary?.total || 0}</h3>
                    <small className="text-muted">Total registros</small>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="p-3 bg-success bg-opacity-10 rounded text-center">
                    <h3 className="mb-0 text-success">
                      {validationSummary?.valid || 0}
                    </h3>
                    <small className="text-muted">Válidos</small>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="p-3 bg-danger bg-opacity-10 rounded text-center">
                    <h3 className="mb-0 text-danger">
                      {validationSummary?.errors || 0}
                    </h3>
                    <small className="text-muted">Errores</small>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="p-3 bg-warning bg-opacity-10 rounded text-center">
                    <h3 className="mb-0 text-warning">
                      {(validationSummary?.conflicts?.excluded || 0) +
                        (validationSummary?.conflicts?.deleted || 0) +
                        (validationSummary?.conflicts?.overwritten || 0)}
                    </h3>
                    <small className="text-muted">Conflictos</small>
                  </div>
                </div>
              </div>

              {/* Conflictos */}
              {validationSummary?.conflicts &&
                ((validationSummary.conflicts.excluded || 0) +
                  (validationSummary.conflicts.deleted || 0) +
                  (validationSummary.conflicts.overwritten || 0)) > 0 && (
                  <div className="alert alert-warning">
                    <h6 className="alert-heading">
                      ⚠️ Usuarios duplicados detectados:
                    </h6>
                    <ul className="mb-0">
                      {validationSummary.conflicts.excluded > 0 && (
                        <li>
                          <strong>
                            {validationSummary.conflicts.excluded}
                          </strong>{" "}
                          excluidos
                        </li>
                      )}
                      {validationSummary.conflicts.overwritten > 0 && (
                        <li>
                          <strong>
                            {validationSummary.conflicts.overwritten}
                          </strong>{" "}
                          sobrescritos
                        </li>
                      )}
                      {validationSummary.conflicts.deleted > 0 && (
                        <li>
                          <strong>
                            {validationSummary.conflicts.deleted}
                          </strong>{" "}
                          eliminados
                        </li>
                      )}
                    </ul>
                  </div>
                )}

              {/* Usuarios conflictivos */}
              {validationSummary?.conflicts?.users &&
                validationSummary.conflicts.users.length > 0 && (
                  <div className="card mb-3">
                    <div className="card-header bg-warning bg-opacity-25">
                      <strong>
                        👥 Usuarios duplicados (
                        {validationSummary.conflicts.users.length}):
                      </strong>
                    </div>
                    <div className="card-body p-0">
                      <div className="table-responsive">
                        <table className="table table-sm table-hover mb-0">
                          <thead className="table-light">
                            <tr>
                              <th>Boleta</th>
                              <th>Email</th>
                              <th>Nombre CSV</th>
                              <th>Nombre BD</th>
                              <th>Conflicto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {validationSummary.conflicts.users.map(
                              (conflict, idx) => (
                                <tr key={idx}>
                                  <td>
                                    <code>{conflict.boleta}</code>
                                  </td>
                                  <td>
                                    <code className="small">
                                      {conflict.email}
                                    </code>
                                  </td>
                                  <td>{conflict.name}</td>
                                  <td>{conflict.existingName}</td>
                                  <td>
                                    {conflict.conflictType ===
                                    "Duplicado por boleta y correo" ? (
                                      <span className="badge bg-danger">
                                        Ambos
                                      </span>
                                    ) : conflict.conflictType ===
                                      "Duplicado por boleta" ? (
                                      <span className="badge bg-warning text-dark">
                                        Boleta
                                      </span>
                                    ) : (
                                      <span className="badge bg-info text-dark">
                                        Correo
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

              {/* Errores */}
              {Array.isArray(validationResult.errors) &&
                validationResult.errors.length > 0 && (
                  <div className="mt-3">
                    <h6 className="text-danger">
                      ❌ Errores ({validationResult.errors.length}):
                    </h6>
                    <div className="table-responsive">
                      <table className="table table-sm table-bordered">
                        <thead className="table-light">
                          <tr>
                            <th>Línea</th>
                            <th>Campos</th>
                            <th>Mensajes</th>
                            <th>Fila original</th>
                          </tr>
                        </thead>
                        <tbody>
                          {validationResult.errors.map((e, idx) => (
                            <tr key={idx}>
                              <td>
                                <span className="badge bg-danger">
                                  {e.line}
                                </span>
                              </td>
                              <td>
                                {Object.keys(e.errors).map((k) => (
                                  <span
                                    key={k}
                                    className="badge bg-secondary me-1"
                                  >
                                    {k}
                                  </span>
                                ))}
                              </td>
                              <td>
                                <ul className="mb-0 small">
                                  {Object.entries(e.errors).map(
                                    ([k, v]) => (
                                      <li key={k}>{v}</li>
                                    )
                                  )}
                                </ul>
                              </td>
                              <td>
                                <code className="small">
                                  {JSON.stringify(e.row)}
                                </code>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              {/* Opciones conflicto */}
              {showConflictOptions && (
                <div className="alert alert-primary mt-4">
                  <h6 className="alert-heading">🚀 Paso 2: Confirmar</h6>
                  <p className="mb-3">
                    Elige acción para los usuarios duplicados:
                  </p>
                  <div className="d-flex flex-wrap gap-2">
                    <button
                      onClick={() => handleImport("exclude")}
                      className="btn btn-secondary"
                      disabled={loading}
                    >
                      Excluir
                    </button>
                    <button
                      onClick={() => handleImport("overwrite")}
                      className="btn btn-warning"
                      disabled={loading}
                    >
                      Sobrescribir
                    </button>
                    <button
                      onClick={() => handleImport("delete")}
                      className="btn btn-danger"
                      disabled={loading}
                    >
                      Eliminar y reemplazar
                    </button>
                    <button
                      onClick={handleReset}
                      className="btn btn-outline-secondary"
                      disabled={loading}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Todo válido */}
              {!showConflictOptions &&
                validationSummary?.valid > 0 &&
                validationSummary?.errors === 0 && (
                  <div className="alert alert-success mt-4">
                    <h6 className="alert-heading">✅ Listo para importar</h6>
                    <p>
                      Se importarán{" "}
                      <strong>{validationSummary.valid}</strong> usuarios.
                    </p>
                    <button
                      onClick={() => handleImport(conflictAction)}
                      className="btn btn-success"
                      disabled={loading}
                    >
                      {loading ? "Importando..." : "Importar ahora"}
                    </button>
                    <button
                      onClick={handleReset}
                      className="btn btn-outline-secondary ms-2"
                      disabled={loading}
                    >
                      Cancelar
                    </button>
                  </div>
                )}
            </div>
          </div>
      )}

      {/* Resultado importación CSV/ZIP */}
      {importResult && mode !== "photos" && (
        <div className="card shadow-sm border-success">
          <div className="card-body">
            <h5 className="card-title text-success">
              ✅ Importación completada
            </h5>
            <div className="row g-3 mb-3">
              <div className="col-md-4">
                <div className="p-3 bg-success bg-opacity-10 rounded text-center">
                  <h3 className="mb-0 text-success">
                    {importSummary?.upserted ||
                      importSummary?.data?.created ||
                      0}
                  </h3>
                  <small className="text-muted">Usuarios importados</small>
                </div>
              </div>
              <div className="col-md-4">
                <div className="p-3 bg-light rounded text-center">
                  <h3 className="mb-0">
                    {importSummary?.total ||
                      importSummary?.data?.total ||
                      0}
                  </h3>
                  <small className="text-muted">Total procesados</small>
                </div>
              </div>
              <div className="col-md-4">
                <div className="p-3 bg-warning bg-opacity-10 rounded text-center">
                  <h3 className="mb-0 text-warning">
                    {(importSummary?.conflicts?.excluded || 0) +
                      (importSummary?.conflicts?.deleted || 0) +
                      (importSummary?.conflicts?.overwritten || 0)}
                  </h3>
                  <small className="text-muted">Conflictos</small>
                </div>
              </div>
            </div>

            {importSummary?.conflicts && (
              <div className="alert alert-info">
                <h6>📊 Conflictos:</h6>
                <ul className="mb-0">
                  {importSummary.conflicts.excluded > 0 && (
                    <li>{importSummary.conflicts.excluded} excluidos</li>
                  )}
                  {importSummary.conflicts.overwritten > 0 && (
                    <li>{importSummary.conflicts.overwritten} sobrescritos</li>
                  )}
                  {importSummary.conflicts.deleted > 0 && (
                    <li>{importSummary.conflicts.deleted} eliminados</li>
                  )}
                </ul>
              </div>
            )}

            {mode === "zip" &&
              importSummary?.photosProcessed !== undefined && (
                <div className="alert alert-success">
                  📸 {importSummary.photosProcessed} fotos procesadas
                </div>
              )}

            <div className="text-center mt-4">
              <button onClick={handleReset} className="btn btn-primary">
                Nueva importación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resultado importación fotos */}
      {photosResult && (
        <div className="mt-4">
          <div
            className={`alert ${
              photosResult.ok ? "alert-success" : "alert-danger"
            }`}
          >
            <h5>🖼️ Importación de fotos completada</h5>
            
            {photosResult.stats && (
              <div className="row mt-3">
                <div className="col-md-4">
                  <div className="card bg-light">
                    <div className="card-body text-center">
                      <h3 className="text-success">{photosResult.stats.updated || 0}</h3>
                      <small>Fotos asociadas</small>
                    </div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="card bg-light">
                    <div className="card-body text-center">
                      <h3 className="text-warning">{photosResult.stats.skippedNoUser || 0}</h3>
                      <small>Sin usuario</small>
                    </div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="card bg-light">
                    <div className="card-body text-center">
                      <h3 className="text-danger">{photosResult.stats.errors || 0}</h3>
                      <small>Errores</small>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Mostrar errores detallados */}
            {photosResult.photoErrors && photosResult.photoErrors.length > 0 && (
              <div className="mt-4">
                <h6 className="text-danger">⚠️ Fotos con problemas:</h6>
                <div className="alert alert-warning">
                  <p className="mb-0">
                    {photosResult.photoErrors.length}{" "}
                    {photosResult.photoErrors.length === 1
                      ? "foto no pudo"
                      : "fotos no pudieron"}{" "}
                    ser procesadas. Ver detalles abajo.
                  </p>
                </div>
                
                <details className="mt-2">
                  <summary className="btn btn-sm btn-outline-secondary">
                    Ver detalles de errores ({photosResult.photoErrors.length})
                  </summary>
                  <div className="table-responsive mt-2">
                    <table className="table table-sm table-bordered">
                      <thead className="table-light">
                        <tr>
                          <th>Archivo</th>
                          <th>Boleta</th>
                          <th>Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {photosResult.photoErrors.map((err, idx) => (
                          <tr key={idx}>
                            <td><code>{err.fileName}</code></td>
                            <td>{err.boleta || "—"}</td>
                            <td className="text-danger">{err.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            )}

            {/* Botones para solo válidas cuando hay inválidas */}
            {hasInvalidPhotos && (
              <div className="mt-3 d-flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleForcePhotosValid}
                  disabled={forcingValidPhotos || !file}
                >
                  {forcingValidPhotos
                    ? "Subiendo solo fotos válidas..."
                    : "Subir solo fotos válidas"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={handleReset}
                  disabled={forcingValidPhotos}
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>

          {!hasInvalidPhotos && (
            <button
              className="btn btn-primary mt-3"
              onClick={() => {
                setPhotosResult(null);
                setFile(null);
                setStatus("");
              }}
            >
              Nueva importación de fotos
            </button>
          )}
        </div>
      )}
    </div>
  );
}
