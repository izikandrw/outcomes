import { useState } from 'react';
import { API_ORIGIN } from '../api.js';
import { RULES } from '../lib/validation.js';

// "How to use this product": the framework the app is built around, then how to
// drive it from Claude through the MCP server and kick off agents. The commands
// are filled in with this deployment's API and the signed-in person's email, so
// they can be pasted as they are.

const FRAMEWORK = [
  {
    entity: 'impact',
    page: 'impacts',
    title: 'Impact',
    question: 'What does the business need?',
    body: 'Write down the business results you are on the hook for, and give each a target so it can be settled with a number.',
  },
  {
    entity: 'insight',
    page: 'insights',
    title: 'Insights',
    question: 'What do customers need?',
    body: 'Collect single, checkable observations from calls, tickets, surveys and reviews. Each one keeps its source so anyone can go back and check it.',
  },
  {
    entity: 'outcome',
    page: 'outcomes',
    title: 'Outcomes',
    question: 'What do customers want to see happen?',
    body: 'Group insights into the results customers are after, then connect each outcome to the impact it could drive. Name what the customer gets, not the metric you want or the thing you would build.',
  },
  {
    entity: 'prioritize',
    page: 'map',
    title: 'Prioritize',
    question: 'Which outcomes are worth the effort?',
    body: 'Estimate what each outcome could do for its impact. Weigh that against the evidence behind it and the dollars at stake on its insights, then choose. The Map shows it all together.',
  },
  {
    entity: 'project',
    page: 'roadmap',
    title: 'Roadmap',
    question: 'What will we build to get there?',
    body: 'Add the projects that could move each outcome, give them a team and dates, and address the technical and usability risk of each.',
  },
];

// One made-up example, read from the top down. Each level answers "why?" for the
// one below it.
const EXAMPLE = [
  { entity: 'impact', kind: 'Impact', text: 'Grow revenue by 20% this year', note: 'the business result' },
  { entity: 'outcome', kind: 'Outcome', text: 'Customers see their own data in the product on day one', note: 'the result the customer wants' },
  { entity: 'project', kind: 'Project', text: 'Guided data connection in onboarding', note: 'the work that ships' },
];

const PROMPTS = [
  {
    title: 'Check the plan',
    prompt: 'Are we working on the right things? Review our portfolio and tell me what to fix first.',
    result: 'Claude runs review_portfolio and reports the same gaps the app flags.',
  },
  {
    title: 'Build the tree',
    prompt: 'Here are my notes from planning. Create the impacts and outcomes they describe, and link each outcome to its impact.',
    result: 'Claude creates the records, signed in as you, and they appear here straight away.',
  },
  {
    title: 'Keep targets current',
    prompt: 'Weekly active admins hit 1,240 this week. Record that against the target on the activation outcome.',
    result: 'Claude finds the target and records the measurement.',
  },
];

