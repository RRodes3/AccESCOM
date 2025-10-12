import { useEffect, useState } from 'react';
import { api } from '../services/api';

const roleEs = (r) => ({
  ADMIN: 'Administrador',
  USER: 'Usuario institucional',
  GUARD: 'Guardia',
  GUEST: 'Invitado'
}[r] || r);

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
              <th>Tipo</th>
              <th>Acción</th>
              <th>Dueño QR</th>
              <th>Identificadores</th>
              <th>Guardia</th>
              <th>Boleta</th>
              <th>Email</th>
              <th>CURP</th>
              <th>Motivo Visita</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isGuest = !!row.guest;
              const fullName = isGuest
                ? [row.guest.firstName, row.guest.lastNameP, row.guest.lastNameM].filter(Boolean).join(' ')
                : [row.user?.firstName, row.user?.lastNameP, row.user?.lastNameM].filter(Boolean).join(' ') || row.user?.name;

              const rol = isGuest ? 'Invitado'
                : row.user?.role === 'USER' ? 'Usuario institucional'
                : row.user?.role === 'ADMIN' ? 'Administrador'
                : row.user?.role === 'GUARD' ? 'Guardia'
                : row.user?.role || '—';

              return (
                <tr key={row.id}>
                  <td>{new Date(row.createdAt).toLocaleString()}</td>
                  <td>{row.qr?.kind === 'ENTRY' ? 'Entrada' : (row.qr?.kind === 'EXIT' ? 'Salida' : '—')}</td>
                  <td>{row.action === 'VALIDATE_ALLOW' ? 'Permitido' : (row.action === 'VALIDATE_DENY' ? 'Denegado' : row.action)}</td>
                  <td>
                    {fullName || '—'}
                    <div className="text-muted" style={{fontSize:'0.85em'}}>{rol}</div>
                  </td>
                  <td>
                    {isGuest ? (
                      <>
                        <div><b>CURP:</b> {row.guest.curp}</div>
                        <div><b>Motivo:</b> {row.guest.reason}</div>
                      </>
                    ) : (
                      <>
                        <div><b>Boleta:</b> {row.user?.boleta || '—'}</div>
                        <div><b>Email:</b> {row.user?.email || '—'}</div>
                      </>
                    )}
                  </td>
                  <td>{row.guard?.name || '—'}</td>
                  {/* Tus nuevas columnas */}
                  <td>{isGuest ? '—' : (row.user?.boleta || '—')}</td>
                  <td>{isGuest ? '—' : (row.user?.email || '—')}</td>
                  <td>{isGuest ? (row.guest.curp || '—') : '—'}</td>
                  <td>{isGuest ? (row.guest.reason || '—') : '—'}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr><td colSpan={10} className="text-center text-muted">Sin registros</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
