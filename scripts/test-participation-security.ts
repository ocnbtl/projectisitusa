import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { AVAILABILITY, validateVolunteer, volunteerMailto } from "../src/lib/participation/volunteers";

async function main() {
const valid = { consent: true, name: "Fixture volunteer", email: "person+research@example.com", interests: ["Species research"], availability: AVAILABILITY[1], skills: "Fixture skills", motivation: "Fixture motivation", schedule: "" };
assert.equal(validateVolunteer(valid).email, valid.email);
const href = volunteerMailto(valid.email)!;
assert.equal(decodeURIComponent(href.slice(7)), valid.email);
assert.equal(new URL(href).search, "");
for(const email of ["o'connor@example.org","_research@example.org","person?bcc=x@example.com","person%3f@example.com"]){
  assert.equal(validateVolunteer({...valid,email}).email,email);
  const encoded=volunteerMailto(email)!;
  assert.equal(decodeURIComponent(encoded.slice(7)),email);
  assert.equal(new URL(encoded).search,"");
  assert.equal(new URL(encoded).hash,"");
}
for (const email of ["person@example.com?bcc=other@example.com", "person@example.com#fragment", "person@example.com&bcc=x", "person@example.com,other@example.com", "person@example.com;other@example.com", "person\r\n@example.com", "person\t@example.com", "person..name@example.com"]) {
  assert.throws(() => validateVolunteer({ ...valid, email }));
  assert.equal(volunteerMailto(email), null, `Unsafe historical row: ${email}`);
}
const edge = await readFile("supabase/functions/_shared/volunteers.ts", "utf8");
assert.ok(edge.includes('import { validateVolunteer } from "../../../src/lib/participation/volunteers.ts"'));
const ui = await readFile("src/components/admin/volunteer-applications.tsx", "utf8");
assert.ok(ui.includes("href={emailHref}"));
assert.ok(!ui.includes("mailto:${item.email}"));

const db = new PGlite();
const author = "00000000-0000-4000-8000-000000000001";
const outsider = "00000000-0000-4000-8000-000000000002";
const reviewer = "00000000-0000-4000-8000-000000000003";
const work = "00000000-0000-4000-8000-000000000004";
try {
  await db.exec(`
    create role authenticated;
    create schema auth;
    create schema isitusa_private;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
    create function isitusa_private.has_permission(permission text) returns boolean language sql stable as $$ select permission=any(string_to_array(current_setting('test.permissions',true),',')) $$;
    create table public.isitusa_staff(user_id uuid primary key, active boolean);
    create table public.isitusa_work(id uuid primary key default gen_random_uuid(), kind text, title text, body text default '', organization text default '', source_url text default '', due_on date, status text default 'draft', created_by uuid, assigned_to uuid, approved_by uuid, review_note text default '', version integer default 0, created_at timestamptz default now(), updated_at timestamptz default now());
    create table public.isitusa_audit(id serial primary key,actor_id uuid,action text,entity_id text,detail jsonb);
    alter table public.isitusa_audit enable row level security;
    grant usage on schema public,isitusa_private to authenticated;
    grant select on public.isitusa_audit to authenticated;
    create policy audit_read on public.isitusa_audit for select to authenticated using(isitusa_private.has_permission('team'));
  `);
  await db.exec(await readFile("supabase/schema/15-security-boundaries.sql", "utf8"));
  await db.query("insert into public.isitusa_staff values ($1,true),($2,true),($3,true)", [author, outsider, reviewer]);
  await db.query("insert into public.isitusa_work(id,kind,title,created_by,review_note) values ($1,'article','Original',$2,'Private review note')", [work, author]);
  async function as(actor: string, permissions: string) {
    await db.query("select set_config('test.actor',$1,false),set_config('test.permissions',$2,false)", [actor, permissions]);
  }
  async function save(version: number, assigned_to: string | null = null, kind = "article", status = "draft") {
    return db.query("select isitusa_private.save_work($1,$2,$3::jsonb,$4) as data", [work, version, JSON.stringify({ kind, title: "Updated", assigned_to, review_note: "Reviewed fixture" }), status]);
  }
  await as(outsider, "content");
  const access = await db.query<{ allowed: boolean }>("select isitusa_private.work_access('article',$1,null) as allowed", [author]);
  assert.equal(access.rows[0].allowed, false);
  await assert.rejects(save(0), (e: any) => e.code === "42501");
  assert.equal((await db.query<{ version: number }>("select version from public.isitusa_work where id=$1", [work])).rows[0].version, 0);
  assert.equal((await db.query("select * from public.isitusa_audit")).rows.length, 0);
  await as(author, "content");
  await save(0);
  await assert.rejects(save(0), (e: any) => e.code === "40001");
  await assert.rejects(save(1, null, "event"));
  await db.query("update public.isitusa_work set assigned_to=$1 where id=$2", [outsider, work]);
  await as(outsider, "content");
  await save(1, outsider);
  await as(outsider, "");
  await assert.rejects(save(2, outsider), (e: any) => e.code === "42501");
  await db.query("update public.isitusa_work set assigned_to=null where id=$1", [work]);
  await as(outsider, "content");
  await assert.rejects(save(2), (e: any) => e.code === "42501");
  await as(reviewer, "approve");
  await save(2);
  await db.exec("insert into public.isitusa_audit(action,entity_id,detail) values ('crypto.receipt','private-receipt', '{\"amount_minor\":100}'),('wallet.address','wallet','{\"verification\":\"private note\"}')");
  await as(outsider, "team");
  await db.exec("set role authenticated");
  const ordinary = await db.query<{ action: string }>("select action,entity_id,detail from public.isitusa_audit");
  assert.ok(ordinary.rows.length > 0);
  assert.ok(ordinary.rows.every(row => row.action.startsWith("work.")));
  await db.exec("reset role");
  await as(outsider, "team,finance");
  await db.exec("set role authenticated");
  assert.equal((await db.query("select * from public.isitusa_audit where action in ('crypto.receipt','wallet.address')")).rows.length, 2);
  await db.exec("reset role");
  await as(outsider, "finance");
  await db.exec("set role authenticated");
  assert.equal((await db.query("select * from public.isitusa_audit")).rows.length, 0);
  await db.exec("reset role");
  console.log("PASS: shared volunteer validation and safe legacy mailto; PostgreSQL foreign-unassigned denial, author/assignee/reviewer controls, revoked permission, stale version and financial audit row isolation. Local fixtures only.");
} finally {
  await db.close();
}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
