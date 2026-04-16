import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatCategoryLabel(category: string) {
  switch (category) {
    case "fungi-diseases":
      return "Fungi & Diseases";
    default:
      return category.charAt(0).toUpperCase() + category.slice(1);
  }
}

export function formatNaturalList(items: string[]) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}
