'use client';
/**
 * Daily Travel Report (Field Force → module `attendance`).
 *
 * Two views on one URL, kept in the query string so a link, a reload and the Back button all land where you were:
 *   /dashboard/travel-report?date=YYYY-MM-DD                  → Team: everyone who checked in that day
 *   /dashboard/travel-report?date=YYYY-MM-DD&user_id=<uuid>   → Employee day: route, visits, halts, timeline
 *
 * The data comes from GET /api/v1/attendance/daily-report[/team] (see src/lib/api.ts). Printing uses window.print()
 * with the stylesheet below, which leaves only the report on the page (no sidebar, header or floating widgets).
 */
import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useClient } from '../../../context/ClientContext';
import { usePageTitle } from '../../../lib/pageTitle';
import { isYmd, istToday } from '../../../lib/travelReport';
import { PageHeader, useIsCompact } from '../../../components/ui';
import DayReport from '../../../components/travel-report/DayReport';
import TeamReport from '../../../components/travel-report/TeamReport';

// Print: show ONLY .tr-print-root (the same approach as the Finance report viewer), light ink on white whatever the
// theme, keep colours (badges, map markers) and let the timeline run over as many pages as it needs.
const PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm; }
.tr-printonly { display: none; }
@media print {
  body * { visibility: hidden !important; transition: none !important; }
  .tr-print-root, .tr-print-root * { visibility: visible !important; }
  .tr-print-root {
    position: absolute; left: 0; top: 0; width: 100%; background: #fff; color: #000; padding: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    --text: #000; --dim: #333; --mute: #555; --border: #ccc; --border-l: #bbb;
    --canvas: #fff; --panel: #fff; --card: #fff; --field: #fff; --s2: #fff; --s3: #f3f3f3; --s4: #e6e6e6;
  }
  aside, main > header { display: none !important; }
  .tr-noprint { display: none !important; }
  .tr-printonly { display: block !important; }
  .tr-scroll { overflow: visible !important; }
  .tr-print-root table { width: 100% !important; min-width: 0 !important; }
  .tr-print-root thead { display: table-header-group; }
}`;

function TravelReportContent() {
  usePageTitle('Daily Travel Report');
  const narrow = useIsCompact(900);
  const { selectedClientId } = useClient();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const rawDate = params.get('date');
  const date = isYmd(rawDate) ? rawDate : istToday();
  const userId = params.get('user_id') || '';

  const go = (next: { date?: string; userId?: string }, how: 'push' | 'replace') => {
    const q = new URLSearchParams();
    q.set('date', next.date ?? date);
    const u = next.userId === undefined ? userId : next.userId;
    if (u) q.set('user_id', u);
    router[how](`${pathname}?${q.toString()}`);
  };

  return (
    <div className="tr-print-root" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <PageHeader
        title="Daily Travel Report"
        description={userId
          ? 'Route, customer visits, halts, distance and mode of transport for one employee on one day.'
          : 'Distance, mode of transport, customer visits and halts for every employee, one day at a time.'}
        compact={narrow}
      />
      {userId ? (
        <DayReport
          key={userId}
          date={date} userId={userId} clientId={selectedClientId}
          onDateChange={(d) => go({ date: d }, 'replace')}
          onBack={() => go({ userId: '' }, 'push')}
        />
      ) : (
        <TeamReport
          date={date} clientId={selectedClientId}
          onDateChange={(d) => go({ date: d }, 'replace')}
          onOpen={(id) => go({ userId: id }, 'push')}
        />
      )}
    </div>
  );
}

export default function TravelReportPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: 'var(--mute)', fontSize: 13 }}>Loading…</div>}>
      <TravelReportContent />
    </Suspense>
  );
}
