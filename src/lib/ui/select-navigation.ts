export type SelectOption = { value: string; label: string; disabled?: boolean };

export function selectSearchText(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en-US");
}

export function nextSelectOption(options: SelectOption[], current: number, key: string): number {
  const enabled = options.flatMap((option, index) => option.disabled ? [] : [index]);
  if (!enabled.length) return -1;
  if (key === "Home") return enabled[0];
  if (key === "End") return enabled[enabled.length - 1];
  const index = enabled.indexOf(current);
  if (index === -1) return key === "ArrowUp" ? enabled[enabled.length - 1] : enabled[0];
  return enabled[(index + (key === "ArrowUp" ? -1 : 1) + enabled.length) % enabled.length];
}

export function findSelectOption(options: SelectOption[], query: string, after = -1): number {
  const text = selectSearchText(query);
  if (!text) return -1;
  for (let offset = 1; offset <= options.length; offset++) {
    const index = (after + offset + options.length) % options.length;
    if (!options[index].disabled && selectSearchText(options[index].label).startsWith(text)) return index;
  }
  return -1;
}
