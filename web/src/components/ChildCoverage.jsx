import { childCoverage, coverageAmounts, coverageGap, coverageWidth, formatValue } from '../lib/links.js';

// How much of a target what rolls up to its owner accounts for. `kind` says what
// `entity` is and `collections` holds { impacts, outcomes, projects, targets }.
// Renders nothing when nothing beneath it states that unit.
export default function ChildCoverage({ kind, entity, target, collections }) {
  const coverage = childCoverage(kind, entity, target, collections);
  if (!coverage) return null;
  const gap = coverageGap(coverage);
  const { contributing, missing, missingLabel, source, unit } = coverage;

  return (
    <div className="target-coverage">
      <div
        className="target-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(coverageWidth(coverage))}
        aria-label={`Share of ${entity.name}'s target accounted for by ${source}`}
      >
        <div className="target-progress-fill target-coverage-fill" style={{ width: `${coverageWidth(coverage)}%` }} />
      </div>
      <p className="target-meta">
        <span className="target-now">{Math.round(coverage.share * 100)}% accounted for by {source}</span>
        <span>{coverageAmounts(coverage)}</span>
        {gap && <span>{gap}</span>}
      </p>
      {contributing.length > 0 && (
        <ul className="target-coverage-parts">
          {contributing.map((part) => (
            <li key={`${part.kind}-${part.item.id}`}>
              <span>{part.item.name}</span>
              <span className="target-coverage-value">{formatValue(part.value)}</span>
            </li>
          ))}
        </ul>
      )}
      {missing.length > 0 && (
        <p className="target-meta">
          <span className="muted">
            {missing.length === 1
              ? `${missing[0].name} has no ${unit} target yet`
              : `${missing.length} ${missingLabel} have no ${unit} target yet`}
          </span>
        </p>
      )}
    </div>
  );
}
