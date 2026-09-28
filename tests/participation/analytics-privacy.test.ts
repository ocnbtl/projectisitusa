import assert from "node:assert/strict";
import { test } from "node:test";
import { mayTrackUrl } from "../../src/lib/ui/analytics-privacy";
test("Private participation routes stay excluded after client-side navigation", () => {
 for (const path of ["/admin", "/admin/team", "/auth/confirm#token_hash=private", "/preferences#confirm=private", "/join?email=private", "/report"]) {
  assert.equal(mayTrackUrl("https://isitusa.com" + path), false, path);
 }
 for (const path of ["/", "/species", "/research?state=AK", "/about", "/support"]) assert.equal(mayTrackUrl(path), true, path);
 assert.equal(mayTrackUrl("http://["), false);
});
