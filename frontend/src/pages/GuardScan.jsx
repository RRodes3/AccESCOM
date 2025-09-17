import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../services/api';
import { useNavigate } from 'react-router-dom';

// Tono corto alto (ok) o grave (denegado)
function playFeedback(ok) {
  // Web Audio: tono corto alto (ok) o grave (denegado)
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.value = ok ? 880 : 220; // Hz
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + 0.28);
}



/** Tarjeta de resultado (autorizado/denegado) */
function ScanResultCard({ ok, kind, owner, reason, onScanAgain, onBack }) {
  const approved = ok === true;

  // Mapea roles para mostrar
  const roleLabel = { ADMIN: 'Administrador', USER: 'Alumno', GUARD: 'Guardia' };

  // Encabezado según tipo y resultado de QR
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
            <p className="mb-1"><b>Usuario:</b> {roleLabel[owner?.role] || owner?.role || '—'}</p>
            <p className="mb-1">
              <b>Nombre:</b>{' '}
              {[owner?.firstName, owner?.lastNameP, owner?.lastNameM].filter(Boolean).join(' ')
               || owner?.name || '—'}
            </p>
            <p className="mb-1"><b>No. boleta:</b> {owner?.boleta || '—'}</p>
            <p className="mb-1"><b>Email:</b> {owner?.email || '—'}</p>

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
            <p className="mb-0">
              {reason || 'Código QR duplicado/expirado. Solicita un QR nuevo o credencial.'}
            </p>
            <p className="mt-3 mb-0">Última opción: registro manual.</p>
          </div>
        )}
      </div>

      {/* Botones */}
      <div className="d-grid gap-2 mt-4">
        <button type="button" className="btn btn-primary btn-lg" onClick={onScanAgain}>
          Escanear nuevo código QR
        </button>
        <button type="button" className="btn btn-outline-primary" onClick={onBack}>
          Regresar al menú
        </button>
      </div>
    </div>
  );
}


/** Página de escaneo de QR (guardia) */
export default function GuardScan() {
  const regionId = 'reader';
  const scannerRef   = useRef(null);    // instancia Html5Qrcode
  const startingRef  = useRef(false);   // evita start() concurrente
  const startedRef   = useRef(false);   // sabemos si está corriendo
  const [msg, setMsg] = useState('');
  const [running, setRunning] = useState(false);

  // resultado del backend -> { ok: boolean, owner?: {...}, reason?: string }
  const [result, setResult] = useState(null);
  const navigate = useNavigate();

  const clearContainer = () => {
    const el = document.getElementById(regionId);
    if (el) el.innerHTML = '';
  };

  const stopScanner = useCallback(async () => {
    if (!startedRef.current || !scannerRef.current){
    // aunque “creamos” que no está corriendo, intenta apagar cualquier stream
    hardStopCamera(`#${regionId}`);
    return;}
    const scanner = scannerRef.current;
    try {
      await scanner.stop().catch(() => {});   // apaga cámara (best effort)
      await scanner.clear().catch(() => {});  // limpia DOM
    } catch {
      clearContainer();
    } finally {
      // Fallback duro: por si el stop() no logró cortar los tracks
      hardStopCamera(`#${regionId}`);
      startedRef.current = false;
      setRunning(false);
      scannerRef.current = null; // fuerza nueva creación en próximo start
      setMsg(''); // no mostrar alertas mientras está detenido
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (startingRef.current || startedRef.current) return;
    startingRef.current = true;
    try {
      setMsg(''); // limpia mensajes previos
      if (!scannerRef.current) scannerRef.current = new Html5Qrcode(regionId);
      else clearContainer();
      // Por si quedó un stream “huérfano” de un intento previo
      hardStopCamera(`#${regionId}`);

      const scanner = scannerRef.current;
      const config = { fps: 10, qrbox: { width: 260, height: 260 } };

      await scanner.start(
        { facingMode: 'environment' },
        config,
        async (text) => {
          setMsg('Validando…');
          try {
            // Pausa para evitar lecturas repetidas durante la validación
            await scanner.pause();

            const { data } = await api.post('/qr/validate', { code: text });
            playFeedback(!!data.ok);                // ← beep "positivo"
            // Guardamos resultado; NO reanudamos: mostramos pantalla de resultado
            setResult({ ok: data.ok, kind: data.pass?.kind, owner: data.owner, reason: data.reason });
          } catch (e) {
            playFeedback(false);                    // ← beep "negativo"
            setResult({
              ok: false,
              reason: e?.response?.data?.reason || 'Error validando',
            });
          } finally {
            setMsg(''); // limpia mensaje de validando
            // detén la cámara al terminar el ciclo de validación y mostrar pantalla
            await stopScanner(); // esto también ejecuta el hardStop
          }
        },
        () => { /* errores de escaneo ignorados */ }
      );

      startedRef.current = true;
      setRunning(true);
      setMsg(''); //asegurar que no quede mensaje
    } catch (err) {
      console.error('Error start scanner:', err);
      setMsg('No se pudo iniciar la cámara');
      try { await scannerRef.current?.clear?.(); } catch {}
      hardStopCamera(`#${regionId}`);
      scannerRef.current = null;
    } finally {
      startingRef.current = false;
    }
  }, [stopScanner]);

  // Montaje: arranca al entrar
  useEffect(() => {
    clearContainer();
    startScanner();
    return () => { stopScanner(); 
    hardStopCamera(`#${regionId}`);
    };
  }, [startScanner, stopScanner]);

  // Botones de la tarjeta
  const handleScanAgain = () => {
    setMsg(''); // limpia cualquier alerta previa
    setResult(null);
    setTimeout(() => { startScanner(); }, 0);
  };

  const handleBack = () => {
    navigate('/dashboard');
  };

  // Si hay resultado, mostramos la tarjeta en lugar del visor
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

  // Vista normal (lector + estado)
  return (
    <div className="container mt-3" style={{ maxWidth: 520 }}>
      <div className="d-flex align-items-center justify-content-between">
        <h4>Escaneo de QR (Guardia)</h4>
        <div>
          {!running ? (
            <button className="btn btn-success btn-sm" onClick={startScanner}>
              Iniciar escaneo
            </button>
          ) : (
            <button className="btn btn-danger btn-sm" onClick={stopScanner}>
              Detener escaneo
            </button>
          )}
        </div>
      </div>

      <div
        id={regionId}
        style={{ background: '#0f0f0f', borderRadius: 8, padding: 8 }}
        className="mt-2"
      />

      {/* Cuando no está corriendo, muestra “Regresar al menú” */}
      {!running && (
        <div className="mt-3 d-flex justify-content-end">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => navigate('/dashboard')}
          >
            Regresar al menú
          </button>
        </div>
      )}

      {msg && <div className="alert alert-warning mt-3">{msg}</div>}
    </div>
  );
  // Mata cualquier stream activo (fallback por si html5-qrcode no libera bien)
  function hardStopCamera(regionSelector = '#reader') {
    // primero intenta en el contenedor del lector
    const scoped = document.querySelectorAll(`${regionSelector} video`);
    const all = scoped.length ? scoped : document.querySelectorAll('video');
    all.forEach(v => {
      try {
        const src = v.srcObject;
        if (src && typeof src.getTracks === 'function') {
          src.getTracks().forEach(t => {
            try { t.stop(); } catch {}
          });
        }
        v.srcObject = null;
        v.removeAttribute('src'); // Safari/Firefox a veces lo agradecen
        v.load?.();
      } catch {}
    });
  }

}
