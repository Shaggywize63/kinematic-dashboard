'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, Input, T, type Tone } from '../ui';
import {
  FORENSIC_CHECKS, THRESHOLD_META, loadForensicsConfig, saveForensicsConfig,
  DEFAULT_FORENSICS_CONFIG, type ForensicsConfig, type Severity,
} from '../../lib/expenseForensics';

const SEV_TONE: Record<Severity, Tone> = { info: 'info', warn: 'warn', high: 'red' };
const SEV_LABEL: Record<Severity, string> = { info: 'Info', warn: 'Review', high: 'High risk' };

/**
 * Manager-facing controls for the forgery/forensics checks: the editable
 * thresholds (e.g. the halt limit) and the full catalogue of scenarios that run
 * on every expense claim. A frontend prototype — thresholds persist per browser
 * (localStorage) and apply the next time a claim or queue is opened.
 */
export default function ForensicsSettings() {
  const [cfg, setCfg] = useState<ForensicsConfig>(() => loadForensicsConfig());
  const [saved, setSaved] = useState(true);
  const set = (k: keyof ForensicsConfig, v: number) => { setCfg((c) => ({ ...c, [k]: v })); setSaved(false); };
  const save = () => { saveForensicsConfig(cfg); setSaved(true); toast.success('Forgery-check thresholds saved'); };
  const reset = () => { setCfg({ ...DEFAULT_FORENSICS_CONFIG }); setSaved(false); };

  return (
    <Card padding={20}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Forgery &amp; forensics checks</div>
          <div style={{ fontSize: 13, color: T.mute, marginTop: 2, maxWidth: 560, lineHeight: 1.5 }}>
            What gets highlighted to a manager when a claim is submitted. Thresholds apply the next time a claim or the approval queue is opened.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <Button variant="ghost" onClick={reset}>Reset</Button>
          <Button variant="primary" disabled={saved} onClick={save}>{saved ? 'Saved' : 'Save thresholds'}</Button>
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
        {(Object.keys(THRESHOLD_META) as Array<keyof ForensicsConfig>).map((k) => {
          const meta = THRESHOLD_META[k];
          return (
            <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 12.5, color: T.dim, lineHeight: 1.4 }}>{meta.label}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Input type="number" value={String(cfg[k])} min={meta.min} max={meta.max} step={meta.step}
                  onChange={(e) => set(k, Number(e.target.value))} style={{ width: 100 }} />
                <span style={{ fontSize: 12.5, color: T.mute }}>{meta.unit}</span>
              </span>
            </label>
          );
        })}
      </div>

      <div style={{ marginTop: 22, fontSize: 11.5, fontWeight: 700, color: T.dim, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        Scenarios checked on every claim
      </div>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column' }}>
        {FORENSIC_CHECKS.map((chk, i) => (
          <div key={chk.code} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderTop: i ? `1px solid ${T.border}` : 0 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{chk.title}</span>
                <Badge tone={SEV_TONE[chk.severity]}>{SEV_LABEL[chk.severity]}</Badge>
                {chk.crossClaim && <Badge tone="neutral">Across people</Badge>}
              </div>
              <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.5, marginTop: 2 }}>{chk.description}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
