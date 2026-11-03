import { childCoverage, coverageAmounts, coverageGap, coverageWidth, formatValue } from '../lib/links.js';

// How much of an impact's target its child impacts account for. Renders nothing
// for an impact with no children.
export default function ChildCoverage({ impact, target, impacts, targets }) {
  const coverage = childCoverage(impact, target, impacts, targets);
  if (!coverage) return null;
  const gap = coverageGap(coverage);
  const { contributing, missing, unit } = coverage;

  return (
    <div className="target-coverage">
      <div
        className="target-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(coverageWidth(coverage))}
        aria-label={`Share of ${impact.name}'s target accounted for by child impacts`}
      >
        <div className="target-progress-fill target-coverage-fill" style={{ width: `${coverageWidth(coverage)}%` }} />
      </div>
      <p className="target-meta">
        <span className="target-now">{Math.round(coverage.share * 100)}% accounted for by child impacts</span>
        <span>{coverageAmounts(coverage)}</span>
        {gap && <span>{gap}</span>}
      </p>
      {contributing.length > 0 && (
        <ul className="target-coverage-parts">
          {contributing.map((part) => (
            <li key={part.impact.id}>
              <span>{part.impact.name}</span>
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
              : `${missing.length} child impacts have no ${unit} target yet`}
          </span>
        </p>
      )}
    </div>
  );
}
