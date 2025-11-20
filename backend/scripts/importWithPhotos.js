const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');
const { PrismaClient, InstitutionalType } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const AdmZip = require('adm-zip');
const XLSX = require('xlsx');

const prisma = new PrismaClient();

const RE_LETTERS = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$/;
const RE_BOLETA = /^\d{10}$/;
const RE_EMAIL_DOT = /^[a-z]+(?:\.[a-z]+)+@(?:alumno\.)?ipn\.mx$/i;
const RE_EMAIL_COMPACT = /^[a-z]{1,6}[a-z]+[a-z]?\d{0,6}@(?:alumno\.)?ipn\.mx$/i;
const RE_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;

const isInstitutional = (email) =>
  RE_EMAIL_DOT.test((email || '').trim()) ||
  RE_EMAIL_COMPACT.test((email || '').trim());

const sanitizeName = (s) =>
  String(s || '').trim().replace(/\s{2,}/g, ' ').slice(0, 80);

const buildFullName = (f, p, m) =>
  [f, p, m].map(sanitizeName).filter(Boolean).join(' ').slice(0, 120);

function stripAccents(str = '') {
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function capitalize(str = '') {
  const s = stripAccents(String(str).trim().toLowerCase());
  if (!s) return '';
  return s[0].toUpperCase() + s.slice(1);
}

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

  let pwd = `${initial}${lastLower}${tail}${nameCap}.`;
  if (!RE_PASSWORD.test(pwd)) {
    pwd = pwd + '!2025aA1';
  }
  return pwd;
}

function mapInstitutionalTypeForPrisma(raw) {
  if (!raw) return null;
  const val = String(raw).toUpperCase().trim();
  if (val === 'STUDENT' && InstitutionalType?.STUDENT) return InstitutionalType.STUDENT;
  if (val === 'TEACHER' && InstitutionalType?.TEACHER) return InstitutionalType.TEACHER;
  if (val === 'PAE' && InstitutionalType?.PAE) return InstitutionalType.PAE;
  return null;
}

/**
 * Importa usuarios con fotos desde un ZIP (admite CSV o XLSX)
 * Estructura esperada mínima:
 *  - archivo.csv ó archivo.xlsx en la raíz
 *  - carpeta fotos/ (o photos/) con imágenes {boleta}.jpg|png
 */
