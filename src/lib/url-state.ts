export function buildSearchParams(input: Record<string, string | null | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(input)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  return searchParams.toString();
}
