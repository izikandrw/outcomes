#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerOutcomeTools } from './tools/outcomes.js';

const server = new McpServer({ name: 'outcomes', version: '1.0.0' });

registerOutcomeTools(server);

// stdout carries the protocol; log to stderr only.
await server.connect(new StdioServerTransport());
