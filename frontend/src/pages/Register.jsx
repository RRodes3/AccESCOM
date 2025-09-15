import { useState, useMemo } from 'react';
import { api } from '../services/api';
import { useNavigate, Link } from 'react-router-dom';

const RE_LETTERS = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$/;                 // letras y espacios
const RE_BOLETA  = /^\d{10}$/;                                    // exactamente 10 dígitos
const RE_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;
// email tipo "iniciales.apellido" o "rrodasr1800" + @ipn.mx / @alumno.ipn.mx
const RE_EMAIL_DOT = /^[a-z]+(?:\.[a-z]+)+@(?:alumno\.)?ipn\.mx$/i;
const RE_EMAIL_COMPACT = /^[a-z]{1,6}[a-z]+[a-z]?\d{0,6}@(?:alumno\.)?ipn\.mx$/i;

function isInstitutional(email) {
  const e = (email || '').trim();
  return RE_EMAIL_DOT.test(e) || RE_EMAIL_COMPACT.test(e);
}

export default function Register() {
  const [form, setForm] = useState({
    boleta: '',
    firstName: '',
    lastNameP: '',
    lastNameM: '',
    email: '',
    password: ''
  });
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [sending, setSending] = useState(false);
  const nav = useNavigate();

  // Validación por campo
  const validateField = (name, value) => {
    switch (name) {
      case 'boleta':
        if (!RE_BOLETA.test(value)) return 'La boleta debe tener exactamente 10 dígitos.';
        break;
      case 'firstName':
        if (!value.trim()) return 'El nombre es obligatorio.';
        if (!RE_LETTERS.test(value)) return 'Usa solo letras y espacios.';
        break;
      case 'lastNameP':
        if (!value.trim()) return 'El apellido paterno es obligatorio.';
        if (!RE_LETTERS.test(value)) return 'Usa solo letras y espacios.';
        break;
      case 'lastNameM':
        if (!value.trim()) return 'El apellido materno es obligatorio.';
        if (!RE_LETTERS.test(value)) return 'Usa solo letras y espacios.';
        break;
      case 'email':
        if (!value.trim()) return 'El correo es obligatorio.';
        if (!isInstitutional(value)) return 'Usa tu correo institucional (@ipn.mx o @alumno.ipn.mx).';
        break;
      case 'password':
        if (!RE_PASSWORD.test(value))
          return 'Mínimo 12 caracteres con mayúscula, minúscula, número y símbolo.';
        break;
      default:
        break;
    }
    return '';
  };

  const onChange = (e) => {
    const { name, value } = e.target;
    const newValue = name === 'boleta' ? value.replace(/\D/g, '') : value;
    setForm((f) => ({ ...f, [name]: newValue }));
    // valida on-change y limpia/establece error
    const err = validateField(name, newValue);
    setErrors((prev) => ({ ...prev, [name]: err }));
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

  const submit = async (e) => {
    e.preventDefault();
    setMsg(''); setOk(false);

    // última validación
    if (!isValid) {
      setErrors(formErrors);
      setMsg('Revisa los campos marcados.');
      return;
    }

    if (sending) return;
    setSending(true);

    try {
      const payload = {
        boleta: form.boleta,
        firstName: form.firstName.trim(),
        lastNameP: form.lastNameP.trim(),
        lastNameM: form.lastNameM.trim(),
        email: form.email.trim(),
        password: form.password
      };

      await api.post('/auth/register', payload);
      setOk(true);
      setMsg('Registro exitoso');
      setTimeout(() => nav('/login'), 900);
    } catch (err) {
      const status = err?.response?.status;
      const serverMsg = err?.response?.data?.error;
      if (status === 409) setMsg('Este correo ya está registrado.');
      else setMsg(serverMsg || 'Error al registrar');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="container mt-4" style={{ maxWidth: 520 }}>
      <div className="rounded-3 text-white text-center fw-bold py-2" style={{ background: '#5bbcff' }}>
        Registro de datos generales
      </div>

      <form className="bg-secondary bg-opacity-75 text-white rounded-3 p-3 mt-3" onSubmit={submit} noValidate>
        {/* Boleta */}
        <label className="form-label">No. de boleta o matrícula</label>
        <input
          name="boleta"
          className={`form-control ${errors.boleta ? 'is-invalid' : ''} mb-2`}
          placeholder="Ej. 2022630465"
          value={form.boleta}
          onChange={onChange}
          inputMode="numeric"
          maxLength={10}
        />
        {errors.boleta && <div className="invalid-feedback d-block">{errors.boleta}</div>}

        {/* Nombres y apellidos */}
        <label className="form-label">Nombre(s)</label>
        <input
          name="firstName"
          className={`form-control ${errors.firstName ? 'is-invalid' : ''} mb-2`}
          value={form.firstName}
          onChange={onChange}
        />
        {errors.firstName && <div className="invalid-feedback d-block">{errors.firstName}</div>}

        <label className="form-label">Apellido Paterno</label>
        <input
          name="lastNameP"
          className={`form-control ${errors.lastNameP ? 'is-invalid' : ''} mb-2`}
          value={form.lastNameP}
          onChange={onChange}
        />
        {errors.lastNameP && <div className="invalid-feedback d-block">{errors.lastNameP}</div>}

        <label className="form-label">Apellido Materno</label>
        <input
          name="lastNameM"
          className={`form-control ${errors.lastNameM ? 'is-invalid' : ''} mb-2`}
          value={form.lastNameM}
          onChange={onChange}
        />
        {errors.lastNameM && <div className="invalid-feedback d-block">{errors.lastNameM}</div>}

        {/* Contraseña */}
        <label className="form-label">Contraseña</label>
        <div className="input-group mb-2">
          <input
            name="password"
            type={showPwd ? 'text' : 'password'}
            className={`form-control ${errors.password ? 'is-invalid' : ''}`}
            value={form.password}
            onChange={onChange}
            autoComplete="new-password"
          />
          <button
            type="button"
            className="btn btn-outline-light"
            onClick={() => setShowPwd((s) => !s)}
            aria-label="Mostrar u ocultar contraseña"
          >
            {showPwd ? 'Ocultar' : 'Ver'}
          </button>
        </div>
        {errors.password && (
          <div className="invalid-feedback d-block">
            {errors.password}
          </div>
        )}
        <small className="text-light">
          Mínimo 12 caracteres e incluye mayúscula, minúscula, número y símbolo.
        </small>

        {/* Email */}
        <label className="form-label mt-3">Correo institucional</label>
        <input
          name="email"
          type="email"
          className={`form-control ${errors.email ? 'is-invalid' : ''} mb-2 bg-white`}
          placeholder="Ej. rrodasr1800@alumno.ipn.mx"
          value={form.email}
          onChange={onChange}
          autoComplete="email"
        />
        {errors.email && <div className="invalid-feedback d-block">{errors.email}</div>}

        {/* Mensaje general */}
        {msg && <div className={`alert mt-3 ${ok ? 'alert-success' : 'alert-danger'}`}>{msg}</div>}

        {/* Botones */}
        <div className="d-flex gap-2 mt-3">
          <Link to="/login" className="btn btn-outline-light flex-fill">Regresar</Link>
          <button className="btn btn-primary flex-fill" disabled={!isValid || sending}>
            {sending ? 'Guardando…' : 'Continuar'}
          </button>
        </div>
      </form>
    </div>
  );
}