async function importUsersWithPhotos(zipPath) {
  const tempDir = path.join(__dirname, '..', 'temp', `extract_${Date.now()}`);
  const photosDestDir = path.join(__dirname, '..', 'public', 'photos');

  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  if (!fs.existsSync(photosDestDir)) fs.mkdirSync(photosDestDir, { recursive: true });

  try {
    console.log('📦 Descomprimiendo ZIP...');
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tempDir, true);

    // Listar contenidos
    const entries = fs.readdirSync(tempDir, { recursive: true });
    console.log('📁 Contenido extraído:');
    entries.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));

    // Localizar archivo de datos
    const dataFile = entries.find(e => /\.(csv|xlsx?)$/i.test(e));
    if (!dataFile) throw new Error('No se encontró archivo CSV/XLSX en el ZIP');
    const dataFilePath = path.join(tempDir, dataFile);
    console.log(`📄 Archivo de datos: ${dataFile}`);

    // Detectar carpeta fotos
    let photosSourceFolder = null;
    const candidateFolders = entries.filter(e => {
      const full = path.join(tempDir, e);
      return fs.existsSync(full) && fs.statSync(full).isDirectory();
    });

    // Preferir 'fotos', luego 'photos'
    photosSourceFolder =
      candidateFolders.find(f => /^(fotos|photos)$/i.test(path.basename(f))) ||
      candidateFolders[0] ||
      null;

    if (photosSourceFolder) {
      photosSourceFolder = path.join(tempDir, photosSourceFolder);
      console.log(`📸 Carpeta de fotos detectada: ${photosSourceFolder}`);
    } else {
      console.log('ℹ️ No se detectó carpeta de fotos; se continuará sin imágenes.');
    }

    // Parsear usuarios
    let users = [];
    if (/\.csv$/i.test(dataFile)) {
      console.log('🔄 Parseando CSV...');
      users = await new Promise((resolve, reject) => {
        const rows = [];
        fs.createReadStream(dataFilePath)
          .pipe(csvParser())
          .on('data', (row) => {
            const normalizedRow = {};
            Object.keys(row).forEach(key => {
              const nk = String(key)
                .trim()
                .replace(/\s+/g, '')
                .toLowerCase();
              normalizedRow[nk] = row[key];
            });
            rows.push(normalizedRow);
          })
          .on('end', () => resolve(rows))
          .on('error', reject);
      });
    } else {
      console.log('🔄 Parseando XLSX...');
      const wb = XLSX.readFile(dataFilePath);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      users = rawRows.map(obj => {
        const normalizedRow = {};
        Object.keys(obj).forEach(key => {
          const nk = String(key)
            .trim()
            .replace(/\s+/g, '')
            .toLowerCase();
          normalizedRow[nk] = obj[key];
        });
        return normalizedRow;
      });
    }

    console.log(`✅ Filas leídas: ${users.length}`);

    const results = {
      total: users.length,
      created: 0,
      updated: 0,
      skipped: 0,
      photosProcessed: 0,
      errors: [],
    };

    const photoExtensions = ['.jpg', '.jpeg', '.png'];

    for (let i = 0; i < users.length; i++) {
      const row = users[i];
      const lineNumber = i + 2;

      try {
        const boleta = String(row.boleta || '').trim();
        const firstName = sanitizeName(row.firstname || row.nombre || '');
        const lastNameP = sanitizeName(row.lastnamep || row.apellidopaterno || '');
        const lastNameM = sanitizeName(row.lastnamem || row.apellidomaterno || '');
        const email = String(row.email || '').trim().toLowerCase();
        const role = String(row.role || row.rol || 'USER').trim().toUpperCase();
        let institutionalType = String(row.institutionaltype || row.tipo || '').trim().toUpperCase();
        const photoUrlRaw = String(row.photourl || '').trim();

        if (!institutionalType && role === 'USER') {
          if (/@alumno\.ipn\.mx$/i.test(email)) institutionalType = 'STUDENT';
          else if (/@ipn\.mx$/i.test(email)) institutionalType = 'TEACHER';
        }

        const rowErrors = {};
        if (!RE_BOLETA.test(boleta)) rowErrors.boleta = 'Boleta debe tener 10 dígitos';
        if (!firstName || !RE_LETTERS.test(firstName)) rowErrors.firstName = 'Nombre inválido';
        if (!lastNameP || !RE_LETTERS.test(lastNameP)) rowErrors.lastNameP = 'Apellido paterno inválido';
        if (!lastNameM || !RE_LETTERS.test(lastNameM)) rowErrors.lastNameM = 'Apellido materno inválido';
        if (!email || !isInstitutional(email)) rowErrors.email = 'Correo institucional inválido';
        if (!['ADMIN', 'GUARD', 'USER'].includes(role)) rowErrors.role = 'Role inválido';

        if (Object.keys(rowErrors).length) {
            results.errors.push({ line: lineNumber, errors: rowErrors, data: row });
            results.skipped++;
            continue;
        }

        // Manejo de foto
        let finalPhotoUrl = null;

        // Caso explícito /photos/xxx.jpg ya existente
        if (photoUrlRaw.startsWith('/photos/')) {
          const dest = path.join(photosDestDir, path.basename(photoUrlRaw));
          if (fs.existsSync(dest)) {
            finalPhotoUrl = photoUrlRaw;
            console.log(`✅ Línea ${lineNumber}: usando foto existente ${finalPhotoUrl}`);
          } else {
            console.warn(`⚠️ Línea ${lineNumber}: ruta foto declarada no existe en destino (${photoUrlRaw})`);
          }
        }
        // Nombre de archivo suelto declarado en CSV/XLSX (ej. 2022630469.jpg)
        else if (photoUrlRaw && /\.(jpe?g|png)$/i.test(photoUrlRaw) && photosSourceFolder) {
          const source = path.join(photosSourceFolder, photoUrlRaw);
          if (fs.existsSync(source)) {
            const normalizedName = photoUrlRaw.toLowerCase();
            const destPath = path.join(photosDestDir, normalizedName);
            if (!fs.existsSync(destPath)) {
              fs.copyFileSync(source, destPath);
              results.photosProcessed++;
              console.log(`📸 Copiada foto declarada: ${normalizedName}`);
            }
            finalPhotoUrl = `/photos/${normalizedName}`;
          } else {
            console.warn(`⚠️ Línea ${lineNumber}: foto declarada no encontrada: ${photoUrlRaw}`);
          }
        }
        // Buscar automática por boleta si no se obtuvo foto aún
        if (!finalPhotoUrl && photosSourceFolder && boleta) {
          for (const ext of photoExtensions) {
            const candidate = path.join(photosSourceFolder, `${boleta}${ext}`);
            if (fs.existsSync(candidate)) {
              const normalizedExt = ext.toLowerCase();
              const destPath = path.join(photosDestDir, `${boleta}${normalizedExt}`);
              if (!fs.existsSync(destPath)) {
                fs.copyFileSync(candidate, destPath);
                results.photosProcessed++;
                console.log(`📸 Foto encontrada por boleta: ${boleta}${normalizedExt}`);
              } else {
                console.log(`ℹ️ Foto destino ya existente: ${boleta}${normalizedExt}`);
              }
              finalPhotoUrl = `/photos/${boleta}${normalizedExt}`;
              break;
            }
          }
        }

        const existingUser = await prisma.user.findFirst({
          where: { OR: [{ email }, { boleta }] },
        });

        const plainPassword = buildDefaultPassword({ firstName, lastNameP, boleta });
        const passwordHash = await bcrypt.hash(plainPassword, 10);
        const instTypeEnum = mapInstitutionalTypeForPrisma(institutionalType);

        await prisma.user.upsert({
          where: { email },
            update: {
              firstName,
              lastNameP,
              lastNameM,
              boleta,
              role,
              institutionalType: instTypeEnum ?? undefined,
              password: passwordHash,
              name: buildFullName(firstName, lastNameP, lastNameM),
              photoUrl: finalPhotoUrl || undefined,
            },
            create: {
              firstName,
              lastNameP,
              lastNameM,
              boleta,
              email,
              role,
              institutionalType: instTypeEnum ?? undefined,
              password: passwordHash,
              name: buildFullName(firstName, lastNameP, lastNameM),
              isActive: true,
              mustChangePassword: role === 'USER',
              photoUrl: finalPhotoUrl || null,
            },
        });

        if (existingUser) {
          console.log(`✏️  Actualizado: ${email}${finalPhotoUrl ? ' (foto)' : ''}`);
          results.updated++;
        } else {
          console.log(`✅ Creado: ${email}${finalPhotoUrl ? ' (foto)' : ''}`);
          results.created++;
        }
      } catch (err) {
        console.error(`❌ Error línea ${lineNumber}: ${err.message}`);
        results.errors.push({ line: lineNumber, error: err.message, data: row });
        results.skipped++;
      }
    }

    console.log('🧹 Limpiando temporales...');
    fs.rmSync(tempDir, { recursive: true, force: true });

    console.log('📊 Resumen:');
    console.log(`  Total: ${results.total}`);
    console.log(`  Creados: ${results.created}`);
    console.log(`  Actualizados: ${results.updated}`);
    console.log(`  Skipped: ${results.skipped}`);
    console.log(`  Fotos procesadas: ${results.photosProcessed}`);
    console.log(`  Errores: ${results.errors.length}`);

    return results;
  } catch (error) {
    console.error('❌ Error al procesar ZIP:', error);
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { importUsersWithPhotos };
