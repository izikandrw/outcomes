#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAccountTools } from './tools/account.js';
import { registerTeamTools } from './tools/teams.js';
import { registerImpactTools } from './tools/impacts.js';
import { registerOutcomeTools } from './tools/outcomes.js';
import { registerProjectTools } from './tools/projects.js';
import { registerInsightTools } from './tools/insights.js';
import { registerTargetTools, registerMeasurementTools } from './tools/targets.js';
import { registerHealthTools } from './tools/health.js';
import { registerRunTools } from './tools/runs.js';

// Sent to every client on connect, so agents learn the layers of the tree before
// they create anything. Definitions live in product/domain-model/.
const instructions = `An account's tree has three layers, each a different kind of thing:
- Impact: a result that grows the business, revenue up or costs down, counted in money or a direct proxy (ARR, net revenue retention, win rate, churned revenue, support cost). "Grow enterprise ARR 20%" is an impact.
- Outcome: a change in what customers (people or agents) get or do that drives an impact, written from the customer's side. "Admins invite a teammate in their first session" is an outcome.
- Project: something the team builds or ships to drive outcomes. "Launch the public API" is a project.
Before creating an impact, check it isn't really an outcome (customer behavior) or a project (a deliverable, launch, funding or adoption milestone). If it is, ask what business result it leads to and make that the impact.
Metrics go on targets (create_target), never in names or descriptions.`;

const server = new McpServer({ name: 'outcomes', version: '1.0.0' }, { instructions });

// OUTCOMES_TOOLSET=collector runs the server for the insight collector agent
// (product/agents/insight-collector/): only what it needs to read the account
// and suggest insights. The API enforces the same limits for a 'collector'
// user; a smaller tool list just keeps the model from reaching for the rest.
const COLLECTOR_TOOLS = new Set([
  'list_outcomes', 'get_outcome', 'list_projects', 'get_project', 'list_insights', 'get_insight', 'suggest_insight',
  'start_collection_run', 'record_document', 'finish_collection_run',
]);
if (process.env.OUTCOMES_TOOLSET === 'collector') {
  const register = server.registerTool.bind(server);
  server.registerTool = (name, ...rest) => (COLLECTOR_TOOLS.has(name) ? register(name, ...rest) : undefined);
}

registerAccountTools(server);
registerTeamTools(server);
registerImpactTools(server);
registerOutcomeTools(server);
registerProjectTools(server);
registerInsightTools(server);
registerTargetTools(server);
registerMeasurementTools(server);
registerHealthTools(server);
registerRunTools(server);

// stdout carries the protocol; log to stderr only.
await server.connect(new StdioServerTransport());
