"use client";
import { useEffect, useState, type FormEvent } from "react";
import { FilePlus2, Save, Send, ClipboardCheck } from "lucide-react";
import { backend } from "@/lib/participation/client";
import type { Permission } from "@/lib/participation/contracts";
import { Notice, styles } from "@/components/participation/shared";
import admin from "./admin.module.css";

const kinds = { article: "Article", event: "Event", outreach: "Outreach", partner: "Partnership" } as const;
const states: Record<string, string> = { draft: "Draft", in_review: "Awaiting staff review", changes_requested: "Changes requested", approved: "Approved", completed: "Completed", archived: "Archived" };
type Kind = keyof typeof kinds;
type Work = { id: string; kind: Kind; title: string; body: string; organization: string; source_url: string; due_on: string | null; status: string; assigned_to: string | null; review_note: string; version: number };
type Fields = { kind: Kind; title: string; body: string; organization: string; source_url: string; due_on: string; assigned_to: string; review_note: string };
const empty = (kind: Kind): Fields => ({ kind, title: "", body: "", organization: "", source_url: "", due_on: "", assigned_to: "", review_note: "" });
const fixture: Work = { id: "design-example", kind: "event", title: "A field morning at the community garden", body: "Proposed volunteer activity: photograph plants along the public path and practice identification using the atlas.\n\nBefore inviting anyone, confirm the location, landowner permission, accessibility, supervision and a weather plan. No removal or chemical treatment is proposed.", organization: "Example community garden (fictional)", source_url: "", due_on: null, status: "in_review", assigned_to: null, review_note: "", version: 0 };

