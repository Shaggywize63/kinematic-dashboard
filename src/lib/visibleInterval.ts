/**
 * `setInterval` that only runs while the tab is visible.
 *
 * Background polls (sidebar badges, chat unread count, …) used to keep firing in every hidden tab:
 * network calls and state updates nobody can see, in each of the tabs a user leaves open all day.
 * This one stops while the tab is hidden and, when the tab comes back, refreshes once straight away
 * and resumes the schedule.
 *
 * Returns a function that cancels it (call it from the effect cleanup).
 */
export function visibleInterval(fn: () => void, ms: number): () => void {
  if (typeof document === 'undefined') return () => {};
  let timer: number | null = null;
  const visible = () => document.visibilityState !== 'hidden';
  const start = () => { if (timer == null) timer = window.setInterval(fn, ms); };
  const stop = () => { if (timer != null) { window.clearInterval(timer); timer = null; } };
  const onVisibility = () => {
    if (visible()) { fn(); start(); } else stop();
  };
  if (visible()) start();
  document.addEventListener('visibilitychange', onVisibility);
  return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
}
