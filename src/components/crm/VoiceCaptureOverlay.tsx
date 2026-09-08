'use client';
/**
 * Shared voice-capture UI, extracted from KinematicAI.tsx so both KINI chat and
 * the CRM "Fill with voice" lead-capture flow render the same brand-gradient
 * amplitude orb.
 *
 *  - `KiniVoiceOverlay` — the KINI chat overlay: appears over the chat panel
 *    while the mic is hot, with Done (finalise + send) and X (discard). Voice is
 *    input only. Consumed by KinematicAI.tsx.
 *  - `LeadVoiceCapturePanel` — a distinct full-screen voice panel for the lead
 *    form: an amplitude orb + live transcript + mic/stop + "Use these details".
 *    On confirm it POSTs the transcript to `/crm/ai/extract-lead` and hands the
 *    structured fields back to the caller (which merges them into the form's
 *    state, still gated by the field-override contract). Voice is input only.
 */
import { useCallback, useEffect, useState } from 'react';
import KiniMascot from './KiniMascot';
import { useSpeechRecognition } from '../../lib/useSpeechRecognition';
import { crmAi, type ExtractedLead } from '../../lib/crmApi';

// Keyframes the orb + panel need. Injected inline so the surface is
// self-contained wherever it renders (the lead form doesn't carry KINI's
// <style> block). Duplicate identical @keyframes across surfaces is harmless.
const VOICE_KEYFRAMES = `
@keyframes kmvc-orb-breathe { 0%,100% { transform: scale(0.97); } 50% { transform: scale(1.03); } }
@keyframes kmvc-orb-ripple  { 0% { transform: scale(0.85); opacity: 0.55; } 100% { transform: scale(1.9); opacity: 0; } }
@keyframes kmvc-fade-in     { from { opacity: 0; } to { opacity: 1; } }
@keyframes kmvc-spin        { to { transform: rotate(360deg); } }
`;

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {d.split(' M ').map((p, i) => <path key={i} d={i === 0 ? p : 'M ' + p} />)}
    </svg>
  );
}

// Brand-gradient orb that ripples + scales + glows with the caller's mic
// amplitude (`level`, 0…1). Shared by both surfaces.
function VoiceOrb({ level, size }: { level: number; size: number }) {
  const amp = Math.max(0, Math.min(1, level));
  return (
    <div style={{
      position: 'relative', width: size * 1.9, height: size * 1.9,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* Rippling rings — continuous outward ripple. */}
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          position: 'absolute', width: size, height: size, borderRadius: '50%',
          border: `2px solid rgba(224,30,44,${0.4 - i * 0.1})`,
          animation: `kmvc-orb-ripple ${2.2 + i * 0.4}s ease-out ${i * 0.5}s infinite`,
        }} />
      ))}
      {/* Core orb — brand radial gradient, scales + glows with amplitude. */}
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: 'radial-gradient(circle at 38% 34%, #FF6B6B 0%, #E01E2C 45%, #1E3A8A 120%)',
        boxShadow: `0 0 ${28 + amp * 60}px rgba(224,30,44,${0.5 + amp * 0.4})`,
        transform: `scale(${1 + amp * 0.28})`,
        transition: 'transform 0.08s linear, box-shadow 0.08s linear',
        animation: 'kmvc-orb-breathe 3s ease-in-out infinite',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <KiniMascot size={Math.round(size * 0.5)} />
      </div>
    </div>
  );
}

