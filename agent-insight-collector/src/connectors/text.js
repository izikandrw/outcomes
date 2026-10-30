// Text connector: one file → one SourceDocument (design.md §2.1), for call
// transcripts exported from Attention, interview notes and the like. Speaker
// labels stay in the text: "the customer said" and "our rep said" are very
// different evidence.
import path from 'node:path';

export function textDocument(text, { fileName, sourceSystem }) {
  return {
    source_system: sourceSystem,
    external_id: fileName,
    url: null,
    title: path.basename(fileName, path.extname(fileName)),
    text: text.trim(),
    occurred_at: null,
    customer: null,
    firsthand: null,
    metadata: {},
  };
}
