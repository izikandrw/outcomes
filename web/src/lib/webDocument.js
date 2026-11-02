// An eval case from a web page: its URL and the text a person pasted from it
// (many pages refuse to be fetched, and only the person knows which part of the
// page is the document). In the shape agent-insight-collector/evals/LABELING.md
// describes. Who said it, when and whether it's firsthand are set while labelling.

// The URL in the form it's stored and compared in, or null unless it's http(s).
export function cleanWebUrl(url) {
  try {
    const parsed = new URL(String(url ?? '').trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

// The case already in the set for this URL, if there is one.
export function caseForUrl(cases, url) {
  const wanted = cleanWebUrl(url);
  return cases.find((entry) => entry.document?.url && cleanWebUrl(entry.document.url) === wanted) ?? null;
}

// What createEvalCase takes. A golden case: its answer starts blank and is
// labelled from the document alone.
export function webCase({ url, title, text }) {
  const cleaned = cleanWebUrl(url);
  const parsed = new URL(cleaned);
  const label = title.trim() || `${parsed.pathname}${parsed.search}`;
  return {
    label_source: 'golden',
    name: `web-${parsed.hostname.replace(/^www\./, '')}-${label}`,
    document: {
      source_system: 'web',
      external_id: cleaned,
      url: cleaned,
      title: title.trim() || null,
      occurred_at: null,
      customer: null,
      firsthand: null,
      metadata: {},
      text: text.trim(),
    },
  };
}
