import { useState } from 'react';
import { insightsForProject, outcomesForProject, teamsOnProject, totalDollarImpact } from '../lib/links.js';
import InsightBadge from './InsightBadge.jsx';
import { DateField, InlineText, LinkPicker, PillField, PillSelect } from './InlineFields.jsx';
import TeamChips from './TeamChips.jsx';
import { TrashIcon } from './icons.jsx';

const dateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');
const sameId = (a, b) => String(a) === String(b);

// Every project nested beneath `project`, however deep; none of them can be its parent.
function descendantIds(projects, project) {
  const found = new Set();
  const queue = [project.id];
  while (queue.length > 0) {
    const id = queue.shift();
    for (const item of projects) {
      if (sameId(item.parent_project_id, id) && !found.has(String(item.id))) {
        found.add(String(item.id));
        queue.push(item.id);
      }
    }
  }
  return found;
}

// One project, every field a click away from editing, as on an insight card:
// name and description as text, team and parent as tag-like selects, dates as
// date pickers, and the outcomes it drives as a checklist. onUpdate(project,
// patch) saves a change to its own fields and onToggleOutcome(project, outcome)
// links or unlinks an outcome it drives. A failed save shows under the row.
// Shared by the project list and the roadmap.
export default function ProjectRow({
  project,
  allProjects,
  outcomes,
  teams,
  insights,
  suggestions,
  onUpdate,
  onToggleOutcome,
  onDelete,
  onShowInsights,
  onOpenTeam,
}) {
  const [error, setError] = useState(null);

  async function run(action) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(`Could not save: ${err.message}`);
    }
  }
  const save = (patch) => run(() => onUpdate(project, patch));

  function saveDate(field, value) {
    const next = { start_at: dateInput(project.start_at), end_at: dateInput(project.end_at), [field]: value };
    if (next.start_at && next.end_at && next.end_at < next.start_at) {
      setError('The end date cannot be before the start date.');
      return;
    }
    save({ [field]: value ? new Date(value).toISOString() : null });
  }

  const driven = outcomesForProject(outcomes, project);
  const projectInsights = insightsForProject(insights, project);
  // The project's own team is the select; chips are only for teams on projects nested under it.
  const nestedTeams = teamsOnProject(allProjects, project).filter((entry) => !entry.direct);
  const outcomeItems = outcomes.map((outcome) => ({
    kind: 'outcome',
    id: Number(outcome.id),
    name: outcome.name,
    group: 'Outcomes',
    linked: driven.some((item) => sameId(item.id, outcome.id)),
    outcome,
  }));
  const nested = descendantIds(allProjects, project);
  const parentOptions = allProjects
    .filter((item) => !sameId(item.id, project.id) && !nested.has(String(item.id)))
    .map((item) => ({ id: String(item.id), label: item.name }));

  return (
    <div className="outcome project-row">
      <div>
        <h3>
          <InlineText value={project.name} label="Project name" required onCommit={(name) => save({ name })} />
        </h3>
        <p className="description">
          <InlineText
            value={project.description ?? ''}
            label="Description"
            placeholder="Add a description"
            multiline
            onCommit={(description) => save({ description: description || null })}
          />
        </p>
        <div className="meta">
          <PillField label="Drives" title="The outcomes this project moves">
            <LinkPicker
              items={outcomeItems}
              label="Drives outcomes"
              buttonClassName={`tag link-pill${driven.length === 0 ? ' warn' : ''}`}
              onToggle={(item) => run(() => onToggleOutcome(project, item.outcome))}
            >
              {driven.length === 0
                ? 'No outcome'
                : driven.length <= 2
                  ? driven.map((outcome) => outcome.name).join(', ')
                  : `${driven.length} outcomes`}
            </LinkPicker>
          </PillField>
          <PillField label="Team" title="The team running this project">
            <PillSelect
              label="Team"
              value={project.team_id ? String(project.team_id) : ''}
              options={teams.map((team) => ({ id: String(team.id), label: team.name }))}
              empty="No team"
              onChange={(value) => save({ team_id: value ? Number(value) : null })}
            />
          </PillField>
          <TeamChips entries={nestedTeams} teams={teams} onOpen={onOpenTeam} />
          <PillField label="Start" title="When work starts; shows it as in progress on the roadmap">
            <DateField label="Start date" value={dateInput(project.start_at)} onCommit={(value) => saveDate('start_at', value)} />
          </PillField>
          <PillField label="End" title="When it is due to ship; shows it as completed on the roadmap">
            <DateField label="End date" value={dateInput(project.end_at)} onCommit={(value) => saveDate('end_at', value)} />
          </PillField>
          <PillField label="Parent" title="The project this is nested under">
            <PillSelect
              label="Parent project"
              value={project.parent_project_id ? String(project.parent_project_id) : ''}
              options={parentOptions}
              empty="None"
              onChange={(value) => save({ parent_project_id: value ? Number(value) : null })}
            />
          </PillField>
          <InsightBadge
            count={projectInsights.length}
            suggested={insightsForProject(suggestions, project).length}
            dollars={totalDollarImpact(projectInsights)}
            label={project.name}
            onClick={(filter) => onShowInsights(project, 'project', filter)}
          />
          <span className="id">#{project.id}</span>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
      <div className="actions">
        <button
          type="button"
          className="icon-button danger"
          aria-label={`Delete ${project.name}`}
          title="Delete"
          onClick={() => onDelete(project)}
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}
