import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import './AccessReport.css';

const roleEs = (r) =>
  ({
    ADMIN: 'Administrador',
    USER: 'Usuario institucional',
    GUARD: 'Guardia',
    GUEST: 'Invitado',
  }[r] || r);

const subRolEs = (t) =>
  ({
    STUDENT: 'Estudiante',
    TEACHER: 'Profesor',
    PAE: 'PAE',
  }[t] || (t || '—'));

export default function AccessReport() {
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // filtros
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [subjectType, setSubjectType] = useState('');
  const [institutionalType, setInstitutionalType] = useState('');
  const [accessType, setAccessType] = useState('');
  const [result, setResult] = useState('');

  const buildQs = () => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (subjectType) params.set('subjectType', subjectType);
    if (institutionalType) params.set('institutionalType', institutionalType);
    if (accessType) params.set('accessType', accessType);
    if (result) params.set('result', result);
    return params.toString();
  };

  // centraliza la carga con manejo de loading/error
  async function fetchData() {
    setLoading(true);
    setError('');
    try {
      const qs = buildQs();
      const { data } = await api.get('/admin/report' + (qs ? `?${qs}` : ''));
      setRows(data.items || []);
      setMsg('');
    } catch (e) {
      setError(
        e?.response?.data?.error || e.message || 'No se pudo cargar el reporte'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [from, to, subjectType, institutionalType, accessType, result]);

  // crea una vista "pretty" para la tabla (no elimina rows ni funciones previas)
  const prettyRows = useMemo(
    () =>
      rows.map((row) => {
        const isGuest = !!row.guest;
        const fullName = isGuest
          ? [row.guest.firstName, row.guest.lastNameP, row.guest.lastNameM]
              .filter(Boolean)
              .join(' ')
          : [row.user?.firstName, row.user?.lastNameP, row.user?.lastNameM]
              .filter(Boolean)
              .join(' ') || row.user?.name || '—';

        // ← TRADUCCIÓN DE ACCIÓN con ISSUE → "Código generado"
        let accion = row.action;
        if (accion === 'VALIDATE_ALLOW') {
          accion = 'Permitido';
        } else if (accion === 'VALIDATE_DENY') {
          accion = 'Denegado';
        } else if (accion === 'ISSUE') {
          accion = 'Código generado';
        }

        return {
          id: row.id,
          createdAt: row.createdAt,
          tipo:
            row.qr?.kind === 'ENTRY'
              ? 'Entrada'
              : row.qr?.kind === 'EXIT'
              ? 'Salida'
              : '—',
          accion,
          fullName,
          rol: isGuest ? 'Invitado' : roleEs(row.user?.role) || '—',
          subRol:
            !isGuest && row.user?.institutionalType
              ? subRolEs(row.user.institutionalType)
              : '—',
          boleta: row.user?.boleta || '—',
          email: row.user?.email || '—',
          curp: row.guest?.curp || '—',
          reason: row.guest?.reason || row.reason || '—',
          guard: row.guard?.name || '—',
        };
      }),
    [rows]
  );

  /* ------------ Exportar CSV en el navegador ------------ */
  const exportCSV = () => {
    if (!prettyRows.length) {
      alert('No hay datos para exportar');
      return;
    }

    const header = [
      'Fecha',
      'Tipo',
      'Acción',
      'Nombre',
      'Rol',
      'Sub-rol',
      'Boleta',
      'Email',
      'CURP',
      'Motivo',
      'Guardia',
    ];

    const lines = [header.join(',')];

    prettyRows.forEach((r) => {
      const row = [
        new Date(r.createdAt).toLocaleString().replace(/,/g, ' '),
        r.tipo || '',
        r.accion || '',
        r.fullName || '',
        r.rol || '',
        r.subRol || '',
        r.boleta || '',
        r.email || '',
        r.curp || '',
        r.reason || '',
        r.guard || '',
      ];

      const csvRow = row
        .map(
          (v) =>
            `"${(v ?? '')
              .toString()
              .replace(/"/g, '""')}"`
        )
        .join(',');

      lines.push(csvRow);
    });

    const blob = new Blob([lines.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reporte_accesos.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ------------ Exportar "PDF" via print() ------------ */
  const exportPDF = () => {
    if (!prettyRows.length) {
      alert('No hay datos para exportar');
      return;
    }

    const win = window.open('', '_blank');
    if (!win) return;

    win.document.write(`
      <html>
        <head>
          <title>Reporte de accesos</title>
          <style>
            body { font-family: Arial, sans-serif; font-size: 12px; }
            h2 { text-align: center; }
            table { border-collapse: collapse; width: 100%; margin-top: 12px; }
            th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
            th { background: #f0f0f0; }
          </style>
        </head>
        <body>
          <h2>Reporte de accesos</h2>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Acción</th>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Sub-rol</th>
                <th>Boleta</th>
                <th>Email</th>
                <th>CURP</th>
                <th>Motivo</th>
                <th>Guardia</th>
              </tr>
            </thead>
            <tbody>
              ${prettyRows
                .map(
                  (r) => `
                <tr>
                  <td>${new Date(r.createdAt).toLocaleString()}</td>
                  <td>${r.tipo || ''}</td>
                  <td>${r.accion || ''}</td>
                  <td>${r.fullName || ''}</td>
                  <td>${r.rol || ''}</td>
                  <td>${r.subRol || ''}</td>
                  <td>${r.boleta || ''}</td>
                  <td>${r.email || ''}</td>
                  <td>${r.curp || ''}</td>
                  <td>${r.reason || ''}</td>
                  <td>${r.guard || ''}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
          <script>
            window.print();
          </script>
        </body>
      </html>
    `);

    win.document.close();
  };

  // --- JSX ---
  return (
    <div className="container mt-3">
      {/* filtros */}
      <div className="row g-2 align-items-end">
        <div className="col-auto">
          <label className="form-label">Desde</label>
          <input
            type="date"
            className="form-control"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="col-auto">
          <label className="form-label">Hasta</label>
          <input
            type="date"
            className="form-control"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="col-auto">
          <label className="form-label">Sujeto</label>
          <select
            className="form-select"
            value={subjectType}
            onChange={(e) => setSubjectType(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="INSTITUTIONAL">Institucional</option>
            <option value="GUEST">Invitado</option>
          </select>
        </div>
        <div className="col-auto">
          <label className="form-label">Tipo institucional</label>
          <select
            className="form-select"
            value={institutionalType}
            onChange={(e) => setInstitutionalType(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="STUDENT">Student</option>
            <option value="TEACHER">Teacher</option>
            <option value="PAE">PAE</option>
          </select>
        </div>
        <div className="col-auto">
          <label className="form-label">Acceso</label>
          <select
            className="form-select"
            value={accessType}
            onChange={(e) => setAccessType(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="ENTRY">Entrada</option>
            <option value="EXIT">Salida</option>
          </select>
        </div>
        <div className="col-auto">
          <label className="form-label">Resultado</label>
          <select
            className="form-select"
            value={result}
            onChange={(e) => setResult(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="ALLOWED">Permitido</option>
            <option value="DENIED">Denegado</option>
            <option value="EXPIRED_QR">QR expirado</option>
            <option value="INVALID_QR">QR inválido</option>
          </select>
        </div>

        <div className="col-auto d-flex align-items-end gap-2">
          <button className="btn btn-primary" onClick={exportCSV}>
            Exportar CSV
          </button>
          <button className="btn btn-outline-secondary" onClick={exportPDF}>
            Exportar PDF
          </button>
        </div>
      </div>

      {msg && <div className="alert alert-danger mt-3">{msg}</div>}
      {error && <div className="alert alert-danger mt-3">{error}</div>}
      {loading && <p className="text-muted mt-2">Cargando…</p>}
      <div className="table-responsive mt-3">
        <table className="table table-striped">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Acción</th>
              <th>Dueño QR</th>
              <th>Rol</th>
              <th>Sub-rol</th>
              <th>Identificadores</th>
              <th>Guardia</th>
              <th>Boleta</th>
              <th>Email</th>
              <th>CURP</th>
              <th>Motivo Visita</th>
            </tr>
          </thead>
          <tbody>
            {prettyRows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td>{r.tipo}</td>
                <td>{r.accion}</td>
                <td>{r.fullName}</td>
                <td>{r.rol}</td>
                <td>{r.subRol}</td>
                <td>
                  {r.curp !== '—' || r.reason !== '—' ? (
                    <>
                      <div>
                        <b>CURP:</b> {r.curp}
                      </div>
                      <div>
                        <b>Motivo:</b> {r.reason}
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <b>Boleta:</b> {r.boleta}
                      </div>
                      <div>
                        <b>Email:</b> {r.email}
                      </div>
                    </>
                  )}
                </td>
                <td>{r.guard}</td>
                <td>{r.boleta}</td>
                <td>{r.email}</td>
                <td>{r.curp}</td>
                <td>{r.reason}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={12} className="text-center text-muted">
                  Sin registros
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
