// frontend/src/pages/Dashboard.jsx
import { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [testingCron, setTestingCron] = useState(false);
  const [cronResult, setCronResult] = useState(null);

  useEffect(() => {
    let cancelado = false;

    async function cargar() {
      setLoading(true);
      setError('');
      try {
        // 1) Totales generales (usuarios, QR, logs, allowed, denied)
        const statsRes = await api.get('/qr/stats');

        // 2) Últimos accesos (logs); pedimos 10
        const logsRes = await api.get('/qr/logs', {
          params: { take: 10, skip: 0 },
        });

        if (cancelado) return;
        setStats(statsRes.data || null);
        setRecent(logsRes.data?.items || []);
      } catch (e) {
        if (cancelado) return;
        console.error('Dashboard error:', e);
        setError(
          e?.response?.data?.error ||
            e.message ||
            'No se pudieron cargar las estadísticas'
        );
      } finally {
        if (!cancelado) setLoading(false);
      }
    }

    cargar();
    return () => {
      cancelado = true;
    };
  }, []);

  const fmtFecha = (iso) =>
    iso ? new Date(iso).toLocaleString() : '—';

  // TEST: Ejecutar cronjob manualmente
  const handleTestCronjob = async () => {
    setTestingCron(true);
    setCronResult(null);
    try {
      const { data } = await api.get('/admin/test-cronjob');
      setCronResult({ ok: true, data });
    } catch (err) {
      setCronResult({ 
        ok: false, 
        error: err?.response?.data?.error || err.message 
      });
    } finally {
      setTestingCron(false);
    }
  };

  return (
    <div className="container mt-3">
      <h3 className="mb-3">Panel de Administración (Dashboard)</h3>

      {error && <div className="alert alert-danger">{error}</div>}
      {loading && <p className="text-muted">Cargando…</p>}

      {/* ---------- TARJETAS SUPERIORES ---------- */}
      {stats && (
        <div className="row g-3 mb-4">
          <div className="col-md-4">
            <div className="card shadow-sm h-100">
              <div className="card-body">
                <h5 className="card-title">Usuarios</h5>
                <p className="fs-3 mb-0">{stats.users}</p>
              </div>
            </div>
          </div>

          <div className="col-md-4">
            <div className="card shadow-sm h-100">
              <div className="card-body">
                <h5 className="card-title">QR emitidos</h5>
                <p className="fs-3 mb-0">{stats.passes}</p>
              </div>
            </div>
          </div>

          <div className="col-md-4">
            <div className="card shadow-sm h-100">
              <div className="card-body">
                <h5 className="card-title">Logs</h5>
                <p className="fs-3 mb-0">{stats.logs}</p>
              </div>
            </div>
          </div>

          <div className="col-md-4">
            <div className="card shadow-sm h-100">
              <div className="card-body">
                <h5 className="card-title">Accesos permitidos</h5>
                <p className="fs-3 text-success mb-1">{stats.allowed}</p>
                <small className="text-muted">
                  {(stats.allowed / Math.max(stats.logs || 1, 1) * 100)
                    .toFixed(1)
                    .replace('.0', '')}
                  % de accesos
                </small>
              </div>
            </div>
          </div>

          <div className="col-md-4">
            <div className="card shadow-sm h-100">
              <div className="card-body">
                <h5 className="card-title">Accesos denegados</h5>
                <p className="fs-3 text-danger mb-1">{stats.denied}</p>
                <small className="text-muted">
                  {(stats.denied / Math.max(stats.logs || 1, 1) * 100)
                    .toFixed(1)
                    .replace('.0', '')}
                  % de intentos
                </small>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- BLOQUE DE ÚLTIMOS ACCESOS ---------- */}
      <div className="card shadow-sm">
        <div className="card-body">
          <h5 className="card-title mb-3">Últimos accesos registrados</h5>

          {/* Texto de depuración para asegurarnos de que este bloque se pinta */}
          <p className="text-muted mb-2">
            (DEBUG: este texto debe verse siempre, haya o no registros)
          </p>

          {!recent.length && !loading && (
            <p className="text-muted mb-0">Sin registros todavía.</p>
          )}

          {!!recent.length && (
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Acción</th>
                    <th>Dueño QR</th>
                    <th>Guardia</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((row) => {
                    const esInvitado = !!row.guest;
                    const nombre = esInvitado
                      ? [
                          row.guest.firstName,
                          row.guest.lastNameP,
                          row.guest.lastNameM,
                        ]
                          .filter(Boolean)
                          .join(' ')
                      : [
                          row.user?.firstName,
                          row.user?.lastNameP,
                          row.user?.lastNameM,
                        ]
                          .filter(Boolean)
                          .join(' ') || row.user?.name || '—';

                    const tipo =
                      row.qr?.kind === 'ENTRY'
                        ? 'Entrada'
                        : row.qr?.kind === 'EXIT'
                        ? 'Salida'
                        : '—';

                    const accion =
                      row.action === 'VALIDATE_ALLOW'
                        ? 'Permitido'
                        : row.action === 'VALIDATE_DENY'
                        ? 'Denegado'
                        : row.action;

                    return (
                      <tr key={row.id}>
                        <td>{fmtFecha(row.createdAt)}</td>
                        <td>{tipo}</td>
                        <td>{accion}</td>
                        <td>
                          {nombre}
                          <div className="text-muted small">
                            {esInvitado ? 'Invitado' : row.user?.role || '—'}
                          </div>
                        </td>
                        <td>{row.guard?.name || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ---------- BOTÓN DE PRUEBA DE CRONJOB ---------- */}
      <div className="card shadow-sm mt-4 border-warning">
        <div className="card-body">
          <h5 className="card-title">🔧 Prueba de Cronjob (Desarrollo)</h5>
          <p className="text-muted mb-3">
            Ejecuta manualmente el reseteo diario de usuarios INSIDE → OUTSIDE y 
            auto-expulsión de invitados para verificar que funciona correctamente.
          </p>
          <button 
            className="btn btn-warning"
            onClick={handleTestCronjob}
            disabled={testingCron}
          >
            {testingCron ? 'Ejecutando...' : '▶️ Ejecutar Cronjob Ahora'}
          </button>

          {cronResult && (
            <div className={`alert ${cronResult.ok ? 'alert-success' : 'alert-danger'} mt-3 mb-0`}>
              {cronResult.ok ? (
                <>
                  <h6 className="alert-heading">✅ Cronjob ejecutado exitosamente</h6>
                  <pre className="mb-0 small" style={{maxHeight: '200px', overflow: 'auto'}}>
                    {JSON.stringify(cronResult.data, null, 2)}
                  </pre>
                </>
              ) : (
                <>
                  <h6 className="alert-heading">❌ Error al ejecutar cronjob</h6>
                  <p className="mb-0">{cronResult.error}</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
