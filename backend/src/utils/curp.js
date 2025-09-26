const COMMON_NAME_PREFIXES = new Set(['JOSE','JOSÉ','MARIA','MARÍA','MA','MA.']);

function normalize(s = '') {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Elimina partículas frecuentes en apellidos: DE, DEL, DE LA, LAS, LOS, MAC, MC, VAN, VON…
function stripParticles(s) {
  let t = s.replace(/\b(DE(L)?|LA|LAS|LOS|Y|MC|MAC|VAN|VON)\b/gi, ' ');
  return normalize(t);
}

// Primera vocal interna del apellido (excluyendo la 1a letra)
function firstInternalVowel(s) {
  for (let i = 1; i < s.length; i++) {
    if ('AEIOU'.includes(s[i])) return s[i];
  }
  // si no hay vocal interna, se usa 'X' (criterio común)
  return 'X';
}

// Regla de nombre: si primer nombre es JOSE/MARIA/variantes, usa el segundo
function pickGivenName(fullFirstName) {
  const parts = normalize(fullFirstName).split(' ').filter(Boolean);
  if (parts.length === 0) return '';
  if (COMMON_NAME_PREFIXES.has(parts[0])) return parts[1] || parts[0]; // si no hay 2º, usa 1º
  return parts[0];
}

// Construye prefijo CURP esperado (4 chars)
function expectedCurpPrefix({ firstName = '', lastNameP = '', lastNameM = '' }) {
  const ap = stripParticles(lastNameP);
  const am = stripParticles(lastNameM || '');
  const nm = pickGivenName(firstName);

  const a1 = ap[0] || 'X';
  const av = firstInternalVowel(ap);
  const m1 = (am[0] || 'X');
  const n1 = (nm[0] || 'X');

  return `${a1}${av}${m1}${n1}`;
}

// Valida que el prefijo del CURP coincide con nombres/apellidos
function validateCurpPrefix(curp, names) {
  const curp4 = normalize(curp).slice(0,4);
  const expected = expectedCurpPrefix(names);
  return { ok: curp4 === expected, expected };
}

module.exports = {
  normalize,
  expectedCurpPrefix,
  validateCurpPrefix,
};
