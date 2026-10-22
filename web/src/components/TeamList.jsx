import { useState } from 'react';
import { PencilIcon, PlusIcon, TrashIcon } from './icons.jsx';

// Every team in the account, filterable by name. Nesting is shown as a parent
// tag rather than indentation, matching the flat outcome list. A search also
// matches the parent's name, so filtering by a department finds its teams.
export default function TeamList({ teams, outcomes, projects, onCreate, onEdit, onDelete }) {
  const [query, setQuery] = useState('');

  const nameOf = (id) => teams.find((team) => team.id === id)?.name ?? null;
  const needle = query.trim().toLowerCase();
  const visible = teams.filter((team) => {
    if (!needle) return true;
    const parent = nameOf(team.parent_team_id) ?? '';
    return `${team.name} ${parent}`.toLowerCase().includes(needle);
  });

  const countFor = (collection, team) => collection.filter((item) => item.team_id === team.id).length;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  return (
    <>
      <div className="list-head">
        <input
          type="search"
          value={query}
          placeholder="Filter teams"
          aria-label="Filter teams"
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="id">
          {needle ? `${visible.length} of ${plural(teams.length, 'team')}` : plural(teams.length, 'team')}
        </span>
        <button type="button" className="with-icon" onClick={onCreate}>
          <PlusIcon />
          New team
        </button>
      </div>
      {visible.length === 0 ? (
        <p className="empty">No teams match &ldquo;{query.trim()}&rdquo;.</p>
      ) : (
        <ul className="outcome-list">
          {visible.map((team) => (
            <li key={team.id}>
              <div className="outcome">
                <div>
                  <h3>{team.name}</h3>
                  <p className="meta">
                    {nameOf(team.parent_team_id) && (
                      <span className="tag parent">↳ {nameOf(team.parent_team_id)}</span>
                    )}
                    <span className="tag">{plural(countFor(outcomes, team), 'outcome')}</span>
                    <span className="tag project">{plural(countFor(projects, team), 'project')}</span>
                    <span className="id">#{team.id}</span>
                  </p>
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Edit ${team.name}`}
                    title="Edit"
                    onClick={() => onEdit(team)}
                  >
                    <PencilIcon />
                  </button>
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label={`Delete ${team.name}`}
                    title="Delete"
                    onClick={() => onDelete(team)}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
