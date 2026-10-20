'use client';
import { Card, T } from '../../ui';

/** Loading placeholder shaped like the loaded page (hero, journey + KPIs, tabs, content), so nothing jumps when data lands. */
export default function DetailSkeleton({ narrow }: { narrow: boolean }) {
  const bar = (w: number | string, h: number | string = 12): React.CSSProperties => ({ width: w, height: h });
  return (
    <div aria-busy="true" aria-label="Loading lead" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <i className="km-skel" style={bar(90, 12)} />
      <Card padding={20}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexDirection: narrow ? 'column' : 'row' }}>
          <div style={{ display: 'flex', gap: 16, flex: 1, minWidth: 0, width: '100%' }}>
            <i className="km-skel" style={{ width: 60, height: 60, borderRadius: 999, flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <i className="km-skel" style={bar('42%', 22)} />
              <i className="km-skel" style={bar('30%', 12)} />
              <i className="km-skel" style={bar('64%', 12)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[78, 104, 96, 90].map((w) => <i key={w} className="km-skel" style={{ width: w, height: 34, borderRadius: 6 }} />)}
          </div>
        </div>
      </Card>
      <Card padding={0}>
        <div style={{ padding: 20 }}><i className="km-skel" style={bar('100%', 22)} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${narrow ? 2 : 4}, minmax(0, 1fr))`, gap: 1, background: T.border, borderTop: `1px solid ${T.border}` }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ background: T.card, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <i className="km-skel" style={bar(70, 10)} />
              <i className="km-skel" style={bar('60%', 18)} />
              <i className="km-skel" style={bar('80%', 11)} />
            </div>
          ))}
        </div>
      </Card>
      <i className="km-skel" style={{ ...bar('100%', 40), borderRadius: 0 }} />
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1fr) 320px', gap: 20 }}>
        <Card style={{ height: 260 }}><i className="km-skel" style={bar('100%', '100%')} /></Card>
        {!narrow && <Card style={{ height: 260 }}><i className="km-skel" style={bar('100%', '100%')} /></Card>}
      </div>
    </div>
  );
}
