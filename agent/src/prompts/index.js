// The pipeline's instructions. PROMPT_VERSION names this wording: bump it on
// every change to a prompt or a schema, so each eval result and collection run
// says which instructions produced it (product/agents/insight-collector/evals.md,
// "The improvement loop").
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const PROMPT_VERSION = 'pipeline v1';
export const EXTRACT_PROMPT = readFileSync(path.join(here, 'extract.md'), 'utf8');
export const LINK_PROMPT = readFileSync(path.join(here, 'link.md'), 'utf8');
