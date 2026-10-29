#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTeamTools } from './tools/teams.js';
import { registerImpactTools } from './tools/impacts.js';
import { registerOutcomeTools } from './tools/outcomes.js';
import { registerProjectTools } from './tools/projects.js';
import { registerInsightTools } from './tools/insights.js';
import { registerTargetTools, registerMeasurementTools } from './tools/targets.js';
import { registerHealthTools } from './tools/health.js';
import { registerRunTools } from './tools/runs.js';

const server = new McpServer({ name: 'outcomes', version: '1.0.0' });

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
