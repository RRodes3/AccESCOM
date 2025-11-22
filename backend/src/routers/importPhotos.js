// backend/src/routers/importPhotos.js
const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const AdmZip = require('adm-zip');

const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const prisma = new PrismaClient();

// Carpeta temporal donde multer deja el archivo subido
const uploadTempDir = path.join(__dirname, '..', '..', 'tmp_uploads');
if (!fs.existsSync(uploadTempDir)) {
  fs.mkdirSync(uploadTempDir, { recursive: true });
}

// Configuración básica de multer
const upload = multer({
  dest: uploadTempDir,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB máximo
  },
});

// Carpeta final donde vas a servir las fotos (ej: /public/photos)
function getPhotosDir() {
  // Puedes cambiarla con la env PHOTOS_DIR si quieres
  const photosDir =
    process.env.PHOTOS_DIR ||
    path.join(__dirname, '..', '..', 'public', 'photos');

  if (!fs.existsSync(photosDir)) {
    fs.mkdirSync(photosDir, { recursive: true });
  }
  return photosDir;
}

/**
 * Procesa un archivo de foto:
 * - filename: nombre original (ej. "2022630539.jpg")
 * - filePath: ruta temporal donde está el archivo
 */
async function processPhotoFile(filePath, filename, stats) {
  const ext = path.extname(filename).toLowerCase();
  if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
    stats.skipped.push({ filename, reason: 'Extensión no soportada' });
    return;
  }

  // Boleta = nombre sin extensión
  const boleta = path.basename(filename, ext).trim();
  if (!boleta) {
    stats.skipped.push({ filename, reason: 'Nombre de archivo vacío' });
    return;
  }

  const photosDir = getPhotosDir();
  const finalName = `${boleta}${ext}`;
  const destPath = path.join(photosDir, finalName);

  // Copiar archivo a carpeta final
  fs.copyFileSync(filePath, destPath);

  // Actualizar usuario en BD
  const updated = await prisma.user.updateMany({
    where: { boleta },
    data: { photoUrl: `/photos/${finalName}` },
  });

  if (updated.count > 0) {
    stats.processed++;
  } else {
    stats.notMatched.push(filename);
  }
}

/**
 * POST /admin/import-photos
 * Body: multipart/form-data con un campo "file"
 * - Puede ser un .zip con muchas fotos
 * - O una sola foto .jpg/.jpeg/.png
 */
router.post(
  '/import-photos',
  auth,
  requireRole(['ADMIN']),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Falta archivo' });
    }

    const stats = {
      processed: 0,
      notMatched: [], // archivos cuya boleta no existe en BD
      skipped: [], // extensiones no válidas, etc.
    };

    const originalExt = path.extname(req.file.originalname).toLowerCase();
    const tempPath = req.file.path;

    try {
      if (originalExt === '.zip') {
        // Descomprimir ZIP
        const zip = new AdmZip(tempPath);
        const entries = zip.getEntries();

        for (const entry of entries) {
          if (entry.isDirectory) continue;

          const entryName = entry.entryName.split('/').pop(); // por si viene con subcarpetas
          const ext = path.extname(entryName).toLowerCase();
          if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
            stats.skipped.push({
              filename: entryName,
              reason: 'Extensión no soportada dentro del ZIP',
            });
            continue;
          }

          // Extraer a carpeta temporal
          const tmpPhotoPath = path.join(uploadTempDir, entryName);
          zip.extractEntryTo(entry, uploadTempDir, false, true);

          // Procesar foto
          // eslint-disable-next-line no-await-in-loop
          await processPhotoFile(tmpPhotoPath, entryName, stats);

          // Borrar archivo temporal extraído
          try {
            fs.unlinkSync(tmpPhotoPath);
          } catch (e) {
            console.warn('No se pudo borrar archivo temporal:', tmpPhotoPath);
          }
        }
      } else {
        // Archivo individual (imagen)
        await processPhotoFile(tempPath, req.file.originalname, stats);
      }

      return res.json({
        ok: true,
        message: 'Importación de fotos completada',
        ...stats,
      });
    } catch (err) {
      console.error('Error importando fotos:', err);
      return res
        .status(500)
        .json({ ok: false, error: 'Error al importar fotos' });
    } finally {
      // Borrar el archivo temporal principal (.zip o la imagen)
      try {
        fs.unlinkSync(tempPath);
      } catch (e) {
        console.warn('No se pudo borrar archivo temporal principal:', tempPath);
      }
    }
  }
);

module.exports = router;
