// backend/src/routers/importPhotos.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const AdmZip = require('adm-zip');
const { PrismaClient } = require('@prisma/client');

const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const cloudinary = require('../utils/cloudinary'); // instancia configurada

const prisma = new PrismaClient();
const router = express.Router();

// Carpeta temporal para subir archivos
const uploadDir = path.join(__dirname, '..', '..', 'temp', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer: aceptar imágenes sueltas o ZIP
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB por si el ZIP es pesadito
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg',
      'image/png',
      'application/zip',
      'application/x-zip-compressed'
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Formato no soportado (solo JPG/PNG/ZIP)'));
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

// Helper para subir un buffer a Cloudinary
function uploadBufferToCloudinary(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'accescom/users',
        public_id: publicId,
        overwrite: true,
        resource_type: 'image',
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' }
        ]
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );

    stream.end(buffer);
  });
}

/* =========================================================
   1) IMPORTACIÓN MASIVA DESDE ZIP (pantalla Importación de BD)
   Endpoint que ya usa el front: POST /api/admin/import-photos
   Campo de archivo esperado: "file"
   - Si es ZIP: recorre todas las imágenes.
   - El nombre del archivo debe ser boleta, ej: 2022630539.jpg
   ========================================================= */
router.post(
  '/admin/import-photos',
  auth,
  requireRole(['ADMIN']),
  upload.single('file'),
  async (req, res) => {
    const file = req.file;

    if (!file) {
      return res
        .status(400)
        .json({ ok: false, error: 'Falta archivo (campo "file")' });
    }

    const ext = path.extname(file.originalname).toLowerCase();

    // --- CASO 1: ZIP con muchas fotos ---
    if (ext === '.zip') {
      const zip = new AdmZip(file.path);
      const entries = zip.getEntries();

      let processed = 0;
      let updated = 0;
      let skippedNoUser = 0;
      let errors = 0;

      try {
        for (const entry of entries) {
          if (entry.isDirectory) continue;

          const entryExt = path.extname(entry.entryName).toLowerCase();
          if (!['.jpg', '.jpeg', '.png'].includes(entryExt)) continue;

          const boleta = path
            .basename(entry.entryName, entryExt)
            .trim();

          if (!boleta) continue;

          processed++;

          try {
            const user = await prisma.user.findFirst({
              where: { boleta },
              select: { id: true, photoPublicId: true }
            });

            if (!user) {
              skippedNoUser++;
              continue;
            }

            // Si ya tenía foto, la borramos en Cloudinary
            if (user.photoPublicId) {
              try {
                await cloudinary.uploader.destroy(user.photoPublicId);
              } catch (e) {
                console.warn(
                  'No se pudo destruir foto previa:',
                  boleta,
                  e?.message || e
                );
              }
            }

            const buffer = entry.getData();
            const publicId = `user_${user.id}_${Date.now()}`;

            const uploadResult = await uploadBufferToCloudinary(
              buffer,
              publicId
            );

            await prisma.user.update({
              where: { id: user.id },
              data: {
                photoUrl: uploadResult.secure_url,
                photoPublicId: uploadResult.public_id
              }
            });

            updated++;
          } catch (e) {
            console.error('Error procesando foto de', boleta, e);
            errors++;
          }
        }

        safeUnlink(file.path);

        return res.json({
          ok: true,
          message: 'Importación de fotos completada',
          stats: { processed, updated, skippedNoUser, errors }
        });
      } catch (err) {
        console.error('Error general leyendo ZIP:', err);
        safeUnlink(file.path);
        return res
          .status(500)
          .json({ ok: false, error: 'Error al procesar el ZIP' });
      }
    }

    // --- CASO 2: una sola imagen suelta en este mismo flujo ---
    // Se asume nombre boleta.jpg / boleta.png
    try {
      const baseExt = ext;
      if (!['.jpg', '.jpeg', '.png'].includes(baseExt)) {
        safeUnlink(file.path);
        return res.status(400).json({
          ok: false,
          error: 'Formato no soportado (usa JPG o PNG)'
        });
      }

      const boleta = path.basename(file.originalname, baseExt).trim();
      if (!boleta) {
        safeUnlink(file.path);
        return res.status(400).json({
          ok: false,
          error:
            'El nombre del archivo debe ser la boleta, por ejemplo 2022630539.jpg'
        });
      }

      const user = await prisma.user.findFirst({
        where: { boleta },
        select: { id: true, photoPublicId: true }
      });

      if (!user) {
        safeUnlink(file.path);
        return res
          .status(404)
          .json({ ok: false, error: 'Usuario no encontrado' });
      }

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
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' }
        ]
      });

      safeUnlink(file.path);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          photoUrl: uploadResult.secure_url,
          photoPublicId: uploadResult.public_id
        }
      });

      return res.json({
        ok: true,
        message: 'Foto importada correctamente'
      });
    } catch (err) {
      console.error('Error subiendo foto individual:', err);
      safeUnlink(file.path);
      return res
        .status(500)
        .json({ ok: false, error: 'Error al subir la foto' });
    }
  }
);

/* =========================================================
   2) ENDPOINTS DE FOTO INDIVIDUAL (PUEDES REUTILIZARLOS
      PARA "EDITAR FOTO" DE UN USUARIO ESPECÍFICO)
   POST /api/import/photos  (body: boletaOrEmail, file: photo)
   DELETE /api/import/photos/:boletaOrEmail
   ========================================================= */

// Subir/actualizar una sola foto por boleta o email
router.post(
  '/import/photos',
  auth,
  requireRole(['ADMIN']),
  upload.single('photo'),
  async (req, res) => {
    const { boletaOrEmail } = req.body;
    const file = req.file;

    if (!file) {
      return res
        .status(400)
        .json({ ok: false, error: 'Falta archivo "photo"' });
    }
    if (!boletaOrEmail) {
      safeUnlink(file.path);
      return res
        .status(400)
        .json({ ok: false, error: 'Falta boletaOrEmail' });
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
        return res
          .status(404)
          .json({ ok: false, error: 'Usuario no encontrado' });
      }

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
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' }
        ]
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
      return res
        .status(500)
        .json({ ok: false, error: 'Error al subir la foto' });
    }
  }
);

// Eliminar foto por boleta o email
router.delete(
  '/import/photos/:boletaOrEmail',
  auth,
  requireRole(['ADMIN']),
  async (req, res) => {
    const { boletaOrEmail } = req.params;
    if (!boletaOrEmail) {
      return res
        .status(400)
        .json({ ok: false, error: 'Falta boletaOrEmail' });
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
        data: { photoUrl: null, photoPublicId: null }
      });

      return res.json({ ok: true, message: 'Foto eliminada correctamente' });
    } catch (err) {
      console.error('Error eliminando foto:', err);
      return res
        .status(500)
        .json({ ok: false, error: 'Error al eliminar la foto' });
    }
  }
);

module.exports = router;
