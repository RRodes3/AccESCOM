// backend/src/routers/adminImport.js
const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const XLSX = require('xlsx');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const prisma = new PrismaClient();

// ───── Multer: memoria, 5MB, solo CSV/XLSX ────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      /\.csv$/i.test(file.originalname) ||
      /\.xlsx?$/i.test(file.originalname);
    if (!ok) return cb(new Error('Formato no soportado (usa CSV/XLSX)'));
    cb(null, true);
  },
});

// ───── Helpers ────────────────────────────────────────────────────────────────
const RE_LETTERS = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$/;
const RE_BOLETA = /^\d{10}$/;
const RE_EMAIL_DOT = /^[a-z]+(?:\.[a-z]+)+@(?:alumno\.)?ipn\.mx$/i;
const RE_EMAIL_COMPACT = /^[a-z]{1,6}[a-z]+[a-z]?\d{0,6}@(?:alumno\.)?ipn\.mx$/i;
const isInstitutional = (email) =>
  RE_EMAIL_DOT.test((email || '').trim()) ||
  RE_EMAIL_COMPACT.test((email || '').trim());

const sanitizeName = (s) =>
  String(s || '').trim().replace(/\s{2,}/g, ' ').slice(0, 80);

const buildFullName = (f, p, m) =>
  [f, p, m].map(sanitizeName).filter(Boolean).join(' ').slice(0, 120);

function readSheetToJson(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  let rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  rows = rows.map((o) => {
    const out = {};
    Object.keys(o).forEach((k) => {
      const nk = String(k)
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^A-Za-z0-9 ]/g, '')
        .replace(/ (.)/g, (_, c) => c.toUpperCase());
      const key = nk.charAt(0).toLowerCase() + nk.slice(1); // boleta, firstName, etc.
      out[key] = o[k];
    });
    return out;
  });
  return rows;
}

// ───── IMPORTAR USUARIOS: POST /api/admin/import/users ────────────────────────
router.post(
  '/users',
  auth,
  requireRole(['ADMIN']),
  upload.single('file'), // 👈 MUY IMPORTANTE
  async (req, res) => {
    const dryRun = String(req.query.dryRun || '').toLowerCase() === 'true';

    // Debug para ver qué llega
    console.log('IMPORT /users headers:', req.headers['content-type']);
    console.log('IMPORT /users file:', req.file && {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      size: req.file.size,
    });

    if (!req.file) {
      return res.status(400).json({ error: 'Falta archivo' });
    }

    try {
      const rows = readSheetToJson(req.file.buffer);
      if (!rows.length) {
        return res.status(400).json({ error: 'Archivo vacío' });
      }

      const errors = [];
      const toCreate = [];

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const line = i + 2; // asumiendo encabezado en la línea 1

        const boleta = String(r.boleta || '').trim();
        const firstName = sanitizeName(r.firstName);
        const lastNameP = sanitizeName(r.lastNameP);
        const lastNameM = sanitizeName(r.lastNameM);
        const email = String(r.email || '').trim().toLowerCase();
        const role = String(r.role || 'USER').trim().toUpperCase();
        let institutionalType = (r.institutionalType || '')
          .toString()
          .toUpperCase()
          .trim(); // STUDENT/TEACHER/PAE

        // Si no viene sub-rol y es USER, lo inferimos por dominio
        if (!institutionalType && role === 'USER') {
          if (/@alumno\.ipn\.mx$/i.test(email)) {
            institutionalType = 'STUDENT';
          } else if (/@ipn\.mx$/i.test(email)) {
            institutionalType = 'TEACHER';
          }
        }

        const rowErr = {};
        if (!RE_BOLETA.test(boleta)) rowErr.boleta = 'Boleta debe tener 10 dígitos';
        if (!firstName || !RE_LETTERS.test(firstName)) rowErr.firstName = 'Nombre inválido';
        if (!lastNameP || !RE_LETTERS.test(lastNameP)) rowErr.lastNameP = 'Apellido paterno inválido';
        if (!lastNameM || !RE_LETTERS.test(lastNameM)) rowErr.lastNameM = 'Apellido materno inválido';
        if (!email || !isInstitutional(email)) rowErr.email = 'Correo institucional inválido';
        if (!['ADMIN', 'GUARD', 'USER'].includes(role)) rowErr.role = 'Role inválido';

        if (role === 'USER' && institutionalType &&
            !['STUDENT', 'TEACHER', 'PAE'].includes(institutionalType)) {
          rowErr.institutionalType = 'Debe ser STUDENT/TEACHER/PAE';
        }

        // Si ya hay errores de formato, no buscamos en la BD
        if (Object.keys(rowErr).length) {
          errors.push({ line, errors: rowErr, row: r });
          continue;
        }

        // 🔎 Revisa si ya existe alguien con esa boleta o correo
        const existing = await prisma.user.findFirst({
          where: {
            OR: [
              { boleta },
              { email },
            ],
          },
        });

        if (existing) {
          const dupErr = {};
          if (existing.boleta === boleta) dupErr.boleta = 'Esta boleta ya está registrada';
          if (existing.email === email) dupErr.email = 'Este correo ya está registrado';

          errors.push({ line, errors: dupErr, row: r });
          continue; // NO se agrega a toCreate
        }

        // Si todo OK y no hay duplicados, se prepara para crear
        toCreate.push({
          boleta,
          firstName,
          lastNameP,
          lastNameM,
          email,
          role,
          institutionalType,
        });
      }

      // Si hay cualquier error (formato o duplicados), devolvemos resumen
      if (errors.length) {
        return res.status(400).json({
          error: 'Validación fallida',
          summary: {
            total: rows.length,
            valid: toCreate.length,
            invalid: errors.length,
          },
          errors,
        });
      }

      // Si solo queremos validar (dry-run)
      if (dryRun) {
        return res.json({
          total: rows.length,
          willCreateOrUpdate: toCreate.length,
        });
      }

      // 🚀 Crear usuarios NUEVOS (ya filtramos duplicados arriba)
      const results = [];
      for (const r of toCreate) {
        const instType = r.role === 'USER' ? (r.institutionalType || null) : null;
        const created = await prisma.user.create({
          data: {
            boleta: r.boleta,
            firstName: r.firstName,
            lastNameP: r.lastNameP,
            lastNameM: r.lastNameM,
            name: buildFullName(r.firstName, r.lastNameP, r.lastNameM),
            email: r.email,
            role: r.role,
            institutionalType: instType,
            password:
              'Temp#2025_' + Math.random().toString(36).slice(2, 8) + 'A!',
            isActive: true,
          },
          select: {
            id: true,
            email: true,
            role: true,
            boleta: true,
            institutionalType: true,
          },
        });
        results.push(created);
      }

      return res.json({
        total: rows.length,
        upserted: results.length, // mismo nombre que ya ves en el front
      });
    } catch (e) {
      console.error('IMPORT USERS ERROR:', e);

      // Mandar más detalle al frontend para depurar
      return res.status(500).json({
        error: 'No se pudo importar',
        details: e.message || null,
        code: e.code || null,
        meta: e.meta || null,
      });
    }
  });


module.exports = router;
