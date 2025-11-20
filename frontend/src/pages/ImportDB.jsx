import { useState } from "react";
import { api } from "../services/api";
import "./ImportDB.css";

export default function ImportDB() {
  const [tab, setTab] = useState("users"); // users | guests
  const [importType, setImportType] = useState("csv"); // csv | zip
  const [file, setFile] = useState(null);
  const [conflictAction, setConflictAction] = useState("exclude"); // exclude | overwrite | delete
  const [loading, setLoading] = useState(false);
  
  // Estados para resultados de validación
  const [validationResult, setValidationResult] = useState(null);
  const [showConflictOptions, setShowConflictOptions] = useState(false);
  
  // Estados para importación final
  const [importResult, setImportResult] = useState(null);
  const [err, setErr] = useState("");

  // Determinar el endpoint según el tipo de importación
  const getEndpoint = () => {
    if (importType === "zip") {
      return `/admin/import/import/zip`;
    }
    return `/admin/import/${tab}`; // users o guests
  };

  // Paso 1: Validar archivo (dry-run)
  async function handleValidation(e) {
    e.preventDefault();
    if (!file) {
      setErr("Selecciona un archivo CSV/XLSX/ZIP");
      return;
    }

    // Validación: ZIP solo funciona con el endpoint /import
    if (importType === "zip" && !file.name.toLowerCase().endsWith('.zip')) {
      setErr("Debes seleccionar un archivo ZIP cuando el tipo de importación es 'ZIP con fotos'");
      return;
    }

    if (importType === "csv" && file.name.toLowerCase().endsWith('.zip')) {
      setErr("Debes seleccionar un archivo CSV/XLSX cuando el tipo de importación es 'CSV/XLSX'");
      return;
    }

    setErr("");
    setValidationResult(null);
    setShowConflictOptions(false);
    setImportResult(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const endpoint = getEndpoint();
      
      // ✅ CORREGIDO: ZIP también hace dry-run primero
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

  // Paso 2: Importar con acción seleccionada
  async function handleImport(selectedAction) {
    setLoading(true);
    setErr("");
    setShowConflictOptions(false);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const endpoint = getEndpoint();
      const url = `${endpoint}?dryRun=false&conflictAction=${selectedAction}`;

      const { data } = await api.post(url, formData);

      setImportResult(data);
      setValidationResult(null);
      
      // Limpiar después de importar exitosamente
      setTimeout(() => {
        setFile(null);
        const fileInput = document.getElementById('fileInput');
        if (fileInput) fileInput.value = '';
      }, 100);
    } catch (e) {
      const data = e?.response?.data;
      setErr(data?.error || "Error al importar");
      setImportResult(data || null);
    } finally {
      setLoading(false);
    }
  }

  // Reset todo
  function handleReset() {
    setFile(null);
    setValidationResult(null);
    setImportResult(null);
    setShowConflictOptions(false);
    setErr("");
    setConflictAction("exclude");
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
  }

  // Handler para cambio de tipo de importación
  function handleImportTypeChange(newType) {
    setImportType(newType);
    setFile(null);
    setValidationResult(null);
    setImportResult(null);
    setShowConflictOptions(false);
    setErr("");
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
  }

  const validationSummary = validationResult?.summary || validationResult;
  const importSummary = importResult;

  // Determinar el accept del input según el tipo
  const getFileAccept = () => {
    if (importType === "zip") {
      return ".zip,application/zip,application/x-zip-compressed";
    }
    return ".csv,.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  };

  return (
    <div className="importdb container py-3">
      <h2 className="mb-3">Importación de BD</h2>

      {/* Tabs */}
      <div className="btn-group mb-3">
        <button
          className={`btn ${tab === "users" ? "btn-primary" : "btn-outline-primary"}`}
          onClick={() => setTab("users")}
        >
          Usuarios institucionales
        </button>
        <button
          className={`btn ${tab === "guests" ? "btn-primary" : "btn-outline-primary"}`}
          onClick={() => setTab("guests")}
        >
          Invitados
        </button>
      </div>

      {/* Formulario de validación */}
      {!importResult && (
        <div className="card shadow-sm mb-3">
          <div className="card-body">
            <h5 className="card-title">Paso 1: Seleccionar archivo y validar</h5>
            
            {/* Selector de tipo de importación */}
            <div className="mb-3">
              <label htmlFor="importTypeSelect" className="form-label">
                <strong>Tipo de importación:</strong>
              </label>
              <select
                id="importTypeSelect"
                className="form-select"
                value={importType}
                onChange={(e) => handleImportTypeChange(e.target.value)}
              >
                <option value="csv">📄 CSV/XLSX (solo datos)</option>
                <option value="zip">📦 ZIP (CSV/XLSX + fotos)</option>
              </select>
              <div className="form-text">
                {importType === "csv" 
                  ? "Importa usuarios desde archivo CSV o XLSX sin fotos"
                  : "Importa usuarios con sus fotos desde un archivo ZIP que contenga el CSV/XLSX y las imágenes"}
              </div>
            </div>

            <form onSubmit={handleValidation}>
              <div className="row g-3 align-items-end">
                <div className="col-md-10">
                  <label htmlFor="fileInput" className="form-label">
                    {importType === "zip" ? "Archivo ZIP" : "Archivo CSV/XLSX"}
                  </label>
                  <input
                    id="fileInput"
                    type="file"
                    className="form-control"
                    accept={getFileAccept()}
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </div>

                <div className="col-md-2">
                  <button className="btn btn-primary w-100" disabled={loading || !file}>
                    {loading ? "Procesando..." : "Validar"}
                  </button>
                </div>
              </div>
            </form>

            <div className="mt-3 small text-muted">
              {tab === "users" ? (
                <>
                  <strong>Columnas requeridas:</strong> boleta, firstName, lastNameP, lastNameM,
                  email, role (ADMIN|GUARD|USER), institutionalType (STUDENT|TEACHER|PAE), photoUrl
                  (opcional)
                  {importType === "zip" && (
                    <div className="mt-2">
                      <strong>Estructura del ZIP:</strong> Debe contener un archivo CSV/XLSX con los datos
                      y las fotos con nombre <code>boleta.jpg</code> o <code>boleta.png</code>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <strong>Columnas requeridas:</strong> firstName, lastNameP, lastNameM, curp,
                  reason, state (PENDING|APPROVED|REJECTED)
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mensajes de error */}
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

      {/* Resultado de validación */}
      {validationResult && !importResult && (
        <div className="card shadow-sm mb-3">
          <div className="card-body">
            <h5 className="card-title">📋 Resultado de validación</h5>

            {/* Tarjetas de resumen */}
            <div className="row g-3 mb-4">
              <div className="col-md-3">
                <div className="p-3 bg-light rounded text-center">
                  <h3 className="mb-0">{validationSummary?.total || 0}</h3>
                  <small className="text-muted">Total registros</small>
                </div>
              </div>
              <div className="col-md-3">
                <div className="p-3 bg-success bg-opacity-10 rounded text-center">
                  <h3 className="mb-0 text-success">{validationSummary?.valid || 0}</h3>
                  <small className="text-muted">Válidos</small>
                </div>
              </div>
              <div className="col-md-3">
                <div className="p-3 bg-danger bg-opacity-10 rounded text-center">
                  <h3 className="mb-0 text-danger">{validationSummary?.errors || 0}</h3>
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

            {/* Detalles de conflictos */}
            {validationSummary?.conflicts &&
              ((validationSummary.conflicts.excluded || 0) +
                (validationSummary.conflicts.deleted || 0) +
                (validationSummary.conflicts.overwritten || 0)) > 0 && (
                <div className="alert alert-warning">
                  <h6 className="alert-heading">⚠️ Usuarios duplicados detectados:</h6>
                  <ul className="mb-0">
                    {validationSummary.conflicts.excluded > 0 && (
                      <li>
                        <strong>{validationSummary.conflicts.excluded}</strong> usuarios serán{" "}
                        <span className="badge bg-secondary">excluidos</span> (ya existen)
                      </li>
                    )}
                    {validationSummary.conflicts.overwritten > 0 && (
                      <li>
                        <strong>{validationSummary.conflicts.overwritten}</strong> usuarios serán{" "}
                        <span className="badge bg-warning text-dark">sobrescritos</span>
                      </li>
                    )}
                    {validationSummary.conflicts.deleted > 0 && (
                      <li>
                        <strong>{validationSummary.conflicts.deleted}</strong> usuarios serán{" "}
                        <span className="badge bg-danger">eliminados</span> y reemplazados
                      </li>
                    )}
                  </ul>
                  
                  <div className="alert alert-info mt-3 mb-0">
                    <small>
                      ℹ️ <strong>Nota:</strong> La acción seleccionada (excluir/sobrescribir/eliminar) se aplicará 
                      a todos los usuarios duplicados al momento de importar.
                    </small>
                  </div>
                </div>
              )}

            {/* Contraseñas de ejemplo */}
            {validationSummary?.samplePasswords && validationSummary.samplePasswords.length > 0 && (
              <div className="alert alert-info">
                <h6 className="alert-heading">🔑 Contraseñas generadas (primeros 3 ejemplos):</h6>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Email</th>
                        <th>Boleta</th>
                        <th>Contraseña</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validationSummary.samplePasswords.map((user, idx) => (
                        <tr key={idx}>
                          <td>
                            <code>{user.email}</code>
                          </td>
                          <td>
                            <code>{user.boleta}</code>
                          </td>
                          <td>
                            <code className="text-primary fw-bold">{user.passwordEjemplo}</code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <small className="text-muted d-block mt-2">
                  💡 Patrón: inicial + apellido + últimos4dígitos + Nombre + punto
                </small>
              </div>
            )}

            {/* Errores de validación */}
            {Array.isArray(validationResult.errors) && validationResult.errors.length > 0 && (
              <div className="mt-3">
                <h6 className="text-danger">❌ Errores de validación ({validationResult.errors.length}):</h6>
                <div className="accordion" id="errorsAccordion">
                  <div className="accordion-item">
                    <h2 className="accordion-header">
                      <button
                        className="accordion-button collapsed"
                        type="button"
                        data-bs-toggle="collapse"
                        data-bs-target="#collapseErrors"
                      >
                        Ver detalles de errores
                      </button>
                    </h2>
                    <div
                      id="collapseErrors"
                      className="accordion-collapse collapse"
                      data-bs-parent="#errorsAccordion"
                    >
                      <div className="accordion-body">
                        <div className="table-responsive">
                          <table className="table table-sm table-bordered">
                            <thead className="table-light">
                              <tr>
                                <th width="80">Línea</th>
                                <th>Campo</th>
                                <th>Error</th>
                                <th>Datos originales</th>
                              </tr>
                            </thead>
                            <tbody>
                              {validationResult.errors.map((e, idx) => (
                                <tr key={idx}>
                                  <td className="text-center">
                                    <span className="badge bg-danger">{e.line}</span>
                                  </td>
                                  <td>
                                    {Object.keys(e.errors).map((k) => (
                                      <span key={k} className="badge bg-secondary me-1">
                                        {k}
                                      </span>
                                    ))}
                                  </td>
                                  <td>
                                    <ul className="mb-0 small">
                                      {Object.entries(e.errors).map(([k, v]) => (
                                        <li key={k}>{v}</li>
                                      ))}
                                    </ul>
                                  </td>
                                  <td>
                                    <code className="small">{JSON.stringify(e.row)}</code>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Paso 2: Opciones de acción CON LISTA DE CONFLICTOS INTEGRADA */}
            {showConflictOptions && (
              <div className="alert alert-primary mt-4">
                <h6 className="alert-heading">🚀 Paso 2: Confirmar importación</h6>
                
                {validationSummary?.valid > 0 ? (
                  <p className="mb-3">
                    Todos los registros son duplicados. Elige cómo deseas manejarlos:
                  </p>
                ) : (
                  <p className="mb-3">
                    <strong>Todos los registros son duplicados.</strong> Elige cómo deseas manejarlos:
                  </p>
                )}

                {/* LISTA DE USUARIOS CONFLICTIVOS */}
                {validationSummary?.conflicts?.users && validationSummary.conflicts.users.length > 0 && (
                  <div className="card mb-3">
                    <div className="card-header bg-warning bg-opacity-25">
                      <strong>👥 Usuarios duplicados ({validationSummary.conflicts.users.length}):</strong>
                    </div>
                    <div className="card-body p-0">
                      <div className="table-responsive">
                        <table className="table table-sm table-hover mb-0">
                          <thead className="table-light">
                            <tr>
                              <th>Boleta</th>
                              <th>Email</th>
                              <th>Nombre en CSV</th>
                              <th>Nombre en BD</th>
                              <th>Tipo de conflicto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {validationSummary.conflicts.users.map((conflict, idx) => (
                              <tr key={idx}>
                                <td><code>{conflict.boleta}</code></td>
                                <td><code className="small">{conflict.email}</code></td>
                                <td>{conflict.name}</td>
                                <td>{conflict.existingName}</td>
                                <td>
                                  {conflict.conflictType === "Duplicado por boleta y correo" ? (
                                    <span className="badge bg-danger">Ambos duplicados</span>
                                  ) : conflict.conflictType === "Duplicado por boleta" ? (
                                    <span className="badge bg-warning text-dark">Boleta duplicada</span>
                                  ) : (
                                    <span className="badge bg-info text-dark">Correo duplicado</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* BOTONES DE ACCIÓN AL FINAL */}
                <div className="d-flex flex-wrap gap-2">
                  <button
                    onClick={() => handleImport("exclude")}
                    className="btn btn-secondary"
                    disabled={loading}
                  >
                    ⏭️ Excluir duplicados
                    <br />
                    <small className="d-block" style={{ fontSize: "0.75rem" }}>
                      {validationSummary?.valid > 0 
                        ? `No importar los ${validationSummary.conflicts?.excluded || 0} existentes`
                        : 'No importar ningún usuario (todos existen)'}
                    </small>
                  </button>
                  <button
                    onClick={() => handleImport("overwrite")}
                    className="btn btn-warning"
                    disabled={loading}
                  >
                    ✏️ Sobrescribir duplicados
                    <br />
                    <small className="d-block" style={{ fontSize: "0.75rem" }}>
                      Actualizar datos de {validationSummary.conflicts?.users?.length || 0} usuarios existentes
                    </small>
                  </button>
                  <button
                    onClick={() => handleImport("delete")}
                    className="btn btn-danger"
                    disabled={loading}
                  >
                    🗑️ Eliminar y reemplazar
                    <br />
                    <small className="d-block" style={{ fontSize: "0.75rem" }}>
                      Borrar y recrear {validationSummary.conflicts?.users?.length || 0} usuarios
                    </small>
                  </button>
                  <button onClick={handleReset} className="btn btn-outline-secondary" disabled={loading}>
                    ↺ Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Si no hay conflictos y todo es válido */}
            {!showConflictOptions &&
              validationSummary?.valid > 0 &&
              validationSummary?.errors === 0 && (
                <div className="alert alert-success mt-4">
                  <h6 className="alert-heading">✅ Todos los registros son válidos</h6>
                  <p className="mb-3">
                    Se importarán <strong>{validationSummary.valid}</strong> usuarios sin conflictos.
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

      {/* Resultado final de importación */}
      {importResult && (
        <div className="card shadow-sm border-success">
          <div className="card-body">
            <h5 className="card-title text-success">✅ Importación completada exitosamente</h5>

            <div className="row g-3 mb-3">
              <div className="col-md-4">
                <div className="p-3 bg-success bg-opacity-10 rounded text-center">
                  <h3 className="mb-0 text-success">{importSummary?.upserted || importSummary?.data?.created || 0}</h3>
                  <small className="text-muted">Usuarios importados</small>
                </div>
              </div>
              <div className="col-md-4">
                <div className="p-3 bg-light rounded text-center">
                  <h3 className="mb-0">{importSummary?.total || importSummary?.data?.total || 0}</h3>
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
                  <small className="text-muted">Conflictos manejados</small>
                </div>
              </div>
            </div>

            {importSummary?.conflicts && (
              <div className="alert alert-info">
                <h6>📊 Resumen de conflictos:</h6>
                <ul className="mb-0">
                  {importSummary.conflicts.excluded > 0 && (
                    <li>{importSummary.conflicts.excluded} usuarios excluidos</li>
                  )}
                  {importSummary.conflicts.overwritten > 0 && (
                    <li>{importSummary.conflicts.overwritten} usuarios sobrescritos</li>
                  )}
                  {importSummary.conflicts.deleted > 0 && (
                    <li>{importSummary.conflicts.deleted} usuarios eliminados y reemplazados</li>
                  )}
                </ul>
              </div>
            )}

            {/* Mensaje especial para importaciones ZIP */}
            {importType === "zip" && importSummary?.photosProcessed !== undefined && (
              <div className="alert alert-success">
                📸 {importSummary.photosProcessed} fotos procesadas correctamente
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
    </div>
  );
}
