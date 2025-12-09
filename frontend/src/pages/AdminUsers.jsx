// frontend/src/pages/AdminUsers.jsx
import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import {
  listUsers,
  createUser,
  deleteUser,
  deactivateUser,
  restoreUser,
  bulkUserAction,
  updateUser          // ← nuevo
} from '../services/admin';
import { Link } from 'react-router-dom';
import './AdminUsers.css';

const RE_LETTERS   = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$/;
const RE_BOLETA    = /^\d{10}$/;
const RE_PASSWORD  = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;
const RE_EMAIL_DOT     = /^[a-z]+(?:\.[a-z]+)+@(?:alumno\.)?ipn\.mx$/i;
const RE_EMAIL_COMPACT = /^[a-z]{1,6}[a-z]+[a-z]?\d{0,6}@(?:alumno\.)?ipn\.mx$/i;
const isInstitutional = (email) =>
  RE_EMAIL_DOT.test((email || '').trim().toLowerCase()) ||
  RE_EMAIL_COMPACT.test((email || '').trim().toLowerCase());

const translateRole = (role) => ({
  ADMIN: 'Administrador',
  GUARD: 'Guardia',
  USER: 'Usuario Institucional'
}[role] || role);

const translateInstitutionalType = (type) => ({
  STUDENT: 'Estudiante',
  TEACHER: 'Profesor',
  PAE: 'PAE'
}[type] || type);

