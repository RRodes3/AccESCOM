// frontend/src/pages/AdminUsers.jsx
import { useEffect, useMemo, useState } from 'react';
import {
  listUsers,
  createUser,
  deleteUser,
  deactivateUser,
  restoreUser
} from '../services/admin';

const RE_LETTERS   = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$/;
const RE_BOLETA    = /^\d{10}$/;
const RE_PASSWORD  = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;
const RE_EMAIL_DOT     = /^[a-z]+(?:\.[a-z]+)+@(?:alumno\.)?ipn\.mx$/i;
const RE_EMAIL_COMPACT = /^[a-z]{1,6}[a-z]+[a-z]?\d{0,6}@(?:alumno\.)?ipn\.mx$/i;
const isInstitutional = (email) => RE_EMAIL_DOT.test((email || '').trim().toLowerCase()) || RE_EMAIL_COMPACT.test((email || '').trim().toLowerCase());


export default function AdminUsers() {
  // --- Estado de formulario de alta ---
  const [form, setForm] = useState({
    boleta: '', firstName: '', lastNameP: '', lastNameM: '',
    email: '', password: '', role: 'GUARD'
  });
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);

  // --- Estado de lista ---
  const [query, setQuery] = useState('');
  const [role, setRole]   = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [take]  = useState(20);
  const [skip, setSkip]   = useState(0);
  const [loading, setLoading] = useState(false);

  // --- Validación rápida del cliente ---
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

  // --- Cargar lista ---
  const load = async () => {
    setLoading(true);
    try {
      const { data } = await listUsers({ query, role, take, skip, includeInactive });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error(e);
      setMsg('No se pudo cargar la lista');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [query, role, skip, includeInactive]);

  // --- Handlers ---
  const onChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: name === 'boleta' ? value.replace(/\D/g, '').slice(0,10) : value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    const eobj = validate(form);
    setErrors(eobj);
    if (Object.keys(eobj).length) return;

    setSending(true);
    try {
      await createUser({
        boleta: form.boleta,
        firstName: form.firstName.trim(),
        lastNameP: form.lastNameP.trim(),
        lastNameM: form.lastNameM.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: form.role
      });
      setForm({ boleta:'', firstName:'', lastNameP:'', lastNameM:'', email:'', password:'', role:'GUARD' });
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

  const onDeactivate = async (id) => {
    if (!window.confirm('¿Desactivar este usuario? Podrás reactivarlo después.')) return;
    try {
      await deactivateUser(id);
      await load();
    } catch (e) {
      console.error(e);
      alert('No se pudo desactivar (¿último ADMIN activo o tú mismo?).');
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

  const onDelete = async (id) => {
    if (!window.confirm('¿Eliminar DEFINITIVAMENTE? Si tiene QR/logs fallará.')) return;
    try {
      await deleteUser(id);
      await load();
    } catch (e) {
      console.error(e);
      alert('No se pudo eliminar. Si tiene registros (QR/Logs), usa “Desactivar”.');
    }
  };

  const pages = Math.ceil(total / take) || 1;
  const page = Math.floor(skip / take) + 1;

  // --- Render ---
  return (
    <div className="container mt-3">
      <h3>Administración de usuarios</h3>

      {/* Filtros */}
      <div className="row g-2 align-items-end">
        <div className="col-md-4">
          <label className="form-label">Buscar (nombre, boleta, correo)</label>
          <input className="form-control" value={query} onChange={e=>{ setSkip(0); setQuery(e.target.value); }} />
        </div>
        <div className="col-md-3">
          <label className="form-label">Rol</label>
          <select className="form-select" value={role} onChange={e=>{ setSkip(0); setRole(e.target.value); }}>
            <option value="">Todos</option>
            <option value="ADMIN">ADMIN</option>
            <option value="GUARD">GUARD</option>
            <option value="USER">USER</option>
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

      {/* Tabla */}
      <div className="table-responsive mt-3">
        <table className="table table-sm table-striped align-middle">
          <thead>
            <tr>
              <th>Boleta</th>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Creado</th>
              <th style={{width:260}}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7}>Cargando…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7}>Sin resultados</td></tr>
            ) : items.map(u => (
              <tr key={u.id}>
                <td>{u.boleta}</td>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>
                  {u.isActive
                    ? <span className="badge bg-success">Activo</span>
                    : <span className="badge bg-secondary">Inactivo</span>}
                </td>
                <td>{new Date(u.createdAt).toLocaleString()}</td>
                <td className="d-flex flex-wrap gap-2">
                  {u.isActive ? (
                    <button className="btn btn-sm btn-warning" onClick={()=>onDeactivate(u.id)}>
                      Desactivar
                    </button>
                  ) : (
                    <button className="btn btn-sm btn-outline-success" onClick={()=>onRestore(u.id)}>
                      Reactivar
                    </button>
                  )}
                  <button className="btn btn-sm btn-outline-danger" onClick={()=>onDelete(u.id)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación simple */}
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

      {/* Alta de usuario */}
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
                   placeholder="ej. rrodasr1800@alumno.ipn.mx" />
            {errors.email && <div className="invalid-feedback d-block">{errors.email}</div>}
          </div>
          <div className="col-md-3">
            <label className="form-label">Rol</label>
            <select name="role"
                    className={`form-select ${errors.role ? 'is-invalid':''}`}
                    value={form.role} onChange={onChange}>
              <option value="GUARD">GUARD</option>
              <option value="ADMIN">ADMIN</option>
              <option value="USER">USER</option>
            </select>
            {errors.role && <div className="invalid-feedback d-block">{errors.role}</div>}
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
    </div>
  );
}
