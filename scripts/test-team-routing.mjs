import assert from "node:assert/strict";

import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const routing = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync("src/lib/team-routing.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, routing);
const { teamDestination } = routing.exports;
for (const host of ["isitusa.com", "preview.vercel.app", "team.isitusa.com.evil.example"]) assert.equal(teamDestination(host, "/"), null);
assert.equal(teamDestination("team.isitusa.com", "/"), "https://team.isitusa.com/admin");
for (const path of ["/admin", "/admin/preview", "/auth/confirm", "/api/contributions/checkout", "/_next/static/test.js", "/brand/v3/icon.svg"]) assert.equal(teamDestination("team.isitusa.com", path), null);
for (const path of ["/about", "/support", "/administrator", "/auth/other"]) assert.equal(teamDestination("team.isitusa.com", path), "https://isitusa.com"+path);
console.log("Team routing: exact host, account routes, public routes and asset boundaries passed.");


const runtimeSource = readFileSync("supabase/functions/_shared/runtime.ts", "utf8").replace(/^import .*;\r?\n/, "");
const runtime = { exports: {}, Deno: { env: { get: () => "https://isitusa.com" } }, Request, Response };
vm.runInNewContext(ts.transpileModule(runtimeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, runtime);
for (const origin of ["https://isitusa.com", "https://team.isitusa.com"]) assert.equal(runtime.exports.cors(new Request("https://example.test", { headers: { Origin: origin } }))["Access-Control-Allow-Origin"], origin);
for (const origin of ["https://team.isitusa.com.evil.test", "http://team.isitusa.com", "null", "https://preview.vercel.app"]) assert.throws(() => runtime.exports.cors(new Request("https://example.test", { headers: { Origin: origin } })), /must come from/);
assert.throws(() => runtime.exports.cors(new Request("https://example.test")), /must come from/);
const next = require("next/server");
const middlewareSource = readFileSync("middleware.ts", "utf8");
const context = { exports: {}, process: { env: { VERCEL_ENV: "production" } }, Response, URL, require: name => name === "next/server" ? next : { teamDestination } };
vm.runInNewContext(ts.transpileModule(middlewareSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
for (const host of ["isitusa.com", "team.isitusa.com"]) assert.equal(context.exports.middleware(new next.NextRequest("https://"+host+"/admin/preview")).status, 404);
const response = context.exports.middleware(new next.NextRequest("https://team.isitusa.com/"));
assert.equal(response.headers.get("location"), "https://team.isitusa.com/admin");
assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
assert.match(response.headers.get("cache-control"), /no-store/);
assert.equal(context.exports.middleware(new next.NextRequest("https://isitusa.com/")).headers.get("location"), null);
context.process.env.VERCEL_ENV = "preview";
assert.equal(context.exports.middleware(new next.NextRequest("https://preview.vercel.app/admin/preview")).status, 200);
console.log("Origin allowlist, production preview denial, private caching and public routing passed.");
