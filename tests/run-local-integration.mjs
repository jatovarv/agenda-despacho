import {setupCode} from '../db/sqlite.mjs';
process.env.SETUP_CODE=setupCode();
await import('./integration.mjs');
