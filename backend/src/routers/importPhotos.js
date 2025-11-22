// backend/src/routers/importPhotos.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');

const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const cloudinary = require('../utils/cloudinary'); // instancia configurada

const prisma = new PrismaClient();
const router = express.Router();

// Carpeta temporal para uploads
const uploadDir = path.join(__dirname, '..', '..', 'temp', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer para imágenes (JPG/PNG)
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Formato no soportado (solo JPG/PNG)'));
    }
    cb(null, true);
  },
});

// Helper para borrar archivos temporales
function safeUnlink(p) {
  if (!p) return;
  fs.unlink(p, (err) => {
    if (err) console.warn('No se pudo borrar temp:', p, err.message);
  });
}

/**
 * Lógica común para subir/actualizar la foto de un usuario
 * - Usa boletaOrEmail si viene en el body
 * - Si no viene, intenta deducir la boleta del nombre del archivo (sin extensión)
 */
async function processSinglePhotoUpload(req, res) {
  const file = req.file;
  let { boletaOrEmail } = req.body;

  if (!file) {
    return res
      .status(400)
      .json({ ok: false, error: 'Falta archivo de imagen' });
  }

  // Si no viene boletaOrEmail en el body, intenta sacarlo del nombre del archivo
  if (!boletaOrEmail) {
    const original = file.originalname || '';
    const base = path.basename(original, path.extname(original));
    boletaOrEmail = base;
  }

  if (!boletaOrEmail) {
    safeUnlink(file.path);
    return res
      .status(400)
      .json({ ok: false, error: 'Falta boleta o correo del usuario' });
  }

  try {
    const clave = boletaOrEmail.trim();
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ boleta: clave }, { email: clave.toLowerCase() }],
      },
      select: { id: true, photoPublicId: true },
    });

    if (!user) {
      safeUnlink(file.path);
      return res
        .status(404)
        .json({ ok: false, error: 'Usuario no encontrado' });
    }

    // Si ya tenía foto en Cloudinary, destruirla
    if (user.photoPublicId) {
      try {
        await cloudinary.uploader.destroy(user.photoPublicId);
      } catch (e) {
        console.warn('No se pudo destruir foto previa:', e?.message || e);
      }
    }

    // Subir nueva foto a Cloudinary
    const uploadResult = await cloudinary.uploader.upload(file.path, {
      folder: 'accescom/users',
      public_id: `user_${user.id}_${Date.now()}`,
      overwrite: true,
      resource_type: 'image',
      transformation: [
        { width: 400, height: 400, crop: 'fill', gravity: 'face' },
      ],
    });

    // Borrar archivo temporal
    safeUnlink(file.path);

    // Guardar URL y public_id en la BD
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        photoUrl: uploadResult.secure_url,
        photoPublicId: uploadResult.public_id,
      },
      select: { id: true, photoUrl: true, photoPublicId: true },
    });

    return res.json({
      ok: true,
      message: 'Foto actualizada correctamente',
      photoUrl: updated.photoUrl,
    });
  } catch (err) {
    console.error('Error subiendo foto:', err);
    safeUnlink(file.path);
    const msg = err.message?.includes('Formato no soportado')
      ? err.message
      : 'Error al subir la foto';
    return res.status(500).json({ ok: false, error: msg });
  }
}

/**
 * POST /api/import/photos
 *  - Pensado para formularios que envían el campo "photo"
 *  - Requiere rol ADMIN
 */
router.post(
  '/import/photos',
  auth,
  requireRole(['ADMIN']),
  upload.single('photo'),
  (req, res) => {
    processSinglePhotoUpload(req, res);
  }
);

/**
 * POST /api/import-photos
 *  - Mismo comportamiento, pero esperando campo "file"
 *  - Esta ruta empata con lo que veías en Network como "import-photos"
 */
router.post(
  '/import-photos',
  auth,
  requireRole(['ADMIN']),
  upload.single('file'),
  (req, res) => {
    processSinglePhotoUpload(req, res);
  }
);

/**
 * Lógica para borrar la foto de un usuario (y el recurso en Cloudinary)
 */
async function deleteUserPhoto(req, res) {
  const { boletaOrEmail } = req.params;

  if (!boletaOrEmail) {
    return res
      .status(400)
      .json({ ok: false, error: 'Falta boleta o correo' });
  }

  try {
    const clave = boletaOrEmail.trim();
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ boleta: clave }, { email: clave.toLowerCase() }],
      },
      select: { id: true, photoPublicId: true },
    });

    if (!user) {
      return res
        .status(404)
        .json({ ok: false, error: 'Usuario no encontrado' });
    }

    if (user.photoPublicId) {
      try {
        await cloudinary.uploader.destroy(user.photoPublicId);
      } catch (e) {
        console.warn(
          'Error destruyendo recurso Cloudinary:',
          e?.message || e
        );
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { photoUrl: null, photoPublicId: null },
    });

    return res.json({ ok: true, message: 'Foto eliminada correctamente' });
  } catch (err) {
    console.error('Error eliminando foto:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Error al eliminar la foto' });
  }
}

/**
 * DELETE /api/import/photos/:boletaOrEmail
 */
router.delete(
  '/import/photos/:boletaOrEmail',
  auth,
  requireRole(['ADMIN']),
  (req, res) => {
    deleteUserPhoto(req, res);
  }
);

/**
 * DELETE /api/import-photos/:boletaOrEmail
 *  - Variante que empata con nombre "import-photos"
 */
router.delete(
  '/import-photos/:boletaOrEmail',
  auth,
  requireRole(['ADMIN']),
  (req, res) => {
    deleteUserPhoto(req, res);
  }
);

module.exports = router;
