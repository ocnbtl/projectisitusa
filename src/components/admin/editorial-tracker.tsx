"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Search } from "lucide-react";
import queue from "@/content/editorial-queue.json";
import baseline from "@/content/editorial-review-baseline.json";
import { EDITORIAL_REVISIONS } from "@/content/species-editorial-revisions";
import { SPECIES_EDITORIAL_DRAFTS as SPECIES_EDITORIAL } from "@/content/species-editorial-drafts";
import { backend } from "@/lib/participation/client";
import { REVIEW_STATES, reviewStatus, sourceUrls, type EditorialTask, type ReviewStatus } from "@/lib/ui/editorial-review";
import { Notice, styles } from "@/components/participation/shared";
import css from "./editorial-review.module.css";

const prepared = queue.filter(row => Boolean(SPECIES_EDITORIAL[row.id]));
const batches = [...new Set(prepared.map(row => row.batch))];
const revisionRows = Object.values(EDITORIAL_REVISIONS);
const revisionReady = revisionRows.filter(row => row.status === "ready_for_review").length;
const researchUpdates = revisionRows.filter(row => (row.revisionNumber ?? 0) >= 3).length;
const previous = baseline as Record<string, string>;
export function EditorialTracker({ preview = false, canReview = false, onDirtyChange }: { preview?: boolean; canReview?: boolean; onDirtyChange?: (dirty: boolean) => void }) {
  const [tasks, setTasks] = useState<Record<string, EditorialTask>>({});
  const [batch, setBatch] = useState(1), [query, setQuery] = useState(""), [filter, setFilter] = useState("all"), [catalog, setCatalog] = useState(false);
  const [selected, setSelected] = useState(prepared[0]?.id ?? queue[0].id);
  const [loading, setLoading] = useState(!preview), [loadError, setLoadError] = useState(""), [retry, setRetry] = useState(0);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const dirty = useRef(false), saving = useRef(false);
  const onDirty = useCallback((value: boolean) => { dirty.current = value; onDirtyChange?.(value); }, [onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (dirty.current || saving.current) event.preventDefault(); };
    window.addEventListener("beforeunload", leave); return () => window.removeEventListener("beforeunload", leave);
  }, []);
  useEffect(() => {
    if (preview) return;
    let current = true;
    setLoading(true); setLoadError("");
    (async () => {
      try {
        const all: Record<string, EditorialTask> = {};
        for (let offset = 0; offset < 3000; offset += 1000) {
          const result = await backend().from("isitusa_editorial_tasks").select("*").order("species_id").range(offset, offset + 999);
          if (result.error) throw new Error("Your saved reviews could not load. You can still read the profiles; retry before saving feedback.");
          for (const task of result.data) all[task.species_id] = task;
          if (result.data.length < 1000) break;
        }
        if (current) setTasks(all);
      } catch (error) { if (current) setLoadError(error instanceof Error ? error.message : "Reviews unavailable. Please retry."); }
      finally { if (current) setLoading(false); }
    })();
    return () => { current = false; };
  }, [preview, retry]);
  const stateFor = (id: string) => reviewStatus(tasks[id], Boolean(SPECIES_EDITORIAL[id]));
  const approved = prepared.filter(row => stateFor(row.id) === "reviewed").length;
  const rows = (catalog ? queue : prepared).filter(row => (query.trim() ? `${row.commonName} ${row.scientificName} ${(EDITORIAL_REVISIONS[row.id]?.alternativeNames ?? []).join(" ")} ${(EDITORIAL_REVISIONS[row.id]?.otherScientificNames ?? []).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()) : row.batch === batch) && (filter === "all" || stateFor(row.id) === filter));
  const active = rows.find(row => row.id === selected) ?? rows[0];
  const index = rows.findIndex(row => row.id === active?.id);
  function change(action: () => void) {
    if (saving.current || (dirty.current && !window.confirm("Discard the unsaved feedback or draft on this profile?"))) return;
    onDirty(false); setSelectionRevision(n => n + 1); action();
  }
  const nextPending = [...rows.slice(index + 1), ...rows.slice(0, index)].find(row => stateFor(row.id) !== "reviewed");
  return <section className={css.review} aria-label="Species profile review">
    <div className={css.intro}><p>Read at your own pace. Check the sources, leave a note, and mark the descriptions you are happy with.</p><div className={css.progress}><strong>{prepared.length} profiles ready to read</strong><span>{loading ? "Loading your decisions..." : loadError ? "Saved decisions unavailable" : `${approved} approved · ${prepared.length - approved} still to review`}</span></div></div>
    {revisionRows.length > 0 && <p className={css.caption}>Research update: {researchUpdates} descriptions now have additional source research across all four batches. {revisionReady} of {revisionRows.length} are ready for your editorial review{revisionRows.length > revisionReady ? `; ${revisionRows.length - revisionReady} still have description research gaps` : ". All description research gaps have been addressed"}. Relevant name and historical-record limitations remain in the research notes. Your saved notes and draft approvals are preserved.</p>}
    {preview && <p className={css.preview} role="note">Preview only. Feedback and approvals here are examples and are not saved.</p>}
    <div className={css.batchBar} aria-label="Profile batches">{batches.map(number => <button key={number} aria-pressed={!catalog && batch === number && !query} onClick={() => change(() => { setBatch(number); setCatalog(false); setQuery(""); })}>Batch {number}<span>{(number - 1) * 50 + 1}-{Math.min(number * 50, prepared.length)}</span></button>)}<button aria-pressed={catalog} onClick={() => change(() => { setCatalog(!catalog); setBatch(1); setQuery(""); })}>{catalog ? "Back to prepared profiles" : "Full catalog"}<span>{catalog ? `${prepared.length} descriptions` : `${queue.length.toLocaleString()} species`}</span></button></div>
    <div className={css.filters}><label><span><Search size={15} aria-hidden="true"/> Find a species</span><input className={styles.input} value={query} onChange={event => change(() => setQuery(event.target.value))} placeholder={catalog ? "Search the full catalog" : "Search all 200 profiles"}/></label><label>Review status<select className={styles.select} value={filter} onChange={event => change(() => setFilter(event.target.value))}><option value="all">All statuses</option>{Object.entries(REVIEW_STATES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{catalog && <label>Catalog batch<select className={styles.select} value={batch} disabled={Boolean(query.trim())} onChange={event => change(() => setBatch(Number(event.target.value)))}>{Array.from({ length: Math.ceil(queue.length / 50) }, (_, i) => <option key={i} value={i + 1}>Batch {i + 1}</option>)}</select></label>}</div>
    {loadError && <Notice error>{loadError} <button className="text-link" onClick={() => setRetry(n => n + 1)}>Retry saved reviews</button></Notice>}
    {!active ? <div className={css.empty}><h3>No profiles match this view.</h3><p>Try a different name, batch or review status.</p><button className={`${styles.button} ${styles.secondary}`} onClick={() => change(() => { setQuery(""); setFilter("all"); })}>Clear filters</button></div> : <div className={css.workspace}>
      <nav className={css.speciesList} aria-label="Profiles in this view"><p>{rows.length} {rows.length === 1 ? "profile" : "profiles"}{query.trim() ? " across batches" : ` in batch ${batch}`}</p><div>{rows.map(row => <button key={row.id} aria-current={row.id === active.id ? "true" : undefined} onClick={() => change(() => setSelected(row.id))}><span className={css.listName}>{row.commonName}{stateFor(row.id) === "reviewed" && <Check size={15} aria-label="Approved"/>}</span><i>{row.scientificName}</i><span className={css.listMeta}>#{row.order} · {loading || loadError ? "Review status unavailable" : REVIEW_STATES[stateFor(row.id)]}</span></button>)}</div></nav>
      <div className={css.reader}><div className={css.readerNav}><span>{index + 1} of {rows.length} in this view</span><div><button aria-label="Previous profile" disabled={index === 0} onClick={() => change(() => setSelected(rows[index - 1].id))}><ArrowLeft size={18}/></button><button aria-label="Next profile" disabled={index === rows.length - 1} onClick={() => change(() => setSelected(rows[index + 1].id))}><ArrowRight size={18}/></button></div></div>
        <ProfileReview key={`${active.id}:${loading}:${retry}:${selectionRevision}`} row={active} task={tasks[active.id]} canReview={canReview} preview={preview} unavailable={loading || Boolean(loadError)} onDirty={onDirty} onSaving={value => { saving.current = value; }} onSaved={task => setTasks(current => ({ ...current, [task.species_id]: task }))}/>
        {nextPending && <button className={css.next} onClick={() => change(() => setSelected(nextPending.id))}>Next awaiting review <ArrowRight size={16}/></button>}
      </div>
    </div>}
  </section>;
}
function ProfileReview({ row, task, canReview, preview, unavailable, onDirty, onSaving, onSaved }: { row: typeof queue[number]; task?: EditorialTask; canReview: boolean; preview: boolean; unavailable: boolean; onDirty: (value: boolean) => void; onSaving: (value: boolean) => void; onSaved: (task: EditorialTask) => void }) {
  const editorial = SPECIES_EDITORIAL[row.id];
  const revision = EDITORIAL_REVISIONS[row.id];
  const [draft, setDraft] = useState(task?.draft ?? editorial?.summary ?? ""), [notes, setNotes] = useState(task?.notes ?? ""), [sources, setSources] = useState((task?.sources ?? editorial?.sources.map(source => source.url) ?? []).join("\n"));
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState(""), [dirty, setDirty] = useState(false);
  const publishedSources = editorial?.sources ?? [];
  const status = reviewStatus(task, Boolean(editorial));
  function edit(action: () => void) { action(); setDirty(true); onDirty(true); setMessage(""); }
  async function save(nextStatus: ReviewStatus) {
    if (busy || unavailable || (nextStatus === "reviewed" && !canReview)) return;
    setBusy(true); onSaving(true); onDirty(true); setError(""); setMessage("");
    try {
      const urls = sourceUrls(sources);
      if (["in_review", "reviewed"].includes(nextStatus) && (draft.trim().length < 30 || !urls.length)) throw new Error("Add a description of at least 30 characters and a source before requesting review or approval.");
      let version = (task?.version ?? 0) + 1;
      if (!preview) {
        const result = await backend().rpc("isitusa_save_editorial", { species: row.id, expected_version: task?.version ?? null, next_status: nextStatus, next_draft: draft, next_notes: notes, next_sources: urls });
        if (result.error) throw new Error(result.error.code === "40001" ? "Someone saved a newer review. Copy your unsaved notes, then use Refresh to load it before saving again." : "Your review could not be saved. Your changes are still here. Check your connection and team access, then retry.");
        version = result.data;
      }
      onSaved({ species_id: row.id, draft: draft.trim(), notes: notes.trim(), sources: urls, status: nextStatus, version, updated_at: new Date().toISOString() });
      setDraft(draft.trim()); setNotes(notes.trim()); setSources(urls.join("\n")); setDirty(false); onDirty(false);
      setMessage(preview ? "Preview updated. Nothing was saved to your real workspace." : nextStatus === "reviewed" ? "Approval saved for this draft. Public descriptions are published separately." : "Feedback and draft saved privately. This profile is still awaiting approval.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save. Your changes are still here."); onDirty(dirty); }
    finally { setBusy(false); onSaving(false); }
  }
  return <article aria-labelledby="profile-review-name">
    <header className={css.profileHeader}><h3 id="profile-review-name">{row.commonName}</h3><p><i>{row.scientificName}</i></p><div className={css.profileMeta}><span>Batch {row.batch} · Profile {row.order}</span><span>{unavailable ? "Reading saved review..." : dirty ? "Unsaved changes" : REVIEW_STATES[status]}</span></div></header>
    {revision && <section className={css.revision} aria-label="Updated description">
      <h4>Updated description{revision.revisionNumber ? ` · Round ${revision.revisionNumber}` : ""}</h4>
      <p className={css.caption}>{revision.revisedAt && <>Revised <time dateTime={revision.revisedAt}>{revision.revisedAt}</time>. </>}{(revision.revisionNumber ?? 0) >= 3 ? "Additional independent sources checked; description revised to match the evidence." : "Clearer language, consistent names and useful details, based on the existing research."} {revision.status === "ready_for_review" ? "Ready for your editorial review." : "Research gaps remain; check the limitations below."} Your saved feedback remains attached to the draft below.</p>
      <p className={css.description}>{revision.proposedDescription}</p>
      {revision.alternativeNames?.length ? <p className={css.caption}><strong>Other common names:</strong> {revision.alternativeNames.join("; ")}</p> : null}
      {revision.otherScientificNames?.length ? <p className={css.caption}><strong>Names used in other references:</strong> {revision.otherScientificNames.join("; ")}. See the research notes for differences in classification.</p> : null}
      {revision.previousDescription && <details className={css.disclosure}><summary>Compare with the previous candidate</summary><p className={css.comparison}>{revision.previousDescription}</p></details>}
      <details className={css.disclosure}><summary>Sources, identification and research notes</summary>
        {revision.identification && <><h5>How to identify it</h5><p>{revision.identification}</p></>}
        {revision.actions && <><h5>What to do</h5><p>{revision.actions}</p></>}
        <p className={css.caption}>{revision.researchNotes}</p><ul>{revision.sources.map(source => <li key={source.url}><a className="text-link" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a> <small>Checked {source.accessedAt}</small></li>)}</ul>
      </details>
      <button type="button" className={`${styles.button} ${styles.secondary}`} disabled={busy || unavailable || revision.status !== "ready_for_review" || draft === revision.proposedDescription} onClick={() => { if (dirty && !window.confirm("Replace your unsaved description and sources with this research revision? Your feedback will be kept.")) return; edit(() => { setDraft(revision.proposedDescription); setSources(revision.sources.map(source => source.url).join("\n")); }); }}>Use revision in my draft</button>
    </section>}
    {revision && <h4>Current review draft</h4>}
    <p className={css.description}>{draft || "This profile is waiting for its first sourced description. Use Edit draft below to begin."}</p>
    {task?.draft && task.draft !== editorial?.summary && <p className={css.caption}>You are reading your saved private draft.</p>}
    <p className={css.caption}>Prepared for your review. The public profile keeps its current description until a separate publication.</p>
    <a className={css.publicLink} href={`/species/${row.id}`} target="_blank" rel="noopener noreferrer">View public profile <ArrowUpRight size={15} aria-hidden="true"/></a>
    <section className={css.sources}><h4>Read the sources</h4>{editorial && <p className={css.caption}>Original draft research checked {editorial.reviewedAt}. New revision dates are shown above; source checking is separate from your approval.</p>}<ul>{sources.split(/\r?\n/).filter(url => /^https?:\/\//i.test(url.trim())).map((url, index) => { const label = publishedSources.find(source => source.url === url.trim())?.label; let host = "Source link"; try { host = new URL(url.trim()).hostname.replace(/^www\./, ""); } catch {} return <li key={`${url}:${index}`}><a href={url.trim()} target="_blank" rel="noopener noreferrer"><span>{label ?? host}<small>{host}</small></span><ArrowUpRight size={16} aria-hidden="true"/></a></li>; })}</ul>{!sources.trim() && <p className={css.caption}>No sources added yet.</p>}</section>
    <details className={css.disclosure}><summary>Compare with previous description</summary>{previous[row.id] ? <><p className={css.caption}>Before this 200-profile review round.{previous[row.id] === editorial?.summary ? " The wording is unchanged." : ""}</p><p className={css.comparison}>{previous[row.id]}</p></> : <p className={css.comparison}>No earlier separately reviewed description was recorded for this species. This is its first sourced editorial draft in the review series.</p>}</details>
    <form className={css.feedback} onSubmit={event => { event.preventDefault(); void save(draft.trim().length >= 30 && sources.trim() ? "in_review" : "in_progress"); }}>
      <label className={styles.field}>Your feedback<textarea className={styles.textarea} rows={3} maxLength={6000} disabled={busy || unavailable} value={notes} onChange={event => edit(() => setNotes(event.target.value))} placeholder="What works? What needs a clearer explanation or another source?"/></label>
      <details className={css.disclosure}><summary>Edit draft and sources</summary><div className={css.editFields}><label className={styles.field}>Description<textarea className={styles.textarea} rows={7} maxLength={6000} disabled={busy || unavailable} value={draft} onChange={event => edit(() => setDraft(event.target.value))}/></label><label className={styles.field}>Source links, one per line<textarea className={styles.textarea} rows={3} maxLength={30000} disabled={busy || unavailable} value={sources} onChange={event => edit(() => setSources(event.target.value))}/></label></div></details>
      <div className={css.actions}><button type="submit" className={`${styles.button} ${styles.secondary}`} disabled={busy || unavailable}>{busy ? "Saving..." : "Save feedback"}</button>{canReview && <button type="button" className={styles.button} disabled={busy || unavailable || (!dirty && status === "reviewed")} onClick={() => void save("reviewed")}><Check size={16} aria-hidden="true"/>{!dirty && status === "reviewed" ? "Approved" : "Approve draft"}</button>}</div>
      <p className={css.caption}>Feedback stays in the team workspace. Saving or approving a draft does not publish it.{!canReview && " Final approval belongs to an authorized reviewer."}</p>
      {error && <Notice error>{error}</Notice>}{message && <Notice success>{message}</Notice>}
    </form>
  </article>;
}
