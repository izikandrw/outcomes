import { projectsForOutcome, targetLabel } from './links.js';

// The parent chain an open item's breadcrumb shows and edits. An item is named
// by a ref, { kind, id }; `collections` maps each kind to its rows; and `moves`
// maps a ref's key to the parent it will have once saved (a ref, or null for
// none). Nothing is written until the form is saved, so everything here reads
// the hierarchy as it will be, with moves laid over what is stored.

// What each kind can move under. Only an outcome crosses kinds: a top-level
// outcome links to an impact. A target also sits in the tree, under the outcome
// or impact it quantifies, but stays there: its breadcrumb only navigates.
const PARENT_KINDS = {
  impact: ['impact'],
  outcome: ['impact', 'outcome'],
  project: ['project'],
  team: ['team'],
};

export const refKey = ({ kind, id }) => `${kind}-${id}`;

const sameRef = (a, b) => a.kind === b.kind && String(a.id) === String(b.id);

const find = (ref, collections) => collections[ref.kind]?.find((item) => String(item.id) === String(ref.id));

const nameOfItem = (kind, item) => (kind === 'target' ? targetLabel(item) : item.name);

export const nameOf = (ref, collections) => {
  const item = find(ref, collections);
  return item && nameOfItem(ref.kind, item);
};

export function storedParent(kind, item) {
  if (kind === 'target') {
    if (item.outcome_id) return { kind: 'outcome', id: item.outcome_id };
    return item.impact_id ? { kind: 'impact', id: item.impact_id } : null;
  }
  if (kind === 'outcome' && !item.parent_outcome_id) {
    return item.impact_id ? { kind: 'impact', id: item.impact_id } : null;
  }
  const id = item[`parent_${kind}_id`];
  return id ? { kind, id } : null;
}

function parentOf(ref, collections, moves) {
  const key = refKey(ref);
  if (key in moves) return moves[key];
  const item = find(ref, collections);
  return item ? storedParent(ref.kind, item) : null;
}

// The outcomes a project drives, through project_outcomes or the older
// outcomes.project_id column. A new project added from an outcome names it on
// its ref, having no row yet.
function linkedOutcomes(ref, collections) {
  if (ref.kind !== 'project') return [];
  const project = find(ref, collections);
  return (collections.outcome ?? []).filter(
    (outcome) =>
      String(ref.linkedOutcomeId) === String(outcome.id) ||
      (project && projectsForOutcome([project], outcome).length > 0),
  );
}

// The next crumb up. A project with no parent project sits under the outcome it
// drives, as it does on the map. That link is not a parent: it is `linked`, and
// storedParent and moves know nothing of it, so saving never writes it.
function nextUp(child, collections, moves) {
  const parent = parentOf(child, collections, moves);
  if (parent) return parent;
  const [outcome] = linkedOutcomes(child, collections);
  return outcome ? { kind: 'outcome', id: outcome.id, linked: true } : null;
}

// The ancestors of `start`, root first. Each knows its `child`: the ref whose
// parent changes when that crumb is swapped.
export function lineage(start, collections, moves = {}) {
  const chain = [];
  const seen = new Set([refKey(start)]);
  let child = start;
  let ref = nextUp(child, collections, moves);
  while (ref && !seen.has(refKey(ref))) {
    const item = find(ref, collections);
    if (!item) break;
    seen.add(refKey(ref));
    chain.unshift({ kind: ref.kind, id: ref.id, name: nameOfItem(ref.kind, item), child, linked: Boolean(ref.linked) });
    child = { kind: ref.kind, id: ref.id };
    ref = nextUp(child, collections, moves);
  }
  return chain;
}

// A project can drive several outcomes but the chain only runs through one:
// these are the others it drives.
export function otherLinkedOutcomes(start, collections, moves = {}) {
  const chain = lineage(start, collections, moves);
  return linkedOutcomes(start, collections)
    .filter((outcome) => !chain.some((crumb) => crumb.kind === 'outcome' && String(crumb.id) === String(outcome.id)))
    .map((outcome) => ({ kind: 'outcome', id: outcome.id, name: outcome.name }));
}

// What `child` may move under, by kind: anything but itself or what sits
// beneath it, which would make it its own ancestor.
export function parentChoices(child, collections, moves = {}) {
  return PARENT_KINDS[child.kind].map((kind) => ({
    kind,
    items: collections[kind].filter((item) => {
      const ref = { kind, id: item.id };
      return !sameRef(ref, child) && !lineage(ref, collections, moves).some((ancestor) => sameRef(ancestor, child));
    }),
  }));
}

// The swaps to write to `start`'s ancestors when it is saved. A move on an item
// no longer in the chain is dropped, since the breadcrumb stopped showing it,
// and so is one put back to where it started.
export function ancestorMoves(start, collections, moves = {}) {
  return lineage(start, collections, moves)
    .map(({ kind, id }) => ({ child: { kind, id }, parent: parentOf({ kind, id }, collections, moves) }))
    .filter(({ child, parent }) => {
      const stored = storedParent(child.kind, find(child, collections));
      return stored && parent ? !sameRef(stored, parent) : Boolean(stored) !== Boolean(parent);
    });
}

// The parent as the API's columns.
export function parentFields(kind, parent) {
  if (kind === 'outcome') {
    return {
      parent_outcome_id: parent?.kind === 'outcome' ? parent.id : null,
      impact_id: parent?.kind === 'impact' ? parent.id : null,
    };
  }
  return { [`parent_${kind}_id`]: parent?.id ?? null };
}

// Where a modal sits in the tree, or null when it sits nowhere. `editable` says
// its breadcrumb can swap parents, which takes a form whose Save writes them. A
// new item takes the parent it was added under, which each way of opening one
// names differently.
export function modalHierarchy(modal) {
  if (!modal) return null;
  if (!PARENT_KINDS[modal.kind]) return viewHierarchy(modal);
  const { kind } = modal;
  const item = modal[kind];
  const start = { kind, id: item?.id ?? 'new' };
  if (kind === 'project' && !item && modal.parent) start.linkedOutcomeId = modal.parent.id;
  const moves = { [refKey(start)]: item ? storedParent(kind, item) : newItemParent(modal), ...modal.moves };
  return { start, moves, editable: true, fields: parentFields(kind, moves[refKey(start)]) };
}

// The views below an item: a target and what hangs off one or off anything else.
function viewHierarchy({ kind, target, parent, parentKind = 'outcome', entity, entityKind, rule }) {
  const under = (ref) => {
    const start = { kind, id: 'view' };
    return { start, moves: { [refKey(start)]: ref } };
  };
  const owner = parent ? { kind: parentKind, id: parent.id } : null;
  const ownTarget = target ? { kind: 'target', id: target.id } : null;
  if (kind === 'target-measurements') return { start: ownTarget, moves: {} };
  if (kind === 'target') return target ? { start: ownTarget, moves: {} } : under(owner);
  if (kind === 'measurement') return under(ownTarget ?? owner);
  // A suggested outcome or project doesn't exist yet, so it has no place.
  if (kind === 'entity-insights') return under(entity.suggested ? null : { kind: entityKind, id: entity.id });
  if (kind === 'issue') return under({ kind: rule.appliesTo, id: entity.id });
  return null;
}

function newItemParent({ kind, parent, parentId, impactId, parentProject }) {
  if (kind === 'outcome') {
    if (parentId) return { kind: 'outcome', id: parentId };
    return impactId ? { kind: 'impact', id: impactId } : null;
  }
  if (kind === 'project') return parentProject ? { kind, id: parentProject.id } : null;
  return parent ? { kind, id: parent.id } : null;
}