// Full-screen voice-capture overlay shown over the chat panel while the mic is
// live. The orb reacts to the caller's amplitude, with the streaming transcript
// beneath it. Voice is input only — Done finalises + sends, X discards.
export function KiniVoiceOverlay({
  level, interim, isMobile, onCancel, onDone,
}: {
  level: number; interim: string; isMobile: boolean;
  onCancel: () => void; onDone: () => void;
}) {
  const orbSize = isMobile ? 150 : 176;
  const ctrlBtn: React.CSSProperties = {
    width: 52, height: 52, borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.12)',
    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 5,
      background: 'rgba(8,8,12,0.74)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 24, animation: 'kmvc-fade-in 0.2s ease-out',
    }}>
      <style>{VOICE_KEYFRAMES}</style>
      <VoiceOrb level={level} size={orbSize} />

      <div style={{ marginTop: 26, fontSize: 12, fontWeight: 900, letterSpacing: 1.6, color: '#FF6B6B' }}>
        LISTENING…
      </div>
      <div style={{
        marginTop: 10, maxWidth: 360, textAlign: 'center',
        color: interim ? '#fff' : 'rgba(255,255,255,0.6)',
        fontSize: 18, fontWeight: 600, lineHeight: 1.4, minHeight: 50,
      }}>
        {interim || 'Say something like “show my hottest leads”'}
      </div>

      <div style={{ display: 'flex', gap: 26, alignItems: 'center', marginTop: 28 }}>
        <button type="button" onClick={onCancel} aria-label="Cancel voice" style={ctrlBtn}>
          <Icon d="M18 6L6 18M6 6l12 12" size={22} />
        </button>
        <button type="button" onClick={onDone} aria-label="Send" style={{
          width: 66, height: 66, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, #FF4D4D, #E01E2C)',
          boxShadow: '0 10px 30px rgba(224,30,44,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
        }}>
          <Icon d="M12 19V5M5 12l7-7 7 7" size={26} />
        </button>
      </div>
    </div>
  );
}

// Small viewport hook so the panel sizes down on phones without CSS media
// queries (this codebase styles inline). 640px catches phones in portrait.
function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

// Turn any thrown error into a plain-language line the rep can act on. The
// backend surfaces the Anthropic monthly-usage / billing cap as a 400/402 with
// a readable message; anything else degrades to "type it in instead".
function friendlyError(e: unknown): string {
  const msg = (e as { message?: string })?.message || '';
  const lc = msg.toLowerCase();
  if (lc.includes('limit') || lc.includes('monthly') || lc.includes('quota') ||
      lc.includes('credit') || lc.includes('billing')) {
    return 'KINI has hit its monthly AI limit. Try again after it resets, or just type the details in below.';
  }
  if (msg && !lc.includes('unauthorized')) return `${msg} You can type the details in instead.`;
  return "Couldn't read that — please try again, or type the details in instead.";
}

