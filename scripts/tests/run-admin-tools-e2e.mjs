import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
if (process.env.DATABASE_URL !== "postgres://telecamp_test@127.0.0.1:5432/telecamp_test") throw Error("E2E_UNSAFE_DATABASE_REFUSED");
const require = createRequire(path.join(root, "artifacts/api-server/package.json"));
const { build } = require("esbuild");
const dir = path.join(root, "artifacts/api-server/.e2e");
await mkdir(dir, { recursive: true });
try {
  await build({
    entryPoints: [path.join(root, "scripts/tests/admin-tools.e2e.ts")],
    outfile: path.join(dir, "suite.mjs"), bundle: true, platform: "node", format: "esm",
    alias: { "@workspace/db": path.join(root, "lib/db/src/index.ts") },
    external: ["pg", "pg-native", "sharp", "pino", "pino-http", "express", "cookie-parser",
      "telegram", "bufferutil", "utf-8-validate", "@clerk/*"],
    banner: { js: 'import {createRequire as __e2eRequire} from "node:module";const require=__e2eRequire(import.meta.url);' },
    logLevel: "silent",
  });
  const result = spawnSync(process.execPath, [path.join(dir, "suite.mjs")], {
    encoding: "utf8", timeout: 90000,
    env: { ...process.env, TELECAMPAIGN_E2E_ONLY: "1", NODE_ENV: "production", LOG_LEVEL: "silent",
      SESSION_SECRET: randomBytes(32).toString("hex"), TELECAMPAIGN_DISABLE_WORKER: "true",
      TELECAMPAIGN_DISABLE_PAYMENT_WORKER: "true" },
  });
  // Never publish request bodies, session cookies, recovery codes or DB errors.
  console.log((result.stdout + result.stderr).split("\n").filter(line => /^E2E_[A-Z_]+$/.test(line)).join("\n"));
  if (result.status !== 0 || !result.stdout.includes("E2E_ALL_PASSED")) process.exitCode = 1;
} finally { await rm(dir, { recursive: true, force: true }); }
