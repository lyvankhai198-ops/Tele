import assert from "node:assert/strict";
import { issueCaptcha, verifyAndConsumeCaptcha } from "./captcha";

const now = 1_800_000_000_000;
const code = "2A4G7Z";

async function run(): Promise<void> {
  const challenge = await issueCaptcha("203.0.113.10", { now, code });
  assert.match(challenge.image, /^data:image\/png;base64,/);
  const image = Buffer.from(challenge.image.split(",", 2)[1], "base64");
  assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(image.includes(Buffer.from(code)), false);
  assert.equal(verifyAndConsumeCaptcha(challenge.challengeId, code.toLowerCase(), "203.0.113.10", now + 1), "valid");
  assert.equal(verifyAndConsumeCaptcha(challenge.challengeId, code, "203.0.113.10", now + 2), "missing");

  const wrongChallenge = await issueCaptcha("203.0.113.11", { now, code });
  assert.equal(verifyAndConsumeCaptcha(wrongChallenge.challengeId, "WRONG1", "203.0.113.11", now + 1), "wrong");
  assert.equal(verifyAndConsumeCaptcha(wrongChallenge.challengeId, code, "203.0.113.11", now + 2), "missing");

  const ipChallenge = await issueCaptcha("203.0.113.12", { now, code });
  assert.equal(verifyAndConsumeCaptcha(ipChallenge.challengeId, code, "203.0.113.99", now + 1), "ip-mismatch");
  assert.equal(verifyAndConsumeCaptcha(ipChallenge.challengeId, code, "203.0.113.12", now + 2), "missing");

  const expiredChallenge = await issueCaptcha("203.0.113.13", { now, ttlMs: 10, code });
  assert.equal(verifyAndConsumeCaptcha(expiredChallenge.challengeId, code, "203.0.113.13", now + 10), "expired");

  console.log("Authentication CAPTCHA checks passed.");
}

await run();