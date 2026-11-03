// What the command palette can jump to and how a search ranks it. Everything it
// searches is already loaded, so this runs in the browser on every keystroke.
import { targetLabel } from './links.js';
import { NAV_PAGES } from './navPages.js';

// Other words people may reach for, searched after the name.
const PAGE_KEYWORDS = {
  map: 'tree',
  roadmap: 'timeline',
  insights: 'evidence',
  review: 'suggestions queue approve',
  teams: 'org',
};

// Places that aren't in the top nav. `tab` is a tab of the page; `modal` a modal
// that opens over whatever page you are on.
const OTHER_PLACES = [
  { key: 'tab-rejected', name: 'Rejected insights', page: 'review', tab: 'rejected' },
  { key: 'tab-runs', name: 'Collector runs', page: 'review', tab: 'runs', keywords: 'collection traces' },
  { key: 'tab-evals', name: 'Eval set', page: 'review', tab: 'evals', keywords: 'evals cases labels' },
  { key: 'modal-account', name: 'Account settings', modal: 'account', keywords: 'logo' },
  { key: 'modal-members', name: 'Members', modal: 'members', keywords: 'invite users people' },
];

// The order equally good matches list in: the places first, then top down.
export const ENTRY_KINDS = ['page', 'impact', 'outcome', 'project', 'target', 'team', 'insight'];
export const KIND_LABELS = {
  page: 'Go to',
  impact: 'Impact',
  outcome: 'Outcome',
  project: 'Project',
  target: 'Target',
  team: 'Team',
  insight: 'Insight',
};

// Case, accents and punctuation don't matter when searching.
const normalize = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const oneLine = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

// One row: `name` is what it shows and ranks highest, `detail` the line beneath,
// `searchText` anything else that should find it.
function entry(fields, searchText = '') {
  const { name, detail } = fields;
  return { ...fields, nameKey: normalize(name), textKey: normalize(`${detail ?? ''} ${searchText}`) };
}

function item(kind, record, name, detail, searchText) {
  return entry({ key: `${kind}-${record.id}`, kind, id: String(record.id), name, detail: oneLine(detail) }, searchText);
}

// Everything the palette can reach. The places come first, which is also what it
// shows before anything is typed. Rejected insights stay out, as they do from
// every list but the review queue's own tab.
export function paletteEntries({ teams = [], impacts = [], outcomes = [], projects = [], targets = [], insights = [] }) {
  const parentName = (target) =>
    (target.impact_id != null
      ? impacts.find((impact) => String(impact.id) === String(target.impact_id))
      : outcomes.find((outcome) => String(outcome.id) === String(target.outcome_id))
    )?.name;
  return [
    ...NAV_PAGES.map(({ id, label }) =>
      entry({ key: `page-${id}`, kind: 'page', page: id, name: label }, PAGE_KEYWORDS[id]),
    ),
    ...OTHER_PLACES.map(({ keywords, ...place }) => entry({ kind: 'page', ...place }, keywords)),
    ...impacts.map((impact) => item('impact', impact, impact.name, impact.description)),
    ...outcomes.map((outcome) => item('outcome', outcome, outcome.name, outcome.description)),
    ...projects.map((project) => item('project', project, project.name, project.description)),
    ...targets.map((target) => item('target', target, targetLabel(target), parentName(target), `${target.unit} ${target.description ?? ''}`)),
    ...teams.map((team) => item('team', team, team.name, team.description)),
    ...insights
      .filter((insight) => insight.status !== 'rejected')
      .map((insight) => ({
        ...item(
          'insight',
          insight,
          insight.name,
          insight.description ?? insight.source,
          `${insight.source ?? ''} ${insight.source_excerpt ?? ''}`,
        ),
        suggested: insight.status === 'unvalidated',
      })),
  ];
}

// How well an entry matches, higher being better, or 0 if it doesn't. Every word
// typed has to appear, so a second word narrows the list rather than growing it.
function scoreOf({ id, nameKey, textKey }, { phrase, words, wantedId }) {
  if (id != null && id === wantedId) return 6;
  if (!phrase) return 0;
  if (nameKey === phrase) return 5;
  if (nameKey.startsWith(phrase)) return 4;
  const wordStarts = ` ${nameKey}`;
  if (wordStarts.includes(` ${phrase}`)) return 3;
  if (words.every((word) => nameKey.includes(word))) return 2;
  const everything = `${nameKey} ${textKey}`;
  return words.every((word) => everything.includes(word)) ? 1 : 0;
}

// The entries a query finds, best first. Nothing typed lists the places. "the
// map" finds Map, and "#42" or "42" finds whatever has that id, as titles and
// links name items that way.
export function searchEntries(entries, query) {
  const wantedId = /^#?(\d+)$/.exec(query.trim())?.[1];
  const phrase = normalize(query).replace(/^the (?=\S)/, '');
  if (!phrase && !wantedId) return entries.filter((candidate) => candidate.kind === 'page');
  const needle = { phrase, words: phrase.split(' '), wantedId };
  return entries
    .map((candidate) => ({ candidate, score: scoreOf(candidate, needle) }))
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        ENTRY_KINDS.indexOf(a.candidate.kind) - ENTRY_KINDS.indexOf(b.candidate.kind) ||
        a.candidate.name.localeCompare(b.candidate.name),
    )
    .map(({ candidate }) => candidate);
}

// Cmd+K on a Mac, Ctrl+K elsewhere. On a Mac, Ctrl+K stays what it is in any text
// field there: delete to the end of the line. Letters ignore Caps Lock.
export function isPaletteShortcut({ key, metaKey, ctrlKey, altKey, shiftKey }, { mac = true } = {}) {
  if (altKey || shiftKey || key?.toLowerCase() !== 'k') return false;
  return mac ? metaKey && !ctrlKey : ctrlKey && !metaKey;
}
