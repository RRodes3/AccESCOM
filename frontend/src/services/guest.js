import { api } from './api';

export function registerGuest(payload) {
  // payload: { firstName, lastNameP, lastNameM, curp, reason }
  return api.post('/guest/register', payload);
}

export const guestRegister = (payload) => api.post('/guest/register', payload);
export const guestVisit    = (curp)    => api.get('/guest/visit', { params: { curp } });

// util simple para obtener prefijo CURP a partir de nombres/apellidos
const VOWELS = 'AEIOU';
const STOP_NAMES = ['MARIA', 'MA', 'MA.', 'JOSE', 'J', 'J.']; // los más comunes

function normalize(str) {
  return String(str || '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/Ñ/g, 'X')
    .trim();
}

function firstInternalVowel(word) {
  if (!word) return 'X';
  const w = word.toUpperCase();
  for (let i = 1; i < w.length; i++) {
    if (VOWELS.includes(w[i])) return w[i];
  }
  return 'X';
}

function curpPrefixFromNames(firstName, lastNameP, lastNameM) {
  const lp = normalize(lastNameP);
  const lm = normalize(lastNameM);
  let fn = normalize(firstName);

  // ignora nombres compuestos comunes (MARIA, JOSE)
  const parts = fn.split(/\s+/).filter(Boolean);
  if (parts.length > 1 && STOP_NAMES.includes(parts[0])) {
    fn = parts.slice(1).join(' ');
  }
  const fn0 = normalize(fn)[0] || 'X';

  const p0 = lp[0] || 'X';
  const pV = firstInternalVowel(lp);
  const m0 = lm ? lm[0] : 'X';

  return `${p0}${pV}${m0}${fn0}`;
}
