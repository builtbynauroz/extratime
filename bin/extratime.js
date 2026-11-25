#!/usr/bin/env node
// extratime: a coding agent on your Anthropic API key, powered by Claude. Runs the TypeScript source through tsx, so there's no build step.
// tsx is found from this file wherever npm, npx, pnpm or bun put it, and our own tsconfig applies in whatever folder you run it.
import { fileURLToPath } from "node:url";
import { register } from "tsx/esm/api";

register({ tsconfig: fileURLToPath(new URL("../tsconfig.json", import.meta.url)) });
await import("../src/cli.tsx");