// A distinct full-screen voice panel for the lead form. The rep taps the mic,
// describes a prospect, and on "Use these details" the transcript is sent to
// the extractor; the structured fields come back to `onExtracted`. Manages the
// speech recogniser, transcript accumulation, extraction call, and errors.
export function LeadVoiceCapturePanel({
  isB2C, onExtracted, onClose,
}: {
  isB2C: boolean;
  onExtracted: (e: ExtractedLead) => void;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const [transcript, setTranscript] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Accumulate each finalised utterance so a rep can pause and resume (the Web
  // Speech recogniser ends after a pause). Interim words render live below.
  const speech = useSpeechRecognition({
    onResult: (text) => setTranscript((prev) => (prev ? `${prev} ${text}` : text).trim()),
  });

  const orbSize = isMobile ? 150 : 184;
  const canUse = !!transcript.trim() && !speech.listening && !extracting;

  const toggleMic = useCallback(() => {
    if (speech.listening) { speech.stop(); return; }
    setError(null);
    speech.start();
  }, [speech]);

  const handleUseDetails = useCallback(async () => {
    const t = transcript.trim();
    if (!t || extracting) return;
    speech.stop();
    setExtracting(true);
    setError(null);
    try {
      const data = await crmAi.extractLead({ transcript: t, is_b2c: isB2C });
      onExtracted(data);
      onClose();
    } catch (e) {
      setError(friendlyError(e));
      setExtracting(false);
    }
  }, [transcript, extracting, isB2C, speech, onExtracted, onClose]);

  const close = useCallback(() => { speech.cancel(); onClose(); }, [speech, onClose]);

  // The transcript preview shows accumulated final text plus the live interim.
  const preview = [transcript, speech.interim].filter(Boolean).join(' ').trim();
  const statusLabel = speech.listening ? 'LISTENING…' : (transcript ? 'GOT IT — REVIEW BELOW' : 'TAP THE MIC TO SPEAK');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Fill with voice"
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(8,8,12,0.82)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 24, animation: 'kmvc-fade-in 0.2s ease-out',
      }}
    >
      <style>{VOICE_KEYFRAMES}</style>

      {/* Header — title + close, matches "a distinct voice panel". */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <KiniMascot size={26} />
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>Fill with voice</span>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          style={{
            width: 38, height: 38, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.22)',
            background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon d="M18 6L6 18M6 6l12 12" size={20} />
        </button>
      </div>

      <VoiceOrb level={speech.level} size={orbSize} />

      <div style={{ marginTop: 24, fontSize: 12, fontWeight: 900, letterSpacing: 1.6, color: '#FF6B6B' }}>
        {statusLabel}
      </div>
      <div style={{
        marginTop: 12, maxWidth: 420, textAlign: 'center',
        color: preview ? '#fff' : 'rgba(255,255,255,0.6)',
        fontSize: 18, fontWeight: preview ? 600 : 500, lineHeight: 1.45, minHeight: 56,
        maxHeight: 168, overflowY: 'auto',
      }}>
        {preview || 'Describe the lead — e.g. “Rajesh Kumar from Acme Steel, mobile 98…, wants TMT bars in Pune”'}
      </div>

      {!speech.supported && (
        <div style={{ marginTop: 8, maxWidth: 420, textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
          Voice input isn’t supported in this browser. Please type the details in instead.
        </div>
      )}
      {error && (
        <div style={{ marginTop: 10, maxWidth: 420, textAlign: 'center', color: '#FF8A8A', fontSize: 13.5, lineHeight: 1.45 }}>
          {error}
        </div>
      )}

      {/* Controls — mic/stop toggle + "Use these details". */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, marginTop: 26, width: '100%', maxWidth: 340 }}>
        <button
          type="button"
          onClick={toggleMic}
          disabled={!speech.supported || extracting}
          aria-label={speech.listening ? 'Stop' : 'Start speaking'}
          style={{
            width: 76, height: 76, borderRadius: '50%', cursor: (!speech.supported || extracting) ? 'not-allowed' : 'pointer',
            border: speech.listening ? 'none' : '1px solid rgba(255,255,255,0.28)',
            background: speech.listening ? 'linear-gradient(135deg, #FF4D4D, #E01E2C)' : 'rgba(255,255,255,0.12)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: speech.listening ? '0 10px 30px rgba(224,30,44,0.5)' : 'none',
            opacity: (!speech.supported || extracting) ? 0.5 : 1, transition: 'all 0.2s',
          }}
        >
          {speech.listening
            ? <Icon d="M6 6h12v12H6z" size={26} />
            : <Icon d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z M19 10v1a7 7 0 0 1-14 0v-1 M12 18v4 M8 22h8" size={26} />}
        </button>

        <button
          type="button"
          onClick={() => void handleUseDetails()}
          disabled={!canUse}
          style={{
            width: '100%', padding: '13px 18px', borderRadius: 999, border: 'none',
            fontSize: 16, fontWeight: 800, cursor: canUse ? 'pointer' : 'not-allowed',
            background: canUse ? 'linear-gradient(135deg, #FF4D4D, #E01E2C)' : 'rgba(255,255,255,0.16)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: canUse ? '0 10px 30px rgba(224,30,44,0.4)' : 'none', transition: 'all 0.2s',
          }}
        >
          {extracting && (
            <span style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'kmvc-spin 0.7s linear infinite' }} />
          )}
          {extracting ? 'Reading…' : 'Use these details'}
        </button>
      </div>
    </div>
  );
}
