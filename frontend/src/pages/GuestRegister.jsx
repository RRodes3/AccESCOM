import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import QRCode from 'react-qr-code';
import { Link, useNavigate } from 'react-router-dom';

const RE_LETTERS = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$/;
const RE_CURP = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/i;

const minLen = (s, n) => (s || '').trim().length >= n;

export default function GuestRegister() {
  const [form, setForm] = useState({
    firstName: '',
    lastNameP: '',
    lastNameM: '',
    curp: '',
    reason: '',
  });

  const [errors, setErrors] = useState({});
  const [showErrors, setShowErrors] = useState(false);
  const [topMsg, setTopMsg] = useState('');
  const [sending, setSending] = useState(false);
  const nav = useNavigate();

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({
      ...f,
      [name]:
        name === 'curp'
          ? value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 18)
          : value,
    }));
  };

  // Validación SOLO cuando se presiona "Continuar"
  const validate = (f) => {
    const e = {};

    // Nombre(s)
    if (!minLen(f.firstName, 3)) {
      e.firstName = 'El nombre debe tener al menos 3 letras.';
    } else if (!RE_LETTERS.test(f.firstName)) {
      e.firstName = 'El nombre solo puede contener letras y espacios.';
    }

    // Apellido paterno
    if (!minLen(f.lastNameP, 3)) {
      e.lastNameP = 'El apellido paterno debe tener al menos 3 letras.';
    } else if (!RE_LETTERS.test(f.lastNameP)) {
      e.lastNameP = 'El apellido paterno solo puede contener letras y espacios.';
    }

    // Apellido materno (opcional: valida si viene algo)
    if (f.lastNameM && !RE_LETTERS.test(f.lastNameM)) {
      e.lastNameM = 'El apellido materno solo puede contener letras y espacios.';
    } else if (f.lastNameM && !minLen(f.lastNameM, 3)) {
      e.lastNameM = 'El apellido materno debe tener al menos 3 letras.';
    }

    // CURP
    if (!RE_CURP.test(f.curp)) {
      e.curp = 'CURP inválida (18 caracteres, formato oficial).';
    }

    // Motivo
    if (!minLen(f.reason, 5)) {
      e.reason = 'Describe el motivo de la visita (mín. 5 caracteres).';
    }

    return e;
  };

  const submit = async (e) => {
    e.preventDefault();
    setTopMsg('');
    const eobj = validate(form);
    setErrors(eobj);
    setShowErrors(true);

    if (Object.keys(eobj).length) {
      setTopMsg('Revisa los campos marcados.');
      return;
    }

    setSending(true);
    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastNameP: form.lastNameP.trim(),
        lastNameM: form.lastNameM.trim() || null,
        curp: form.curp.trim().toUpperCase(),
        reason: form.reason.trim(),
      };
      const { data } = await api.post('/guest/register', payload);
      // Navega a una pantalla de QR del invitado o muestra éxito
      // Por ahora, redirigimos al dashboard o a una ruta de confirmación:
      nav('/dashboard', { replace: true });
    } catch (err) {
      // Muestra explicación de por qué falló (del backend)
      const server = err?.response?.data;
      setTopMsg(server?.error || 'No se pudo registrar al invitado.');
      if (server?.errors) setErrors(server.errors);
    } finally {
      setSending(false);
    }
  };

  const FieldError = ({ name }) =>
    showErrors && errors[name] ? (
      <div className="invalid-feedback d-block">{errors[name]}</div>
    ) : null;

  return (
    <div className="container mt-4" style={{ maxWidth: 480 }}>

      <form
        className="bg-secondary bg-opacity-75 text-white rounded-3 p-3 mt-3"
        onSubmit={submit}
        noValidate
      >
        {topMsg && <div className="alert alert-danger">{topMsg}</div>}

        <label className="form-label">Nombre(s)</label>
        <input
          name="firstName"
          className={`form-control ${showErrors && errors.firstName ? 'is-invalid' : ''}`}
          value={form.firstName}
          onChange={onChange}
          placeholder="Ej. Ana"
        />
        <FieldError name="firstName" />

        <label className="form-label mt-2">Apellido Paterno</label>
        <input
          name="lastNameP"
          className={`form-control ${showErrors && errors.lastNameP ? 'is-invalid' : ''}`}
          value={form.lastNameP}
          onChange={onChange}
          placeholder="Ej. Cruz"
        />
        <FieldError name="lastNameP" />

        <label className="form-label mt-2">Apellido Materno</label>
        <input
          name="lastNameM"
          className={`form-control ${showErrors && errors.lastNameM ? 'is-invalid' : ''}`}
          value={form.lastNameM}
          onChange={onChange}
          placeholder="Opcional"
        />
        <FieldError name="lastNameM" />

        <label className="form-label mt-2">CURP</label>
        <input
          name="curp"
          className={`form-control ${showErrors && errors.curp ? 'is-invalid' : ''}`}
          value={form.curp}
          onChange={onChange}
          placeholder="18 caracteres"
        />
        <FieldError name="curp" />

        <label className="form-label mt-2">Motivo de visita</label>
        <input
          name="reason"
          className={`form-control ${showErrors && errors.reason ? 'is-invalid' : ''}`}
          value={form.reason}
          onChange={onChange}
          placeholder="Ej. Trámite"
        />
        <FieldError name="reason" />

        <div className="d-flex gap-2 mt-3">
          <Link to="/" className="btn btn-outline-light flex-fill">
            Regresar
          </Link>
          <button className="btn btn-primary flex-fill" disabled={sending}>
            {sending ? 'Enviando…' : 'Continuar'}
          </button>
        </div>
      </form>
    </div>
  );
}
