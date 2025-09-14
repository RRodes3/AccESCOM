import { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function AccessReport() {
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/qr/logs?take=100&skip=0');
        setRows(data.items || []);
      } catch (e) {
        console.log('LOGS ERROR:', e?.response?.status, e?.response?.data);
        setMsg(e?.response?.data?.error || 'No se pudo cargar el reporte');
      }
    })();
  }, []);

  const exportCSV = () => {
    const header = ['Fecha', 'Acción', 'Usuario', 'Usuario email', 'Guardia', 'Guardia email', 'QR code'];
    const csv = [
      header.join(','),
      ...rows.map(r => [
        new Date(r.createdAt).toLocaleString(),
        r.action,
        r.user?.name || '',
        r.user?.email || '',
        r.guard?.name || '',
        r.guard?.email || '',
        r.qr?.code || ''
      ].map(x => `"${String(x).replace(/"/g,'""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `access-log_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mt-3">
      <div className="d-flex justify-content-between align-items-center">
        <h4>Reporte de Accesos</h4>
        <button className="btn btn-outline-secondary" onClick={exportCSV}>Exportar CSV</button>
      </div>
      {msg && <div className="alert alert-danger mt-3">{msg}</div>}
      <div className="table-responsive mt-3">
        <table className="table table-striped">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Acción</th>
              <th>Usuario</th>
              <th>Guardia</th>
              <th>QR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td>{r.action}</td>
                <td>{r.user?.name} <small className="text-muted d-block">{r.user?.email}</small></td>
                <td>{r.guard?.name || '—'} <small className="text-muted d-block">{r.guard?.email || ''}</small></td>
                <td><small className="text-muted">{r.qr?.code?.slice(0,10) || '—'}</small></td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={5} className="text-center text-muted">Sin registros</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
