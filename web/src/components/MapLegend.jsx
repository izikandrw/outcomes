// A one-line reading of the map for someone seeing it for the first time, in the
// colours its cards use. The questions match the framework on the Guide page.
const CHAIN = [
  { entity: 'impact', title: 'Impact', question: 'What the business needs' },
  { entity: 'outcome', title: 'Outcomes', question: 'What customers want to see happen' },
  { entity: 'project', title: 'Projects', question: 'What we will build to get there' },
];

export default function MapLegend() {
  return (
    <div className="map-legend" role="note" aria-label="How to read the map">
      <ol className="map-legend-chain">
        {CHAIN.map((level) => (
          <li key={level.entity} className={`map-legend-item tone-${level.entity}`}>
            <strong>{level.title}</strong>
            <span>{level.question}</span>
          </li>
        ))}
      </ol>
      <p className="map-legend-item tone-insight">
        <strong>💡 Insights</strong>
        <span>The customer evidence behind them</span>
      </p>
    </div>
  );
}
