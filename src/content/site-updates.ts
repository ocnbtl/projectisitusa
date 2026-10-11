/** Dates describe published releases, not the visitor's current date.
 * Add an entry when a visitor-facing change ships; keep research dates separate.
 */
export const SITE_UPDATES = [
  { date: "2026-10-11", title: "Get to know ISITUSA", detail: "A shorter About page brings our purpose, research sources, and ways to help together. The footer is simpler, with easier access to privacy choices.", href: "/about" },
  { date: "2026-10-10", title: "More ways to explore and contribute", detail: "Explore species profiles and their county records, suggest a correction, or choose how you would like to support the work.", href: "/species" },
  { date: "2026-10-01", title: "A clearer way to explore", detail: "A continuous map color scale, flexible species views, and county research pages that lead with recorded findings. The research release date is shown separately below.", href: "/research" },
] as const;
