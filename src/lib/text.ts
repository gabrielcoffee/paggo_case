// Accent- and case-insensitive text matching for client-side search.
// "ç" decomposes to "c" + combining cedilla under NFD; stripping the combining
// marks leaves a plain ASCII-ish form so "São", "sao" and "SAO" all match.
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
