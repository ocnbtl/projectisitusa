/** Dates describe published releases, not the visitor's current date.
 * Add an entry when a visitor-facing change ships; keep research dates separate.
 */
export const SITE_UPDATES = [
  { date: "2026-10-22", title: "More ways to see the map", detail: "Monochrome and Spectrum add two new map palettes, with all six choices together on phones. Clearer About links and an original pixel woodland that follows your light or dark theme make it easier to explore the project.", href: "/about" },
  { date: "2026-10-20", title: "A clearer introduction to ISITUSA", detail: "Our About page now follows one reading path through who we are, our mission, and the research behind the tool. Footer links keep email updates and preferences together.", href: "/about" },
  { date: "2026-10-19", title: "More room for the map on mobile", detail: "Compact search, filters, and recent updates leave more space for the map. County and ZIP lookup, species search, and map controls stay close at hand.", href: "/" },
  { date: "2026-10-19", title: "New ways to take part", detail: "Tell us your skills and availability through the volunteer application, explore the sighting-report page, or choose a contribution option in the more compact Support page.", href: "/volunteer" },
  { date: "2026-10-18", title: "A closer look at our research", detail: "Our approach and data-sources papers explain how we work with records and their limitations. Organized credits help you follow the resources behind the project.", href: "/approach" },
  { date: "2026-10-11", title: "Get to know ISITUSA", detail: "A shorter About page brings our purpose, research sources, and ways to help together. The footer is simpler, with easier access to privacy choices.", href: "/about" },
  { date: "2026-10-10", title: "More ways to explore and contribute", detail: "Explore species profiles and their county records, suggest a correction, or choose how you would like to support the work.", href: "/species" },
  { date: "2026-10-01", title: "A clearer way to explore", detail: "A continuous map color scale, flexible species views, and county research pages that lead with recorded findings. The research release date is shown separately below.", href: "/research" },
] as const;
