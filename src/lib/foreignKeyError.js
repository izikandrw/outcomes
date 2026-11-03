// What a person calls the rows that can stop a delete. A table missing from here
// falls back to the generic message rather than naming something meaningless.
const BLOCKERS = {
  measurements: 'readings',
  impacts: 'child impacts',
  outcomes: 'linked outcomes',
  projects: 'linked projects',
};

// Words a foreign key violation (Postgres 23503) for the person who hit it. On a
// delete, Postgres reports only the first referencing table it finds, so clearing
// that one can reveal another.
function foreignKeyMessage(err) {
  const table = /still referenced from table "(\w+)"/.exec(err.detail || '')?.[1];
  const blocker = BLOCKERS[table];
  return blocker ? `still has ${blocker}; remove those first` : 'referenced by or references a missing row';
}

module.exports = { foreignKeyMessage };
