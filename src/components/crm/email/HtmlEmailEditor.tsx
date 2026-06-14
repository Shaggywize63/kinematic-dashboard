'use client';
import { useMemo, useState } from 'react';

/**
 * Side-by-side HTML editor for email bodies. The left pane is a raw HTML
 * textarea; the right pane renders the same markup in a sandboxed iframe
 * so the rep sees what the recipient will see — no rich-text engine
 * dependency, no surprise re-serialization.
 *
 * Variables are inserted as `{{var_name}}` tokens which the backend
 * substitutes at send time via emailAlerts.service.renderVars().
 */
export default function HtmlEmailEditor({
  value,
  onChange,
  variables = [],
  minHeight = 360,
}: {
  value: string;
  onChange: (next: string) => void;
  variables?: string[];
  minHeight?: number;
}) {
  const [view, setView] = useState<'split' | 'code' | 'preview'>('split');

  const insertAtEnd = (token: string) => onChange((value || '') + token);

  // The iframe srcDoc is wrapped in a minimal HTML shell so the preview
  // reads like a real email even when the template doesn't include
  // <html><body> itself.
  const srcDoc = useMemo(() => {
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      body{font-family:-apple-system,system-ui,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;line-height:1.55;margin:16px;font-size:14px}
      a{color:#2563eb}
      table{border-collapse:collapse}
      img{max-width:100%;height:auto}
    </style></head><body>${value || '<p style="color:#888">Empty body — paste your HTML on the left.</p>'}</body></html>`;
  }, [value]);

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--s3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--s2)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['split', 'code', 'preview'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
              border: '1px solid var(--border)', cursor: 'pointer',
              background: view === v ? 'var(--primary)' : 'transparent',
              color: view === v ? '#fff' : 'var(--text-dim)',
            }}>{v === 'split' ? 'Split' : v === 'code' ? 'HTML' : 'Preview'}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {variables.length > 0 && (
            <>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>Insert</span>
              {variables.map((v) => (
                <button key={v} type="button" onClick={() => insertAtEnd(`{{${v}}}`)} style={{
                  padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                  background: 'rgba(99,102,241,0.15)', color: 'var(--accent, #6366F1)',
                  border: '1px solid rgba(99,102,241,0.35)', cursor: 'pointer',
                }}>{`{{${v}}}`}</button>
              ))}
            </>
          )}
        </div>
      </div>
      <div style={{ display: view === 'split' ? 'grid' : 'block', gridTemplateColumns: view === 'split' ? '1fr 1fr' : '1fr', minHeight }}>
        {view !== 'preview' && (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="<p>Hi {{name}},</p>&#10;<p>Just following up …</p>"
            spellCheck={false}
            style={{
              width: '100%', boxSizing: 'border-box', minHeight,
              padding: 12, background: 'var(--s3)', color: 'var(--text)',
              fontFamily: 'ui-monospace, Menlo, Monaco, "Courier New", monospace',
              fontSize: 12, lineHeight: 1.5, border: 'none', borderRight: view === 'split' ? '1px solid var(--border)' : 'none',
              resize: 'vertical', outline: 'none',
            }}
          />
        )}
        {view !== 'code' && (
          <iframe
            title="Email preview"
            srcDoc={srcDoc}
            sandbox=""
            style={{ width: '100%', minHeight, border: 'none', background: '#fff' }}
          />
        )}
      </div>
    </div>
  );
}
