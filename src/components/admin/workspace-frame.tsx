"use client";
import Link from "next/link";
import { SPECIES_EDITORIAL_DRAFTS as SPECIES_EDITORIAL } from "@/content/species-editorial-drafts";
import type { ReactNode } from "react";
import { BookOpenCheck, MessageCircle, Eye, ArrowRight, ChartNoAxesCombined, ClipboardList, HeartHandshake, LayoutDashboard, LogOut, Mail, NotebookPen, FolderKanban, RefreshCw, Settings2, ShieldCheck, Users } from "lucide-react";
import type { Permission } from "@/lib/participation/contracts";
import { styles } from "@/components/participation/shared";
import admin from "./admin.module.css";

export const WORKSPACE_TABS = [
  { id: "chat", name: "Team room", icon: MessageCircle, description: "Conversations for everyone on the team." },
  { id: "overview", name: "Overview", icon: LayoutDashboard, description: "A clear view of the work ahead." },
  { id: "research", name: "Profile review", icon: BookOpenCheck, description: "Read the latest descriptions, check their sources and leave your feedback." },
  { id: "review", name: "Sightings", icon: ClipboardList, description: "Review observations, compare evidence and record a decision." },
  { id: "work", name: "Projects & proposals", icon: FolderKanban, description: "Articles, events, outreach and partnerships, with staff approval." },
  { id: "campaigns", name: "Email studio", icon: NotebookPen, description: "Write a useful update, review its sources, and prepare it for delivery." },
  { id: "audience", name: "Email audience", icon: Mail, description: "Follow subscriber choices and prepare the next update." },
  { id: "finance", name: "Contributions", icon: HeartHandshake, description: "Verified receipts, with their original amounts and sources." },
  { id: "analytics", name: "Site activity", icon: ChartNoAxesCombined, description: "Understand how consenting visitors use the website." },
  { id: "team", name: "Team access", icon: Users, description: "Give each person the access their work requires." },
  { id: "settings", name: "Connections", icon: Settings2, description: "See what is configured and what still needs verification." },
] as const;
export type WorkspaceTab = typeof WORKSPACE_TABS[number]["id"];
export function visibleTab(tab: WorkspaceTab, can: (permission: Permission) => boolean) {
  if (tab === "research") return can("content") || can("review") || can("approve");
  if (tab === "chat") return true;
  if (tab === "work") return ["content","events","outreach","approve"].some(p => can(p as Permission));
  if (tab === "campaigns") return can("content") || can("audience") || can("publish");
  return tab === "overview" || can(tab === "settings" ? "team" : tab);
}
export function WorkspaceFrame({ name, owner, tab, can, loading, refreshedAt, onTab, onRefresh, onSignOut, onPreview, children }: {
  name: string; owner: boolean; tab: WorkspaceTab; can: (permission: Permission) => boolean; loading: boolean; refreshedAt: string | null;
  onTab: (tab: WorkspaceTab) => void; onRefresh: () => void; onSignOut: () => void; onPreview?: () => void; children: ReactNode;
}) {
  const current = WORKSPACE_TABS.find(item => item.id === tab)!;
  return <main id="main-content" className={admin.shell}>
    <header className={admin.top}><div><h1>Team workspace</h1><p className={admin.security}><ShieldCheck size={15} aria-hidden="true"/> {name} <span>{owner ? "Owner" : "Team member"}</span></p></div><div className={admin.draftActions}>{owner&&onPreview&&<button className={`${styles.button} ${styles.secondary}`} onClick={onPreview}><Eye size={16} aria-hidden="true"/>Preview a role</button>}<button className={`${styles.button} ${styles.secondary}`} onClick={onSignOut}><LogOut size={16} aria-hidden="true"/>Sign out</button></div></header>
    <div className={admin.body}><aside className={admin.sidebar}><nav className={admin.nav} aria-label="Workspace">{WORKSPACE_TABS.filter(item => visibleTab(item.id, can)).map(item => <button key={item.id} aria-current={tab === item.id ? "page" : undefined} onClick={() => onTab(item.id)}><item.icon size={18} aria-hidden="true"/><span>{item.name}</span></button>)}</nav><Link href="/" className={admin.backToAtlas}>Open website <ArrowRight size={15} aria-hidden="true"/></Link></aside>
      <section className={admin.panel} aria-label={current.name} aria-busy={loading}><header className={admin.heading}><div><h2>{current.name}</h2><p>{current.description}</p></div><div className={admin.refreshGroup}><button className={`${styles.button} ${styles.secondary}`} disabled={loading} onClick={onRefresh}><RefreshCw size={16} aria-hidden="true"/>{loading ? "Refreshing" : "Refresh"}</button>{refreshedAt && <span>Checked {new Date(refreshedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>}</div></header><div className={admin.content} key={tab}>{children}</div></section>
    </div>
  </main>;
}

export function WorkspaceOverview({ counts, can, onTab }: { counts: Record<string, number>; can: (p: Permission) => boolean; onTab: (tab: WorkspaceTab) => void }) {
  const tasks = [
    { permission: "review", tab: "review", title: "Review the next observation", detail: "Check identification, photographs and location before a final decision.", count: counts.pending, unit: "awaiting review" },
    { permission: "audience", tab: "audience", title: "Keep your community informed", detail: "Prepare an update for the people who have chosen to hear from us.", count: counts.confirmed, unit: "confirmed and not suppressed" },
    { permission: "finance", tab: "finance", title: "Check contribution records", detail: "Read verified receipts and review refund or dispute records separately.", count: counts.finance, unit: "recorded receipts" },
  ] as const;
  return <div className={admin.overview}><section><h3>Where to begin</h3><div className={admin.taskList}>{visibleTab("research", can) && <button className={admin.task} onClick={() => onTab("research")}><span><strong>Read the latest species profiles</strong><span>Browse batches, compare descriptions and save private feedback.</span></span><span className={admin.taskCount}><b>{Object.keys(SPECIES_EDITORIAL).length}</b><span>prepared descriptions</span></span><ArrowRight size={18} aria-hidden="true"/></button>}{tasks.filter(task => can(task.permission)).map(task => <button key={task.tab} className={admin.task} onClick={() => onTab(task.tab)}><span><strong>{task.title}</strong><span>{task.detail}</span></span><span className={admin.taskCount}><b>{task.count === undefined ? "Unavailable" : task.count.toLocaleString()}</b><span>{task.unit}</span></span><ArrowRight size={18} aria-hidden="true"/></button>)}</div>{!visibleTab("research", can) && !tasks.some(task => can(task.permission)) && <p className={admin.empty}>Use the sections in your navigation to get started. Your access is set by the workspace owner.</p>}</section>
      <div className={admin.overviewNotes}><section><h3>Evidence comes first.</h3><p>A review decision belongs to an observation. Research review still comes before any change to the public map.</p><a className="text-link" href="/research">Read the research status <ArrowRight size={14} aria-hidden="true"/></a></section><section><h3>Keep access purposeful.</h3><p>Private observations, email choices and contributions are separated by role. Sign out when you finish on a shared device.</p>{can("team") && <button className="text-link" onClick={() => onTab("team")}>Review team access <ArrowRight size={14} aria-hidden="true"/></button>}</section></div>
    </div>;
}

export function WorkspaceLoading() {
  return <div className={admin.loading} role="status"><span className={admin.loadingMark} aria-hidden="true"/><span>Reading your workspace...</span><div aria-hidden="true" className={admin.loadingLines}><i/><i/><i/></div></div>;
}
