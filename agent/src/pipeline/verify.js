// Verify (code): the guard against made-up quotes (design.md §2.3). A
// candidate whose excerpt isn't in the document is dropped, a dollar figure
// whose basis isn't there is cleared, and the same excerpt twice is kept once.

// Whitespace, curly quotes and case don't count, as in the app's eval case
// check (src/lib/evalCases.js).
export const normalise = (text) =>
  String(text ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export function verify(document, candidates) {
  const text = normalise(document.text);
  const kept = [];
  const drops = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const excerpt = normalise(candidate.excerpt);
    if (!excerpt || !text.includes(excerpt)) {
      drops.push({ reason: 'excerpt_not_in_document', candidate });
      continue;
    }
    if (seen.has(excerpt)) {
      drops.push({ reason: 'duplicate_excerpt', candidate });
      continue;
    }
    seen.add(excerpt);
    if (candidate.dollar_impact !== null && !text.includes(normalise(candidate.dollar_impact_basis))) {
      drops.push({ reason: 'dollar_basis_not_in_document', candidate });
      kept.push({ ...candidate, dollar_impact: null, dollar_impact_basis: null });
      continue;
    }
    kept.push(candidate);
  }
  return { kept, drops };
}
