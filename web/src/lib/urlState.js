// What the address bar holds, so any view can be linked to and Back/Forward
// move between pages. Everything rides in query params, which need no
// rewrites on the static host:
//
//   ?page=outcomes                       a top-nav page
//   ?page=team&team=3                    one team's home
//   ?page=impacts&issue=no-target        a list narrowed to one delivery rule
//   ?page=outcomes&outcome=42            an item opened over the page; also
//                                        impact, project, target, insight
//   ?page=outcomes&q=churn&f.team=3&f.team=5&sort=added
//                                        a list's search, filters and sort
//
// Filters carry an `f.` prefix because some filter fields share a name with
// an item param (an insight's outcome filter vs. outcome=42).
export const PAGES = ['map', 'impacts', 'outcomes', 'roadmap', 'insights', 'review', 'teams', 'team'];
export const ITEM_KINDS = ['outcome', 'impact', 'project', 'target', 'insight'];
const FILTER_PREFIX = 'f.';

export const emptyListView = () => ({ q: '', filters: {}, sort: null });

// The view a query string describes. `page` is null when the URL names none,
// so the caller can fall back to the last page used.
export function readUrl(search = window.location.search) {
  const params = new URLSearchParams(search);
  const page = PAGES.includes(params.get('page')) ? params.get('page') : null;
  const kind = ITEM_KINDS.find((entry) => params.has(entry));
  const filters = {};
  for (const [key, value] of params) {
    if (!key.startsWith(FILTER_PREFIX) || !value) continue;
    const field = key.slice(FILTER_PREFIX.length);
    filters[field] = [...(filters[field] ?? []), value];
  }
  return {
    page,
    teamId: params.get('team'),
    issue: params.get('issue'),
    item: kind ? { kind, id: params.get(kind) } : null,
    listView: { q: params.get('q') ?? '', filters, sort: params.get('sort') },
  };
}

// The query string (with its leading '?') for a view, the inverse of readUrl.
export function buildSearch({ page, teamId, issue, item, listView }) {
  const params = new URLSearchParams({ page });
  if (page === 'team' && teamId) params.set('team', teamId);
  if (issue) params.set('issue', issue);
  if (item) params.set(item.kind, item.id);
  if (listView.q) params.set('q', listView.q);
  for (const [field, picked] of Object.entries(listView.filters)) {
    for (const value of picked) params.append(`${FILTER_PREFIX}${field}`, value);
  }
  if (listView.sort) params.set('sort', listView.sort);
  return `?${params}`;
}

// The item a modal shows, as the { kind, id } its link names; null for
// modals that aren't one existing item (new forms, settings, issues).
export function itemOfModal(modal) {
  if (!modal) return null;
  const { kind } = modal;
  if (kind === 'target-measurements') return { kind: 'target', id: String(modal.target.id) };
  if (['outcome', 'impact', 'project', 'insight'].includes(kind) && modal[kind]) {
    return { kind, id: String(modal[kind].id) };
  }
  return null;
}
