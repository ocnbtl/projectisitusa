"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, ChartNoAxesCombined, ClipboardList, HeartHandshake, LayoutDashboard, LogOut, Mail, RefreshCw, Settings2, ShieldCheck, Users } from "lucide-react";
import type { Permission } from "@/lib/participation/contracts";
import { styles } from "@/components/participation/shared";
import admin from "./admin.module.css";

export const WORKSPACE_TABS = [
  { id: "overview", name: "Overview", icon: LayoutDashboard, description: "A clear view of the work ahead." },
  { id: "review", name: "Sightings", icon: ClipboardList, description: "Review observations, compare evidence and record a decision." },
  { id: "audience", name: "Email audience", icon: Mail, description: "Follow subscriber choices and prepare the next update." },
  { id: "finance", name: "Contributions", icon: HeartHandshake, description: "Verified receipts, with their original amounts and sources." },
  { id: "analytics", name: "Site activity", icon: ChartNoAxesCombined, description: "Understand how consenting visitors use the atlas." },
  { id: "team", name: "Team access", icon: Users, description: "Give each person the access their work requires." },
  { id: "settings", name: "Connections", icon: Settings2, description: "See what is configured and what still needs verification." },
] as const;
export type WorkspaceTab = typeof WORKSPACE_TABS[number]["id"];
export function visibleTab(tab: WorkspaceTab, can: (permission: Permission) => boolean) {
  return tab === "overview" || can(tab === "settings" ? "team" : tab);
}
export function WorkspaceFrame({ name, owner, tab, can, loading, refreshedAt, onTab, onRefresh, onSignOut, children }: {
  name: string; owner: boolean; tab: WorkspaceTab; can: (permission: Permission) => boolean; loading: boolean; refreshedAt: string | null;
  onTab: (tab: WorkspaceTab) => void; onRefresh: () => void; onSignOut: () => void; children: ReactNode;
}) {
  const current = WORKSPACE_TABS.find(item => item.id === tab)!;
  return <main id="main-content" className={admin.shell}>
    <header className={admin.top}><div><h1>Our working atlas.</h1><p className={admin.security}><ShieldCheck size={15} aria-hidden="true"/> {name} <span>{owner ? "Owner" : "Team member"}</span></p></div><button className={`${styles.button} ${styles.secondary}`} onClick={onSignOut}><LogOut size={16} aria-hidden="true"/>Sign out</button></header>
    <div className={admin.body}><aside className={admin.sidebar}><nav className={admin.nav} aria-label="Workspace">{WORKSPACE_TABS.filter(item => visibleTab(item.id, can)).map(item => <button key={item.id} aria-current={tab === item.id ? "page" : undefined} onClick={() => onTab(item.id)}><item.icon size={18} aria-hidden="true"/><span>{item.name}</span></button>)}</nav><Link href="/" className={admin.backToAtlas}>Open the public atlas <ArrowRight size={15} aria-hidden="true"/></Link></aside>
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
  return <div className={admin.overview}><section><h3>Where to begin</h3><div className={admin.taskList}>{tasks.filter(task => can(task.permission)).map(task => <button key={task.tab} className={admin.task} onClick={() => onTab(task.tab)}><span><strong>{task.title}</strong><span>{task.detail}</span></span><span className={admin.taskCount}><b>{task.count === undefined ? "Unavailable" : task.count.toLocaleString()}</b><span>{task.unit}</span></span><ArrowRight size={18} aria-hidden="true"/></button>)}</div>{!tasks.some(task => can(task.permission)) && <p className={admin.empty}>Use the sections in your navigation to get started. Your access is set by the workspace owner.</p>}</section>
      <div className={admin.overviewNotes}><section><h3>Evidence comes first.</h3><p>A review decision belongs to an observation. Research review still comes before any change to the public map.</p><a className="text-link" href="/research">Read the research status <ArrowRight size={14} aria-hidden="true"/></a></section><section><h3>Keep access purposeful.</h3><p>Private observations, email choices and contributions are separated by role. Sign out when you finish on a shared device.</p>{can("team") && <button className="text-link" onClick={() => onTab("team")}>Review team access <ArrowRight size={14} aria-hidden="true"/></button>}</section></div>
    </div>;
}

export function WorkspaceLoading() {
  return <div className={admin.loading} role="status"><span className={admin.loadingMark} aria-hidden="true"/><span>Reading your workspace...</span><div aria-hidden="true" className={admin.loadingLines}><i/><i/><i/></div></div>;
}
