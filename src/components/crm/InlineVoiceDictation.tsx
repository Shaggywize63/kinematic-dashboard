'use client';
/**
 * Inline press-and-hold voice dictation for a free-text field.
 *
 * The same browser-speech pipeline as the lead "Fill with voice" flow
 * (`useSpeechRecognition`), but instead of POSTing to extract-lead it simply
 * streams the transcript into whatever text field the caller owns, via
 * `onTranscript`. Used by the lead "recent update" box so a rep can SPEAK an
 * update rather than type it. Multi-language: a compact picker sets the
 * recogniser language (persisted per browser); the rep's spoken update then
 * feeds the existing ✨ Suggest (updateSuggest.service) for relevant next steps.
 *
 * Voice is input only. Hold to speak, release to insert.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import { useSpeechRecognition } from '../../lib/useSpeechRecognition';

// BCP-47 tags the Web Speech API accepts. Kept to the languages Kinematic's
// field reps actually use; en-IN first so it stays the default.
const LANGS: { code: string; label: string }[] = [
  { code: 'en-IN', label: 'English' },
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'bn-IN', label: 'বাংলা' },
  { code: 'ta-IN', label: 'தமிழ்' },
  { code: 'te-IN', label: 'తెలుగు' },
  { code: 'mr-IN', label: 'मराठी' },
  { code: 'gu-IN', label: 'ગુજરાતી' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ' },
  { code: 'ml-IN', label: 'മലയാളം' },
  { code: 'pa-IN', label: 'ਪੰਜਾਬੀ' },
];

const LANG_KEY = 'kin_voice_lang';

export default function InlineVoiceDictation({
  onTranscript,
  disabled,
}: {
  // Called with each finalised chunk of speech; the caller appends it to its field.
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const [lang, setLang] = useState('en-IN');
  // Restore the rep's last language after mount (localStorage is client-only,
  // so reading it in state init would mismatch the server render).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved && LANGS.some((l) => l.code === saved)) setLang(saved);
    } catch { /* ignore */ }
  }, []);
  const setLangPersist = (code: string) => {
    setLang(code);
    try { localStorage.setItem(LANG_KEY, code); } catch { /* ignore */ }
  };

  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);

  const speech = useSpeechRecognition({
    continuous: true,
    lang,
    onResult: (text) => { if (text.trim()) onTranscriptRef.current(text.trim()); },
  });

  const holdingRef = useRef(false);
  const beginHold = useCallback(() => {
    if (disabled || !speech.supported || holdingRef.current) return;
    holdingRef.current = true;
    speech.start();
  }, [disabled, speech]);
  const endHold = useCallback((submit: boolean) => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    if (submit) { try { speech.stop(); } catch { /* */ } }
    else { try { speech.cancel(); } catch { /* */ } }
  }, [speech]);

  // Drop the mic on unmount.
  useEffect(() => () => { try { speech.cancel(); } catch { /* */ } }, [speech]);

  if (!speech.supported) return null; // the rep just types; no mic affordance.

  const listening = speech.listening;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Hold to dictate an update"
        aria-pressed={listening}
        onPointerDown={(e) => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ } beginHold(); }}
        onPointerUp={(e) => { try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* */ } endHold(true); }}
        onPointerCancel={() => endHold(false)}
        onPointerLeave={() => { if (holdingRef.current) endHold(true); }}
        onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); beginHold(); } }}
        onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); endHold(true); } }}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '6px 12px', borderRadius: 8,
          border: `1px solid ${listening ? 'var(--red)' : 'var(--border)'}`,
          background: listening ? 'var(--red-w)' : 'var(--s3)',
          color: listening ? 'var(--red)' : 'var(--text)',
          fontSize: 12, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          boxShadow: listening ? '0 0 0 3px rgba(208,30,44,0.16)' : 'none',
          transition: 'background 0.15s ease, border-color 0.15s ease',
        }}
      >
        <Mic aria-hidden size={14} strokeWidth={2} />
        {listening ? 'Listening… release to insert' : 'Speak update'}
      </div>

      <select
        aria-label="Dictation language"
        value={lang}
        onChange={(e) => setLangPersist(e.target.value)}
        disabled={disabled || listening}
        title="Language you'll speak in"
        style={{
          padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)',
          background: 'var(--s3)', color: 'var(--text)', fontSize: 12, fontWeight: 600,
          cursor: disabled || listening ? 'not-allowed' : 'pointer',
        }}
      >
        {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>

      {listening && speech.interim && (
        <span style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {speech.interim}
        </span>
      )}
      {speech.error && !listening && (
        <span style={{ fontSize: 11.5, color: 'var(--red)' }}>{speech.error}</span>
      )}
    </div>
  );
}
