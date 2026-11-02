import { useMemo, useRef } from 'react';
import { matchesFilters } from '../lib/insightFilters.js';
import { projectFilterFields } from '../lib/projectFilters.js';
import useSlashFocus from '../lib/useSlashFocus.js';
import useStuck from '../lib/useStuck.js';
import { ruleById } from '../lib/validation.js';
import FilterBar from './FilterBar.jsx';
import ProjectRow from './ProjectRow.jsx';
import { PlusIcon, SearchIcon } from './icons.jsx';

// Flat list of every project, laid out like the outcome and impact lists. The
// roadmap places projects in time; this is where to find one and narrow them
// down by team, schedule, evidence and what they drive, using the fields in
// projectFilters.js. Every field on a row edits in place; see ProjectRow. A
// project that rolls up to no outcome carries the rule's emoji in the left margin,
// so it stands out while scanning the list.
const WHATS_THE_POINT = ruleById('whats-the-point');

export default function ProjectList({
  view,
  onViewChange,
  projects,
  allProjects = projects,
  outcomes,
  teams,
  impacts = [],
  insights,
  suggestions,
  issues,
  onCreate,
  onUpdate,
  onToggleOutcome,
  onDelete,
  onShowInsights,
  onOpenTeam,
}) {
  // The search and filters ({ q, filters }), which the app keeps in the URL.
  const { q: query, filters } = view;
  const setQuery = (q) => onViewChange({ ...view, q });
  const setFilters = (next) => onViewChange({ ...view, filters: next });
  const toolbarRef = useRef(null);
  const stuck = useStuck(toolbarRef);
  const searchRef = useRef(null);
  useSlashFocus(searchRef);

  const fields = useMemo(
    () => projectFilterFields({ projects: allProjects, outcomes, teams, impacts, insights, suggestions, issues }),
    [allProjects, outcomes, teams, impacts, insights, suggestions, issues],
  );

  const needle = query.trim().toLowerCase();
  const searched = needle
    ? projects.filter((project) =>
        `${project.name} ${project.description ?? ''} #${project.id}`.toLowerCase().includes(needle),
      )
    : projects;
  const visible = searched.filter((project) => matchesFilters(project, fields, filters));

  // How many projects an option would show, given the search and the other fields' filters.
  function countFor(fieldId, optionId) {
    const field = fields.find((entry) => entry.id === fieldId);
    return searched.filter(
      (project) => field.values(project).includes(optionId) && matchesFilters(project, fields, filters, fieldId),
    ).length;
  }

  const filtered = needle || Object.keys(filters).length > 0;

  return (
    <>
      <div ref={toolbarRef} className={`list-toolbar${stuck ? ' stuck' : ''}`}>
        <div className="list-toolbar-row">
          <label className="search-box">
            <SearchIcon />
            <input
              ref={searchRef}
              type="search"
              value={query}
              aria-label="Search projects"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {/* The count and Clear hang off the right of New project, as on the outcome list. */}
          <span className="list-toolbar-end">
            <button type="button" className="with-icon btn-project" onClick={onCreate}>
              <PlusIcon />
              New project
            </button>
            <span className="list-toolbar-status">
              {filtered && <span className="id list-toolbar-count">{`${visible.length} of ${projects.length}`}</span>}
              {Object.keys(filters).length > 0 && (
                <button type="button" className="filter-clear" onClick={() => setFilters({})}>
                  Clear
                </button>
              )}
            </span>
          </span>
        </div>
        <FilterBar fields={fields} filters={filters} onChange={setFilters} countFor={countFor} showClear={false} />
      </div>
      {visible.length === 0 ? (
        <p className="empty">No projects match.</p>
      ) : (
        <ul className="outcome-list">
          {visible.map((project) => (
            <li key={project.id} className="project-list-item">
              {issues?.get(project.id)?.includes(WHATS_THE_POINT) && (
                <span
                  className="project-margin-issue"
                  role="img"
                  aria-label={`${WHATS_THE_POINT.title}: ${WHATS_THE_POINT.description}`}
                  title={`${WHATS_THE_POINT.title}\n${WHATS_THE_POINT.description}`}
                >
                  {WHATS_THE_POINT.emoji}
                </span>
              )}
              <ProjectRow
                project={project}
                allProjects={allProjects}
                outcomes={outcomes}
                teams={teams}
                insights={insights}
                suggestions={suggestions}
                onUpdate={onUpdate}
                onToggleOutcome={onToggleOutcome}
                onDelete={onDelete}
                onShowInsights={onShowInsights}
                onOpenTeam={onOpenTeam}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
