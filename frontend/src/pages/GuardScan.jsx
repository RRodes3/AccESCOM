// frontend/src/pages/GuardScan.jsx
import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../services/api';

export default function GuardScan() {
  const regionId = 'reader';
  const scannerRef = useRef(null);
  // indicador de estado para saber si se inició el escáner
  const isStartedRef = useRef(false);
  const [msg, setMsg] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    // si ya existe una instancia previa, no crear otra
    if (!scannerRef.current) {
      const scanner = new Html5Qrcode(regionId);
      scannerRef.current = scanner;

      const config = { fps: 10, qrbox: { width: 250, height: 250 } };

      scanner.start(
        { facingMode: 'environment' },
        config,
        async (text) => {
          setMsg('Validando…');
          try {
            // pausar para no leer dos veces el mismo código
            await scanner.pause();
            const { data } = await api.post('/qr/validate', { code: text });
            setResult({ ok: data.ok, owner: data.owner, reason: data.reason });
          } catch (err) {
            setResult({ ok: false, reason: err?.response?.data?.reason || 'Error validando' });
          } finally {
            setMsg('');
            // reanudar el escáner para seguir leyendo códigos
            await scanner.resume();
          }
        },
        () => {/* errores de lectura silenciosos */},
      ).then(() => {
        isStartedRef.current = true;
      }).catch((err) => {
        console.error('Error al iniciar Html5Qrcode:', err);
        setMsg('Error iniciando cámara');
      });
    }

    // cleanup: detener y limpiar al desmontar
    return () => {
      const scanner = scannerRef.current;
      if (scanner) {
        if (isStartedRef.current) {
          // sólo detener si estaba corriendo o pausado
          scanner.stop()
            .then(() => scanner.clear())
            .catch(() => {/* ignore */});
        } else {
          // si no se llegó a iniciar, limpiar el contenedor
          const el = document.getElementById(regionId);
          if (el) el.innerHTML = '';
        }
        scannerRef.current = null;
        isStartedRef.current = false;
      }
    };
  }, []);

  return (
    <div className="container mt-3" style={{ maxWidth: 520 }}>
      <h4>Escaneo de QR (Guardia)</h4>
      <div id={regionId}></div>
      {msg && <div className="alert alert-warning mt-3">{msg}</div>}
      {result && result.ok && (
        <div className="alert alert-success mt-3">
          Acceso PERMITIDO a: <b>{result.owner?.name}</b> ({result.owner?.email})
        </div>
      )}
      {result && result.ok === false && (
        <div className="alert alert-danger mt-3">
          Acceso DENEGADO: {result.reason}
        </div>
      )}
    </div>
  );
}
