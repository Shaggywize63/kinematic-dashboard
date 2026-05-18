'use client';
/**
 * FFM custom chart builder modal — pick a dataset, X / Y axes, and a
 * chart type, then save as a WidgetInstance with widget_type='ffm_custom'.
 *
 * Mirrors src/components/crm/analytics/CustomChartBuilder.tsx (Lead
 * Analytics) but is wired to FFM_CUSTOM_DATASETS instead of the CRM
 * registry. Saved widgets render via the ffm_custom branch in
 * FfmAnalyticsSection.
 */
import { useEffect, useMemo, useState } from 'react';
import { X, BarChart3, LineChart as LineIcon, PieChart, Activity, Table as TableIcon } from 'lucide-react';
import {
  FFM_CUSTOM_DATASETS, ffmDatasetById,
} from '../../../lib/ffmAnalyticsConfig';
import type { ChartType } from '../../../lib/crm/widgetCatalog';
import type { WidgetInstance } from '../../../lib/crmAnalyticsExtApi';

interface CustomConfig {
  data_source?: string;
  x_field?: string;
  y_field?: string;
  label?: string;
}

interface Props {
  onSave: (widget: WidgetInstance) => void;
  onClose: () => void;
  initial?: WidgetInstance | null;
}

const CHART_TYPES: Array<{ value: ChartType; label: string; icon: React.ElementType }> = [
  { value: 'bar',            label: 'Bar',            icon: BarChart3 },
  { value: 'line',           label: 'Line',           icon: LineIcon },
  { value: 'area',           label: 'Area',           icon: Activity },
  { value: 'pie',            label: 'Pie',            icon: PieChart },
  { value: 'donut',          label: 'Donut',          icon: PieChart },
  { value: 'horizontal-bar', label: 'Horizontal Bar', icon: BarChart3 },
  { value: 'table',          label: 'Table',          icon: TableIcon },
];

