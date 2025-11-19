const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');
const { PrismaClient, InstitutionalType } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const AdmZip = require('adm-zip');

const prisma = new PrismaClient();

// Helpers de validación (reutilizamos los mismos del adminImport.js)
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

  if (val === 'STUDENT' && InstitutionalType && InstitutionalType.STUDENT) return InstitutionalType.STUDENT;
  if (val === 'TEACHER' && InstitutionalType && InstitutionalType.TEACHER) return InstitutionalType.TEACHER;
  if (val === 'PAE' && InstitutionalType && InstitutionalType.PAE) return InstitutionalType.PAE;

  return null;
}

/**
 * Importa usuarios con fotos desde un archivo ZIP
 * El ZIP debe contener:
 * - Un archivo CSV con los datos de usuarios
 * - Una carpeta con fotos nombradas como {boleta}.jpg o {boleta}.png
 * 
 * @param {string} zipPath - Ruta al archivo ZIP
 * @returns {Promise<Object>} - Resultado con estadísticas de la importación
 */
async function importUsersWithPhotos(zipPath) {
  const tempDir = path.join(__dirname, '..', 'temp', `extract_${Date.now()}`);
  const photosDestDir = path.join(__dirname, '..', 'public', 'photos');

  // Crear directorios si no existen
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  if (!fs.existsSync(photosDestDir)) {
    fs.mkdirSync(photosDestDir, { recursive: true });
  }

  try {
    console.log('📦 Descomprimiendo ZIP...');
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tempDir, true);

    // Buscar el archivo CSV
    const files = fs.readdirSync(tempDir, { recursive: true });
    const csvFile = files.find((f) => /\.csv$/i.test(f.toString()));

    if (!csvFile) {
      throw new Error('No se encontró archivo CSV en el ZIP');
    }

    const csvPath = path.join(tempDir, csvFile.toString());
    console.log(`📄 CSV encontrado: ${csvFile}`);

    // Buscar carpeta de fotos
    const photosFolders = files.filter((f) => {
      const fullPath = path.join(tempDir, f.toString());
      return fs.statSync(fullPath).isDirectory();
    });

    let photosSourceFolder = tempDir; // Por defecto buscar en raíz
    if (photosFolders.length > 0) {
      photosSourceFolder = path.join(tempDir, photosFolders[0].toString());
      console.log(`📸 Carpeta de fotos: ${photosFolders[0]}`);
    }

    const users = [];

    return new Promise((resolve, reject) => {
      fs.createReadStream(csvPath)
        .pipe(csvParser())
        .on('data', (row) => {
          // Normalizar nombres de columnas
          const normalizedRow = {};
          Object.keys(row).forEach((key) => {
            const normalizedKey = key
              .trim()
              .replace(/\s+/g, '')
              .toLowerCase();
            normalizedRow[normalizedKey] = row[key];
          });

          users.push(normalizedRow);
        })
        .on('end', async () => {
          console.log(`📄 CSV procesado: ${users.length} filas encontradas`);

          const results = {
            total: users.length,
            created: 0,
            updated: 0,
            skipped: 0,
            photosProcessed: 0,
            errors: [],
          };

          for (let i = 0; i < users.length; i++) {
            const row = users[i];
            const lineNumber = i + 2;

            try {
              // Extraer y sanitizar campos
              const boleta = String(row.boleta || '').trim();
              const firstName = sanitizeName(row.firstname || row.nombre || '');
              const lastNameP = sanitizeName(row.lastnamep || row.apellidopaterno || '');
              const lastNameM = sanitizeName(row.lastnamem || row.apellidomaterno || '');
              const email = String(row.email || '').trim().toLowerCase();
              const role = String(row.role || row.rol || 'USER').trim().toUpperCase();
              let institutionalType = String(row.institutionaltype || row.tipo || '').trim().toUpperCase();

              // Inferir institutionalType si no viene
              if (!institutionalType && role === 'USER') {
                if (/@alumno\.ipn\.mx$/i.test(email)) {
                  institutionalType = 'STUDENT';
                } else if (/@ipn\.mx$/i.test(email)) {
                  institutionalType = 'TEACHER';
                }
              }

              // Validaciones
              const rowErrors = {};
              if (!RE_BOLETA.test(boleta)) rowErrors.boleta = 'Boleta debe tener 10 dígitos';
              if (!firstName || !RE_LETTERS.test(firstName)) rowErrors.firstName = 'Nombre inválido';
              if (!lastNameP || !RE_LETTERS.test(lastNameP)) rowErrors.lastNameP = 'Apellido paterno inválido';
              if (!lastNameM || !RE_LETTERS.test(lastNameM)) rowErrors.lastNameM = 'Apellido materno inválido';
              if (!email || !isInstitutional(email)) rowErrors.email = 'Correo institucional inválido';
              if (!['ADMIN', 'GUARD', 'USER'].includes(role)) rowErrors.role = 'Role inválido';

              if (Object.keys(rowErrors).length > 0) {
                results.errors.push({ line: lineNumber, errors: rowErrors, data: row });
                results.skipped++;
                continue;
              }

              // Buscar foto (soporta .jpg, .jpeg, .png)
              let photoUrl = null;
              const photoExtensions = ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG'];
              
              for (const ext of photoExtensions) {
                const photoFileName = `${boleta}${ext}`;
                const photoSourcePath = path.join(photosSourceFolder, photoFileName);

                if (fs.existsSync(photoSourcePath)) {
                  // Copiar foto a public/photos con extensión normalizada
                  const normalizedExt = ext.toLowerCase();
                  const photoDestPath = path.join(photosDestDir, `${boleta}${normalizedExt}`);
                  fs.copyFileSync(photoSourcePath, photoDestPath);
                  
                  photoUrl = `/photos/${boleta}${normalizedExt}`;
                  results.photosProcessed++;
                  console.log(`📸 Foto copiada: ${boleta}${normalizedExt}`);
                  break;
                }
              }

              // Verificar si ya existe
              const existingUser = await prisma.user.findFirst({
                where: {
                  OR: [{ email }, { boleta }],
                },
              });

              // Generar contraseña si no existe
              const plainPassword = buildDefaultPassword({ firstName, lastNameP, boleta });
              const passwordHash = await bcrypt.hash(plainPassword, 10);

              const instTypeEnum = mapInstitutionalTypeForPrisma(institutionalType);

              // Upsert usuario
              const user = await prisma.user.upsert({
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
                  photoUrl: photoUrl || undefined,
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
                  photoUrl: photoUrl || null,
                },
              });

              if (existingUser) {
                console.log(`✏️  Usuario actualizado: ${email}${photoUrl ? ' (con foto)' : ''}`);
                results.updated++;
              } else {
                console.log(`✅ Usuario creado: ${email}${photoUrl ? ' (con foto)' : ''}`);
                results.created++;
              }
            } catch (error) {
              console.error(`❌ Error en línea ${lineNumber}:`, error.message);
              results.errors.push({
                line: lineNumber,
                error: error.message,
                data: row,
              });
              results.skipped++;
            }
          }

          // Limpiar carpeta temporal
          console.log('🧹 Limpiando archivos temporales...');
          fs.rmSync(tempDir, { recursive: true, force: true });

          console.log(`\n📊 Resumen de importación:`);
          console.log(`   Total: ${results.total}`);
          console.log(`   Creados: ${results.created}`);
          console.log(`   Actualizados: ${results.updated}`);
          console.log(`   Fotos procesadas: ${results.photosProcessed}`);
          console.log(`   Omitidos: ${results.skipped}`);
          console.log(`   Errores: ${results.errors.length}`);

          resolve(results);
        })
        .on('error', (error) => {
          console.error('❌ Error al leer CSV:', error);
          // Limpiar en caso de error
          if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
          }
          reject(error);
        });
    });
  } catch (error) {
    console.error('❌ Error al procesar ZIP:', error);
    // Limpiar en caso de error
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    throw error;
  }
}

module.exports = { importUsersWithPhotos };
