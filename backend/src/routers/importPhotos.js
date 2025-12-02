// backend/src/routers/importPhotos.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const AdmZip = require('adm-zip');
const { PrismaClient } = require('@prisma/client');

const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const cloudinary = require('../utils/cloudinary');

const prisma = new PrismaClient();
const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'temp', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 20 * 1024 * 1024 },
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
   POST /api/admin/import-photos (UNIFICADO)
   ========================================================= */
router.post(
  '/admin/import-photos',
  auth,
  requireRole(['ADMIN']),
  upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'file', maxCount: 1 }
  ]),
  async (req, res) => {
    const { boletaOrEmail } = req.body;
    
    // Detectar qué campo se usó
    const file = req.files?.photo?.[0] || req.files?.file?.[0];

    if (!file) {
      return res.status(400).json({ ok: false, error: 'Falta archivo (campo "photo" o "file")' });
    }

    const ext = path.extname(file.originalname).toLowerCase();

    // CASO 1: Subida individual desde perfil (con boletaOrEmail en body)
    if (boletaOrEmail) {
      console.log('📸 [admin/import-photos] Individual con boletaOrEmail:', boletaOrEmail);
      try {
        if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
          safeUnlink(file.path);
          return res.status(400).json({
            ok: false,
            error: 'Formato no soportado (usa JPG o PNG)'
          });
        }

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

        if (user.photoPublicId) {
          try {
            await cloudinary.uploader.destroy(user.photoPublicId);
          } catch (e) {
            console.warn('No se pudo destruir foto previa:', e?.message || e);
          }
        }

        const uploadResult = await cloudinary.uploader.upload(file.path, {
          folder: 'accescom/users',
          public_id: `user_${user.id}`, // ✅ Sin timestamp
          overwrite: true,
          invalidate: true, // ✅ AGREGAR
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
          message: 'Foto actualizada correctamente',
          photoUrl: uploadResult.secure_url
        });
      } catch (err) {
        console.error('Error subiendo foto individual:', err);
        safeUnlink(file.path);
        return res.status(500).json({ ok: false, error: 'Error al subir la foto' });
      }
    }

    // CASO 2: Importación masiva ZIP
    if (ext === '.zip') {
      console.log('📦 [admin/import-photos] Importación masiva ZIP');
      const zip = new AdmZip(file.path);
      const entries = zip.getEntries();

      let processed = 0;
      let updated = 0;
      let skippedNoUser = 0;
      let errors = 0;
      const photoErrors = []; // Array de errores detallados

      try {
        for (const entry of entries) {
          if (entry.isDirectory) continue;

          const entryExt = path.extname(entry.entryName).toLowerCase();
          const fileName = entry.entryName;
          
          // ✅ NUEVO: Validar formato ANTES de continuar
          if (!['.jpg', '.jpeg', '.png'].includes(entryExt)) {
            photoErrors.push({
              fileName,
              reason: `Formato no soportado (${entryExt}). Solo se aceptan .jpg, .jpeg, .png`
            });
            errors++;
            continue;
          }

          const boleta = path.basename(entry.entryName, entryExt).trim();
          if (!boleta) {
            photoErrors.push({
              fileName,
              reason: 'Nombre de archivo inválido (no se pudo extraer boleta)'
            });
            errors++;
            continue;
          }

          processed++;

          try {
            const user = await prisma.user.findFirst({
              where: { boleta },
              select: { id: true, photoPublicId: true, boleta: true }
            });

            if (!user) {
              photoErrors.push({
                fileName,
                boleta,
                reason: 'Boleta no existe en la base de datos'
              });
              skippedNoUser++;
              continue;
            }

            if (user.photoPublicId) {
              try {
                await cloudinary.uploader.destroy(user.photoPublicId);
              } catch (e) {
                console.warn('No se pudo destruir foto previa:', boleta, e?.message || e);
              }
            }

            const buffer = entry.getData();
            const publicId = `user_${user.id}`; // ✅ Sin timestamp para evitar duplicados

            const uploadResult = await uploadBufferToCloudinary(buffer, publicId);

            await prisma.user.update({
              where: { id: user.id },
              data: {
                photoUrl: uploadResult.secure_url,
                photoPublicId: uploadResult.public_id
              }
            });

            updated++;
            console.log(`✅ Foto asociada: ${boleta} → ${uploadResult.public_id}`);
          } catch (e) {
            console.error('Error procesando foto de', boleta, e);
            photoErrors.push({
              fileName,
              boleta,
              reason: `Error al subir a Cloudinary: ${e.message}`
            });
            errors++;
          }
        }

        safeUnlink(file.path);

        return res.json({
          ok: true,
          message: 'Importación de fotos completada',
          stats: { 
            processed, 
            updated, 
            skippedNoUser, 
            errors,
            photoErrors: photoErrors.length > 0 ? photoErrors : undefined // ✅ NUEVO
          }
        });
      } catch (err) {
        console.error('Error general leyendo ZIP:', err);
        safeUnlink(file.path);
        return res.status(500).json({ ok: false, error: 'Error al procesar el ZIP' });
      }
    }

    // CASO 3: Archivo individual (nombre = boleta)
    console.log('📸 [admin/import-photos] Individual con nombre de archivo como boleta');
    try {
      if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
        safeUnlink(file.path);
        return res.status(400).json({
          ok: false,
          error: 'Formato no soportado (usa JPG o PNG)'
        });
      }

      const boleta = path.basename(file.originalname, ext).trim();
      if (!boleta) {
        safeUnlink(file.path);
        return res.status(400).json({
          ok: false,
          error: 'El nombre del archivo debe ser la boleta, por ejemplo 2022630539.jpg'
        });
      }

      const user = await prisma.user.findFirst({
        where: { boleta },
        select: { id: true, photoPublicId: true }
      });

      if (!user) {
        safeUnlink(file.path);
        return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
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
        public_id: `user_${user.id}`, // ✅ Sin timestamp
        overwrite: true,
        invalidate: true, // ✅ AGREGAR
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
      return res.status(500).json({ ok: false, error: 'Error al subir la foto' });
    }
  }
);

/* =========================================================
   DELETE /api/admin/import-photos/:boletaOrEmail
   ========================================================= */
router.delete(
  '/admin/import-photos/:boletaOrEmail',
  auth,
  requireRole(['ADMIN']),
  async (req, res) => {
    console.log('🗑️ [delete-photo] para', req.params.boletaOrEmail);
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
