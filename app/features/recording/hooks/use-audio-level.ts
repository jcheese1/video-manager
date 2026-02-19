import { useEffect, useRef, useState } from "react";

/**
 * Samples the RMS dB level from a MediaStream at ~60fps.
 * Returns a smoothed dB value (EMA) suitable for driving a VU meter.
 */
export function useAudioLevel(opts: {
  mediaStream: MediaStream | null;
  isRecording: boolean;
}): number {
  const [db, setDb] = useState(-Infinity);
  const dbRef = useRef(-Infinity);
  const rafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    if (!opts.mediaStream || !opts.isRecording) {
      setDb(-Infinity);
      dbRef.current = -Infinity;
      return;
    }

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(opts.mediaStream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.3;
    source.connect(analyser);

    analyserRef.current = analyser;
    dataRef.current = new Float32Array(
      analyser.fftSize
    ) as Float32Array<ArrayBuffer>;

    const SMOOTHING = 0.15; // EMA factor — lower = smoother

    const tick = () => {
      const data = dataRef.current;
      const an = analyserRef.current;
      if (!data || !an) return;

      an.getFloatTimeDomainData(data as Float32Array<ArrayBuffer>);

      // RMS
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        sum += data[i]! * data[i]!;
      }
      const rms = Math.sqrt(sum / data.length);
      const rawDb = 20 * Math.log10(rms + 1e-10);

      // Clamp
      const clamped = Math.max(-80, Math.min(0, rawDb));

      // EMA smoothing
      dbRef.current =
        dbRef.current === -Infinity
          ? clamped
          : dbRef.current + SMOOTHING * (clamped - dbRef.current);

      setDb(dbRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      source.disconnect();
      audioContext.close().catch(() => {});
      analyserRef.current = null;
      dataRef.current = null;
    };
  }, [opts.mediaStream, opts.isRecording]);

  return db;
}
