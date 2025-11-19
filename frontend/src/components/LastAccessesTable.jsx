import React, { useState, useEffect } from 'react';
import { getLastAccesses } from '../services/api';

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
      setAccesses(res.data.accesses || []);
      setPagination(res.data.pagination || {});
    } catch (err) {
      setError('Error al cargar los accesos');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccesses();
  }, []);

  const handlePageChange = (newPage) => {
    const newSkip = (newPage - 1) * pagination.take;
    fetchAccesses(pagination.take, newSkip);
  };

  const handlePageSizeChange = (e) => {
    const newTake = parseInt(e.target.value, 10);
    fetchAccesses(newTake, 0); // reset a página 1
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
          <table className="table table-hover">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario/Invitado</th>
                <th>Tipo</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {accesses.length === 0 ? (
                <tr>
                  <td colSpan="4" className="text-center text-muted">
                    No hay registros
                  </td>
                </tr>
              ) : (
                accesses.map((access) => {
                  const userName = access.user?.name || access.guest?.name || 'Desconocido';
                  const userBoleta = access.user?.boleta || '';
                  const qrKind = access.qr?.kind || '-';
                  const action = access.action || '-';
                  
                  return (
                    <tr key={access.id}>
                      <td>{new Date(access.createdAt).toLocaleString('es-MX')}</td>
                      <td>
                        {access.user?.photoUrl && (
                          <img
                            src={access.user.photoUrl}
                            alt=""
                            className="rounded-circle me-2"
                            style={{ width: 32, height: 32, objectFit: 'cover' }}
                          />
                        )}
                        {userName}
                        {userBoleta && <span className="text-muted"> ({userBoleta})</span>}
                      </td>
                      <td>
                        <span className={`badge bg-${qrKind === 'ENTRY' ? 'success' : 'warning'}`}>
                          {qrKind === 'ENTRY' ? 'Entrada' : qrKind === 'EXIT' ? 'Salida' : qrKind}
                        </span>
                      </td>
                      <td>
                        <span className={`badge bg-${action.includes('ALLOW') ? 'success' : 'danger'}`}>
                          {action.replace('VALIDATE_', '')}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Controles de paginación */}
        {pagination.totalPages > 1 && (
          <nav className="d-flex justify-content-between align-items-center mt-3">
            <div className="text-muted small">
              Mostrando {accesses.length} de {pagination.total} registros
            </div>
            <ul className="pagination pagination-sm mb-0">
              <li className={`page-item ${pagination.currentPage === 1 ? 'disabled' : ''}`}>
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
                // Mostrar solo páginas cercanas (max 5)
                if (
                  page === 1 ||
                  page === pagination.totalPages ||
                  Math.abs(page - pagination.currentPage) <= 2
                ) {
                  return (
                    <li
                      key={page}
                      className={`page-item ${page === pagination.currentPage ? 'active' : ''}`}
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

              <li className={`page-item ${pagination.currentPage === pagination.totalPages ? 'disabled' : ''}`}>
                <button
                  className="page-link"
                  onClick={() => handlePageChange(pagination.currentPage + 1)}
                  disabled={pagination.currentPage === pagination.totalPages || loading}
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