// backend/src/routers/importPhotos.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');

const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const cloudinary = require('../utils/cloudinary'); // Debe exportar instancia configurada

const prisma = new PrismaClient();
const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'temp', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Formato no soportado (solo JPG/PNG)'));
    }
    cb(null, true);
  }
});

function safeUnlink(p) {
  if (!p) return;
  fs.unlink(p, (err) => {
    if (err) console.warn('No se pudo borrar temp:', p, err.message);
  });
}

// POST /api/admin/import/photos
router.post(
  '/import/photos',
  auth,
  requireRole(['ADMIN']),
  upload.single('photo'),
  async (req, res) => {
    const { boletaOrEmail } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ ok: false, error: 'Falta archivo "photo"' });
    if (!boletaOrEmail) {
      safeUnlink(file.path);
      return res.status(400).json({ ok: false, error: 'Falta boletaOrEmail' });
    }

    try {
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { boleta: boletaOrEmail.trim() },
            { email: boletaOrEmail.trim().toLowerCase() }
          ]
        },
        select: { id: true, photoPublicId: true }
      });

      if (!user) {
        safeUnlink(file.path);
        return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
      }

      // Destruir foto anterior si existe public_id
      if (user.photoPublicId) {
        try {
          await cloudinary.uploader.destroy(user.photoPublicId);
        } catch (e) {
          console.warn('No se pudo destruir foto previa:', e?.message || e);
        }
      }

      const uploadResult = await cloudinary.uploader.upload(file.path, {
        folder: 'accescom/users',
        public_id: `user_${user.id}_${Date.now()}`,
        overwrite: true,
        resource_type: 'image',
        transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }]
      });

      safeUnlink(file.path);

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          photoUrl: uploadResult.secure_url,
          photoPublicId: uploadResult.public_id
        },
        select: { id: true, photoUrl: true, photoPublicId: true }
      });

      return res.json({
        ok: true,
        message: 'Foto actualizada correctamente',
        photoUrl: updated.photoUrl
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
);

// DELETE /api/admin/import/photos/:boletaOrEmail (borra foto)
router.delete(
  '/import/photos/:boletaOrEmail',
  auth,
  requireRole(['ADMIN']),
  async (req, res) => {
    const { boletaOrEmail } = req.params;
    if (!boletaOrEmail) {
      return res.status(400).json({ ok: false, error: 'Falta boletaOrEmail' });
    }

    try {
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { boleta: boletaOrEmail.trim() },
            { email: boletaOrEmail.trim().toLowerCase() }
          ]
        },
        select: { id: true, photoPublicId: true }
      });

      if (!user) {
        return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
      }

      if (user.photoPublicId) {
        try {
          await cloudinary.uploader.destroy(user.photoPublicId);
        } catch (e) {
            console.warn('Error destruyendo recurso Cloudinary:', e?.message || e);
        }
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { photoUrl: null, photoPublicId: null }
      });

      return res.json({ ok: true, message: 'Foto eliminada correctamente' });
    } catch (err) {
      console.error('Error eliminando foto:', err);
      return res.status(500).json({ ok: false, error: 'Error al eliminar la foto' });
    }
  }
);

module.exports = router;
