'use client';
// HR assistant, Voice tab: six Indian languages with sample phrases. A SIMULATION: no microphone, no recording, no audio.
// "Play sample" runs the English equivalent of the phrase through the same intent engine as the chat and shows the
// canned transcript, the intent it found and the answer.

import { useMemo } from 'react';
import { Badge, Button, Card, CardTitle, DataTable, Note, T, useIsCompact, type Col } from '../ui';
import { Select } from '../../ui';
import type { HrmsDb } from '../../../lib/hrms/types';
import { ask, INTENT_LABEL } from '../../../lib/hrms/assist/engine';
import { policyRefs } from '../../../lib/hrms/assist/policies';
import { VOICE_COVERAGE, VOICE_LANGUAGES, type VoiceLanguage } from '../../../lib/hrms/assist/voice';
import { PERSONAS, personaWho, setLastVoice, setPersona } from '../../../lib/hrms/assist/store';
import type { AssistState, PolicyState } from '../../../lib/hrms/assist/types';
import { InfoChip, SimNote } from './shared';

export default function VoiceTab({ db, assist, policy }: { db: HrmsDb; assist: AssistState; policy: PolicyState }) {
  const narrow = useIsCompact(700);
  const who = personaWho(assist.persona);
  const last = assist.lastVoice;
  const lang = last ? VOICE_LANGUAGES.find((l) => l.id === last.lang) : undefined;
  const utt = lang && last ? lang.utterances[last.idx] : undefined;
  const result = useMemo(
    () => (utt ? ask(db, who, utt.engineText, { leaveRequests: assist.leaveRequests, policies: policyRefs(policy.policies) }) : null),
    [db, who.employeeId, who.role, utt, assist.leaveRequests, policy.policies], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const cols: Col<(typeof VOICE_COVERAGE)[number]>[] = [
    { key: 'lang', label: 'Language', render: (r) => <b>{VOICE_LANGUAGES.find((l) => l.id === r.id)!.name}</b> },
    { key: 'script', label: 'Script', render: (r) => VOICE_LANGUAGES.find((l) => l.id === r.id)!.scriptName },
    { key: 'understanding', label: 'What exists', render: (r) => r.understanding },
    { key: 'stt', label: 'Speech to text', render: (r) => <Badge tone="neutral">{r.speechToText}</Badge>, nowrap: true },
    { key: 'tts', label: 'Text to speech', render: (r) => <Badge tone="neutral">{r.textToSpeech}</Badge>, nowrap: true },
    { key: 'review', label: 'Native-speaker review', render: (r) => r.review },
    { key: 'status', label: 'Status', render: (r) => <Badge tone="warn" dot>{r.status}</Badge>, nowrap: true },
  ];

  return (
    <div data-testid="voice-tab" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SimNote testid="voice-simulation">
        No microphone is used. Nothing is recorded, and no audio is played. “Play sample” runs the English equivalent of each phrase through the same rules as the chat, then shows a canned transcript, the intent it found and the answer.
        The answer is in English only. The phrases below have not been checked by a native speaker yet.
      </SimNote>

      <div style={{ maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="voice-persona" style={{ fontSize: 12.5, fontWeight: 500, color: T.dim }}>Speaking as</label>
        <Select id="voice-persona" value={assist.persona} onChange={(e) => setPersona(e.target.value)}>
          {PERSONAS.map((p) => <option key={p.employeeId} value={p.employeeId}>{p.label}</option>)}
        </Select>
      </div>

      <Card padding={16} style={{ border: `1px solid ${result ? T.info : T.border}` }}>
        <CardTitle right={<Badge tone="warn" mono>SIMULATION</Badge>}>Sample result</CardTitle>
        {result && utt && lang ? (
          <div data-testid="voice-result" style={{ display: 'grid', gap: 12, gridTemplateColumns: narrow ? '1fr' : 'repeat(3, minmax(0, 1fr))' }}>
            <Step n={1} title="Transcript (canned)">
              <div lang={lang.id} style={{ fontSize: 17, lineHeight: 1.5 }}>{utt.script}</div>
              <div style={{ fontSize: 13, color: T.dim, fontStyle: 'italic' }}>{utt.translit}</div>
              <div style={{ fontSize: 12.5, color: T.mute }}>Heard as {lang.name}. In the live product this would come from speech to text.</div>
            </Step>
            <Step n={2} title="Intent (the engine)">
              <div data-testid="voice-intent"><Badge tone="neutral" mono>{INTENT_LABEL[result.intent]}</Badge></div>
              <div style={{ fontSize: 13, color: T.dim }}>Matched on the English equivalent: “{utt.engineText}”</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{result.usedData.map((u) => <InfoChip key={u}>{u}</InfoChip>)}</div>
            </Step>
            <Step n={3} title="Answer">
              <div data-testid="voice-answer" style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.5 }}>{result.answer}</div>
            </Step>
          </div>
        ) : (
          <div style={{ fontSize: 13.5, color: T.dim }}>Press “Play sample” on any phrase below. Nothing is heard or spoken.</div>
        )}
      </Card>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))' }}>
        {VOICE_LANGUAGES.map((l) => <LangCard key={l.id} l={l} active={last?.lang === l.id ? last.idx : -1} />)}
      </div>

      <Card padding={16}>
        <CardTitle>Language coverage</CardTitle>
        <DataTable columns={cols} rows={VOICE_COVERAGE.map((r) => ({ ...r }))} minWidth={860} />
        <div style={{ marginTop: 12 }}>
          <Note>Every row says “Sample only” because only three phrases per language are written, and no speech service is connected. Which speech providers support which languages, and how well, has to be checked with each provider before this is promised to anyone.</Note>
        </div>
      </Card>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, background: T.panel }}>
      <div style={{ fontSize: 12, fontFamily: T.mono, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.mute }}>Step {n} · {title}</div>
      {children}
    </div>
  );
}

function LangCard({ l, active }: { l: VoiceLanguage; active: number }) {
  return (
    <Card padding={16} style={{ minWidth: 0 }}>
      <div data-testid={`voice-card-${l.id}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontFamily: T.heading, fontSize: 16, color: T.text }}>{l.name} <span lang={l.id} style={{ color: T.dim, fontWeight: 500 }}>{l.native}</span></h3>
          <Badge tone="warn" mono>SIMULATION</Badge>
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {l.utterances.map((u, i) => (
            <li key={i} style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: i ? 12 : 0, borderTop: i ? `1px solid ${T.border}` : 0 }}>
              <div style={{ minWidth: 0 }}>
                <div lang={l.id} style={{ fontSize: 16, lineHeight: 1.45, color: T.text }}>{u.script}</div>
                <div style={{ fontSize: 13, color: T.dim, fontStyle: 'italic' }}>{u.translit}</div>
                <div style={{ fontSize: 13, color: T.mute }}>{u.english}</div>
              </div>
              <Button size="sm" variant={active === i ? 'primary' : 'secondary'} aria-label={`Play sample: ${l.name}, phrase ${i + 1}`} data-testid={`play-${l.id}-${i}`} onClick={() => setLastVoice(l.id, i)}>
                {active === i ? 'Played' : 'Play sample'}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
