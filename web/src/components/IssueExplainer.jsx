// Rendered inside the modal, which supplies the heading (the rule's emoji and
// title) and close control.
export default function IssueExplainer({ rule, entity }) {
  return (
    <div className="issue-explainer">
      <p className="issue-subject">{entity.name}</p>
      <p>{rule.description}</p>
      <p>
        <strong>How to fix it:</strong> {rule.fix}
      </p>
    </div>
  );
}
