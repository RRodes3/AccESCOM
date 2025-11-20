import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const RE_LETTERS = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$/;
const RE_CURP    = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/i;
const minLen = (s, n) => (s || '').trim().length >= n;

export default function GuestRegister() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    firstName: '', lastNameP: '', lastNameM: '', curp: '', reason: '',
  });
  const [errors, setErrors] = useState({});
  const [showErrors, setShowErrors] = useState(false);
  const [topMsg, setTopMsg] = useState('');
  const [sending, setSending] = useState(false);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({
      ...f,
      [name]: name === 'curp'
        ? value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 18)
        : value,
    }));
  };

  const validate = (f) => {
    const e = {};
    if (!minLen(f.firstName, 3) || !RE_LETTERS.test(f.firstName)) e.firstName = 'Nombre: solo letras, mín. 3.';
    if (!minLen(f.lastNameP, 3) || !RE_LETTERS.test(f.lastNameP)) e.lastNameP = 'Apellido paterno: solo letras, mín. 3.';
    if (f.lastNameM) {
      if (!RE_LETTERS.test(f.lastNameM) || !minLen(f.lastNameM, 3)) e.lastNameM = 'Apellido materno: solo letras, mín. 3.';
    }
    if (!RE_CURP.test(f.curp)) e.curp = 'CURP inválida (18 caracteres).';
    if (!minLen(f.reason, 5)) e.reason = 'Motivo: mínimo 5 caracteres.';
    return e;
  };

  const submit = (e) => {
    e.preventDefault();
    setTopMsg('');
    const eobj = validate(form);
    setErrors(eobj);
    setShowErrors(true);
    if (Object.keys(eobj).length) {
      setTopMsg('Revisa los campos marcados.');
      return;
    }
    if (sending) return;
    setSending(true);

    // 👉 SOLO navegamos a confirmar con los datos (sin guardar nada aún)
    nav('/confirm-guest', { state: { form } });
  };

  const FieldError = ({ name }) =>
    showErrors && errors[name] ? <div className="invalid-feedback d-block">{errors[name]}</div> : null;

  return (
    <div className="container mt-4" style={{ maxWidth: 520 }}>
      <form className="bg-secondary bg-opacity-75 text-white rounded-3 p-3" onSubmit={submit} noValidate>
        {topMsg && <div className="alert alert-danger">{topMsg}</div>}

        <label className="form-label">Nombre(s)</label>
        <input name="firstName" className={`form-control ${showErrors && errors.firstName ? 'is-invalid' : ''}`}
               value={form.firstName} onChange={onChange} placeholder="Obligatorio" />
        <FieldError name="firstName" />

        <label className="form-label mt-2">Apellido Paterno</label>
        <input name="lastNameP" className={`form-control ${showErrors && errors.lastNameP ? 'is-invalid' : ''}`}
               value={form.lastNameP} onChange={onChange} placeholder="Obligatorio" />
        <FieldError name="lastNameP" />

        <label className="form-label mt-2">Apellido Materno</label>
        <input name="lastNameM" className={`form-control ${showErrors && errors.lastNameM ? 'is-invalid' : ''}`}
               value={form.lastNameM} onChange={onChange} placeholder="Opcional" />
        <FieldError name="lastNameM" />

        <label className="form-label mt-2">CURP</label>
        <input name="curp" className={`form-control ${showErrors && errors.curp ? 'is-invalid' : ''}`}
               value={form.curp} onChange={onChange} placeholder="18 caracteres" />
        <FieldError name="curp" />

        <label className="form-label mt-2">Motivo de visita</label>
        <input name="reason" className={`form-control ${showErrors && errors.reason ? 'is-invalid' : ''}`}
               value={form.reason} onChange={onChange} placeholder="Ej. Trámite" />
        <FieldError name="reason" />

        <div className="d-flex gap-2 mt-3">
          <Link to="/" className="btn btn-outline-light flex-fill">Regresar</Link>
          <button className="btn btn-primary flex-fill" disabled={sending}>
            {sending ? 'Continuando…' : 'Continuar'}
          </button>
        </div>
      </form>
    </div>
  );
}
