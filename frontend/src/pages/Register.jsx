import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const RE_LETTERS   = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$/;
const RE_BOLETA    = /^\d{10}$/;
const RE_PASSWORD  = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;
const RE_EMAIL_DOT     = /^[a-z]+(?:\.[a-z]+)+@(?:alumno\.)?ipn\.mx$/i;
const RE_EMAIL_COMPACT = /^[a-z]{1,6}[a-z]+[a-z]?\d{0,6}@(?:alumno\.)?ipn\.mx$/i;
const isInstitutional = (e) => RE_EMAIL_DOT.test((e||'').trim()) || RE_EMAIL_COMPACT.test((e||'').trim());

export default function Register() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    boleta: '', firstName: '', lastNameP: '', lastNameM: '',
    email: '', password: ''
  });
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [sending, setSending] = useState(false);

  const validateField = (name, value) => {
    switch (name) {
      case 'boleta':    if (!RE_BOLETA.test(value)) return 'La boleta debe tener exactamente 10 dígitos.'; break;
      case 'firstName': if (!value.trim() || !RE_LETTERS.test(value)) return 'Usa solo letras y espacios.'; break;
      case 'lastNameP': if (!value.trim() || !RE_LETTERS.test(value)) return 'Usa solo letras y espacios.'; break;
      case 'lastNameM': if (!value.trim() || !RE_LETTERS.test(value)) return 'Usa solo letras y espacios.'; break;
      case 'email':     if (!value.trim() || !isInstitutional(value)) return 'Correo institucional requerido.'; break;
      case 'password':  if (!RE_PASSWORD.test(value)) return 'Mínimo 12 caracteres con mayúsc./minúsc./número/símbolo.'; break;
      default: break;
    }
    return '';
  };

  const onChange = (e) => {
    const { name, value } = e.target;
    const v = name === 'boleta' ? value.replace(/\D/g, '').slice(0,10) : value;
    setForm(f => ({ ...f, [name]: v }));
    setErrors(prev => ({ ...prev, [name]: validateField(name, v) }));
  };

  const formErrors = useMemo(() => {
    const e = {};
    Object.entries(form).forEach(([k, v]) => {
      const err = validateField(k, v);
      if (err) e[k] = err;
    });
    return e;
  }, [form]);

  const isValid = useMemo(() => Object.keys(formErrors).length === 0, [formErrors]);

  const submit = (e) => {
    e.preventDefault();
    setMsg('');
    if (!isValid) {
      setErrors(formErrors);
      setMsg('Revisa los campos marcados.');
      return;
    }
    // Vamos a la pantalla de confirmación
    nav('/register/confirm', { state: { form } });
  };

  return (
    <div className="container mt-4" style={{ maxWidth: 520 }}>
      <form className="bg-secondary bg-opacity-75 text-white rounded-3 p-3" onSubmit={submit} noValidate>
        <label className="form-label">No. de boleta o matrícula</label>
        <input
          name="boleta"
          className={`form-control ${errors.boleta ? 'is-invalid' : ''} mb-2`}
          placeholder="Ej. 2022630465"
          value={form.boleta} onChange={onChange} inputMode="numeric" maxLength={10}
        />
        {errors.boleta && <div className="invalid-feedback d-block">{errors.boleta}</div>}

        <label className="form-label mt-2">Nombre(s)</label>
        <input name="firstName" className={`form-control ${errors.firstName ? 'is-invalid' : ''} mb-2`}
               value={form.firstName} onChange={onChange} />
        {errors.firstName && <div className="invalid-feedback d-block">{errors.firstName}</div>}

        <label className="form-label mt-2">Apellido Paterno</label>
        <input name="lastNameP" className={`form-control ${errors.lastNameP ? 'is-invalid' : ''} mb-2`}
               value={form.lastNameP} onChange={onChange} />
        {errors.lastNameP && <div className="invalid-feedback d-block">{errors.lastNameP}</div>}

        <label className="form-label mt-2">Apellido Materno</label>
        <input name="lastNameM" className={`form-control ${errors.lastNameM ? 'is-invalid' : ''} mb-2`}
               value={form.lastNameM} onChange={onChange} />
        {errors.lastNameM && <div className="invalid-feedback d-block">{errors.lastNameM}</div>}

        <label className="form-label mt-2">Contraseña</label>
        <div className="input-group mb-2">
          <input
            name="password" type={showPwd ? 'text' : 'password'}
            className={`form-control ${errors.password ? 'is-invalid' : ''}`}
            value={form.password} onChange={onChange} autoComplete="new-password"
          />
          <button type="button" className="btn btn-outline-light" onClick={() => setShowPwd(s => !s)}>
            {showPwd ? 'Ocultar' : 'Ver'}
          </button>
        </div>
        {errors.password && <div className="invalid-feedback d-block">{errors.password}</div>}
        <small className="text-light">Mínimo 12 caracteres con mayúscula, minúscula, número y símbolo.</small>

        <label className="form-label mt-3">Correo institucional</label>
        <input
          name="email" type="email"
          className={`form-control ${errors.email ? 'is-invalid' : ''} mb-2 bg-white`}
          placeholder="ej. rrodasr1800@alumno.ipn.mx"
          value={form.email} onChange={onChange}
        />
        {errors.email && <div className="invalid-feedback d-block">{errors.email}</div>}

        {msg && <div className="alert alert-danger mt-3">{msg}</div>}

        <div className="d-flex gap-2 mt-3">
          <Link to="/" className="btn btn-outline-light flex-fill">Regresar</Link>
          <button className="btn btn-primary flex-fill" disabled={!isValid || sending}>
            {sending ? 'Guardando…' : 'Continuar'}
          </button>
        </div>
      </form>
    </div>
  );
}
