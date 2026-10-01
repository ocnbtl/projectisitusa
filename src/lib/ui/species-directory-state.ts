import type { SpeciesCategory } from "@/lib/data/types";
export const DIRECTORY_CATEGORIES: SpeciesCategory[] = ["wildlife", "plants", "insects", "fungi-diseases"];
export const DIRECTORY_PAGE_SIZES = [12, 24, 48, 96] as const;
export type DirectoryView = "rows" | "compact" | "grid";
export function readDirectoryState(search: string) {
  const params = new URLSearchParams(search);
  const categories = [...new Set((params.get("category") ?? "").split(","))].filter((value): value is SpeciesCategory => DIRECTORY_CATEGORIES.includes(value as SpeciesCategory));
  const requestedPage = Number(params.get("page")), size = Number(params.get("size")), view = params.get("view");
  return { query: (params.get("q") ?? "").slice(0, 200), categories,
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    pageSize: DIRECTORY_PAGE_SIZES.find(value => value === size) ?? 24,
    view: (view === "grid" || view === "compact" ? view : "rows") as DirectoryView };
}
