import React, { useState, useEffect } from 'react';
import { getLastAccesses, api } from '../services/api';

/* ---------- Configuración de URLs para fotos ---------- */
// Igual que en GuardScan
const API_BASE_URL = api?.defaults?.baseURL || '/api';
const ASSETS_BASE_URL =
  process.env.REACT_APP_ASSETS_BASE_URL ||
  API_BASE_URL.replace(/\/api\/?$/, '');

function resolvePhotoUrl(photoUrl) {
  if (!photoUrl) return null;

  // Si ya viene absoluta, la dejamos
  if (photoUrl.startsWith('http://') || photoUrl.startsWith('https://')) {
    return photoUrl;
  }

  // Si es relativa (ej. "/photos/xyz.jpg"), la pegamos al backend
  const base = ASSETS_BASE_URL.replace(/\/$/, '');
  const path = photoUrl.replace(/^\//, '');
  return `${base}/${path}`;
}

export default function LastAccessesTable() {
  const [accesses, setAccesses] = useState([]);
  const [pagination, setPagination] = useState({
    total: 0,
    take: 10,
    skip: 0,
    totalPages: 0,
    currentPage: 1,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchAccesses = async (take = 10, skip = 0) => {
    setLoading(true);
    setError('');
    try {
      const res = await getLastAccesses({ take, skip });

      // Backend: { items, total }
      const data = res.data || {};
      const items = data.items || [];

      // Mapear AccessEvent -> shape que la tabla espera
      const mappedAccesses = items.map((ev) => {
        const user = ev.user || null;
        const guest = ev.guest || null;

        const userFullName = user
          ? user.name ||
            [user.firstName, user.lastNameP, user.lastNameM]
              .filter(Boolean)
              .join(' ')
          : '';

        const guestFullName = guest
          ? [guest.firstName, guest.lastNameP, guest.lastNameM]
              .filter(Boolean)
              .join(' ')
          : '';

        return {
          id: ev.id,
          createdAt: ev.createdAt,
          user: user
            ? {
                name: userFullName || user.email || 'Desconocido',
                boleta: user.boleta || '',
                photoUrl: user.photoUrl || null,
              }
            : null,
          guest: guest
            ? {
                name: guestFullName || 'Invitado',
                curp: guest.curp || '',
                reason: guest.reason || '',
              }
            : null,
          qr: {
            kind: ev.accessType, // ENTRY / EXIT
          },
          action: ev.result, // ALLOWED / DENIED / INVALID_QR / EXPIRED_QR...
        };
      });

      setAccesses(mappedAccesses);

      const total = data.total ?? items.length;
      const totalPages = total > 0 ? Math.ceil(total / take) : 1;
      const currentPage = Math.floor(skip / take) + 1;

      setPagination({
        total,
        take,
        skip,
        totalPages,
        currentPage,
      });
    } catch (err) {
      setError('Error al cargar los accesos');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccesses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePageChange = (newPage) => {
    const newSkip = (newPage - 1) * pagination.take;
    fetchAccesses(pagination.take, newSkip);
  };

  const handlePageSizeChange = (e) => {
    const newTake = parseInt(e.target.value, 10);
    fetchAccesses(newTake, 0);
  };

  if (loading && accesses.length === 0) {
    return <div className="text-center p-4">Cargando...</div>;
  }

  return (
    <div className="card">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h5 className="mb-0">Últimos Accesos</h5>
        <div className="d-flex align-items-center gap-2">
          <label className="mb-0 me-2">Mostrar:</label>
          <select
            className="form-select form-select-sm"
            style={{ width: 'auto' }}
            value={pagination.take}
            onChange={handlePageSizeChange}
            disabled={loading}
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
          </select>
        </div>
      </div>
      <div className="card-body">
        {error && <div className="alert alert-danger">{error}</div>}

        <div className="table-responsive">
          <table className="table table-hover last-accesses-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario/Invitado</th>
                <th className="col-motivo">Motivo</th>
                <th>Tipo</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {accesses.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center text-muted">
                    No hay registros
                  </td>
                </tr>
              ) : (
                accesses.map((access) => {
                  const userName =
                    access.user?.name || access.guest?.name || 'Desconocido';
                  const userBoleta = access.user?.boleta || '';
                  const guestCurp = access.guest?.curp || '';
                  const guestReason = access.guest?.reason || '';
                  const qrKind = access.qr?.kind || '-';
                  const action = access.action || '-';
                  const isGuest = !!access.guest;

                  const userPhotoSrc = access.user?.photoUrl
                    ? resolvePhotoUrl(access.user.photoUrl)
                    : null;

                  return (
                    <tr key={access.id}>
                      <td>
                        {access.createdAt
                          ? new Date(access.createdAt).toLocaleString('es-MX')
                          : '—'}
                      </td>
                      <td>
                        {userPhotoSrc && (
                          <img
                            src={userPhotoSrc}
                            alt=""
                            className="rounded-circle me-2"
                            style={{
                              width: 32,
                              height: 32,
                              objectFit: 'cover',
                            }}
                            onError={(e) => {
                              console.error(
                                'Error cargando foto en tabla:',
                                userPhotoSrc
                              );
                              e.target.style.display = 'none';
                            }}
                          />
                        )}
                        {userName}
                        {isGuest
                          ? guestCurp && (
                              <span className="text-muted"> ({guestCurp})</span>
                            )
                          : userBoleta && (
                              <span className="text-muted">
                                {' '}
                                ({userBoleta})
                              </span>
                            )}
                      </td>
                      <td className="col-motivo">
                        {isGuest ? (
                          guestReason || (
                            <span className="text-muted">—</span>
                          )
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`badge bg-${
                            qrKind === 'ENTRY'
                              ? 'success'
                              : qrKind === 'EXIT'
                              ? 'warning'
                              : 'secondary'
                          }`}
                        >
                          {qrKind === 'ENTRY'
                            ? 'Entrada'
                            : qrKind === 'EXIT'
                            ? 'Salida'
                            : qrKind}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge bg-${
                            String(action).includes('ALLOW') ||
                            String(action).includes('ALLOWED')
                              ? 'success'
                              : 'danger'
                          }`}
                        >
                          {(() => {
                            const act = String(action).replace('VALIDATE_', '');
                            if (act === 'ALLOWED') return 'Permitido';
                            if (act === 'DENIED') return 'Denegado';
                            if (act === 'EXPIRED_QR') return 'QR Expirado';
                            if (act === 'INVALID_QR') return 'QR Inválido';
                            return act;
                          })()}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <nav className="d-flex justify-content-between align-items-center mt-3">
            <div className="text-muted small">
              Mostrando {accesses.length} de {pagination.total} registros
            </div>
            <ul className="pagination pagination-sm mb-0">
              <li
                className={`page-item ${
                  pagination.currentPage === 1 ? 'disabled' : ''
                }`}
              >
                <button
                  className="page-link"
                  onClick={() => handlePageChange(pagination.currentPage - 1)}
                  disabled={pagination.currentPage === 1 || loading}
                >
                  Anterior
                </button>
              </li>

              {[...Array(pagination.totalPages)].map((_, i) => {
                const page = i + 1;
                if (
                  page === 1 ||
                  page === pagination.totalPages ||
                  Math.abs(page - pagination.currentPage) <= 2
                ) {
                  return (
                    <li
                      key={page}
                      className={`page-item ${
                        page === pagination.currentPage ? 'active' : ''
                      }`}
                    >
                      <button
                        className="page-link"
                        onClick={() => handlePageChange(page)}
                        disabled={loading}
                      >
                        {page}
                      </button>
                    </li>
                  );
                } else if (
                  page === pagination.currentPage - 3 ||
                  page === pagination.currentPage + 3
                ) {
                  return (
                    <li key={page} className="page-item disabled">
                      <span className="page-link">...</span>
                    </li>
                  );
                }
                return null;
              })}

              <li
                className={`page-item ${
                  pagination.currentPage === pagination.totalPages
                    ? 'disabled'
                    : ''
                }`}
              >
                <button
                  className="page-link"
                  onClick={() =>
                    handlePageChange(pagination.currentPage + 1)
                  }
                  disabled={
                    pagination.currentPage === pagination.totalPages || loading
                  }
                >
                  Siguiente
                </button>
              </li>
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}
