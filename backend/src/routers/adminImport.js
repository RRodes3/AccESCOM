// backend/src/routers/adminImport.js
const router = require('express').Router();
const { PrismaClient, InstitutionalType } = require('@prisma/client');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const bcrypt = require('bcryptjs');

// ✅ AGREGAR AQUÍ (después de las otras importaciones, antes de "const prisma")
const { importUsersWithPhotos } = require('../../scripts/importWithPhotos');
const { importCSV } = require('../../scripts/importCSV');

const prisma = new PrismaClient();

// ───── Multer: memoria y disco, 50MB, CSV/XLSX/ZIP ────────────────────────────
const uploadMemory = multer({
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

const uploadDisk = multer({
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB para ZIPs con fotos
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/zip' ||
      file.mimetype === 'application/x-zip-compressed' ||
      /\.csv$/i.test(file.originalname) ||
      /\.zip$/i.test(file.originalname);
    if (!ok) return cb(new Error('Formato no soportado (usa CSV o ZIP)'));
    cb(null, true);
  },
});

// ───── Helpers ────────────────────────────────────────────────────────────────
const RE_LETTERS = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$/;
const RE_BOLETA = /^\d{10}$/;
const RE_EMAIL_DOT = /^[a-z]+(?:\.[a-z]+)+@(?:alumno\.)?ipn\.mx$/i;
const RE_EMAIL_COMPACT = /^[a-z]{1,6}[a-z]+[a-z]?\d{0,6}@(?:alumno\.)?ipn\.mx$/i;
const RE_PASSWORD  = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;
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

// quitar acentos y normalizar
function stripAccents(str = '') {
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// capitaliza primera letra
function capitalize(str = '') {
  const s = stripAccents(String(str).trim().toLowerCase());
  if (!s) return '';
  return s[0].toUpperCase() + s.slice(1);
}

/**
 * Genera una contraseña por defecto a partir de:
 *  - inicial del nombre (minúscula)
 *  - apellido paterno (minúsculas)
 *  - últimos 4 dígitos de la boleta
 *  - nombre capitalizado
 *  - punto final.
 *
 * Ej: Raúl Rodas Rodríguez, boleta 2022630465 → rrodas0465Raul.
 */
function buildDefaultPassword({ firstName, lastNameP, boleta }) {
  const fn = String(firstName || 'Usuario').trim().split(/\s+/)[0];
  const ln = String(lastNameP || 'ESCOM').trim().split(/\s+/)[0];
  const cleanFn = stripAccents(fn);
  const cleanLn = stripAccents(ln);

  const initial = cleanFn[0] ? cleanFn[0].toLowerCase() : 'u';
  const lastLower = cleanLn.toLowerCase();
  const digits = String(boleta || '').replace(/\D/g, '');
  const tail = digits.slice(-4) || '0000';
  const nameCap = capitalize(fn);

  let pwd = `${initial}${lastLower}${tail}${nameCap}.`; // ej: rrodas0465Raul.

  // por si acaso, reforzamos si no pasa la regex
  if (!RE_PASSWORD.test(pwd)) {
    pwd = pwd + '!2025aA1';
  }

  return pwd;
}

// función para mapear los tipos institucionales del CSV a los enums de Prisma
function mapInstitutionalTypeForPrisma(raw) {
  if (!raw) return null;
  const val = String(raw).toUpperCase().trim();

  // Intentamos mapear a las claves del enum generado por Prisma
  if (val === 'STUDENT' && InstitutionalType && InstitutionalType.STUDENT) return InstitutionalType.STUDENT;
  if (val === 'TEACHER' && InstitutionalType && InstitutionalType.TEACHER) return InstitutionalType.TEACHER;
  if (val === 'PAE' && InstitutionalType && InstitutionalType.PAE) return InstitutionalType.PAE;

  // Si no coincide, devolvemos null (que tratamos luego como "no setear")
  return null;
}

// ───── IMPORTAR USUARIOS (XLSX/CSV en memoria): POST /api/admin/import/users ──
router.post(
  '/users',
  auth,
  requireRole(['ADMIN']),
  uploadMemory.single('file'),
  async (req, res) => {
    const dryRun = String(req.query.dryRun || '').toLowerCase() === 'true';
    const conflictAction = String(req.query.conflictAction || 'exclude').toLowerCase(); // 'exclude' | 'overwrite' | 'delete'

    if (!req.file) {
      return res.status(400).json({ error: 'Falta archivo' });
    }

    try {
      const rows = readSheetToJson(req.file.buffer);
      if (!rows.length) {
        return res.status(400).json({ error: 'Archivo vacío' });
      }

      const errors = [];
      const validRows = [];
      const conflictsHandled = {
        excluded: 0,
        deleted: 0,
        overwritten: 0,
        users: [], // ← MOVIDO AQUÍ: guardamos conflictos inmediatamente
      };

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const line = i + 2; // encabezado en línea 1

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

        // NUEVO: leer photoUrl si viene en el archivo
        const photoUrl = (r.photoUrl || '').toString().trim() || null;

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

        // Validación opcional de photoUrl (muy ligera)
        if (photoUrl && !/^https?:\/\/|^\//i.test(photoUrl)) {
          rowErr.photoUrl = 'photoUrl debe ser una URL absoluta o empezar con /';
        }

        if (Object.keys(rowErr).length) {
          errors.push({ line, errors: rowErr, row: r });
          continue;
        }

        // 🔎 Revisa si ya existe alguien con esa boleta o correo
        const existing = await prisma.user.findFirst({
          where: {
            OR: [{ boleta }, { email }],
          },
          select: {
            id: true, // ← AGREGADO: necesario para poder eliminarlo
            email: true,
            boleta: true,
            firstName: true,
            lastNameP: true,
            lastNameM: true,
          }
        });

        if (existing) {
          // Determinar tipo de conflicto
          let conflictType = '';
          if (existing.boleta === boleta && existing.email === email) {
            conflictType = 'Duplicado por boleta y correo';
          } else if (existing.boleta === boleta) {
            conflictType = 'Duplicado por boleta';
          } else if (existing.email === email) {
            conflictType = 'Duplicado por correo';
          }

          // ✅ GUARDAR EL CONFLICTO INMEDIATAMENTE (antes de continue/delete)
          conflictsHandled.users.push({
            email: email,
            boleta: boleta,
            name: buildFullName(firstName, lastNameP, lastNameM),
            existingName: buildFullName(existing.firstName, existing.lastNameP, existing.lastNameM),
            conflictType: conflictType,
          });

          if (conflictAction === 'exclude') {
            // Excluir el usuario, no hacer nada
            conflictsHandled.excluded++;
            console.log(`⏭️  Usuario ${email} ya existe, excluyendo...`);
            continue; // ← Ahora está bien porque YA guardamos el conflicto arriba
          }

          if (conflictAction === 'delete') {
            // Eliminar el usuario existente antes de crear el nuevo
            await prisma.user.delete({
              where: { id: existing.id },
            });
            conflictsHandled.deleted++;
            console.log(`🗑️  Usuario ${email} eliminado para reemplazar`);
          }

          if (conflictAction === 'overwrite') {
            // Se sobrescribirá con upsert más adelante
            conflictsHandled.overwritten++;
            console.log(`✏️  Usuario ${email} será sobrescrito`);
          }
        }

        validRows.push({
          boleta,
          firstName,
          lastNameP,
          lastNameM,
          email,
          role,
          institutionalType,
          photoUrl,
        });
      }

      const toCreate = validRows.map((r) => {
        const plainPassword = buildDefaultPassword({
          firstName: r.firstName,
          lastNameP: r.lastNameP,
          boleta: r.boleta,
        });

        return {
          boleta: r.boleta,
          firstName: r.firstName,
          lastNameP: r.lastNameP,
          lastNameM: r.lastNameM,
          email: r.email,
          role: r.role,
          institutionalType: r.institutionalType,
          photoUrl: r.photoUrl,
          _plainPassword: plainPassword,
        };
      });

      if (errors.length && toCreate.length === 0) {
        return res.status(400).json({
          error: 'Validación fallida - no hay registros válidos',
          summary: {
            total: rows.length,
            valid: toCreate.length,
            invalid: errors.length,
            conflicts: conflictsHandled, // ← Ya tiene users[] poblado
          },
          errors,
        });
      }

      if (dryRun) {
        return res.json({
          ok: true,
          summary: {
            total: rows.length,
            valid: toCreate.length,
            errors: errors.length,
            conflicts: conflictsHandled, // ← Ya tiene users[] poblado
            samplePasswords: toCreate.slice(0, 3).map((u) => ({
              email: u.email,
              boleta: u.boleta,
              passwordEjemplo: u._plainPassword,
            })),
          },
          errors,
        });
      }

      const withHashes = await Promise.all(
        toCreate.map(async (u) => ({
          ...u,
          passwordHash: await bcrypt.hash(u._plainPassword, 10),
        }))
      );

      const results = await prisma.$transaction(
        withHashes.map((u) => {
          const instTypeEnum = mapInstitutionalTypeForPrisma(u.institutionalType);

          return prisma.user.upsert({
            where: { email: u.email },
            update: {
              firstName: u.firstName,
              lastNameP: u.lastNameP,
              lastNameM: u.lastNameM,
              boleta: u.boleta,
              role: u.role,
              institutionalType: instTypeEnum ?? undefined,
              password: u.passwordHash,
              name: buildFullName(u.firstName, u.lastNameP, u.lastNameM),
              photoUrl: u.photoUrl || undefined,
            },
            create: {
              firstName: u.firstName,
              lastNameP: u.lastNameP,
              lastNameM: u.lastNameM,
              boleta: u.boleta,
              email: u.email,
              role: u.role,
              institutionalType: instTypeEnum ?? undefined,
              password: u.passwordHash,
              name: buildFullName(u.firstName, u.lastNameP, u.lastNameM),
              isActive: true,
              mustChangePassword: u.role === 'USER',
              photoUrl: u.photoUrl || null,
            },
            select: {
              id: true,
              email: true,
              role: true,
              boleta: true,
              institutionalType: true,
              photoUrl: true,
            },
          });
        })
      );

      return res.json({
        total: rows.length,
        upserted: results.length,
        conflicts: conflictsHandled,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (e) {
      console.error('IMPORT USERS ERROR:', e);
      return res.status(500).json({
        error: 'No se pudo importar',
        details: e.message || null,
        code: e.code || null,
        meta: e.meta || null,
      });
    }
  }
);

// ───── IMPORTAR CON FOTOS (ZIP o CSV en disco): POST /api/admin/import ────────
router.post(
  '/import/:type',
  auth,
  requireRole(['ADMIN']),
  uploadDisk.single('file'),
  async (req, res) => {
    const { type } = req.params;
    const { file } = req;
    const dryRun = String(req.query.dryRun || '').toLowerCase() === 'true';
    const conflictAction = String(req.query.conflictAction || 'exclude').toLowerCase(); // exclude|overwrite|delete

    if (!file) {
      return res.status(400).json({ error: 'No se ha enviado ningún archivo.' });
    }

    if (!['csv', 'zip'].includes(type)) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(400).json({ error: 'Tipo debe ser csv o zip' });
    }

    try {
      let response;

      if (type === 'zip') {
        // NUEVO: importación con soporte dryRun y acciones de conflicto
        const { importUsersWithPhotosDryRun, importUsersWithPhotosReal } = require('../../scripts/importWithPhotosActions');

        if (dryRun) {
          response = await importUsersWithPhotosDryRun(file.path);
        } else {
            response = await importUsersWithPhotosReal(file.path, { conflictAction });
        }
      } else {
        // CSV “suave” existente (sin fotos) — opcional: podrías también extender a dryRun si no lo tienes.
        const { importCSV } = require('../../scripts/importCSV');
        response = await importCSV(file.path);
      }

      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

      res.json(response);
    } catch (error) {
      console.error('ERROR EN /import:', error);
      if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      res.status(500).json({
        error: 'Hubo un error al procesar el archivo',
        details: error.message,
      });
    }
  }
);

module.exports = router;
