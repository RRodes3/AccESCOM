const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const XLSX = require('xlsx');
const csvParser = require('csv-parser');
const bcrypt = require('bcryptjs');
const { PrismaClient, InstitutionalType } = require('@prisma/client');
const cloudinary = require('../src/utils/cloudinary'); // ← AGREGAR ESTA LÍNEA

const prisma = new PrismaClient();

const RE_LETTERS = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$/;
const RE_BOLETA = /^\d{10}$/;
const RE_EMAIL_DOT = /^[a-z]+(?:\.[a-z]+)+@(?:alumno\.)?ipn\.mx$/i;
const RE_EMAIL_COMPACT = /^[a-z]{1,6}[a-z]+[a-z]?\d{0,6}@(?:alumno\.)?ipn\.mx$/i;
const RE_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;
const RE_EMAIL_GENERIC = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const isInstitutional = (email) =>
  RE_EMAIL_DOT.test((email || '').trim()) || RE_EMAIL_COMPACT.test((email || '').trim());

const sanitizeName = (s) => String(s || '').trim().replace(/\s{2,}/g, ' ').slice(0, 80);
const buildFullName = (f, p, m) =>
  [f, p, m].map(sanitizeName).filter(Boolean).join(' ').slice(0, 120);

function stripAccents(str = '') {
  return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function capitalize(str = '') {
  const s = stripAccents(String(str).trim().toLowerCase());
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}
function buildDefaultPassword({ firstName, lastNameP, boleta }) {
  const fn = String(firstName || 'Usuario').trim().split(/\s+/)[0];
  const ln = String(lastNameP || 'ESCOM').trim().split(/\s+/)[0];
  const cleanFn = stripAccents(fn);
  const cleanLn = stripAccents(ln);
  const initial = cleanFn[0] ? cleanFn[0].toLowerCase() : 'u';
  const tail = String(boleta || '').replace(/\D/g, '').slice(-4) || '0000';
  const pwd = `${initial}${cleanLn.toLowerCase()}${tail}${capitalize(fn)}.`; // ej base
  return RE_PASSWORD.test(pwd) ? pwd : pwd + '!2025aA1';
}
function mapInstitutionalTypeForPrisma(raw) {
  if (!raw) return null;
  const val = String(raw).toUpperCase().trim();
  if (val === 'STUDENT' && InstitutionalType?.STUDENT) return InstitutionalType.STUDENT;
  if (val === 'TEACHER' && InstitutionalType?.TEACHER) return InstitutionalType.TEACHER;
  if (val === 'PAE' && InstitutionalType?.PAE) return InstitutionalType.PAE;
  return null;
}

function extractZip(zipPath) {
  const tempDir = path.join(__dirname, '..', 'temp', `zip_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(tempDir, true);
  return tempDir;
}

function discoverDataFileAndPhotos(tempDir) {
  const entries = fs.readdirSync(tempDir, { recursive: true });
  const dataFile = entries.find(e => /\.(csv|xlsx?)$/i.test(e));
  if (!dataFile) throw new Error('No se encontró archivo CSV/XLSX en el ZIP');
  const candidateFolders = entries.filter(e => {
    const full = path.join(tempDir, e);
    return fs.existsSync(full) && fs.statSync(full).isDirectory();
  });
  let photosFolder = candidateFolders.find(f => /^(fotos|photos)$/i.test(path.basename(f))) || candidateFolders[0] || null;
  if (photosFolder) photosFolder = path.join(tempDir, photosFolder);
  return { dataFilePath: path.join(tempDir, dataFile), photosFolder };
}

async function parseUsers(dataFilePath) {
  let users = [];
  if (/\.csv$/i.test(dataFilePath)) {
    users = await new Promise((resolve, reject) => {
      const rows = [];
      fs.createReadStream(dataFilePath)
        .pipe(csvParser())
        .on('data', (row) => {
          const norm = {};
          Object.keys(row).forEach(k => {
            const nk = String(k).trim().replace(/\s+/g, '').toLowerCase();
            norm[nk] = row[k];
          });
          rows.push(norm);
        })
        .on('end', () => resolve(rows))
        .on('error', reject);
    });
  } else {
    const wb = XLSX.readFile(dataFilePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    users = rawRows.map(obj => {
      const norm = {};
      Object.keys(obj).forEach(k => {
        const nk = String(k).trim().replace(/\s+/g, '').toLowerCase();
        norm[nk] = obj[k];
      });
      return norm;
    });
  }
  return users;
}

// Agregar esta función helper después de parseUsers y antes de importUsersWithPhotosDryRun
async function uploadUserPhotoFromZip({ photosFolder, boleta, userId }) {
  if (!photosFolder) return { photoUrl: null, photoPublicId: null };

  const candidates = [
    `${boleta}.jpg`,
    `${boleta}.jpeg`,
    `${boleta}.png`,
    `${boleta}.JPG`,
    `${boleta}.JPEG`,
    `${boleta}.PNG`,
  ];

  let localPath = null;

  for (const filename of candidates) {
    const candidatePath = path.join(photosFolder, filename);
    if (fs.existsSync(candidatePath)) {
      localPath = candidatePath;
      break;
    }
  }

  if (!localPath) {
    return { photoUrl: null, photoPublicId: null };
  }

  try {
    console.log(`📤 Subiendo foto a Cloudinary: ${path.basename(localPath)}`);
    const result = await cloudinary.uploader.upload(localPath, {
      folder: 'accescom/users',
      public_id: `user_${userId || boleta}_${Date.now()}`,
      overwrite: true,
      resource_type: 'image',
      transformation: [
        { width: 400, height: 400, crop: 'fill', gravity: 'face' },
      ],
    });

    console.log(`✅ Foto subida: ${result.public_id}`);
    return {
      photoUrl: result.secure_url,
      photoPublicId: result.public_id,
    };
  } catch (error) {
    console.error(`❌ Error subiendo foto para boleta ${boleta}:`, error.message);
    return { photoUrl: null, photoPublicId: null };
  }
}

// Dry run: validar, detectar conflictos, NO modificar BD ni copiar fotos
async function importUsersWithPhotosDryRun(zipPath) {
  const tempDir = extractZip(zipPath);
  try {
    const { dataFilePath, photosFolder } = discoverDataFileAndPhotos(tempDir);
    const usersRaw = await parseUsers(dataFilePath);

    const errors = [];
    const validRows = [];
    const conflicts = { excluded: 0, deleted: 0, overwritten: 0, users: [] };

    for (let i = 0; i < usersRaw.length; i++) {
      const row = usersRaw[i];
      const line = i + 2;

      const boleta = String(row.boleta || '').trim();
      const firstName = sanitizeName(row.firstname || row.nombre || '');
      const lastNameP = sanitizeName(row.lastnamep || row.apellidopaterno || '');
      const lastNameM = sanitizeName(row.lastnamem || row.apellidomaterno || '');
      const email = String(row.email || '').trim().toLowerCase();
      const role = String(row.role || row.rol || 'USER').trim().toUpperCase();
      let institutionalType = String(row.institutionaltype || row.tipo || '').trim().toUpperCase();
      const photoUrlRaw = String(row.photourl || '').trim();
      const contactEmailRaw = String(row.contactemail || row.contact || '').trim().toLowerCase();
      const contactEmail = (role !== 'GUARD' && contactEmailRaw) ? contactEmailRaw : null;

      if (!institutionalType && role === 'USER') {
        if (/@alumno\.ipn\.mx$/i.test(email)) institutionalType = 'STUDENT';
        else if (/@ipn\.mx$/i.test(email)) institutionalType = 'TEACHER';
      }

      const rowErr = {};
      if (!RE_BOLETA.test(boleta)) rowErr.boleta = 'Boleta debe tener 10 dígitos';
      if (!firstName || !RE_LETTERS.test(firstName)) rowErr.firstName = 'Nombre inválido';
      if (!lastNameP || !RE_LETTERS.test(lastNameP)) rowErr.lastNameP = 'Apellido paterno inválido';
      if (!lastNameM || !RE_LETTERS.test(lastNameM)) rowErr.lastNameM = 'Apellido materno inválido';
      if (!email || !isInstitutional(email)) rowErr.email = 'Correo institucional inválido';
      if (!['ADMIN','GUARD','USER'].includes(role)) rowErr.role = 'Role inválido';
      if (contactEmail && !RE_EMAIL_GENERIC.test(contactEmail)) rowErr.contactEmail = 'Correo contacto inválido';

      if (Object.keys(rowErr).length) {
        errors.push({ line, errors: rowErr, row });
        continue;
      }

      const existing = await prisma.user.findFirst({
        where: { OR: [{ boleta }, { email }] },
        select: { boleta: true, email: true, firstName: true, lastNameP: true, lastNameM: true }
      });

      if (existing) {
        let conflictType = '';
        if (existing.boleta === boleta && existing.email === email) conflictType = 'Duplicado por boleta y correo';
        else if (existing.boleta === boleta) conflictType = 'Duplicado por boleta';
        else if (existing.email === email) conflictType = 'Duplicado por correo';

        conflicts.users.push({
          boleta,
          email,
          name: buildFullName(firstName, lastNameP, lastNameM),
          existingName: buildFullName(existing.firstName, existing.lastNameP, existing.lastNameM),
          conflictType
        });
        
        // ✅ En dry-run, todos los conflictos se cuentan como "excluded" por defecto
        conflicts.excluded++;
        // ✅ IMPORTANTE: NO agregar a validRows, hacer continue
        continue;
      }

      // ✅ Solo llega aquí si NO hay conflicto
      validRows.push({ boleta, firstName, lastNameP, lastNameM, email, role, institutionalType, photoUrlRaw, contactEmail });
    }

    return {
      ok: true,
      summary: {
        total: usersRaw.length,
        valid: validRows.length,
        errors: errors.length,
        conflicts,
        samplePasswords: validRows.slice(0, 3).map(u => ({
          email: u.email,
          boleta: u.boleta,
          passwordEjemplo: buildDefaultPassword({
            firstName: u.firstName,
            lastNameP: u.lastNameP,
            boleta: u.boleta
          })
        }))
      },
      errors
    };
  } finally {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// Import real: aplica conflictAction y realiza creación / actualización / borrado
async function importUsersWithPhotosReal(zipPath, { conflictAction = 'exclude' } = {}) {
  const tempDir = extractZip(zipPath);
  const photosDestDir = path.join(__dirname, '..', 'public', 'photos');

  try {
    const { dataFilePath, photosFolder } = discoverDataFileAndPhotos(tempDir);
    const usersRaw = await parseUsers(dataFilePath);

    const errors = [];
    const toProcess = [];
    const conflictsHandled = { excluded: 0, deleted: 0, overwritten: 0, users: [] };

    for (let i = 0; i < usersRaw.length; i++) {
      const row = usersRaw[i];
      const line = i + 2;

      const boleta = String(row.boleta || '').trim();
      const firstName = sanitizeName(row.firstname || row.nombre || '');
      const lastNameP = sanitizeName(row.lastnamep || row.apellidopaterno || '');
      const lastNameM = sanitizeName(row.lastnamem || row.apellidomaterno || '');
      const email = String(row.email || '').trim().toLowerCase();
      const role = String(row.role || row.rol || 'USER').trim().toUpperCase();
      let institutionalType = String(row.institutionaltype || row.tipo || '').trim().toUpperCase();
      const photoUrlRaw = String(row.photourl || '').trim();
      const contactEmailRaw = String(row.contactemail || row.contact || '').trim().toLowerCase();
      const contactEmail = (role !== 'GUARD' && contactEmailRaw) ? contactEmailRaw : null;

      if (!institutionalType && role === 'USER') {
        if (/@alumno\.ipn\.mx$/i.test(email)) institutionalType = 'STUDENT';
        else if (/@ipn\.mx$/i.test(email)) institutionalType = 'TEACHER';
      }

      const rowErr = {};
      if (!RE_BOLETA.test(boleta)) rowErr.boleta = 'Boleta debe tener 10 dígitos';
      if (!firstName || !RE_LETTERS.test(firstName)) rowErr.firstName = 'Nombre inválido';
      if (!lastNameP || !RE_LETTERS.test(lastNameP)) rowErr.lastNameP = 'Apellido paterno inválido';
      if (!lastNameM || !RE_LETTERS.test(lastNameM)) rowErr.lastNameM = 'Apellido materno inválido';
      if (!email || !isInstitutional(email)) rowErr.email = 'Correo institucional inválido';
      if (!['ADMIN','GUARD','USER'].includes(role)) rowErr.role = 'Role inválido';
      if (contactEmail && !RE_EMAIL_GENERIC.test(contactEmail)) rowErr.contactEmail = 'Correo contacto inválido';

      if (Object.keys(rowErr).length) {
        errors.push({ line, errors: rowErr, row });
        continue;
      }

      const existing = await prisma.user.findFirst({
        where: { OR: [{ boleta }, { email }] },
        select: { id: true, boleta: true, email: true, firstName: true, lastNameP: true, lastNameM: true }
      });

      if (existing) {
        let conflictType = '';
        if (existing.boleta === boleta && existing.email === email) conflictType = 'Duplicado por boleta y correo';
        else if (existing.boleta === boleta) conflictType = 'Duplicado por boleta';
        else if (existing.email === email) conflictType = 'Duplicado por correo';

        conflictsHandled.users.push({
          boleta,
          email,
          name: buildFullName(firstName, lastNameP, lastNameM),
          existingName: buildFullName(existing.firstName, existing.lastNameP, existing.lastNameM),
          conflictType
        });

        if (conflictAction === 'exclude') {
          conflictsHandled.excluded++;
          continue;
        } else if (conflictAction === 'delete') {
          await prisma.user.delete({ where: { id: existing.id } });
          conflictsHandled.deleted++;
        } else if (conflictAction === 'overwrite') {
          conflictsHandled.overwritten++;
          // Upsert hará update
        }
      }

      toProcess.push({
        boleta, firstName, lastNameP, lastNameM, email, role, institutionalType, photoUrlRaw, contactEmail
      });
    }

    // Procesar fotos + upserts
    let created = 0;
    let updated = 0;
    let photosProcessed = 0;

    for (const u of toProcess) {
      let finalPhotoUrl = null;
      let finalPhotoPublicId = null;

      // Paso 1: Crear o actualizar usuario primero (necesitamos el ID)
      const plainPassword = buildDefaultPassword({ firstName: u.firstName, lastNameP: u.lastNameP, boleta: u.boleta });
      const passwordHash = await bcrypt.hash(plainPassword, 10);
      const instTypeEnum = mapInstitutionalTypeForPrisma(u.institutionalType);

      const existingBefore = await prisma.user.findFirst({ where: { email: u.email } });

      const upsertedUser = await prisma.user.upsert({
        where: { email: u.email },
        update: {
          firstName: u.firstName,
          lastNameP: u.lastNameP,
          lastNameM: u.lastNameM,
          boleta: u.boleta,
          role: u.role,
          institutionalType: instTypeEnum ?? undefined,
          password: passwordHash,
          name: buildFullName(u.firstName, u.lastNameP, u.lastNameM),
          contactEmail: u.contactEmail || null
        },
        create: {
          firstName: u.firstName,
          lastNameP: u.lastNameP,
          lastNameM: u.lastNameM,
          boleta: u.boleta,
          email: u.email,
          role: u.role,
          institutionalType: instTypeEnum ?? undefined,
          password: passwordHash,
          name: buildFullName(u.firstName, u.lastNameP, u.lastNameM),
          isActive: true,
          mustChangePassword: u.role === 'USER',
          contactEmail: u.contactEmail || null
        },
        select: { id: true, email: true }
      });

      if (existingBefore) updated++; else created++;

      // Paso 2: Procesar foto si existe
      // Prioridad 1: URL explícita de Cloudinary ya existente
      if (u.photoUrlRaw && u.photoUrlRaw.startsWith('https://res.cloudinary.com/')) {
        finalPhotoUrl = u.photoUrlRaw;
        // Intentar extraer public_id de la URL (opcional, puede ser complejo)
        console.log(`ℹ️ Usuario ${u.email}: usando URL Cloudinary existente`);
      }
      // Prioridad 2: Archivo local declarado en CSV
      else if (u.photoUrlRaw && /\.(jpe?g|png)$/i.test(u.photoUrlRaw) && photosFolder) {
        const source = path.join(photosFolder, u.photoUrlRaw);
        if (fs.existsSync(source)) {
          try {
            const result = await cloudinary.uploader.upload(source, {
              folder: 'accescom/users',
              public_id: `user_${upsertedUser.id}_${Date.now()}`,
              overwrite: true,
              resource_type: 'image',
              transformation: [
                { width: 400, height: 400, crop: 'fill', gravity: 'face' },
              ],
            });
            finalPhotoUrl = result.secure_url;
            finalPhotoPublicId = result.public_id;
            photosProcessed++;
            console.log(`📸 Subida foto declarada: ${u.photoUrlRaw} → ${result.public_id}`);
          } catch (err) {
            console.error(`❌ Error subiendo foto declarada para ${u.email}:`, err.message);
          }
        }
      }
      // Prioridad 3: Buscar automáticamente por boleta
      if (!finalPhotoUrl && photosFolder) {
        const { photoUrl, photoPublicId } = await uploadUserPhotoFromZip({
          photosFolder,
          boleta: u.boleta,
          userId: upsertedUser.id
        });
        if (photoUrl) {
          finalPhotoUrl = photoUrl;
          finalPhotoPublicId = photoPublicId;
          photosProcessed++;
        }
      }

      // Paso 3: Actualizar usuario con foto si se obtuvo
      if (finalPhotoUrl) {
        await prisma.user.update({
          where: { id: upsertedUser.id },
          data: {
            photoUrl: finalPhotoUrl,
            photoPublicId: finalPhotoPublicId
          },
        });
        console.log(`✅ Usuario ${u.email} actualizado con foto Cloudinary`);
      }
    }

    return {
      total: usersRaw.length,
      upserted: created + updated,
      created,
      updated,
      photosProcessed,
      conflicts: conflictsHandled,
      errors: errors.length ? errors : undefined
    };
  } finally {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  importUsersWithPhotosDryRun,
  importUsersWithPhotosReal
};