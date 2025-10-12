import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../services/api';
import { useNavigate } from 'react-router-dom';

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

/* ---------- Tarjeta de resultado ---------- */
function ScanResultCard({ ok, kind, owner, reason, onScanAgain, onBack }) {
  const approved = ok === true;
  const roleLabel = { 
    ADMIN: 'Administrador',
    USER: 'Usuario institucional',
    GUARD: 'Guardia',
    GUEST: 'Invitado'
  };
  const heading = approved
    ? (kind === 'EXIT' ? 'Salida permitida' : 'Acceso permitido')
    : (kind === 'EXIT' ? 'Salida denegada' : 'Acceso denegado');

  return (
    <div className="container mt-4" style={{ maxWidth: 420 }}>
      <div className={`rounded-3 text-white text-center fw-bold py-2 ${approved ? 'bg-success' : 'bg-danger'}`}>
        {heading}
      </div>

      <div className="bg-secondary bg-opacity-75 text-white rounded-3 p-3 mt-3">
        {approved ? (
          <>
            <p className="mb-1"><b>Tipo:</b> {roleLabel[owner?.role] || '—'}</p>

            <p className="mb-1">
              <b>Nombre:</b>{' '}
              {[owner?.firstName, owner?.lastNameP, owner?.lastNameM]
                .filter(Boolean)
                .join(' ') || owner?.name || '—'}
            </p>

            {owner?.role === 'GUEST' ? (
              <>
                <p className="mb-1"><b>CURP:</b> {owner?.curp || '—'}</p>
                <p className="mb-1"><b>Motivo visita:</b> {owner?.reason || '—'}</p>
              </>
            ) : (
              <>
                <p className="mb-1"><b>No. boleta:</b> {owner?.boleta || '—'}</p>
                <p className="mb-1"><b>Email:</b> {owner?.email || '—'}</p>
              </>
            )}

            <div className="d-flex justify-content-center mt-3">
              <div
                style={{
                  width: 160, height: 160, borderRadius: '50%',
                  background: '#d9a89c', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  color: '#333', fontWeight: 'bold'
                }}
              >
                {(owner?.firstName?.[0] || owner?.name?.[0] || 'U').toUpperCase()}
              </div>
            </div>
          </>
        ) : (
          <div style={{ whiteSpace: 'pre-line' }}>
            <p className="mb-0">{reason || 'Código QR duplicado/expirado. Solicita un QR nuevo o credencial.'}</p>
            <p className="mt-3 mb-0">Última opción: registro manual.</p>
          </div>
        )}
      </div>

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

  // Modo: 'reader' (lector USB HID) | 'camera' (webcam)
  const [mode, setMode] = useState('reader');

  // html5-qrcode refs
  const scannerRef  = useRef(null);
  const startingRef = useRef(false);
  const startedRef  = useRef(false);

  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');
  const [result, setResult] = useState(null);

  /* ---------- util ---------- */
  const clearContainer = () => {
    const el = document.getElementById(regionId);
    if (el) el.innerHTML = '';
  };

  const hardStopCamera = (regionSelector = `#${regionId}`) => {
    const scoped = document.querySelectorAll(`${regionSelector} video`);
    const all = scoped.length ? scoped : document.querySelectorAll('video');
    all.forEach(v => {
      try {
        const src = v.srcObject;
        if (src && typeof src.getTracks === 'function') {
          src.getTracks().forEach(t => { try { t.stop(); } catch {} });
        }
        v.srcObject = null;
        v.removeAttribute('src');
        v.load?.();
      } catch {}
    });
  };

  /* ---------- validación común (para ambos modos) ---------- */
  const handleCode = useCallback(async (code) => {
    setMsg('Validando…');

    // si veníamos de cámara, pausamos y/o detenemos
    if (startedRef.current) {
      try { await scannerRef.current?.pause?.(); } catch {}
    }

    try {
      const { data } = await api.post('/qr/validate', { code });
      playFeedback(!!data.ok);
      setResult({ ok: data.ok, kind: data.pass?.kind, owner: data.owner, reason: data.reason });
    } catch (e) {
      playFeedback(false);
      setResult({ ok: false, reason: e?.response?.data?.reason || 'Error validando' });
    } finally {
      setMsg('');
      // detenemos completamente la cámara si estaba activa
      if (startedRef.current) await stopScanner();
    }
  }, []); // eslint-disable-line

  /* ---------- Cámara ---------- */
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

  const startScanner = useCallback(async () => {
    if (startingRef.current || startedRef.current) return;
    startingRef.current = true;
    try {
      setMsg('');
      if (!scannerRef.current) scannerRef.current = new Html5Qrcode(regionId);
      else clearContainer();

      // asegurar que no hay streams huérfanos
      hardStopCamera();

      const scanner = scannerRef.current;
      const config = { fps: 10, qrbox: { width: 260, height: 260 } };

      await scanner.start(
        { facingMode: 'environment' },
        config,
        async (text) => { await handleCode(text); },
        () => {}
      );

      startedRef.current = true;
      setRunning(true);
      setMsg('');
    } catch (err) {
      console.error('Error start scanner:', err);
      setMsg('No se pudo iniciar la cámara');
      try { await scannerRef.current?.clear?.(); } catch {}
      hardStopCamera();
      scannerRef.current = null;
    } finally {
      startingRef.current = false;
    }
  }, [handleCode]);

  // Montaje / cambio de modo: enciende/apaga cámara según corresponda
  useEffect(() => {
    if (mode === 'camera') {
      clearContainer();
      startScanner();
    } else {
      // lector
      stopScanner();
      clearContainer();
    }
    return () => {};
  }, [mode, startScanner, stopScanner]);

  useEffect(() => {
    return () => { stopScanner(); hardStopCamera(); };
  }, [stopScanner]);

  /* ---------- Lector USB (HID) ---------- */
  useEffect(() => {
    if (mode !== 'reader') return;

    let timer = null;
    let buf = '';

    const flushIfAny = () => {
      const code = buf.trim();
      buf = '';
      if (code) handleCode(code);
    };

    const onKeyDown = (e) => {
      // Evita capturar si hay un input activo
      const a = document.activeElement;
      const typing = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
      if (typing) return;

      // Reinicia timeout de inactividad entre teclas
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { flushIfAny(); }, 120);

      if (e.key === 'Enter' || e.key === 'NumpadEnter') {
        flushIfAny();
      } else if (e.key.length === 1) {
        buf += e.key;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (timer) clearTimeout(timer);
    };
  }, [mode, handleCode]);

  /* ---------- Handlers de UI ---------- */
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
    <div className="container mt-3" style={{ maxWidth: 560 }}>
      <div className="d-flex align-items-center justify-content-between">
        <h4>Escaneo (Guardia)</h4>

        {/* Selector de modo */}
        <div className="btn-group">
          <button
            className={`btn btn-sm ${mode === 'reader' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setMode('reader')}
            title="Usar lector USB (HID)"
          >
            Usar lector
          </button>
          <button
            className={`btn btn-sm ${mode === 'camera' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setMode('camera')}
            title="Usar cámara del dispositivo"
          >
            Escanear con cámara
          </button>
        </div>
      </div>

      {/* Contenedor de cámara (solo visible en modo cámara) */}
      {mode === 'camera' && (
        <>
          <div
            id={regionId}
            style={{ background: '#0f0f0f', borderRadius: 8, padding: 8 }}
            className="mt-2"
          />
          <div className="mt-2">
            {!running ? (
              <button className="btn btn-success btn-sm me-2" onClick={startScanner}>
                Iniciar escaneo
              </button>
            ) : (
              <button className="btn btn-danger btn-sm me-2" onClick={stopScanner}>
                Detener escaneo
              </button>
            )}
          </div>
        </>
      )}

      {/* Indicador en modo lector */}
      {mode === 'reader' && (
        <div className="alert alert-info mt-3 mb-0">
          <b>Lector listo:</b> acerca el QR al escáner (HID). Acepta terminadores CR/LF o timeout.
        </div>
      )}

      {!running && mode === 'camera' && (
        <div className="mt-3 d-flex justify-content-end">
          <button type="button" className="btn btn-outline-secondary" onClick={handleBack}>
            Regresar al menú
          </button>
        </div>
      )}

      {msg && <div className="alert alert-warning mt-3">{msg}</div>}
    </div>
  );
}
