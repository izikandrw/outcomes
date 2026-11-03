import { useEffect, useState } from 'react';
import AutoGrowTextarea from './AutoGrowTextarea.jsx';
import MultiSelect from './MultiSelect.jsx';
import TargetsSection from './TargetsSection.jsx';
import { projectsForOutcome, projectsLinkedInLineage } from '../lib/links.js';

const EMPTY = {
  name: '',
  description: '',
  team_id: '',
};

// Rendered inside the modal, which supplies the heading and close control. The
// parent (an outcome, or an impact for a top-level outcome) is set in the modal's
// breadcrumb and arrives as `parentFields`, so this form only owns the remaining
// fields. `editing` is null when creating, or the outcome being changed. `draft`
// prefills name and description when creating one the insight collector
// proposed.
export default function OutcomeForm({
  editing,
  draft,
  parent,
  parentFields,
  teams,
  outcomes = [],
  projects,
  targets = [],
  onAddTarget,
  onEditTarget,
  onDeleteTarget,
  onViewTarget,
  onSubmit,
  onCancel,
  onDelete,
}) {
  const [form, setForm] = useState(EMPTY);
  const [projectIds, setProjectIds] = useState(new Set());
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name ?? '',
        description: editing.description ?? '',
        team_id: editing.team_id ?? '',
      });
      setProjectIds(new Set(projectsForOutcome(projects, editing).map((project) => String(project.id))));
    } else {
      // Adding a child from the tree: inherit the parent's team. Otherwise
      // default to the only team so the common single-team case needs no
      // picking; either can be cleared, since the team may not be known yet.
      // One the collector proposed starts with no team: the reviewer chooses.
      setForm((current) => ({
        ...EMPTY,
        name: draft?.name ?? '',
        description: draft?.description ?? '',
        team_id: parent?.team_id
          ? String(parent.team_id)
          : draft
            ? ''
            : current.team_id || (teams.length === 1 ? String(teams[0].id) : ''),
      }));
      setProjectIds(new Set());
    }
    setError(null);
    // projects is left out on purpose: a refetch mid-edit shouldn't wipe picks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, draft, parent]);

  // A project already under this outcome's parent or child is carried through
  // it, so it isn't offered. One picked before this rule stays listed so it can
  // still be removed.
  const inLineage = projectsLinkedInLineage(outcomes, projects, {
    id: editing?.id,
    parent_outcome_id: parentFields.parent_outcome_id,
  });
  const linkable = projects.filter(
    (project) => !inLineage.has(String(project.id)) || projectIds.has(String(project.id))
  );

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim()) return setError('Name is required.');

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: form.name.trim(),
        description: form.description.trim() || null,
        team_id: form.team_id ? Number(form.team_id) : null,
        // Links live in project_outcomes; the older single-project column is
        // folded into them, so clear it or a removed pick would keep showing.
        project_id: null,
        project_ids: [...projectIds].map(Number),
        ...parentFields,
      });
      if (!editing) {
        setForm((current) => ({ ...EMPTY, team_id: current.team_id }));
        setProjectIds(new Set());
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="outcome-form" onSubmit={submit}>
      <label>
        Name
        <input
          autoFocus
          value={form.name}
          placeholder="e.g. Cut onboarding time to under a day"
          onChange={(event) => update('name', event.target.value)}
        />
      </label>

      <label>
        Description
        <AutoGrowTextarea
          value={form.description}
          placeholder="What does success look like?"
          onChange={(event) => update('description', event.target.value)}
        />
      </label>

      <label>
        Team
        <select value={form.team_id} onChange={(event) => update('team_id', event.target.value)}>
          <option value="">No team yet</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </label>

      <MultiSelect
        label="Projects"
        placeholder="Select projects…"
        items={linkable}
        selected={projectIds}
        onChange={setProjectIds}
      />

      <TargetsSection
        targets={targets}
        saved={Boolean(editing)}
        onAdd={onAddTarget}
        onEdit={onEditTarget}
        onDelete={onDeleteTarget}
        onView={onViewTarget}
      />

      {error && <p className="error">{error}</p>}

      <div className="actions form-actions">
        {editing && (
          <button type="button" className="ghost danger" style={{ marginRight: 'auto' }} onClick={onDelete}>
            Delete
          </button>
        )}
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-outcome" disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add outcome'}
        </button>
      </div>
    </form>
  );
}