export function OrganizationWork({ can, onDirtyChange, preview = false }: { can: (p: Permission) => boolean; onDirtyChange?: (dirty: boolean) => void; preview?: boolean }) {
 const available = (Object.keys(kinds) as Kind[]).filter(kind => can("approve") || can(kind === "article" ? "content" : kind === "event" ? "events" : "outreach"));
 const [records, setRecords] = useState<Work[]>(preview ? [fixture] : []), [selected, setSelected] = useState<Work | null>(null);
 const [fields, setFields] = useState<Fields>(empty(available[0] ?? "article")), [people, setPeople] = useState<{ user_id: string; display_name: string }[]>([]);
 const [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(!preview), [dirty, setDirty] = useState(false), [revision, setRevision] = useState(0), [filter, setFilter] = useState("all"), [page, setPage] = useState(0), [more, setMore] = useState(false);
 const reviewer = can("approve"), team = can("team");
 useEffect(() => {
  if (preview) return;
  let active = true; setLoading(true); setError("");
  let query = backend().from("isitusa_work").select("*").order("updated_at", { ascending: false }).order("id");
  if (filter !== "all") query = query.eq("status", filter);
  query.range(page * 25, page * 25 + 25).then(result => { if (!active) return; if (result.error) { setRecords([]); setError("Work could not load. Refresh your workspace to try again."); } else { setRecords(result.data.slice(0, 25)); setMore(result.data.length > 25); } setLoading(false); });
  return () => { active = false; };
 }, [preview, revision, filter, page]);
 useEffect(() => { if (preview || !reviewer || !team) return; let active = true; backend().from("isitusa_staff").select("user_id,display_name").eq("active", true).order("display_name").limit(100).then(result => { if (active && !result.error) setPeople(result.data); }); return () => { active = false; }; }, [preview, reviewer, team]);
 useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
 useEffect(() => { if (!dirty) return; const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); }; window.addEventListener("beforeunload", leave); return () => window.removeEventListener("beforeunload", leave); }, [dirty]);
 function choose(record: Work | null) { if (dirty && !window.confirm("Discard your unsaved work changes?")) return; setSelected(record); setFields(record ? { ...record, due_on: record.due_on ?? "", assigned_to: record.assigned_to ?? "" } : empty(available[0] ?? "article")); setDirty(false); setError(""); setMessage(""); }
 function change<K extends keyof Fields>(key: K, value: Fields[K]) { setFields(previous => ({ ...previous, [key]: value })); setDirty(true); }
 async function save(status: string) {
  setBusy(true); setError(""); setMessage("");
  try {
   const result = preview ? { data: { ...fields, id: selected?.id ?? "new-example", status, version: (selected?.version ?? -1) + 1 }, error: null } : await backend().rpc("isitusa_save_work", { record_id: selected?.id ?? null, expected_version: selected?.version ?? null, fields, next_status: status });
   if (result.error) throw new Error(result.error.message);
   const record = result.data as Work; setSelected(record); setDirty(false); setRevision(n => n + 1);
   if (preview) setRecords(previous => [record, ...previous.filter(item => item.id !== record.id)]);
   setMessage(preview ? "Design example updated. No project record changed." : `${states[status] ?? status}. This action did not publish content, contact anyone, or forward a report.`);
  } catch (failure) { setError(failure instanceof Error ? failure.message : "Your work could not be saved. Your text is still here."); } finally { setBusy(false); }
 }
 const editable = reviewer || !selected || ["draft", "changes_requested"].includes(selected.status);
 function submit(event: FormEvent) { event.preventDefault(); void save("draft"); }
 return <div>
  <div className={admin.workIntro}><p>Prepare the work, record the evidence, and bring it to staff for approval. Partner and outreach records stay internal.</p><label className={styles.field}>Work status<select className={styles.select} value={filter} disabled={busy || dirty} onChange={event => { setFilter(event.target.value); setPage(0); }}><option value="all">All work</option>{Object.entries(states).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label></div>
  <div className={admin.draftLayout}><div className={admin.draftList}><button disabled={busy} onClick={() => choose(null)} aria-pressed={!selected}><FilePlus2 size={16} aria-hidden="true"/>New proposal</button>{loading ? <p role="status">Reading the work queue...</p> : records.filter(row => !preview || filter === "all" || row.status === filter).map(record => <button disabled={busy} key={record.id} aria-pressed={selected?.id === record.id} onClick={() => choose(record)}>{record.title}<span>{kinds[record.kind]} / {states[record.status]}</span></button>)}{!loading && !records.length && <p className={styles.hint}>No work in this view yet. Start with a proposal or choose another status.</p>}<div className={admin.pagination}><button disabled={page === 0 || dirty || busy || preview} onClick={() => setPage(n => n - 1)}>Previous</button><span>Page {page + 1}</span><button disabled={!more || dirty || busy || preview} onClick={() => setPage(n => n + 1)}>Next</button></div></div>
  <form className={styles.form} onSubmit={submit}><div className={admin.workTitle}><h3>{selected ? kinds[selected.kind] : "A new proposal"}</h3><span className={admin.pill}>{selected ? states[selected.status] : "Not saved"}</span></div>
   <label className={styles.field}>Type<select className={styles.select} value={fields.kind} disabled={Boolean(selected) || busy} onChange={event => change("kind", event.target.value as Kind)}>{available.map(kind => <option key={kind} value={kind}>{kinds[kind]}</option>)}</select></label>
   <label className={styles.field}>Title<input className={styles.input} value={fields.title} disabled={!editable || busy} onChange={event => change("title", event.target.value)} required maxLength={150}/></label>
   <label className={styles.field}>{fields.kind === "article" ? "Article draft and sources" : "Plan, context and next step"}<textarea className={styles.textarea} rows={9} value={fields.body} disabled={!editable || busy} onChange={event => change("body", event.target.value)} maxLength={10000}/></label>
   <div className={styles.grid}><label className={styles.field}>Organization<input className={styles.input} value={fields.organization} disabled={!editable || busy} onChange={event => change("organization", event.target.value)} maxLength={150} placeholder="Partner or organization, if relevant"/></label><label className={styles.field}>Target date<input className={styles.input} type="date" value={fields.due_on} disabled={!editable || busy} onChange={event => change("due_on", event.target.value)}/></label></div>
   <label className={styles.field}>Supporting source or organization website<input className={styles.input} type="url" pattern="https://.*" value={fields.source_url} disabled={!editable || busy} onChange={event => change("source_url", event.target.value)} maxLength={1000} placeholder="https://"/></label>
   {reviewer && team && <label className={styles.field}>Assigned team member<select className={styles.select} value={fields.assigned_to} disabled={busy} onChange={event => change("assigned_to", event.target.value)}><option value="">Not assigned</option>{people.map(person => <option key={person.user_id} value={person.user_id}>{person.display_name}</option>)}</select></label>}
   {reviewer ? <label className={styles.field}>Staff review note<textarea className={styles.textarea} rows={3} maxLength={2000} value={fields.review_note} disabled={busy} onChange={event => change("review_note", event.target.value)} placeholder="What was checked, what needs changing, and the next step."/></label> : selected?.review_note && <Notice>{selected.review_note}</Notice>}
   <p className={styles.hint}>{dirty ? "Unsaved changes. " : ""}Approval records an internal decision. Public articles, event announcements and external outreach require a separate publication or sending step.</p>
   <div className={admin.draftActions}>{editable && <button className={styles.button} disabled={busy || !fields.title.trim()}><Save size={16} aria-hidden="true"/>{busy ? "Saving..." : "Save draft"}</button>}{(!selected || ["draft", "changes_requested"].includes(selected.status)) && <button className={`${styles.button} ${styles.secondary}`} type="button" disabled={busy || !fields.title.trim()} onClick={() => void save("in_review")}><Send size={16} aria-hidden="true"/>Submit for review</button>}{reviewer && selected?.status === "in_review" && <><button className={styles.button} type="button" disabled={busy || fields.review_note.trim().length < 3} onClick={() => void save("approved")}><ClipboardCheck size={16} aria-hidden="true"/>Approve work</button><button className={`${styles.button} ${styles.secondary}`} type="button" disabled={busy || fields.review_note.trim().length < 3} onClick={() => void save("changes_requested")}>Request changes</button></>}{reviewer && selected?.status === "approved" && <button className={styles.button} type="button" disabled={busy || dirty} onClick={() => void save("completed")}>Mark completed</button>}</div>
   {error && <Notice error>{error}</Notice>}{message && <Notice success>{message}</Notice>}
  </form></div>
 </div>;
}
