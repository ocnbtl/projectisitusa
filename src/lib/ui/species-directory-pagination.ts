export const CRAWLABLE_DIRECTORY_PAGE_SIZE = 24;
export function directoryPagePath(page: number) {
  return page <= 1 ? "/species" : `/species/page/${page}`;
}
export function directoryPageCount(total: number) {
  return Math.max(1, Math.ceil(total / CRAWLABLE_DIRECTORY_PAGE_SIZE));
}
