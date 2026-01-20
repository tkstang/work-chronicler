#!/usr/bin/env node

import { createServer, startServer } from '../dist/mcp/server.js';

const ctx = await createServer();
await startServer(ctx);
