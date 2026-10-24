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

const server = new McpServer({ name: 'outcomes', version: '1.0.0' });

registerTeamTools(server);
registerImpactTools(server);
registerOutcomeTools(server);
registerProjectTools(server);
registerInsightTools(server);
registerTargetTools(server);
registerMeasurementTools(server);
registerHealthTools(server);

// stdout carries the protocol; log to stderr only.
await server.connect(new StdioServerTransport());
