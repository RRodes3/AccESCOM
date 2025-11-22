import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../services/api';
import { useNavigate } from 'react-router-dom';
import LastAccessesTable from '../components/LastAccessesTable';
import '../components/Common.css';

/* ---------- Configuración de URLs ---------- */
// Obtener la base del backend desde la configuración de API
const API_BASE_URL = api.defaults.baseURL || '/api';
// Remover el /api final para obtener la raíz del servidor
const ASSETS_BASE_URL =
  process.env.REACT_APP_ASSETS_BASE_URL ||
  API_BASE_URL.replace(/\/api\/?$/, '');

/* ---------- beep corto OK/FAIL ---------- */
function playFeedback(ok) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.value = ok ? 880 : 220;
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + 0.28);
}

/* ---------- Normalizador del resultado del backend ---------- */
function normalizeScanPayload(raw) {
  if (!raw) raw = {};
  return {
    ok: !!raw.ok,
    result: raw.result || null,
    kind: raw.pass?.kind || raw.kind || null,
    owner: raw.owner || null,
    reason: raw.reason || '',
  };
}

/* ---------- Tarjeta de resultado ---------- */
function ScanResultCard({ ok, kind, owner, reason, onScanAgain, onBack }) {
  // Estados semánticos
  const isAllowed = ok === true;
  const lowerReason = (reason || '').toLowerCase();

  // Casos que consideramos "advertencia" (amarillo)
  const isWarning =
    !isAllowed &&
    (
      // Usuario institucional ya dentro / fuera
      lowerReason.includes('ya está dentro') ||
      lowerReason.includes('ya esta dentro') ||
      lowerReason.includes('se encuentra dentro') ||
      lowerReason.includes('se encuentra fuera') ||
      lowerReason.includes('ya está fuera') ||
      lowerReason.includes('ya esta fuera') ||

      // Usuario aún no ha entrado
      lowerReason.includes('aún no ha entrado') ||
      lowerReason.includes('aun no ha entrado') ||

      // Visita de invitado ya completada
      lowerReason.includes('visita completada')
    );

  const isHardDeny = !isAllowed && !isWarning;

  // Colores de franja
  const bannerClass = isAllowed
    ? 'bg-success'
    : isWarning
    ? 'bg-warning text-dark'
    : 'bg-danger';

  // Texto del encabezado
  const heading = isAllowed
    ? kind === 'EXIT'
      ? 'Salida permitida'
      : 'Acceso permitido'
    : isWarning
    ? 'Advertencia'
    : kind === 'EXIT'
    ? 'Salida denegada'
    : 'Acceso denegado';

  const institutionalLabel = {
    STUDENT: 'Alumno',
    TEACHER: 'Docente',
    PAE: 'PAE',
  };

  // Construcción de URL completa de foto
  const photoSrc = owner?.photoUrl
    ? (owner.photoUrl.startsWith('http')
        ? owner.photoUrl
        : `${ASSETS_BASE_URL.replace(/\/+$/, '')}/${owner.photoUrl.replace(/^\/+/, '')}`)
    : null;

  return (
    <div className="container mt-3 scan-result-card" style={{ maxWidth: 560 }}>
      {/* Banner de estado */}
      <div className={`rounded-3 text-white text-center fw-bold py-2 ${bannerClass}`}>
        {heading}
      </div>

      {/* Tarjeta de datos */}
      <div className="bg-secondary bg-opacity-75 text-white rounded-3 p-3 mt-3">
        {/* Mensaje de razón */}
        {!isAllowed && (
          <p className="mb-3 text-center fw-semibold" style={{ whiteSpace: 'pre-line' }}>
            {reason || 'Operación no válida'}
          </p>
        )}

        {/* Datos del dueño del QR (solo si existe) */}
        {owner && (
          <>
            <p className="mb-1">
              <b>Tipo:</b>{' '}
              {owner.kind === 'GUEST' || owner.role === 'GUEST'
                ? 'Invitado'
                : `Usuario institucional — ${
                    institutionalLabel[owner.institutionalType] || '—'
                  }`}
            </p>

            <p className="mb-1">
              <b>Nombre:</b>{' '}
              {[owner.firstName, owner.lastNameP, owner.lastNameM]
                .filter(Boolean)
                .join(' ') || owner.name || '—'}
            </p>

            {owner.boleta && (
              <p className="mb-1">
                <b>No. boleta:</b> {owner.boleta}
              </p>
            )}

            {owner.email && (
              <p className="mb-1">
                <b>Email:</b> {owner.email}
              </p>
            )}

            {owner.curp && (
              <p className="mb-1">
                <b>CURP:</b> {owner.curp}
              </p>
            )}

            {owner.reason && (
              <p className="mb-1">
                <b>Motivo visita:</b> {owner.reason}
              </p>
            )}

            {/* Foto si la hay */}
            <div className="d-flex flex-column align-items-center mt-3">
              <div
                style={{
                  width: 160,
                  height: 160,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: '#d9a89c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {photoSrc ? (
                  <img
                    src={photoSrc}
                    alt="Foto del usuario"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      console.error('Error cargando foto en escaneo:', photoSrc);
                      console.error('Owner data:', owner);
                      e.target.style.display = 'none';
                      e.target.parentElement.innerHTML = `<span style="font-size: 3rem; color: #333; font-weight: bold;">${
                        (owner.firstName?.[0] || owner.name?.[0] || 'U').toUpperCase()
                      }</span>`;
                    }}
                    onLoad={() => {
                      console.log('✅ Foto cargada correctamente:', photoSrc);
                    }}
                  />
                ) : (
                  <span
                    style={{
                      fontSize: '3rem',
                      color: '#333',
                      fontWeight: 'bold',
                    }}
                  >
                    {(owner.firstName?.[0] || owner.name?.[0] || 'U').toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Botones */}
      <div className="d-grid gap-2 mt-4">
        <button type="button" className="btn btn-primary btn-lg" onClick={onScanAgain}>
          Escanear nuevo código
        </button>
        <button type="button" className="btn btn-outline-primary" onClick={onBack}>
          Regresar al menú
        </button>
      </div>
    </div>
  );
}

/* ---------- Página de escaneo ---------- */
export default function GuardScan() {
  const regionId = 'reader';
  const navigate = useNavigate();

  // 'reader' (lector USB HID) | 'camera' (webcam)
  const [mode, setMode] = useState('reader');

  const scannerRef = useRef(null);
  const startingRef = useRef(false);
  const startedRef = useRef(false);

  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');
  const [result, setResult] = useState(null);

  const [readerReady, setReaderReady] = useState(false);
  const bufferRef = useRef({ str: '', last: 0 });

  /* ---------- util ---------- */
  const clearContainer = () => {
    const el = document.getElementById(regionId);
    if (el) el.innerHTML = '';
  };

  const hardStopCamera = (regionSelector = `#${regionId}`) => {
    const scoped = document.querySelectorAll(`${regionSelector} video`);
    const all = scoped.length ? scoped : document.querySelectorAll('video');
    all.forEach((v) => {
      try {
        const src = v.srcObject;
        if (src && typeof src.getTracks === 'function') {
          src.getTracks().forEach((t) => {
            try {
              t.stop();
            } catch {}
          });
        }
        v.srcObject = null;
        v.removeAttribute('src');
        v.load?.();
      } catch {}
    });
  };

  /* ---------- stopScanner (cámara) ---------- */
  const stopScanner = useCallback(async () => {
    if (!startedRef.current || !scannerRef.current) {
      hardStopCamera();
      setRunning(false);
      return;
    }
    const scanner = scannerRef.current;
    try {
      await scanner.stop().catch(() => {});
      await scanner.clear().catch(() => {});
    } catch {
      clearContainer();
    } finally {
      hardStopCamera();
      scannerRef.current = null;
      startedRef.current = false;
      setRunning(false);
    }
  }, []);

  /* ---------- Validar código (común a cámara y lector) ---------- */
  const handleValidate = useCallback(async (code) => {
    try {
      const { data } = await api.post('/qr/validate', { code });
      const normalized = normalizeScanPayload(data);
      setResult(normalized);
      playFeedback(!!normalized.ok);
      return data;
    } catch (e) {
      const errData =
        e?.response?.data || {
          ok: false,
          result: 'ERROR',
          reason: 'Error al validar',
          owner: null,
        };
      const normalized = normalizeScanPayload(errData);
      setResult(normalized);
      playFeedback(false);
      return errData;
    }
  }, []);

  /* ---------- startScanner (cámara) ---------- */
  const startScanner = useCallback(async () => {
    if (startingRef.current || startedRef.current) return;
    startingRef.current = true;
    try {
      setMsg('');
      if (!scannerRef.current) scannerRef.current = new Html5Qrcode(regionId);
      else clearContainer();

      hardStopCamera();

      const scanner = scannerRef.current;
      const config = { fps: 10, qrbox: { width: 260, height: 260 } };

      await scanner.start(
        { facingMode: 'environment' },
        config,
        async (text) => {
          await stopScanner();      // detener cámara al primer código
          await handleValidate(text);
        },
        () => {}
      );

      startedRef.current = true;
      setRunning(true);
      setMsg('');
    } catch (err) {
      console.error('Error start scanner:', err);
      setMsg('No se pudo iniciar la cámara');
      try {
        await scannerRef.current?.clear?.();
      } catch {}
      hardStopCamera();
      scannerRef.current = null;
    } finally {
      startingRef.current = false;
    }
  }, [handleValidate, stopScanner]);

  /* ---------- Efecto: cambio de modo ---------- */
  useEffect(() => {
    if (mode === 'camera') {
      clearContainer();
      startScanner();
    } else {
      stopScanner();
      clearContainer();
    }
    return () => {};
  }, [mode, startScanner, stopScanner]);

  /* ---------- cleanup global ---------- */
  useEffect(() => {
    return () => {
      stopScanner();
      hardStopCamera();
    };
  }, [stopScanner]);

  /* ---------- Lector USB (HID) ---------- */
  useEffect(() => {
    if (mode !== 'reader') return;

    const onKeyDown = (e) => {
      const a = document.activeElement;
      const typing =
        a &&
        (a.tagName === 'INPUT' ||
          a.tagName === 'TEXTAREA' ||
          a.isContentEditable);
      if (typing) return;

      const now = Date.now();
      const dt = now - (bufferRef.current.last || 0);
      if (dt > 250) bufferRef.current.str = '';
      bufferRef.current.last = now;

      if (e.key === 'Enter' || e.key === 'NumpadEnter') {
        const code = bufferRef.current.str.trim();
        bufferRef.current.str = '';
        if (code.length >= 6) {
          if (!readerReady) setReaderReady(true);
          handleValidate(code);
        }
        return;
      }

      if (e.key.length === 1) bufferRef.current.str += e.key;
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, handleValidate, readerReady]);

  /* ---------- Handlers UI ---------- */
  const handleScanAgain = () => {
    setResult(null);
    setMsg('');
    if (mode === 'camera') startScanner();
  };

  const handleBack = () => navigate('/dashboard');

  /* ---------- UI ---------- */
  if (result) {
    return (
      <ScanResultCard
        ok={result.ok}
        kind={result.kind}
        owner={result.owner}
        reason={result.reason}
        onScanAgain={handleScanAgain}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="container mt-3 scan-result-card" style={{ maxWidth: 560 }}>
      <div className="d-flex align-items-center justify-content-between">
        <h4>Escaneo (Guardia)</h4>

        <div className="btn-group">
          <button
            className={`btn btn-sm ${
              mode === 'reader' ? 'btn-primary' : 'btn-outline-primary'
            }`}
            onClick={() => setMode('reader')}
            title="Usar lector USB (HID)"
          >
            Usar lector
          </button>
          <button
            className={`btn btn-sm ${
              mode === 'camera' ? 'btn-primary' : 'btn-outline-primary'
            }`}
            onClick={() => setMode('camera')}
            title="Usar cámara del dispositivo"
          >
            Escanear con cámara
          </button>
        </div>
      </div>

      {mode === 'camera' && (
        <>
          <div
            id={regionId}
            style={{ background: '#0f0f0f', borderRadius: 8, padding: 8 }}
            className="mt-2"
          />
          <div className="mt-2">
            {!running ? (
              <button
                className="btn btn-success btn-sm me-2"
                onClick={startScanner}
              >
                Iniciar escaneo
              </button>
            ) : (
              <button
                className="btn btn-danger btn-sm me-2"
                onClick={stopScanner}
              >
                Detener escaneo
              </button>
            )}
          </div>
        </>
      )}

      {mode === 'reader' && (
        <div
          className={`alert ${
            readerReady ? 'alert-info' : 'alert-warning'
          } mt-3 mb-0`}
        >
          <b>{readerReady ? 'Lector listo:' : 'Esperando lector:'}</b>{' '}
          {readerReady
            ? 'acerca el QR al escáner (HID). Acepta CR/LF o timeout.'
            : 'conecta tu escáner HID y realiza un primer escaneo para detectar el dispositivo.'}
        </div>
      )}

      {!running && mode === 'camera' && (
        <div className="mt-3 d-flex justify-content-end">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={handleBack}
          >
            Regresar al menú
          </button>
        </div>
      )}

      {msg && <div className="alert alert-warning mt-3">{msg}</div>}

      {/* Mensaje de soporte */}
      <div className="soporte-box">
        <p className="soporte-texto">
          ¿Algún problema con el lector o el acceso?{" "}
          <a href="mailto:AccESCOM.app@gmail.com" className="soporte-link">
            Contáctanos aquí
          </a>.
        </p>
      </div>

      <LastAccessesTable />
    </div>
  );
}
