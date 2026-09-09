'use client';
/**
 * Shared voice-capture UI, extracted from KinematicAI.tsx so both KINI chat and
 * the CRM "Fill with voice" lead-capture flow render the same brand-gradient
 * amplitude orb.
 *
 *  - `KiniVoiceOverlay` — the KINI chat overlay: appears over the chat panel
 *    while the mic is hot, with Done (finalise + send) and X (discard). Voice is
 *    input only. Consumed by KinematicAI.tsx.
 *  - `InlineLeadVoiceCapture` — an INLINE press-and-hold (walkie-talkie) mic
 *    control that lives directly inside the New Lead form (no modal). The rep
 *    presses and HOLDS the mic to record and RELEASES to submit: on release it
 *    stops the recogniser, POSTs the transcript to `/crm/ai/extract-lead`, and
 *    hands the structured fields back to the caller (which merges them into the
 *    form's state, still gated by the field-override contract). A live orb +
 *    transcript animate in-place on the same page. Voice is input only.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
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

// Phases of the inline walkie-talkie control:
//   idle       — a resting mic pill with the "hold to speak" hint.
//   listening  — the rep is holding the button; orb + live transcript animate
//                in-place on the page (NOT a modal).
//   processing — released with a usable transcript; awaiting extract-lead.
//   success    — fields were filled; a brief confirmation before collapsing.
//   error      — extraction failed; a friendly inline message, retry by holding.
type VoicePhase = 'idle' | 'listening' | 'processing' | 'success' | 'error';

// An INLINE press-and-hold ("walkie-talkie") voice control that lives directly
// inside the New Lead form — no modal, no separate screen. The rep presses and
// HOLDS the mic to record and RELEASES to submit: on release we stop the
// recogniser, and if the transcript is usable we POST it to `/crm/ai/extract-
// lead` and hand the structured fields to `onExtracted` (which merges them into
// the form, still gated by the field-override contract). The orb + transcript
// animate in-place on the same page. Voice is input only.
export function InlineLeadVoiceCapture({
  isB2C, onExtracted,
}: {
  isB2C: boolean;
  onExtracted: (e: ExtractedLead) => void;
}) {
  const isMobile = useIsMobile();
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [transcriptView, setTranscriptView] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Accumulate every finalised utterance across the hold. The ref is the source
  // of truth read synchronously on release (React state lags a tick); the view
  // state just drives the live preview.
  const transcriptRef = useRef('');
  // Continuous recognition so a brief pause mid-sentence doesn't end the hold —
  // the recogniser stays hot until the rep releases and we call stop().
  const speech = useSpeechRecognition({
    continuous: true,
    onResult: (text) => {
      transcriptRef.current = (transcriptRef.current ? `${transcriptRef.current} ${text}` : text).trim();
      setTranscriptView(transcriptRef.current);
    },
  });

  // Latest props/handlers behind refs so the stable finalize callback (invoked
  // from an effect on the listening→idle transition) never closes over stale
  // values.
  const isB2CRef = useRef(isB2C);
  const onExtractedRef = useRef(onExtracted);
  useEffect(() => { isB2CRef.current = isB2C; }, [isB2C]);
  useEffect(() => { onExtractedRef.current = onExtracted; }, [onExtracted]);

  // True from pointer-down until release/cancel; distinguishes a natural end
  // from the rep letting go. `submitRef` marks that a release is awaiting the
  // recogniser's final flush before we run the extraction.
  const holdingRef = useRef(false);
  const submitRef = useRef(false);
  const successTimerRef = useRef<number | null>(null);

  const clearSuccessTimer = () => {
    if (successTimerRef.current != null) { window.clearTimeout(successTimerRef.current); successTimerRef.current = null; }
  };

  const resetIdle = useCallback(() => {
    transcriptRef.current = '';
    setTranscriptView('');
    setError(null);
    setPhase('idle');
  }, []);

  // Run the extraction with whatever the recogniser finalised. Reads refs only,
  // so it's safe to fire from the listening→idle effect below.
  const finalizeSubmit = useCallback(async () => {
    const t = transcriptRef.current.trim();
    // Too short to be a real dictation → quietly collapse, no API call.
    if (t.length < 3) { resetIdle(); return; }
    setError(null);
    setPhase('processing');
    try {
      const data = await crmAi.extractLead({ transcript: t, is_b2c: isB2CRef.current });
      onExtractedRef.current(data);
      setPhase('success');
      clearSuccessTimer();
      successTimerRef.current = window.setTimeout(() => resetIdle(), 1600);
    } catch (e) {
      setError(friendlyError(e));
      setPhase('error');
    }
  }, [resetIdle]);

  // The recogniser flushes its final result on stop(), then flips `listening`
  // false. When that transition follows a release, extract from the now-final
  // transcript. Kept in a ref so the effect stays dependency-light.
  const finalizeRef = useRef(finalizeSubmit);
  useEffect(() => { finalizeRef.current = finalizeSubmit; }, [finalizeSubmit]);
  const prevListeningRef = useRef(false);
  useEffect(() => {
    const was = prevListeningRef.current;
    prevListeningRef.current = speech.listening;
    if (was && !speech.listening && submitRef.current) {
      submitRef.current = false;
      void finalizeRef.current();
    }
  }, [speech.listening]);

  // Cleanup on unmount — drop the mic and any pending success timer.
  useEffect(() => () => { clearSuccessTimer(); try { speech.cancel(); } catch { /* */ } }, [speech]);

  const beginHold = useCallback(() => {
    if (!speech.supported) return;
    if (holdingRef.current || phase === 'processing') return;
    clearSuccessTimer();
    holdingRef.current = true;
    submitRef.current = false;
    transcriptRef.current = '';
    setTranscriptView('');
    setError(null);
    setPhase('listening');
    speech.start();
  }, [speech, phase]);

  // End the hold. submit=true → release (stop + extract); submit=false →
  // cancel/discard (pointer cancelled or left the button).
  const endHold = useCallback((submit: boolean) => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    if (!submit) {
      submitRef.current = false;
      try { speech.cancel(); } catch { /* */ }
      resetIdle();
      return;
    }
    if (speech.listening) {
      // Wait for the recogniser's final flush; the listening→idle effect fires
      // the extraction. Show processing now only if we already have words.
      submitRef.current = true;
      const hasWords = !!transcriptRef.current.trim() || !!speech.interim.trim();
      setPhase(hasWords ? 'processing' : 'idle');
      try { speech.stop(); } catch { /* */ }
    } else {
      // Recogniser already idle (e.g. it errored) — extract from what we have.
      void finalizeSubmit();
    }
  }, [speech, resetIdle, finalizeSubmit]);

  const onPointerDown = (e: React.PointerEvent) => {
    // Suppress text selection / the native long-press callout.
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ }
    beginHold();
  };
  const onPointerUp = (e: React.PointerEvent) => {
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* */ }
    endHold(true);
  };
  const onPointerCancel = () => endHold(false);
  // Under pointer capture a leave rarely fires, but treat it as a release so a
  // stray drag-out still submits what was said rather than stranding the mic.
  const onPointerLeave = () => { if (holdingRef.current) endHold(true); };

  // Keyboard parity: hold Space/Enter to record, release to submit.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); beginHold(); }
  };
  const onKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); endHold(true); }
  };

  const listening = phase === 'listening';
  const processing = phase === 'processing';
  const success = phase === 'success';
  const expanded = listening || processing || success;
  const orbSize = isMobile ? 54 : 62;
  const preview = [transcriptRef.current, speech.interim].filter(Boolean).join(' ').trim();

  // Not supported → a plain, non-interactive hint. The rep types the form.
  if (!speech.supported) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '11px 14px', marginBottom: 18, borderRadius: 8,
        border: '1px solid var(--border)', background: 'var(--s3)',
        fontSize: 12, color: 'var(--text-dim)',
      }}>
        <MicGlyph size={16} />
        Voice fill isn’t supported in this browser — type the details in below.
      </div>
    );
  }

  const statusLabel = listening ? 'Listening…' : processing ? 'Reading…' : success ? 'Filled in from voice' : '';
  const statusColor = success ? 'var(--ok)' : 'var(--red)';

  return (
    <div style={{ marginBottom: 18 }}>
      <style>{VOICE_KEYFRAMES}</style>
      <div
        role="button"
        tabIndex={0}
        aria-label="Hold to fill the form with your voice"
        aria-pressed={listening}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerLeave}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          // touchAction:none stops the browser hijacking the hold for scroll;
          // userSelect:none stops the drag from selecting the label text.
          touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          display: 'flex', alignItems: 'center', gap: 14, width: '100%',
          padding: expanded ? '16px 16px' : '11px 14px', borderRadius: 8,
          border: `1px solid ${listening ? 'var(--red)' : 'var(--border)'}`,
          background: listening ? 'var(--red-w)' : 'var(--s3)',
          cursor: processing ? 'wait' : 'pointer', textAlign: 'left',
          boxShadow: listening ? '0 0 0 3px rgba(208,30,44,0.16)' : 'none',
          transition: 'padding 0.15s ease, background 0.15s ease, border-color 0.15s ease',
        }}
      >
        {expanded ? (
          <>
            <VoiceOrb level={processing ? 0.45 : success ? 0.2 : speech.level} size={orbSize} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 10.5, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: statusColor }}>
                  {statusLabel}
                </span>
                {processing && (
                  <span style={{ width: 13, height: 13, border: '2px solid var(--border)', borderTopColor: 'var(--red)', borderRadius: '50%', display: 'inline-block', animation: 'kmvc-spin 0.7s linear infinite' }} />
                )}
              </span>
              <span style={{
                display: 'block', marginTop: 4, fontSize: 13, lineHeight: 1.4,
                color: preview ? 'var(--text)' : 'var(--text-dim)',
                maxHeight: 60, overflowY: 'auto',
              }}>
                {success
                  ? 'Details filled in — review and save.'
                  : (preview || (listening ? 'Keep talking — release when you’re done.' : 'Reading what you said…'))}
              </span>
            </span>
          </>
        ) : (
          <>
            <span style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              background: 'var(--red)', boxShadow: '0 0 0 4px var(--red-w)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <MicGlyph size={16} color="#fff" />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Fill with voice</span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-dim)' }}>Hold to speak · release to fill</span>
            </span>
            <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 10.5, letterSpacing: '0.08em', color: 'var(--text-mute)', flexShrink: 0 }}>KINI</span>
          </>
        )}
      </div>

      {phase === 'error' && error && (
        <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.45, color: 'var(--red)' }}>
          {error}
        </div>
      )}
    </div>
  );
}

// The mic outline used by the idle pill and the unsupported hint.
function MicGlyph({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <path d="M12 18v4" /><path d="M8 22h8" />
    </svg>
  );
}
