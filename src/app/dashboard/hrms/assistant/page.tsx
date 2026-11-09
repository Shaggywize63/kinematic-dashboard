'use client';
// HR assistant: employees and managers get answers about their own HR data in chat. A simulation with fixed rules
// (no AI model, no network). Three previews: WhatsApp, voice in Indian languages, and an MCP design preview.

import { HrmsPage, Loading, TabBar, useTabParam } from '../../../../components/hrms/ui';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { assistStore, policyStore } from '../../../../lib/hrms/assist/store';
import { SimNote } from '../../../../components/hrms/assist/shared';
import WhatsAppTab from '../../../../components/hrms/assist/WhatsAppTab';
import VoiceTab from '../../../../components/hrms/assist/VoiceTab';
import McpTab from '../../../../components/hrms/assist/McpTab';

const TABS = ['whatsapp', 'voice', 'mcp'] as const;
type Tab = (typeof TABS)[number];

export default function AssistantPage() {
  const db = useHrmsDb();
  const assist = assistStore.use();
  const policy = policyStore.use();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'whatsapp');
  if (!db || !assist || !policy) return <Loading />;

  return (
    <HrmsPage
      eyebrow="HRMS · Assistant"
      title="HR assistant"
      description="Ask about your own leave, pay, PF, holidays and policies in plain words. Managers can also ask about their team's leave and attendance, never about their pay."
    >
      <SimNote testid="assistant-simulation">
        Everything on this page is a simulation. The answers come from fixed rules written for this preview. There is no AI model, no network call, and no message is sent to WhatsApp, a phone or an AI service.
        It reads the sample HR records in this browser and shows you which ones it used.
      </SimNote>
      <TabBar<Tab>
        value={tab} onChange={setTab}
        tabs={[{ key: 'whatsapp', label: 'WhatsApp' }, { key: 'voice', label: 'Voice (Indian languages)' }, { key: 'mcp', label: 'Ask Kinematic (MCP)' }]}
      />
      <div role="tabpanel" aria-label={tab}>
        {tab === 'whatsapp' && <WhatsAppTab db={db} assist={assist} policy={policy} />}
        {tab === 'voice' && <VoiceTab db={db} assist={assist} policy={policy} />}
        {tab === 'mcp' && <McpTab db={db} assist={assist} policy={policy} />}
      </div>
    </HrmsPage>
  );
}
