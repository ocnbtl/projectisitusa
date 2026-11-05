/** Public, dated changes survive later releases, including same-day entries. */
import release from "./site-release.generated.json";
export const SITE_RELEASE_ID = release.revision;
export const SITE_UPDATES = release.updates;