export default function FfmCustomChartBuilder({ onSave, onClose, initial }: Props) {
  const initialConfig = (initial?.config as CustomConfig | undefined) ?? {};
  const initialDsId = initialConfig.data_source ?? FFM_CUSTOM_DATASETS[0].id;

  const [datasetId, setDatasetId] = useState<string>(initialDsId);
  const ds = useMemo(() => ffmDatasetById(datasetId) ?? FFM_CUSTOM_DATASETS[0], [datasetId]);

  const [xField, setXField] = useState<string>(initialConfig.x_field ?? ds.defaultX);
  const [yField, setYField] = useState<string>(initialConfig.y_field ?? ds.defaultY);
  const [chartType, setChartType] = useState<ChartType>((initial?.chart_type as ChartType) ?? 'bar');
  const [label, setLabel] = useState<string>(initialConfig.label ?? ds.label);

  const changeDataset = (id: string) => {
    setDatasetId(id);
    const next = ffmDatasetById(id);
    if (next) {
      setXField(next.defaultX);
      setYField(next.defaultY);
      setLabel(next.label);
    }
  };

  useEffect(() => {
    if (initial && initialConfig.data_source) {
      setDatasetId(initialConfig.data_source);
      if (initialConfig.x_field) setXField(initialConfig.x_field);
      if (initialConfig.y_field) setYField(initialConfig.y_field);
      if (initialConfig.label)   setLabel(initialConfig.label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const numericFields = ds.fields.filter(f => f.type === 'number');
  const xCandidates   = ds.fields;
  const yCandidates   = chartType === 'table' ? ds.fields : numericFields;

  const save = () => {
    const widget: WidgetInstance = {
      id: initial?.id ?? cryptoRandomId(),
      widget_type: 'ffm_custom',
      chart_type: chartType,
      config: {
        data_source: datasetId,
        x_field: xField,
        y_field: yField,
        label: label.trim() || ds.label,
      },
    };
    onSave(widget);
  };

  const canSave = !!datasetId && !!xField && !!yField && !!label.trim();

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={dialog}>
        <header style={headerStyle}>
          <div>
            <div style={kicker}>{initial ? 'Edit chart' : 'Build chart'}</div>
            <div style={titleStyle}>Custom field-force chart</div>
            <div style={subStyle}>Pick a dataset, choose X / Y axes, then a chart type.</div>
          </div>
          <button onClick={onClose} style={closeBtn} aria-label="Close">
            <X size={20} />
          </button>
        </header>

        <div style={form}>
          <Field label="Chart title">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Strike rate by FE — North zone"
              style={input}
            />
          </Field>

          <Field label="Data source">
            <select value={datasetId} onChange={(e) => changeDataset(e.target.value)} style={input}>
              {FFM_CUSTOM_DATASETS.map(d => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
            <div style={hint}>{ds.description}</div>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="X axis (category / label)">
              <select value={xField} onChange={(e) => setXField(e.target.value)} style={input}>
                {xCandidates.map(f => (
                  <option key={f.key} value={f.key}>{f.label} ({f.type})</option>
                ))}
              </select>
            </Field>
            <Field label="Y axis (value)">
              <select value={yField} onChange={(e) => setYField(e.target.value)} style={input}>
                {yCandidates.map(f => (
                  <option key={f.key} value={f.key}>{f.label} ({f.type})</option>
                ))}
              </select>
              {chartType !== 'table' && numericFields.length === 0 && (
                <div style={{ ...hint, color: 'var(--primary)' }}>
                  This dataset has no numeric columns — switch to Table.
                </div>
              )}
            </Field>
          </div>

          <Field label="Chart type">
            <div style={chartGrid}>
              {CHART_TYPES.map(({ value, label: cLabel, icon: Icon }) => {
                const active = chartType === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setChartType(value)}
                    style={{ ...chartCell, ...(active ? chartCellActive : {}) }}
                  >
                    <Icon size={18} />
                    <span style={{ fontSize: 11, fontWeight: 700 }}>{cLabel}</span>
                  </button>
                );
              })}
            </div>
          </Field>
        </div>

        <footer style={footer}>
          <button onClick={onClose} style={ghostBtn}>Cancel</button>
          <button
            onClick={save}
            disabled={!canSave}
            style={{ ...primaryBtn, opacity: canSave ? 1 : 0.5, cursor: canSave ? 'pointer' : 'not-allowed' }}
          >
            {initial ? 'Save changes' : 'Add chart'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'fw_' + Math.random().toString(36).slice(2, 11);
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
  zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
};
const dialog: React.CSSProperties = {
  background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 16,
  width: '100%', maxWidth: 580, maxHeight: '90vh', overflow: 'hidden',
  display: 'flex', flexDirection: 'column',
};
const headerStyle: React.CSSProperties = {
  padding: '18px 22px', borderBottom: '1px solid var(--border)',
  display: 'flex', alignItems: 'flex-start', gap: 12,
};
const kicker: React.CSSProperties = {
  fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase',
  letterSpacing: 0.8, fontWeight: 700,
};
const titleStyle: React.CSSProperties = { fontSize: 18, fontWeight: 800, color: 'var(--text)', marginTop: 2 };
const subStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-dim)', marginTop: 3 };
const closeBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: 'var(--text-dim)',
  cursor: 'pointer', padding: 4, marginLeft: 'auto',
};
const form: React.CSSProperties = {
  padding: 20, display: 'flex', flexDirection: 'column', gap: 14,
  overflowY: 'auto',
};
const fieldLabel: React.CSSProperties = {
  fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase',
  letterSpacing: 0.6, fontWeight: 700,
};
const input: React.CSSProperties = {
  background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '9px 12px', color: 'var(--text)', fontSize: 13, outline: 'none',
  width: '100%', fontFamily: 'inherit',
};
const hint: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', marginTop: 4 };
const chartGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
};
const chartCell: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
  padding: '10px 6px', borderRadius: 8, background: 'var(--s2)',
  border: '1px solid var(--border)', color: 'var(--text-dim)', cursor: 'pointer',
  transition: 'border-color .1s, color .1s',
};
const chartCellActive: React.CSSProperties = {
  background: 'var(--s3)', borderColor: 'var(--primary)', color: 'var(--primary)',
};
const footer: React.CSSProperties = {
  padding: '14px 22px', borderTop: '1px solid var(--border)',
  display: 'flex', justifyContent: 'flex-end', gap: 8,
};
const ghostBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
};
const primaryBtn: React.CSSProperties = {
  background: 'var(--primary)', border: 'none', color: '#fff',
  padding: '8px 18px', borderRadius: 8, fontWeight: 700, fontSize: 13,
};
