import { ListIcon, TreeIcon } from './icons.jsx';

const VIEWS = [
  { id: 'tree', label: 'Tree', Icon: TreeIcon },
  { id: 'list', label: 'List', Icon: ListIcon },
];

export default function ViewToggle({ view, onChange }) {
  return (
    <div className="view-toggle" role="group" aria-label="Outcome view">
      {VIEWS.map(({ id, label, Icon }) => (
        <button key={id} type="button" aria-pressed={view === id} onClick={() => onChange(id)}>
          <Icon />
          {label}
        </button>
      ))}
    </div>
  );
}
