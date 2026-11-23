'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

// Web Speech API recogniser. Returns helpers + the `listening` flag, plus a
// live `level` (0…1 mic amplitude) and `interim` (streaming partial transcript)
// so a voice UI can render an animated orb reacting to the caller's voice.
// Falls back to a no-op when the browser doesn't support it (Firefox stable,
// Safari iOS < 14). Callers hide the mic button when `supported` is false. The
// amplitude meter is a best-effort side channel (getUserMedia + AnalyserNode);
// if it fails, voice still works and the orb just breathes.
//
// Extracted from KinematicAI.tsx so both KINI chat and the CRM "Fill with
// voice" lead-capture flow share one implementation.
export interface SpeechRecognitionApi {
  listening: boolean;
  supported: boolean;
  start: () => void;
  stop: () => void;
  cancel: () => void;
  level: number;   // 0…1 smoothed mic amplitude
  interim: string; // live partial transcript
  // Set when the recogniser reports an error (denied mic permission, no
  // speech detected, network issue, …) — null otherwise. Without this a
  // failure just flips `listening` back to false with no way for the caller
  // to know why, which reads as "I held the mic and nothing happened".
  error: string | null;
}

// Maps the Web Speech API's `SpeechRecognitionErrorEvent.error` code to a
// line a rep can act on. `undefined`/unknown codes that aren't worth
// surfacing (e.g. a harmless already-running race) return null.
function speechErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access is blocked for this site. Allow it in your browser’s site settings, then try again.';
    case 'audio-capture':
      return 'No microphone found. Check your device’s microphone and try again.';
    case 'network':
      return 'Voice service network error. Check your connection and try again.';
    case 'no-speech':
      return 'Didn’t hear anything — hold the mic and try again.';
    case 'aborted':
      return null; // the rep cancelled — not a failure worth surfacing
    case undefined:
      return null;
    default:
      return 'Voice input error. Try again, or type the details in.';
  }
}

export function useSpeechRecognition(
  { onResult, continuous = false }: { onResult: (text: string) => void; continuous?: boolean },
): SpeechRecognitionApi {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [level, setLevel] = useState(0);      // 0…1 smoothed mic amplitude
  const [interim, setInterim] = useState(''); // live partial transcript
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<any>(null);
  // Keep the latest onResult in a ref so the recogniser is set up once (no
  // teardown on every render) while still calling the current callback.
  const onResultRef = useRef(onResult);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  // Whether the recogniser keeps running across brief pauses (walkie-talkie
  // press-and-hold) instead of ending after the first utterance. Read via a
  // ref so the recogniser is still created once — each consumer passes a fixed
  // value, so the default-false KINI-chat path is unchanged.
  const continuousRef = useRef(continuous);
  useEffect(() => { continuousRef.current = continuous; }, [continuous]);
  // Amplitude-meter plumbing — separate from the recogniser so a getUserMedia
  // failure never breaks transcription.
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);

  const stopMeter = useCallback(() => {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* */ }
    streamRef.current = null;
    try { ctxRef.current?.close(); } catch { /* */ }
    ctxRef.current = null;
    setLevel(0);
  }, []);

  const startMeter = useCallback(async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / buf.length);
        // Gain up (speech RMS is small) + low-pass smooth so the orb reads
        // organic rather than jittery.
        setLevel(prev => prev * 0.6 + Math.min(1, rms * 3.2) * 0.4);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch { /* amplitude is best-effort */ }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);
    const rec = new SR();
    rec.continuous = continuousRef.current;
    rec.interimResults = true;
    rec.lang = 'en-IN';
    rec.onresult = (e: any) => {
      let finalText = '';
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0]?.transcript ?? '';
        if (r.isFinal) finalText += t; else interimText += t;
      }
      if (interimText) setInterim(interimText.trim());
      if (finalText.trim()) { setInterim(''); onResultRef.current(finalText.trim()); }
    };
    rec.onend = () => { setListening(false); setInterim(''); stopMeter(); };
    rec.onerror = (e: any) => { setListening(false); setInterim(''); stopMeter(); setError(speechErrorMessage(e?.error)); };
    recRef.current = rec;
    return () => { try { rec.abort(); } catch { /* */ } stopMeter(); };
  }, [stopMeter]);

  const start = useCallback(() => {
    if (!recRef.current || listening) return;
    setError(null);
    try { recRef.current.start(); setListening(true); void startMeter(); }
    catch (e: any) { setError(speechErrorMessage(e?.name === 'InvalidStateError' ? undefined : 'start-failed')); }
  }, [listening, startMeter]);
  const stop = useCallback(() => {
    // Finalise — flush whatever was captured (fires onresult → onend).
    if (!recRef.current) return;
    try { recRef.current.stop(); } catch { /* */ }
    stopMeter();
  }, [stopMeter]);
  const cancel = useCallback(() => {
    // Discard — abort without emitting a final result, so nothing is sent.
    if (!recRef.current) { stopMeter(); setListening(false); setInterim(''); return; }
    try { recRef.current.abort(); } catch { /* */ }
    stopMeter();
    setListening(false);
    setInterim('');
  }, [stopMeter]);

  return { listening, supported, start, stop, cancel, level, interim, error };
}
