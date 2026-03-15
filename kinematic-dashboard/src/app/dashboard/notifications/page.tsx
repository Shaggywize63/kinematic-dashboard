"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type City = { id: string; name: string; };
type Supervisor = { id: string; name: string; cityId: string; };
type FieldExec = { id: string; name: string; supervisorId: string; };
type Priority = "Info" | "Warning" | "Critical";

type SentNotification = {
  id: string; title: string; message: string; priority: Priority;
  target: string; readRate: number; sentAt: string;
};

type FormState = {
  title: string; message: string; priority: Priority;
  cityId: string; supervisorId: string; fieldExecId: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL ?? "";

// ✅ FIXED: use kinematic_token, not "token"
function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("kinematic_token") ?? "";
}

async function apiFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const json = await res.json();
  return (json.data ?? json) as T;
}

function buildAudienceLabel(
  form: FormState, cities: City[], supervisors: Supervisor[], fieldExecs: FieldExec[]
): { heading: string; subtext: string } {
  if (form.fieldExecId && form.fieldExecId !== "all") {
    const fe = fieldExecs.find((f) => f.id === form.fieldExecId);
    return { heading: fe?.name ?? "1 Field Exec", subtext: "Specific FE" };
  }
  if (form.supervisorId && form.supervisorId !== "all") {
    const sup = supervisors.find((s) => s.id === form.supervisorId);
    const count = fieldExecs.length;
    return { heading: sup?.name ?? "Supervisor", subtext: `${count} FE${count !== 1 ? "s" : ""} under this supervisor` };
  }
  if (form.cityId && form.cityId !== "all") {
    const city = cities.find((c) => c.id === form.cityId);
    return { heading: city?.name ?? "City", subtext: "All FEs in this city" };
  }
  return { heading: "All Users", subtext: "via In-App Feed" };
}

const PRIORITY_STYLES: Record<Priority, { bg: string; text: string; dot: string }> = {
  Info:     { bg: "bg-blue-500/10",   text: "text-blue-400",   dot: "bg-blue-400"   },
  Warning:  { bg: "bg-yellow-500/10", text: "text-yellow-400", dot: "bg-yellow-400" },
  Critical: { bg: "bg-red-500/10",    text: "text-red-400",    dot: "bg-red-500"    },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold tracking-widest text-[#4A5568] uppercase mb-2">
      {children}
    </p>
  );
}

function SelectField({ value, onChange, disabled, children }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full px-4 py-3 rounded-xl text-sm font-medium bg-[#0D1117] border border-[#1E2D3D] text-[#CBD5E0] appearance-none cursor-pointer focus:outline-none focus:border-[#EF1F35] focus:ring-1 focus:ring-[#EF1F35]/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%234A5568' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center" }}
    >
      {children}
    </select>
  );
}

function LoadingDots() {
  return (
    <span className="inline-flex gap-1 items-center">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-1 h-1 rounded-full bg-[#4A5568] animate-pulse" style={{ animationDelay: `${i * 150}ms` }}/>
      ))}
    </span>
  );
}

