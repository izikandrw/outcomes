// One structured-output call to Claude, shared by the extract and link steps
// (product/agents/insight-collector/design.md §2.2, §2.5). The response is
// parsed against a zod schema, so there is no JSON to pick out of prose.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

export const DEFAULT_MODEL = 'claude-opus-5-5';
// Set explicitly: Claude Opus 5.5 would otherwise run at medium.
export const DEFAULT_EFFORT = 'high';

// A call that returned but can't be used: refused, cut off, or unparseable.
// The eval runner files these under errors, not as a wrong answer, so a
// truncation doesn't look like a worse prompt (evals.md, "The runner").
export class ModelOutputError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

// `system` is a list of text blocks; the last one is cached, so put what is
// the same on every call (instructions, then the catalog) there and the
// document in `user`. No refusal fallback: in an eval, another model quietly
// answering would credit its output to this one.
export async function callModel(client, { model = DEFAULT_MODEL, effort = DEFAULT_EFFORT, system, user, schema, maxTokens = 16000 }) {
  let response;
  try {
    response = await client.messages.parse({
      model,
      max_tokens: maxTokens,
      output_config: { effort, format: zodOutputFormat(schema) },
      system: system.map((text, i) => ({
        type: 'text',
        text,
        ...(i === system.length - 1 ? { cache_control: { type: 'ephemeral' } } : {}),
      })),
      messages: [{ role: 'user', content: user }],
    });
  } catch (err) {
    // The API doesn't enforce enums in the schema, so a value outside one only
    // fails when the SDK parses it. API and network errors pass through.
    if (err instanceof Anthropic.APIError) throw err;
    throw new ModelOutputError('unparsed', `output did not match the schema: ${err.message}`);
  }
  if (response.stop_reason === 'refusal') {
    throw new ModelOutputError('refusal', `refused (${response.stop_details?.category ?? 'no category'})`);
  }
  if (response.stop_reason === 'max_tokens') throw new ModelOutputError('truncated', `hit max_tokens (${maxTokens})`);
  if (!response.parsed_output) throw new ModelOutputError('unparsed', 'output did not match the schema');
  return { output: response.parsed_output, usage: usageOf(response) };
}

const usageOf = (response) => ({
  input: response.usage.input_tokens ?? 0,
  output: response.usage.output_tokens ?? 0,
  cache_read: response.usage.cache_read_input_tokens ?? 0,
  cache_write: response.usage.cache_creation_input_tokens ?? 0,
});

export const addUsage = (a, b) => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cache_read: a.cache_read + b.cache_read,
  cache_write: a.cache_write + b.cache_write,
});

export const NO_USAGE = { input: 0, output: 0, cache_read: 0, cache_write: 0 };

// $ per million tokens, from Anthropic's price list (2026-10-06); cache writes
// cost 1.25x input, and Haiku's cache read is taken as 10% of its input price.
// Update when prices change. Unknown models report no cost.
const PRICES = {
  'claude-fable-5-1': { input: 10, output: 50, cache_read: 0.25 },
  'claude-opus-5-5': { input: 4, output: 20, cache_read: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cache_read: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cache_read: 0.01 },
};

export function costOf(model, usage) {
  const price = PRICES[model];
  if (!price) return null;
  return (
    (usage.input * price.input +
      usage.output * price.output +
      usage.cache_read * price.cache_read +
      usage.cache_write * price.input * 1.25) /
    1e6
  );
}