export default function AdminUsers() {
  const [form, setForm] = useState({
    boleta: '', firstName: '', lastNameP: '', lastNameM: '',
    email: '', contactEmail: '', password: '', role: 'GUARD', institutionalType: ''
  });
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);

  const [query, setQuery] = useState('');
  const [role, setRole]   = useState('');
  const [institutionalType, setInstitutionalType] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [take]  = useState(20);
  const [skip, setSkip]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [guests, setGuests] = useState([]);
  const [gTotal, setGTotal] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalUser, setModalUser] = useState(null);
  const [modalMode, setModalMode] = useState('');
  const [modalConfirm, setModalConfirm] = useState(false);
  const [selected, setSelected] = useState([]);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState('');
  const [bulkConfirm, setBulkConfirm] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editErrors, setEditErrors] = useState({});
  const [editing, setEditing] = useState(false);

  const validate = (f) => {
    const e = {};
    if (!RE_BOLETA.test(f.boleta)) e.boleta = 'Boleta: 10 dígitos.';
    if (!f.firstName || !RE_LETTERS.test(f.firstName)) e.firstName = 'Nombre inválido.';
    if (!f.lastNameP || !RE_LETTERS.test(f.lastNameP)) e.lastNameP = 'Apellido paterno inválido.';
    if (!f.lastNameM || !RE_LETTERS.test(f.lastNameM)) e.lastNameM = 'Apellido materno inválido.';
    if (!f.email || !isInstitutional(f.email)) e.email = 'Correo institucional inválido.';
    if (!RE_PASSWORD.test(f.password)) e.password = 'Contraseña débil (12+, mayúsc, minúsc, número y símbolo).';
    if (!['ADMIN','GUARD','USER'].includes(f.role)) e.role = 'Rol inválido.';
    return e;
  };
  const isValid = useMemo(() => Object.keys(validate(form)).length === 0, [form]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await listUsers({
        query,
        role,
        institutionalType,
        take,
        skip,
        includeInactive
      });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error(e);
      setMsg('No se pudo cargar la lista');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [query, role, institutionalType, skip, includeInactive]);
  useEffect(() => {
    api.get('/admin/guests?take=100&skip=0')
      .then(({ data }) => {
        setGuests(data.items || []);
        setGTotal(data.total || 0);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (modalOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [modalOpen]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({
      ...f,
      [name]: name === 'boleta'
        ? value.replace(/\D/g, '').slice(0,10)
        : value
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    const eobj = validate(form);
    setErrors(eobj);
    if (Object.keys(eobj).length) return;

    setSending(true);
    try {
      const payload = {
        boleta: form.boleta,
        firstName: form.firstName.trim(),
        lastNameP: form.lastNameP.trim(),
        lastNameM: form.lastNameM.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: form.role,
        ...(form.role === 'USER' && form.institutionalType ? { institutionalType: form.institutionalType } : {}),
        ...(form.role === 'GUARD' && form.overrideGuard ? { overrideGuard: true } : {}),
        ...(form.role !== 'GUARD' && form.contactEmail
            ? { contactEmail: form.contactEmail.trim().toLowerCase() }
            : {})
      };
      await createUser(payload);
      setForm({
        boleta:'', firstName:'', lastNameP:'', lastNameM:'',
        email:'', contactEmail:'', password:'', role:'GUARD', institutionalType: ''
      });
      setSkip(0);
      await load();
      setMsg('Usuario creado correctamente');
    } catch (err) {
      const server = err?.response?.data;
      setMsg(server?.error || 'No se pudo crear');
      if (server?.errors) setErrors(server.errors);
    } finally {
      setSending(false);
    }
  };

  const onRestore = async (id) => {
    try {
      await restoreUser(id);
      await load();
    } catch (e) {
      console.error(e);
      alert('No se pudo reactivar.');
    }
  };

  const openModalFor = (user) => {
    setModalUser(user);
    setModalMode('');
    setModalConfirm(false);
    setModalOpen(true);
  };
  const closeModal = () => {
    setModalOpen(false);
    setModalUser(null);
    setModalMode('');
    setModalConfirm(false);
  };

  const performAction = async () => {
    if (!modalUser || !modalMode) return;
    if (!modalConfirm) {
      alert('Debes marcar la casilla de confirmación.');
      return;
    }
    try {
      if (modalMode === 'soft') {
        await deactivateUser(modalUser.id);
      } else if (modalMode === 'anonymize') {
        await deleteUser(modalUser.id, 'anonymize', { anonymizeEmail: true });
      } else if (modalMode === 'hard') {
        await deleteUser(modalUser.id, 'hard');
      } else {
        alert('Modo inválido.');
        return;
      }
      await load();
      closeModal();
    } catch (e) {
      console.error(e);
      alert(e?.response?.data?.error || 'Acción fallida');
    }
  };

  const bulkPerformAction = async () => {
    if (!bulkMode || !selected.length) return;
    if (!bulkConfirm) {
      alert('Debes marcar la casilla de confirmación.');
      return;
    }
    try {
      for (const id of selected) {
        if (bulkMode === 'soft') {
          await deactivateUser(id);
        } else if (bulkMode === 'anonymize') {
          await deleteUser(id, 'anonymize', { anonymizeEmail: true });
        } else if (bulkMode === 'hard') {
          await deleteUser(id, 'hard');
        }
      }
      await load();
      setBulkModalOpen(false);
      setSelected([]);
    } catch (e) {
      console.error(e);
      alert(e?.response?.data?.error || 'Acción masiva fallida');
    }
  };

  const openEdit = (u) => {
    setEditUser(u);
    setEditForm({
      name: u.name || '',
      firstName: u.firstName || '',
      lastNameP: u.lastNameP || '',
      lastNameM: u.lastNameM || '',
      email: u.email || '',
      contactEmail: u.contactEmail || '',
      boleta: u.boleta || '',
      role: u.role || 'USER',
      institutionalType: u.institutionalType || '',
      isActive: u.isActive,
      mustChangePassword: !!u.mustChangePassword,
      newPassword: ''    // ← AGREGAR ESTO
    });
    setEditErrors({});
    setEditOpen(true);
  };
  const closeEdit = () => {
    setEditOpen(false);
    setEditUser(null);
  };

  const validateEdit = (f) => {
    const e = {};
    if (f.boleta && !RE_BOLETA.test(f.boleta)) e.boleta = 'Boleta inválida';
    if (!f.firstName || !RE_LETTERS.test(f.firstName)) e.firstName = 'Nombre inválido';
    if (!f.lastNameP || !RE_LETTERS.test(f.lastNameP)) e.lastNameP = 'Apellido paterno inválido';
    if (!f.lastNameM || !RE_LETTERS.test(f.lastNameM)) e.lastNameM = 'Apellido materno inválido';
    if (!f.email || !isInstitutional(f.email)) e.email = 'Correo institucional inválido';
    if (f.contactEmail && !/.+@.+\..+/.test(f.contactEmail)) e.contactEmail = 'Correo contacto inválido';
    if (!['ADMIN','GUARD','USER'].includes(f.role)) e.role = 'Rol inválido';
    if (f.role === 'USER' && f.institutionalType && !['STUDENT','TEACHER','PAE'].includes(f.institutionalType))
      e.institutionalType = 'Sub-rol inválido';
    return e;
  };
  const isEditValid = useMemo(() => Object.keys(validateEdit(editForm)).length === 0, [editForm]);

  const submitEdit = async (e) => {
    e.preventDefault();
    const errs = validateEdit(editForm);
    setEditErrors(errs);
    if (Object.keys(errs).length) return;
    setEditing(true);
    try {
      const payload = {
        name: editForm.name.trim(),
        firstName: editForm.firstName.trim(),
        lastNameP: editForm.lastNameP.trim(),
        lastNameM: editForm.lastNameM.trim(),
        email: editForm.email.trim().toLowerCase(),
        contactEmail: editForm.contactEmail ? editForm.contactEmail.trim().toLowerCase() : null,
        boleta: editForm.boleta.trim(),
        role: editForm.role,
        institutionalType: editForm.role === 'USER' ? (editForm.institutionalType || '') : undefined,
        isActive: editForm.isActive,
        mustChangePassword: editForm.mustChangePassword,
        ...(editForm.newPassword ? { newPassword: editForm.newPassword } : {})  // ← AGREGAR ESTO
      };
      await updateUser(editUser.id, payload);
      await load();
      closeEdit();
    } catch (err) {
      const m = err?.response?.data?.error || 'Error al actualizar';
      alert(m);
    } finally {
      setEditing(false);
    }
  };

  const pages = Math.ceil(total / take) || 1;
  const page = Math.floor(skip / take) + 1;

  return (
    <div className="container mt-3">
      <h3>Administración de usuarios</h3>
      <div className="mb-3">
        <Link to="/import-db" className="btn btn-secondary">
          Importar BD con usuarios
        </Link>
      </div>

      <div className="row g-2 align-items-end">
        <div className="col-md-4">
          <label className="form-label">Buscar (nombre, boleta, correo)</label>
          <input className="form-control" value={query} onChange={e=>{ setSkip(0); setQuery(e.target.value); }} />
        </div>
        <div className="col-md-3">
          <label className="form-label">Rol</label>
          <select className="form-select" value={role} onChange={e=>{ setSkip(0); setRole(e.target.value); }}>
            <option value="">Todos</option>
            <option value="ADMIN">Administrador</option>
            <option value="GUARD">Guardia</option>
            <option value="USER">Usuario Institucional</option>
          </select>
        </div>
        <div className="col-md-3">
          <label className="form-label">Sub-rol</label>
          <select
            className="form-select"
            value={institutionalType}
            onChange={e => { setSkip(0); setInstitutionalType(e.target.value); }}
          >
            <option value="">Todos</option>
            <option value="STUDENT">Estudiante</option>
            <option value="TEACHER">Profesor</option>
            <option value="PAE">PAE</option>
          </select>
        </div>
        <div className="col-md-3">
          <label className="form-label">Incluir inactivos</label>
          <div className="form-check form-switch">
            <input className="form-check-input" type="checkbox"
                   checked={includeInactive}
                   onChange={e => { setSkip(0); setIncludeInactive(e.target.checked); }} />
          </div>
        </div>
        <div className="col-md-2">
          <label className="form-label">Resultados</label>
          <input className="form-control" value={total} readOnly />
        </div>
      </div>

      <div className="alert alert-secondary small mt-3">
        <strong>Acciones sobre usuarios:</strong><br />
        <span className="badge bg-warning text-dark me-1">Desactivar</span> Deshabilita temporalmente (reversible).<br />
        <span className="badge bg-info text-dark me-1">Eliminar parcialmente</span> Borra datos personales y deja un registro neutro (irreversible).<br />
        <span className="badge bg-danger me-1">Eliminar definitivo</span> Borra el registro por completo (irreversible).
      </div>

      {selected.length > 0 && (
        <div className="alert alert-primary d-flex justify-content-between align-items-center">
          <div>
            Seleccionados: {selected.length}{' '}
            <button className="btn btn-sm btn-outline-secondary ms-2" onClick={() => setSelected([])}>
              Limpiar selección
            </button>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-sm btn-warning" onClick={() => { setBulkMode('soft'); setBulkConfirm(false); setBulkModalOpen(true); }}>Desactivar</button>
            <button className="btn btn-sm btn-info text-white" onClick={() => { setBulkMode('anonymize'); setBulkConfirm(false); setBulkModalOpen(true); }}>Eliminar parcialmente</button>
            <button className="btn btn-sm btn-danger" onClick={() => { setBulkMode('hard'); setBulkConfirm(false); setBulkModalOpen(true); }}>Eliminar definitivo</button>
          </div>
        </div>
      )}

      <div className="table-responsive mt-3">
        <table className="table table-sm table-striped align-middle">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={selected.length === items.length && items.length > 0}
                  onChange={e => {
                    if (e.target.checked) setSelected(items.map(i => i.id));
                    else setSelected([]);
                  }}
                />
              </th>
              <th>Boleta</th>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Correo contacto</th>
              <th>Rol</th>
              <th>Sub-rol</th>
              <th>Estado</th>
              <th>Creado</th>
              <th>Contraseña por defecto</th>
              <th style={{ width: 260 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11}>Cargando…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={11}>Sin resultados</td></tr>
            ) : items.map(u => (
              <tr key={u.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.includes(u.id)}
                    onChange={e => {
                      setSelected(s => e.target.checked ? [...s, u.id] : s.filter(x => x !== u.id));
                    }}
                  />
                </td>
                <td>{u.boleta}</td>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.contactEmail || <span className="text-muted">—</span>}</td>
                <td>{translateRole(u.role)}</td>
                <td>{u.institutionalType ? translateInstitutionalType(u.institutionalType) : '-'}</td>
                <td>
                  {u.isActive
                    ? <span className="badge bg-success">Activo</span>
                    : <span className="badge bg-secondary">Inactivo</span>}
                </td>
                <td>{new Date(u.createdAt).toLocaleString()}</td>
                <td>
                  {u.defaultPassword
                    ? <code className="bg-light p-1 rounded">{u.defaultPassword}</code>
                    : <span className="text-muted">—</span>}
                </td>
                <td className="actions-cell">
                  <div className="d-flex align-items-center gap-2">
                    {u.isActive ? (
                      <button
                        className="btn btn-sm btn-outline-success"
                        title="Ver opciones de gestión del usuario."
                        onClick={() => openModalFor(u)}
                      >
                        Gestionar
                      </button>
                    ) : (
                      <>
                        <button
                          className="btn btn-sm btn-outline-success"
                          title="Restaura el acceso del usuario desactivado."
                          onClick={() => onRestore(u.id)}
                        >
                          Reactivar
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          title="Ver opciones de gestión del usuario."
                          onClick={() => openModalFor(u)}
                        >
                          Gestionar
                        </button>
                      </>
                    )}
                    <button
                      className="btn btn-sm btn-outline-primary"
                      title="Editar usuario"
                      onClick={() => openEdit(u)}
                    >
                      Editar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="d-flex justify-content-between align-items-center">
        <div>Página {page} de {pages}</div>
        <div className="btn-group">
          <button className="btn btn-outline-secondary btn-sm"
                  disabled={skip===0}
                  onClick={()=>setSkip(Math.max(0, skip - take))}>«</button>
          <button className="btn btn-outline-secondary btn-sm"
                  disabled={page>=pages}
                  onClick={()=>setSkip(skip + take)}>»</button>
        </div>
      </div>

      <div className="rounded-3 text-white text-center fw-bold py-2 mt-4" style={{ background: '#5bbcff' }}>
        Alta de usuario
      </div>

      <form className="bg-secondary bg-opacity-75 text-white rounded-3 p-3 mt-3" onSubmit={submit} noValidate>
        <div className="row g-2">
          <div className="col-md-4">
            <label className="form-label">Boleta (10 dígitos)</label>
            <input name="boleta"
                   className={`form-control ${errors.boleta ? 'is-invalid':''}`}
                   value={form.boleta} onChange={onChange} />
            {errors.boleta && <div className="invalid-feedback d-block">{errors.boleta}</div>}
          </div>
          <div className="col-md-4">
            <label className="form-label">Nombre(s)</label>
            <input name="firstName"
                   className={`form-control ${errors.firstName ? 'is-invalid':''}`}
                   value={form.firstName} onChange={onChange} />
            {errors.firstName && <div className="invalid-feedback d-block">{errors.firstName}</div>}
          </div>
          <div className="col-md-4">
            <label className="form-label">Apellido paterno</label>
            <input name="lastNameP"
                   className={`form-control ${errors.lastNameP ? 'is-invalid':''}`}
                   value={form.lastNameP} onChange={onChange} />
            {errors.lastNameP && <div className="invalid-feedback d-block">{errors.lastNameP}</div>}
          </div>
          <div className="col-md-4">
            <label className="form-label">Apellido materno</label>
            <input name="lastNameM"
                   className={`form-control ${errors.lastNameM ? 'is-invalid':''}`}
                   value={form.lastNameM} onChange={onChange} />
            {errors.lastNameM && <div className="invalid-feedback d-block">{errors.lastNameM}</div>}
          </div>
          <div className="col-md-5">
            <label className="form-label">Correo institucional</label>
            <input name="email" type="email"
                   className={`form-control ${errors.email ? 'is-invalid':''}`}
                   value={form.email} onChange={onChange}
                   placeholder="ej. usuario@alumno.ipn.mx" />
            {errors.email && <div className="invalid-feedback d-block">{errors.email}</div>}
          </div>
          {form.role !== 'GUARD' && (
            <div className="col-md-5">
              <label className="form-label">Correo de contacto (opcional)</label>
              <input
                name="contactEmail"
                type="email"
                className="form-control"
                value={form.contactEmail}
                onChange={onChange}
                placeholder="ej. usuario@gmail.com"
              />
            </div>
          )}
          <div className="col-md-3">
            <label className="form-label">Rol</label>
            <select name="role"
                    className={`form-select ${errors.role ? 'is-invalid':''}`}
                    value={form.role} onChange={onChange}>
              <option value="GUARD">Guardia</option>
              <option value="ADMIN">Administrador</option>
              <option value="USER">Usuario Institucional</option>
            </select>
            {errors.role && <div className="invalid-feedback d-block">{errors.role}</div>}
            {form.role === 'GUARD' && (
              <div className="form-check mt-2">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={!!form.overrideGuard}
                  onChange={e => setForm(f => ({ ...f, overrideGuard: e.target.checked }))}
                />
                <label className="form-check-label small">
                  Sobrescribir guardia existente (mismo correo)
                </label>
              </div>
            )}
          </div>
          <div className="col-md-3">
            <label className="form-label">Sub-rol institucional</label>
            <select name="institutionalType" className="form-select" value={form.institutionalType} onChange={onChange}>
              <option value="">(opcional)</option>
              <option value="STUDENT">Estudiante</option>
              <option value="TEACHER">Profesor</option>
              <option value="PAE">PAE</option>
            </select>
            <div className="form-text">Sólo aplica si el rol es <strong>Usuario Institucional</strong>.</div>
          </div>
          <div className="col-md-6">
            <label className="form-label">Contraseña</label>
            <input name="password" type="password"
                   className={`form-control ${errors.password ? 'is-invalid':''}`}
                   value={form.password} onChange={onChange}
                   placeholder="12+ con may/mín/número/símbolo" />
            {errors.password && <div className="invalid-feedback d-block">{errors.password}</div>}
          </div>
        </div>

        {msg && <div className="alert mt-3 alert-info">{msg}</div>}

        <div className="d-flex gap-2 mt-3">
          <button className="btn btn-primary" disabled={!isValid || sending}>
            {sending ? 'Guardando…' : 'Crear usuario'}
          </button>
        </div>
      </form>

      <h5 className="mt-4">Invitados ({gTotal})</h5>
      <div className="table-responsive">
        <table className="table table-sm align-middle">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>CURP</th>
              <th>Motivo</th>
              <th>Estado</th>
              <th>Creado</th>
              <th>Expira</th>
            </tr>
          </thead>
          <tbody>
            {guests.map(g => (
              <tr key={g.id}>
                <td>{[g.firstName, g.lastNameP, g.lastNameM].filter(Boolean).join(' ')}</td>
                <td>{g.curp}</td>
                <td>{g.reason}</td>
                <td>{g.state}</td>
                <td>{new Date(g.createdAt).toLocaleString()}</td>
                <td>{g.expiresAt ? new Date(g.expiresAt).toLocaleString() : '—'}</td>
              </tr>
            ))}
            {guests.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted">Sin invitados</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && modalUser && (
        <>
          <div className="modal fade show" style={{ display: 'block', background: 'rgba(0,0,0,0.5)' }} onClick={closeModal}>
            <div className="modal-dialog modal-lg modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Acciones sobre usuario</h5>
                  <button type="button" className="btn-close" onClick={closeModal} />
                </div>
                <div className="modal-body">
                  <div className="mb-3 p-3 bg-light rounded">
                    <strong>Usuario seleccionado:</strong><br />
                    <code>{modalUser.email}</code><br />
                    <small className="text-muted">
                      Nombre: {modalUser.name || '—'} | Boleta: {modalUser.boleta || '—'} | Rol: {translateRole(modalUser.role)} | Sub-rol: {modalUser.institutionalType ? translateInstitutionalType(modalUser.institutionalType) : '—'}
                    </small><br />
                    <small className="text-muted">
                      Correo contacto: {modalUser.contactEmail || '—'}
                    </small>
                  </div>

                  {!modalMode ? (
                    <>
                      <p className="fw-bold mb-3">Selecciona la acción que deseas realizar:</p>
                      <div className="d-grid gap-2">
                        <button
                          className="btn btn-warning btn-lg text-start d-flex justify-content-between align-items-center"
                          onClick={() => setModalMode('soft')}
                        >
                          <div>
                            <strong>Desactivar (soft)</strong>
                            <br />
                            <small>Deshabilita acceso, conserva todos los datos. Reversible con "Reactivar".</small>
                          </div>
                          <span className="badge bg-dark">Reversible</span>
                        </button>

                        <button
                          className="btn btn-info btn-lg text-white text-start d-flex justify-content-between align-items-center"
                          onClick={() => setModalMode('anonymize')}
                        >
                          <div>
                            <strong>Eliminar parcialmente (irreversible)</strong>
                            <br />
                            <small>Borra datos personales (incluye correos, nombre, boleta y foto).</small>
                          </div>
                        </button>

                        <button
                          className="btn btn-danger btn-lg text-start d-flex justify-content-between align-items-center"
                          onClick={() => setModalMode('hard')}
                        >
                          <div>
                            <strong>Eliminar definitivo (irreversible)</strong>
                            <br />
                            <small>Elimina el registro del usuario. Logs quedan sin referencia.</small>
                          </div>
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="alert alert-primary d-flex justify-content-between align-items-center">
                        <div>
                          <strong>Has seleccionado:</strong>{' '}
                          {modalMode === 'soft' && <span className="badge bg-warning text-dark">Desactivar</span>}
                          {modalMode === 'anonymize' && <span className="badge bg-info text-dark">Eliminar parcialmente</span>}
                          {modalMode === 'hard' && <span className="badge bg-danger">Eliminar definitivo</span>}
                        </div>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => { setModalMode(''); setModalConfirm(false); }}
                        >
                          Cambiar
                        </button>
                      </div>

                      {modalMode === 'hard' && (
                        <div className="alert alert-danger py-2 small mb-3">
                          <strong>⚠️ Advertencia:</strong> Acción permanente. Los logs conservarán userId NULL.
                        </div>
                      )}
                      {modalMode === 'anonymize' && (
                        <div className="alert alert-info py-2 small mb-3">
                          <strong>ℹ️ Nota:</strong> Se reemplazan todos los datos personales por un marcador neutro.
                        </div>
                      )}
                      {modalMode === 'soft' && (
                        <div className="alert alert-warning py-2 small mb-3">
                          <strong>ℹ️ Nota:</strong> Podrás reactivar al usuario con el botón "Reactivar".
                        </div>
                      )}

                      <div className="confirm-block border rounded bg-light mt-2">
                        <input
                          id="confirmUser"
                          type="checkbox"
                          className="form-check-input"
                          checked={modalConfirm}
                          onChange={(e) => setModalConfirm(e.target.checked)}
                        />
                        <label htmlFor="confirmUser" className="mb-0">
                          {modalMode === 'soft'
                            ? 'Confirmo que deseo desactivar este usuario.'
                            : 'Confirmo que comprendo que esta acción es IRREVERSIBLE y acepto las consecuencias.'}
                        </label>
                      </div>
                    </>
                  )}
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={closeModal}
                  >
                    Cancelar
                  </button>
                  {modalMode && (
                    <button
                      type="button"
                      className={`btn ${
                        modalMode === 'soft' ? 'btn-warning' :
                        modalMode === 'anonymize' ? 'btn-info' :
                        'btn-danger'
                      }`}
                      disabled={!modalConfirm}
                      onClick={performAction}
                    >
                      {modalMode === 'soft' && 'Desactivar usuario'}
                      {modalMode === 'anonymize' && 'Eliminar datos del usuario'}
                      {modalMode === 'hard' && 'Eliminar definitivamente'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {bulkModalOpen && (
        <div className="modal fade show" style={{ display:'block', background:'rgba(0,0,0,0.5)' }} onClick={() => setBulkModalOpen(false)}>
          <div className="modal-dialog modal-lg modal-dialog-centered" onClick={e => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Acción masiva: {bulkMode}</h5>
                <button type="button" className="btn-close" onClick={() => setBulkModalOpen(false)} />
              </div>
              <div className="modal-body">
                <p className="mb-2">Usuarios seleccionados: {selected.length}</p>
                {bulkMode === 'soft' && (
                  <div className="alert alert-warning small">
                    Desactivará temporalmente todos los usuarios seleccionados (reversible).
                  </div>
                )}
                {bulkMode === 'anonymize' && (
                  <div className="alert alert-info small">
                    Eliminará datos personales del usuario. Acción irreversible.
                  </div>
                )}
                {bulkMode === 'hard' && (
                  <div className="alert alert-danger small">
                    Eliminará definitivamente los registros. Acción irreversible.
                  </div>
                )}
                <div className="confirm-block border rounded bg-light mt-2">
                  <input
                    id="bulkConfirm"
                    type="checkbox"
                    className="form-check-input"
                    checked={bulkConfirm}
                    onChange={e => setBulkConfirm(e.target.checked)}
                  />
                  <label htmlFor="bulkConfirm" className="mb-0">
                    Confirmo que deseo aplicar esta acción a {selected.length} usuario(s).
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setBulkModalOpen(false)}>Cancelar</button>
                <button
                  className={`btn ${
                    bulkMode === 'soft' ? 'btn-warning' :
                    bulkMode === 'anonymize' ? 'btn-info' : 'btn-danger'
                  }`}
                  disabled={!bulkConfirm}
                  onClick={async () => {
                    try {
                      const resp = await bulkUserAction(selected, bulkMode);
                      alert(`Procesados: ${resp.data.summary.processed}. Errores: ${resp.data.summary.errors.length}`);
                      setBulkModalOpen(false);
                      setSelected([]);
                      await load();
                    } catch (e) {
                      alert(e?.response?.data?.error || 'Acción masiva falló');
                    }
                  }}
                >
                  {bulkMode === 'soft' && 'Desactivar seleccionados'}
                  {bulkMode === 'anonymize' && 'Eliminar datos de seleccionados'}
                  {bulkMode === 'hard' && 'Eliminar definitivamente'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editOpen && editUser && (
        <div className="modal fade show" style={{ display:'block', background:'rgba(0,0,0,0.5)' }} onClick={closeEdit}>
          <div className="modal-dialog modal-lg modal-dialog-centered" onClick={e => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Editar usuario</h5>
                <button type="button" className="btn-close" onClick={closeEdit} />
              </div>
              <form onSubmit={submitEdit} noValidate>
                <div className="modal-body">
                  <div className="row g-2">
                    <div className="col-md-4">
                      <label className="form-label">Boleta</label>
                      <input
                        className={`form-control ${editErrors.boleta?'is-invalid':''}`}
                        value={editForm.boleta}
                        onChange={e=>setEditForm(f=>({...f,boleta:e.target.value.replace(/\D/g,'').slice(0,10)}))}
                      />
                      {editErrors.boleta && <div className="invalid-feedback d-block">{editErrors.boleta}</div>}
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Nombre(s)</label>
                      <input
                        className={`form-control ${editErrors.firstName?'is-invalid':''}`}
                        value={editForm.firstName}
                        onChange={e=>setEditForm(f=>({...f,firstName:e.target.value}))}
                      />
                      {editErrors.firstName && <div className="invalid-feedback d-block">{editErrors.firstName}</div>}
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Apellido paterno</label>
                      <input
                        className={`form-control ${editErrors.lastNameP?'is-invalid':''}`}
                        value={editForm.lastNameP}
                        onChange={e=>setEditForm(f=>({...f,lastNameP:e.target.value}))}
                      />
                      {editErrors.lastNameP && <div className="invalid-feedback d-block">{editErrors.lastNameP}</div>}
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Apellido materno</label>
                      <input
                        className={`form-control ${editErrors.lastNameM?'is-invalid':''}`}
                        value={editForm.lastNameM}
                        onChange={e=>setEditForm(f=>({...f,lastNameM:e.target.value}))}
                      />
                      {editErrors.lastNameM && <div className="invalid-feedback d-block">{editErrors.lastNameM}</div>}
                    </div>
                    <div className="col-md-5">
                      <label className="form-label">Correo institucional</label>
                      <input
                        type="email"
                        className={`form-control ${editErrors.email?'is-invalid':''}`}
                        value={editForm.email}
                        onChange={e=>setEditForm(f=>({...f,email:e.target.value}))}
                      />
                      {editErrors.email && <div className="invalid-feedback d-block">{editErrors.email}</div>}
                    </div>
                    {editForm.role !== 'GUARD' && (
                      <div className="col-md-5">
                        <label className="form-label">Correo contacto</label>
                        <input
                          type="email"
                          className={`form-control ${editErrors.contactEmail?'is-invalid':''}`}
                          value={editForm.contactEmail || ''}
                          onChange={e=>setEditForm(f=>({...f,contactEmail:e.target.value}))}
                        />
                        {editErrors.contactEmail && <div className="invalid-feedback d-block">{editErrors.contactEmail}</div>}
                      </div>
                    )}
                    <div className="col-md-3">
                      <label className="form-label">Rol</label>
                      <select
                        className={`form-select ${editErrors.role?'is-invalid':''}`}
                        value={editForm.role}
                        onChange={e=>setEditForm(f=>({...f,role:e.target.value}))}
                      >
                        <option value="ADMIN">Administrador</option>
                        <option value="GUARD">Guardia</option>
                        <option value="USER">Usuario Institucional</option>
                      </select>
                      {editErrors.role && <div className="invalid-feedback d-block">{editErrors.role}</div>}
                    </div>
                    <div className="col-md-3">
                      <label className="form-label">Sub-rol</label>
                      <select
                        className="form-select"
                        value={editForm.institutionalType}
                        onChange={e=>setEditForm(f=>({...f,institutionalType:e.target.value}))}
                        disabled={editForm.role !== 'USER'}
                      >
                        <option value="">(none)</option>
                        <option value="STUDENT">Estudiante</option>
                        <option value="TEACHER">Profesor</option>
                        <option value="PAE">PAE</option>
                      </select>
                    </div>
                    <div className="col-md-3">
                      <label className="form-label">Activo</label>
                      <div className="form-check form-switch">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={editForm.isActive}
                          onChange={e=>setEditForm(f=>({...f,isActive:e.target.checked}))}
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <label className="form-label">Forzar cambio contraseña</label>
                      <div className="form-check form-switch">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={editForm.mustChangePassword}
                          onChange={e=>setEditForm(f=>({...f,mustChangePassword:e.target.checked}))}
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Nueva contraseña (opcional)</label>
                      <input
                        type="password"
                        className="form-control"
                        placeholder="Dejar vacío para mantener la actual"
                        value={editForm.newPassword || ''}
                        onChange={e => setEditForm(f => ({ ...f, newPassword: e.target.value }))}
                      />
                      <small className="form-text text-muted">
                        Mínimo 12 caracteres con mayúscula, minúscula, número y símbolo.
                      </small>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={closeEdit}>Cancelar</button>
                  <button className="btn btn-primary" disabled={editing}>
                    {editing ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