function CopyBlock({ children, label }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="guide-code">
      <pre aria-label={label}>{children}</pre>
      <button type="button" className="ghost small" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

// Claude Code's background job list, as it looks with a collector running.
function JobList() {
  return (
    <figure className="guide-terminal">
      <div className="guide-terminal-screen" role="img" aria-label="Claude Code's job list, with an insights collector job running three research agents">
        <p className="dim">Your conversation moved to the background — enter opens it · esc returns to it</p>
        <p className="dim strong">Working</p>
        <p className="guide-terminal-row">
          <span className="strong">· insights collector outcomes</span>
          <span className="dim">3 research agents running; will verify quotes on finish</span>
        </p>
      </div>
      <figcaption>The agent keeps working while you do something else. Keep it open in a terminal, or list your jobs later with <code>claude agents</code>.</figcaption>
    </figure>
  );
}

export default function GuidePage({ user, onNavigate }) {
  const healthRules = RULES.filter((rule) => !rule.id.startsWith('ownerless'));
  const goTo = (page) => (event) => {
    event.preventDefault();
    onNavigate(page);
  };
  const link = (page, text) => (
    <a href={`?page=${page}`} onClick={goTo(page)}>
      {text}
    </a>
  );

  const install = `npm --prefix mcp install
read -rs OUTCOMES_PASSWORD`;
  const connect = `claude mcp add outcomes \\
  -e OUTCOMES_API_URL=${API_ORIGIN} \\
  -e OUTCOMES_EMAIL=${user.email} \\
  -e OUTCOMES_PASSWORD="$OUTCOMES_PASSWORD" \\
  -- node "$PWD/mcp/src/server.js"`;
  const kickoff = `claude --bg "Collect insights from ~/Downloads/feedback-log.csv and suggest them for review"`;

  return (
    <section className="card guide" aria-label="How to use Outcomes">
      <div className="guide-intro">
        <h2>How to use Outcomes</h2>
        <p>
          The business wants revenue. Customers want their problems solved. Product work gets stuck when those look like
          a choice. Outcomes are the bridge: a result customers want that also moves the business.
        </p>
      </div>

      <div className="guide-section">
        <h3>The framework</h3>
        <ol className="guide-steps">
          {FRAMEWORK.map((step, index) => (
            <li key={step.title} className={`guide-step guide-tone-${step.entity}`}>
              <span className="guide-step-number">{index + 1}</span>
              <strong>{link(step.page, step.title)}</strong>
              <em>{step.question}</em>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="guide-section guide-columns">
        <div>
          <h3>How the pieces connect</h3>
          <div className="guide-chain">
            {EXAMPLE.map((level) => (
              <div key={level.kind} className={`guide-link guide-tone-${level.entity}`}>
                <span className="guide-link-kind">{level.kind}</span>
                <span>{level.text}</span>
                <small>{level.note}</small>
              </div>
            ))}
            <div className="guide-link guide-tone-insight">
              <span className="guide-link-kind">Insight</span>
              <span>“9 of 23 trial exit-survey respondents never found where to connect their data”</span>
              <small>the evidence, linked to the outcome</small>
            </div>
          </div>
          <p className="guide-note">
            A target puts numbers on an impact or outcome, and a team owns each outcome and project. This example is made up.
          </p>
        </div>
        <div>
          <h3>Spot where the plan is only hope</h3>
          <p>Outcomes flags the broken links in the chain, and counts them at the top of every page.</p>
          <ul className="guide-rules">
            {healthRules.map((rule) => (
              <li key={rule.id}>
                <span aria-hidden="true">{rule.emoji}</span>
                <div>
                  <strong>{rule.title}</strong>
                  <p>{rule.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="guide-section">
        <h3>Work with Claude</h3>
        <p>
          The Outcomes MCP server gives Claude Code the same abilities you have here, so you can read and change your
          account by asking in plain language, and start agents that collect evidence for you.
        </p>

        <h4>1. Connect Claude</h4>
        <p>
          The server runs from a checkout of the Outcomes repository, which is private, so you need access to it and{' '}
          <a href="https://code.claude.com/docs/en/overview" target="_blank" rel="noreferrer">Claude Code</a>{' '}
          installed. From the root of the checkout, install the server, then type your Outcomes password when the prompt
          waits. It won't show as you type.
        </p>
        <CopyBlock label="Commands that install the server and read your password">{install}</CopyBlock>
        <p>Then register the server, and start a new <code>claude</code> session in the same folder.</p>
        <CopyBlock label="Command that connects Claude Code to Outcomes">{connect}</CopyBlock>

        <h4>2. Ask Claude to do the work</h4>
        <div className="guide-prompts">
          {PROMPTS.map((item) => (
            <div key={item.title} className="guide-prompt">
              <strong>{item.title}</strong>
              <blockquote>{item.prompt}</blockquote>
              <p>{item.result}</p>
            </div>
          ))}
        </div>

        <h4>3. Kick off an agent</h4>
        <p>
          The insight collector reads customer evidence, pulls out observations, checks each quote against its source and
          suggests links to your outcomes and projects. Give it a CSV export, call transcripts, Jira issues or a research
          question. It signs in as a separate collector user that can only read, suggest and record its runs, so it can't
          change your plan.
        </p>
        <p>
          The first time, an account admin asks Claude to <q>set up the insight collector</q>. Claude creates the login,
          keeps the password in a private file and gives you a command to run. After that, start a new session and hand
          it the job, in the conversation or in the background. Files run through a pipeline that needs{' '}
          <code>ANTHROPIC_API_KEY</code> set.
        </p>
        <CopyBlock label="Command that starts the insight collector in the background">{kickoff}</CopyBlock>
        <JobList />

        <h4>4. Review what comes back</h4>
        <p>
          Nothing an agent suggests counts as evidence until a person approves it. Go to {link('review', 'Review insights')} to
          approve or reject each suggestion, with its quote and source beside it. Its Runs tab shows every document a run
          read and why it kept or passed on each one, so you can catch what it got wrong.
        </p>
      </div>
    </section>
  );
}