function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <>
      <style>{`@keyframes toastIn { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }`}</style>
      <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl border text-sm font-semibold ${type === "success" ? "bg-[#0a1f12] border-[#00DF7A]/30 text-[#00DF7A]" : "bg-[#1a0608] border-[#EF1F35]/30 text-[#EF1F35]"}`} style={{ animation: "toastIn 0.3s ease" }}>
      <span>{type === "success" ? "✓" : "✗"}</span>
      {message}
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100 text-base leading-none">×</button>
      </div>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const [form, setForm] = useState<FormState>({
    title: "", message: "", priority: "Info",
    cityId: "all", supervisorId: "all", fieldExecId: "all",
  });

  const [cities,      setCities]      = useState<City[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [fieldExecs,  setFieldExecs]  = useState<FieldExec[]>([]);
  const [history,     setHistory]     = useState<SentNotification[]>([]);

  const [loadingCities,      setLoadingCities]      = useState(true);
  const [loadingSupervisors, setLoadingSupervisors] = useState(false);
  const [loadingFieldExecs,  setLoadingFieldExecs]  = useState(false);
  const [sending,            setSending]            = useState(false);
  const [loadingHistory,     setLoadingHistory]     = useState(true);

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // ── Fetch cities from City Management on mount ─────────────────────────────
  useEffect(() => {
    setLoadingCities(true);
    apiFetch<City[]>("/api/v1/cities", getToken())
      .then((data) => {
        // Filter only active cities
        const active = Array.isArray(data)
          ? data.filter((c: any) => c.is_active !== false)
          : [];
        setCities(active);
      })
      .catch((err) => {
        console.error("Failed to load cities:", err);
        setToast({ message: "Could not load cities", type: "error" });
      })
      .finally(() => setLoadingCities(false));
  }, []);

  // ── Fetch notification history on mount ───────────────────────────────────
  useEffect(() => {
    setLoadingHistory(true);
    apiFetch<any>("/api/v1/notifications", getToken())
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.data ?? data?.notifications ?? []);
        setHistory(Array.isArray(list) ? list : []);
      })
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));
  }, []);

  // ── Fetch supervisors when city changes ───────────────────────────────────
  useEffect(() => {
    setForm((f) => ({ ...f, supervisorId: "all", fieldExecId: "all" }));
    setSupervisors([]);
    setFieldExecs([]);
    if (!form.cityId || form.cityId === "all") return;
    setLoadingSupervisors(true);
    apiFetch<any>(`/api/v1/users?role=supervisor&city=${form.cityId}`, getToken())
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.data ?? data?.users ?? []);
        setSupervisors(Array.isArray(list) ? list : []);
      })
      .catch((err) => {
        console.error("Failed to load supervisors:", err);
        setToast({ message: "Could not load supervisors", type: "error" });
      })
      .finally(() => setLoadingSupervisors(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.cityId]);

  // ── Fetch field execs when supervisor changes ─────────────────────────────
  useEffect(() => {
    setForm((f) => ({ ...f, fieldExecId: "all" }));
    setFieldExecs([]);
    if (!form.supervisorId || form.supervisorId === "all") return;
    setLoadingFieldExecs(true);
    apiFetch<any>(`/api/v1/users?role=executive&supervisor_id=${form.supervisorId}`, getToken())
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.data ?? data?.users ?? []);
        setFieldExecs(Array.isArray(list) ? list : []);
      })
      .catch((err) => {
        console.error("Failed to load field execs:", err);
        setToast({ message: "Could not load field executives", type: "error" });
      })
      .finally(() => setLoadingFieldExecs(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.supervisorId]);

  // ── Derived audience — must be before handleSend ─────────────────────────
  const audience   = buildAudienceLabel(form, cities, supervisors, fieldExecs);
  const isFormValid = form.title.trim().length > 0 && form.message.trim().length > 0;

  // ── Send notification ─────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!form.title.trim() || !form.message.trim()) {
      setToast({ message: "Title and message are required", type: "error" });
      return;
    }
    setSending(true);
    try {
      const payload = {
        title:        form.title.trim(),
        message:      form.message.trim(),
        priority:     form.priority,
        cityId:       form.cityId       !== "all" ? form.cityId       : null,
        supervisorId: form.supervisorId !== "all" ? form.supervisorId : null,
        fieldExecId:  form.fieldExecId  !== "all" ? form.fieldExecId  : null,
      };
      const res = await fetch(`${API}/api/v1/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = await res.json();
      setHistory((prev) => [{
        id:       created.id ?? crypto.randomUUID(),
        title:    form.title,
        message:  form.message,
        priority: form.priority,
        target:   audience.heading,
        readRate: 0,
        sentAt:   new Date().toISOString(),
      }, ...prev]);
      setForm({ title: "", message: "", priority: "Info", cityId: "all", supervisorId: "all", fieldExecId: "all" });
      setSupervisors([]);
      setFieldExecs([]);
      setToast({ message: "Notification sent successfully!", type: "success" });
    } catch (err) {
      console.error("Send failed:", err);
      setToast({ message: "Failed to send notification", type: "error" });
    } finally {
      setSending(false);
    }
  }, [form]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#080C12] text-[#CBD5E0] p-6 lg:p-8">

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white tracking-tight">Notifications</h1>
        <p className="text-sm text-[#4A5568] mt-1">Send broadcast notifications to field executives</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6 items-start">

        {/* ── Left: Send form ── */}
        <div className="space-y-5">
          <div className="bg-[#0D1117] border border-[#1E2D3D] rounded-2xl p-6">
            <h2 className="text-base font-bold text-white mb-5">Send Notification</h2>

            {/* Title + Priority */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-4 mb-4">
              <div>
                <Label>Title</Label>
                <input
                  type="text" placeholder="e.g. Attendance Reminder" value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl text-sm font-medium bg-[#0D1117] border border-[#1E2D3D] text-white placeholder-[#2D3748] focus:outline-none focus:border-[#EF1F35] focus:ring-1 focus:ring-[#EF1F35]/30 transition-all duration-150"
                />
              </div>
              <div>
                <Label>Priority</Label>
                <SelectField value={form.priority} onChange={(v) => setForm((f) => ({ ...f, priority: v as Priority }))}>
                  {(["Info", "Warning", "Critical"] as Priority[]).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </SelectField>
              </div>
            </div>

            {/* Message */}
            <div className="mb-5">
              <Label>Message</Label>
              <textarea
                placeholder="Write notification message…" value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                rows={4}
                className="w-full px-4 py-3 rounded-xl text-sm font-medium resize-none bg-[#0D1117] border border-[#1E2D3D] text-white placeholder-[#2D3748] focus:outline-none focus:border-[#EF1F35] focus:ring-1 focus:ring-[#EF1F35]/30 transition-all duration-150"
              />
            </div>

            <div className="border-t border-[#1E2D3D] my-5" />

            {/* ── City dropdown — fetched from City Management ── */}
            <div className="mb-4">
              <Label>City</Label>
              <SelectField
                value={form.cityId}
                onChange={(v) => setForm((f) => ({ ...f, cityId: v }))}
                disabled={loadingCities}
              >
                <option value="all">
                  {loadingCities ? "Loading cities…" : `All Cities (${cities.length} available)`}
                </option>
                {(Array.isArray(cities)?cities:[]).map((city) => (
                  <option key={city.id} value={city.id}>{city.name}</option>
                ))}
              </SelectField>
              {!loadingCities && cities.length === 0 && (
                <p className="text-xs text-[#4A5568] mt-1.5">
                  No cities found — add cities in <strong className="text-[#CBD5E0]">Other Management → City Management</strong>
                </p>
              )}
            </div>

            {/* ── Supervisor + Field Exec ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div>
                <Label>
                  Supervisor
                  {loadingSupervisors && <span className="ml-2 normal-case tracking-normal font-normal"><LoadingDots /></span>}
                </Label>
                <SelectField
                  value={form.supervisorId}
                  onChange={(v) => setForm((f) => ({ ...f, supervisorId: v }))}
                  disabled={form.cityId === "all" || loadingSupervisors}
                >
                  <option value="all">
                    {form.cityId === "all" ? "Select a city first" : loadingSupervisors ? "Loading…" : `All Supervisors (${supervisors.length})`}
                  </option>
                  {(Array.isArray(supervisors)?supervisors:[]).map((sup) => (
                    <option key={sup.id} value={sup.id}>{sup.name}</option>
                  ))}
                </SelectField>
              </div>
              <div>
                <Label>
                  Field Executive
                  {loadingFieldExecs && <span className="ml-2 normal-case tracking-normal font-normal"><LoadingDots /></span>}
                </Label>
                <SelectField
                  value={form.fieldExecId}
                  onChange={(v) => setForm((f) => ({ ...f, fieldExecId: v }))}
                  disabled={form.supervisorId === "all" || loadingFieldExecs}
                >
                  <option value="all">
                    {form.supervisorId === "all" ? "Select a supervisor first" : loadingFieldExecs ? "Loading…" : `All FEs (${fieldExecs.length})`}
                  </option>
                  {(Array.isArray(fieldExecs)?fieldExecs:[]).map((fe) => (
                    <option key={fe.id} value={fe.id}>{fe.name}</option>
                  ))}
                </SelectField>
              </div>
            </div>

            {/* Send button */}
            <button
              onClick={handleSend} disabled={!isFormValid || sending}
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white bg-[#EF1F35] hover:bg-[#d41a2e] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 transition-all duration-150 shadow-lg shadow-red-500/20 flex items-center justify-center gap-2"
            >
              {sending ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25"/>
                    <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                  Sending…
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 17-7z"/>
                  </svg>
                  Send Broadcast Notification
                </>
              )}
            </button>
          </div>

          {/* ── Sent History ── */}
          <div className="bg-[#0D1117] border border-[#1E2D3D] rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#1E2D3D]">
              <h2 className="text-base font-bold text-white">Sent History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1E2D3D]">
                    {["Notification", "Target", "Priority", "Read Rate", "Sent At"].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-[11px] font-bold tracking-widest text-[#4A5568] uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingHistory ? (
                    <tr><td colSpan={5} className="px-5 py-10 text-center text-[#4A5568] text-sm">Loading history…</td></tr>
                  ) : history.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center">
                        <div className="text-[#2D3748] text-3xl mb-2">📭</div>
                        <div className="text-[#4A5568] text-sm">No notifications sent yet</div>
                      </td>
                    </tr>
                  ) : (
                    (Array.isArray(history)?history:[]).map((n) => {
                      const ps = PRIORITY_STYLES[n.priority];
                      return (
                        <tr key={n.id} className="border-b border-[#0F1923] hover:bg-[#0a0f16] transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="font-semibold text-white text-sm leading-tight">{n.title}</div>
                            <div className="text-[#4A5568] text-xs mt-0.5 truncate max-w-[240px]">{n.message}</div>
                          </td>
                          <td className="px-5 py-3.5"><span className="text-[#CBD5E0] text-sm">{n.target}</span></td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${ps.bg} ${ps.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${ps.dot}`}/>{n.priority}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="flex-1 h-1.5 bg-[#1E2D3D] rounded-full overflow-hidden w-20">
                                <div className="h-full bg-[#00DF7A] rounded-full transition-all" style={{ width: `${n.readRate}%` }}/>
                              </div>
                              <span className="text-xs font-bold text-[#CBD5E0] tabular-nums">{n.readRate}%</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-[#4A5568] text-xs whitespace-nowrap">
                            {new Date(n.sentAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Right: Recipients panel ── */}
        <div className="space-y-4 xl:sticky xl:top-6">
          <div className="bg-[#0D1117] border border-[#1E2D3D] rounded-2xl p-5">
            <h2 className="text-base font-bold text-white mb-4">Recipients</h2>
            <div className="space-y-3 mb-4">
              {[
                { label: "City",       value: loadingCities      ? "Loading…" : form.cityId       === "all" ? "All Cities"       : cities.find((c) => c.id === form.cityId)?.name           ?? "—" },
                { label: "Supervisor", value: form.cityId === "all" ? "All"   : loadingSupervisors ? "Loading…" : form.supervisorId === "all" ? "All" : supervisors.find((s) => s.id === form.supervisorId)?.name ?? "—" },
                { label: "Field Exec", value: form.supervisorId === "all" ? "All" : loadingFieldExecs ? "Loading…" : form.fieldExecId === "all" ? "All" : fieldExecs.find((f) => f.id === form.fieldExecId)?.name ?? "—" },
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center text-sm">
                  <span className="text-[#4A5568]">{row.label}</span>
                  <span className="font-semibold text-[#CBD5E0] text-right max-w-[160px] truncate">{row.value}</span>
                </div>
              ))}
            </div>
            <div className="bg-[#EF1F35]/8 border border-[#EF1F35]/20 rounded-xl p-4">
              <p className="text-[10px] font-bold tracking-widest text-[#EF1F35]/70 uppercase mb-1.5">Audience</p>
              <p className="text-xl font-bold text-white leading-tight">{audience.heading}</p>
              <p className="text-xs text-[#EF1F35] mt-1">{audience.subtext}</p>
            </div>
          </div>

          <div className="bg-[#0D1117] border border-[#1E2D3D] rounded-2xl p-5">
            <h2 className="text-sm font-bold text-white mb-3">Priority Guide</h2>
            <div className="space-y-2.5">
              {(["Info", "Warning", "Critical"] as Priority[]).map((p) => {
                const ps = PRIORITY_STYLES[p];
                const desc = p === "Info" ? "Routine updates & reminders" : p === "Warning" ? "Requires attention soon" : "Immediate action needed";
                return (
                  <div key={p} className="flex items-start gap-3">
                    <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${ps.dot}`}/>
                    <div>
                      <p className={`text-xs font-bold ${ps.text}`}>{p}</p>
                      <p className="text-[11px] text-[#4A5568]">{desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
