// backend/src/routers/profile.js
const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const cloudinary = require('../utils/cloudinary');

const prisma = new PrismaClient();
const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'temp', 'profile-uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Solo se permiten imágenes JPG/PNG'));
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

/* =========================================================
   POST /api/profile/photo - Actualizar foto de perfil
   ========================================================= */
router.post('/photo', auth, upload.single('photo'), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({ ok: false, error: 'Falta archivo de foto' });
  }

  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, photoPublicId: true }
    });

    if (!user) {
      safeUnlink(file.path);
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    // Eliminar foto anterior de Cloudinary si existe
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
      public_id: `user_${user.id}`, // ✅ SIN timestamp - siempre el mismo
      overwrite: true,
      invalidate: true, // ✅ Limpia caché de CDN
      resource_type: 'image',
      transformation: [
        { width: 400, height: 400, crop: 'fill', gravity: 'face' }
      ]
    });

    safeUnlink(file.path);

    // Actualizar en base de datos
    await prisma.user.update({
      where: { id: user.id },
      data: {
        photoUrl: uploadResult.secure_url,
        photoPublicId: uploadResult.public_id
      }
    });

    return res.json({
      ok: true,
      message: 'Foto actualizada correctamente',
      photoUrl: uploadResult.secure_url
    });
  } catch (err) {
    console.error('Error actualizando foto de perfil:', err);
    safeUnlink(file?.path);
    return res.status(500).json({ ok: false, error: 'Error al subir la foto' });
  }
});

/* =========================================================
   DELETE /api/profile/photo - Eliminar foto de perfil
   ========================================================= */
router.delete('/photo', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, photoPublicId: true }
    });

    if (!user) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    // Eliminar de Cloudinary si existe
    if (user.photoPublicId) {
      try {
        await cloudinary.uploader.destroy(user.photoPublicId);
      } catch (e) {
        console.warn('Error destruyendo recurso Cloudinary:', e?.message || e);
      }
    }

    // Actualizar en base de datos
    await prisma.user.update({
      where: { id: user.id },
      data: { photoUrl: null, photoPublicId: null }
    });

    return res.json({ ok: true, message: 'Foto eliminada correctamente' });
  } catch (err) {
    console.error('Error eliminando foto de perfil:', err);
    return res.status(500).json({ ok: false, error: 'Error al eliminar la foto' });
  }
});

module.exports = router;