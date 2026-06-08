/**
 * Removes Vietnamese tones/diacritics from a string.
 * Normalize to NFD form, replace combining characters, and map đ/Đ.
 */
export function removeVietnameseTones(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/**
 * Normalizes a string for search comparison (lowercase, trimmed, and diacritics-removed).
 */
export function normalizeSearchTerm(str: string): string {
  return removeVietnameseTones(str || '')
    .toLowerCase()
    .trim();
}

/**
 * Checks if a target string contains the query string, case and diacritics insensitive.
 */
export function matchesSearchTerm(target: string, query: string): boolean {
  const normalizedTarget = normalizeSearchTerm(target);
  const normalizedQuery = normalizeSearchTerm(query);
  return normalizedTarget.includes(normalizedQuery);
}
