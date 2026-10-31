import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { mkdir, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
if (process.env.DATABASE_URL !== "postgres://telecamp_test@127.0.0.1:5432/telecamp_test") throw Error("E2E_UNSAFE_DATABASE_REFUSED");
const require = createRequire(path.join(root, "artifacts/api-server/package.json"));
const { build } = require("esbuild");
const dir = path.join(root, "artifacts/api-server/.e2e");
const feedbackMedia = await mkdtemp(path.join(tmpdir(), "telecamp-feedback-test-"));
await mkdir(dir, { recursive: true });
try {
  await build({
    entryPoints: [path.join(root, "scripts/tests/admin-tools.e2e.ts")],
    outfile: path.join(dir, "suite.mjs"), bundle: true, platform: "node", format: "esm",
    alias: { "@workspace/db": path.join(root, "lib/db/src/index.ts") },
    external: ["pg-native", "sharp", "pino", "pino-http", "express", "cookie-parser",
      "bufferutil", "utf-8-validate", "@clerk/*"],
    banner: { js: 'import {createRequire as __e2eRequire} from "node:module";import __e2ePath from "node:path";import __e2eUrl from "node:url";const require=__e2eRequire(import.meta.url);globalThis.require=require;globalThis.__filename=__e2eUrl.fileURLToPath(import.meta.url);globalThis.__dirname=__e2ePath.dirname(globalThis.__filename);' },
    logLevel: "silent",
  });
  const bootstrap = `import(${JSON.stringify(path.join(dir, "suite.mjs"))}).catch(error => {
    console.error("E2E_BOOT_" + String(error.name).replace(/[^a-z]/gi,"").toUpperCase());
    const known = ["ERR_MODULE_NOT_FOUND","MODULE_NOT_FOUND","ERR_REQUIRE_ESM"];
    if (known.includes(error.code)) console.error("E2E_" + error.code);
    if (/__dirname is not defined/.test(error.message)) console.error("E2E_BOOT_UNDEFINED_DIRNAME");
    if (/__filename is not defined/.test(error.message)) console.error("E2E_BOOT_UNDEFINED_FILENAME");
    const missingExport = String(error.message).match(/Named export '([A-Za-z0-9_]+)' not found/);
    if (missingExport) console.error("E2E_MISSING_EXPORT_" + missingExport[1].toUpperCase());
    for (const name of ["express","pino","pino-http","pg","sharp","telegram","cookie-parser"])
      if (String(error.message).includes("Cannot find") && String(error.message).includes(name))
        console.error("E2E_MISSING_" + name.replace(/-/g,"_").toUpperCase());
    process.exit(1);
  });`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", bootstrap], {
    encoding: "utf8", timeout: 90000,
    env: { ...process.env, TELECAMPAIGN_E2E_ONLY: "1", NODE_ENV: "production", LOG_LEVEL: "silent",
      SESSION_SECRET: randomBytes(32).toString("hex"), TELECAMPAIGN_DISABLE_WORKER: "true",
      TELECAMPAIGN_MEDIA_DIR: feedbackMedia,
      TELECAMPAIGN_DISABLE_PAYMENT_WORKER: "true" },
  });
  // Never publish request bodies, session cookies, recovery codes or DB errors.
  console.log((result.stdout + result.stderr).split("\n").filter(line => /^E2E_[A-Z0-9_]+$/.test(line)).join("\n"));
  if (result.signal || result.error) console.log("E2E_PROCESS_INTERRUPTED");
  if (result.status !== 0 || !result.stdout.includes("E2E_ALL_PASSED")) process.exitCode = 1;
} finally {
  await rm(dir, { recursive: true, force: true });
  await rm(feedbackMedia, { recursive: true, force: true });
}
