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
 * Checks if a target string contains all the words from the query string (in any order), case and diacritics insensitive.
 */
export function matchesSearchTerm(target: string, query: string): boolean {
  const normalizedTarget = normalizeSearchTerm(target);
  const normalizedQuery = normalizeSearchTerm(query);
  if (!normalizedQuery) return true;
  const queryWords = normalizedQuery.split(/\s+/);
  return queryWords.every(word => normalizedTarget.includes(word));
}

/**
 * Formats a Pancake Order ID. If it is negative, formats as M{value}.
 * Otherwise, prepends a '#' prefix or returns it as a string.
 */
export function formatOrderId(pancakeOrderId: number | string | null | undefined): string {
  if (pancakeOrderId === null || pancakeOrderId === undefined) return '';
  const numericId = Number(pancakeOrderId);
  if (!isNaN(numericId) && numericId < 0) {
    return `M${Math.abs(numericId)}`;
  }
  return `#${pancakeOrderId}`;
}

/**
 * Trích xuất thời gian bảo hành (số tháng) từ ghi chú/note.
 * Nhận diện các mẫu: "bảo hành 24 tháng", "bh 12 thang", "BH 24T", "bh 2 năm", "bao hanh 1 nam", "bh 3n"
 */
export function extractWarrantyMonths(note: string | null | undefined): number | null {
  if (!note) return null;
  const normalized = note.toLowerCase().trim();

  // 1. Matches "bảo hành X tháng", "bh X tháng", "bh Xt", "bh Xthang"
  const monthRegex = /(?:bảo hành|bao hanh|bh)\s*(\d+)\s*(?:tháng|thang|t)(?:\s|$|[^a-z])/i;
  const matchMonth = normalized.match(monthRegex);
  if (matchMonth) {
    const val = parseInt(matchMonth[1], 10);
    if (val > 0 && val <= 120) return val;
  }

  // 2. Matches "bảo hành X năm", "bh X năm", "bh Xn", "bh Xnam"
  const yearRegex = /(?:bảo hành|bao hanh|bh)\s*(\d+)\s*(?:năm|nam|n)(?:\s|$|[^a-z])/i;
  const matchYear = normalized.match(yearRegex);
  if (matchYear) {
    const val = parseInt(matchYear[1], 10);
    if (val > 0 && val <= 10) return val * 12;
  }

  return null;
}

