// Verify (code): the guard against made-up quotes (design.md §2.3). A
// candidate whose excerpt isn't in the document is dropped, a dollar figure
// without a basis in the document, or that its basis doesn't state, is cleared,
// and the same excerpt twice is kept once.

// Whitespace, curly quotes and case don't count, as in the app's eval case
// check (src/lib/evalCases.js).
export const normalise = (text) =>
  String(text ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const SCALES = { thousand: 1e3, k: 1e3, million: 1e6, mm: 1e6, m: 1e6, billion: 1e9, bn: 1e9, b: 1e9 };

// Whether a basis states this figure, so "$1.2M" states 1200000. A figure it
// can't read in digits ("forty thousand") counts as not stated: a missed figure
// costs less than an invented one.
function statesFigure(basis, figure) {
  const amounts = basis.matchAll(/(\d[\d,]*(?:\.\d+)?|\.\d+)\s*(thousand|million|billion|bn|mm|k|m|b)?\b/g);
  for (const [, digits, scale] of amounts) {
    const amount = Number(digits.replaceAll(',', '')) * (SCALES[scale] ?? 1);
    if (Math.abs(amount - figure) < 0.01) return true;
  }
  return false;
}

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
    if (candidate.dollar_impact !== null) {
      const basis = normalise(candidate.dollar_impact_basis);
      let reason = null;
      if (!basis || !text.includes(basis)) reason = 'dollar_basis_not_in_document';
      else if (!statesFigure(basis, candidate.dollar_impact)) reason = 'dollar_figure_not_in_basis';
      if (reason) {
        drops.push({ reason, candidate });
        kept.push({ ...candidate, dollar_impact: null, dollar_impact_basis: null });
        continue;
      }
    }
    kept.push(candidate);
  }
  return { kept, drops };
}
