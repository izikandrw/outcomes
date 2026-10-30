// The insight collector's pipeline for one document: extract → verify → link
// (design.md §2). Fetching documents, deduping against what's already
// collected and writing to the API are left to callers; the eval runner only
// needs what the agent would suggest.
import { extract } from './extract.js';
import { verify } from './verify.js';
import { link } from './link.js';
import { addUsage } from './model.js';

// Returns the insights it would suggest ({ ...candidate, links, proposed }),
// what the code checks dropped, and token usage over every call.
export async function runDocument(client, document, catalog, options = {}) {
  const extracted = await extract(client, document, options);
  const { kept, drops } = verify(document, extracted.candidates);
  let usage = extracted.usage;
  const insights = [];
  for (const candidate of kept) {
    const linked = await link(client, candidate, catalog, options);
    usage = addUsage(usage, linked.usage);
    drops.push(...linked.drops);
    insights.push({ ...candidate, links: linked.links, proposed: linked.proposed });
  }
  return { insights, drops, candidateCount: extracted.candidates.length, usage };
}

export { extract, verify, link };
