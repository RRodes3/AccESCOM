import { useState } from "react";
import { api } from "../services/api";
import "./ImportDB.css";

export default function ImportDB() {
  const [tab, setTab] = useState("users"); // users | guests
  const [file, setFile] = useState(null);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [resu, setResu] = useState(null);
  const [err, setErr] = useState("");

async function onSubmit(e) {
  e.preventDefault();
  if (!file) {
    setErr("Selecciona un archivo CSV/XLSX");
    return;
  }
  setErr("");
  setResu(null);
  setLoading(true);
  try {
    const fd = new FormData();
    fd.append("file", file);

    const { data } = await api.post(
      `/admin/import/${tab}?dryRun=${dryRun}`,
      fd
    );

    setResu(data);
  } catch (e) {
    const data = e?.response?.data;
    setErr(data?.error || "Error al importar");
    setResu(data || null);
  } finally {
    setLoading(false);
  }
}


  return (
    <div className="importdb container py-3">
      <h2 className="mb-3">Importación de BD</h2>

      <div className="btn-group mb-3">
        <button className={`btn ${tab==='users'?'btn-primary':'btn-outline-primary'}`} onClick={()=>setTab('users')}>
          Usuarios institucionales
        </button>
        <button className={`btn ${tab==='guests'?'btn-primary':'btn-outline-primary'}`} onClick={()=>setTab('guests')}>
          Invitados
        </button>
      </div>

      <div className="card shadow-sm mb-3">
        <div className="card-body">
          <form onSubmit={onSubmit}>
            <div className="row g-3 align-items-center">
              <div className="col-auto">
                <input
                  type="file"
                  className="form-control"
                  accept=".csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </div>
              <div className="col-auto form-check">
                <input id="dry" className="form-check-input" type="checkbox" checked={dryRun} onChange={e=>setDryRun(e.target.checked)} />
                <label className="form-check-label" htmlFor="dry">Validar sin guardar (dry-run)</label>
              </div>
              <div className="col-auto">
                <button className="btn btn-success" disabled={loading}>
                  {loading ? 'Procesando…' : (dryRun ? 'Validar' : 'Importar')}
                </button>
              </div>
            </div>
          </form>

          <div className="mt-3 small text-muted">
            {tab==='users' ? (
              <>
                <b>Usuarios - columnas:</b> boleta, firstName, lastNameP, lastNameM, email, role (ADMIN|GUARD|USER), institutionalType (STUDENT|TEACHER|PAE)
              </>
            ) : (
              <>
                <b>Invitados - columnas:</b> firstName, lastNameP, lastNameM, curp, reason, state (PENDING|APPROVED|REJECTED)
              </>
            )}
          </div>
        </div>
      </div>

      {err && <div className="alert alert-danger">{err}</div>}

      {resu && (
        <div className="card shadow-sm">
          <div className="card-body">
            <h5 className="card-title">Resultado</h5>
            <pre className="bg-light p-2 rounded">{JSON.stringify(resu.summary || resu, null, 2)}</pre>

            {Array.isArray(resu.errors) && resu.errors.length > 0 && (
              <>
                <h6 className="mt-3">Errores</h6>
                <div className="table-responsive">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Línea</th><th>Detalle</th><th>Fila (original)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resu.errors.map((e,idx)=>(
                        <tr key={idx}>
                          <td>{e.line}</td>
                          <td>
                            <ul className="mb-0">
                              {Object.entries(e.errors).map(([k,v])=> <li key={k}><b>{k}:</b> {v}</li>)}
                            </ul>
                          </td>
                          <td><code>{JSON.stringify(e.row)}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
