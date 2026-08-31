import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import sharp from "sharp";

const CAPTCHA_TTL_MS = 5 * 60_000;
const CAPTCHA_LENGTH = 6;
const MAX_ACTIVE_CHALLENGES = 5_000;
const MAX_TRACKED_IPS = 10_000;
const MAX_ISSUES_PER_IP = 30;
const ISSUE_WINDOW_MS = 15 * 60_000;
const CAPTCHA_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CAPTCHA_WIDTH = 258;
const CAPTCHA_HEIGHT = 68;

type CaptchaChallenge = {
  answerHash: Buffer;
  ip: string;
  expiresAt: number;
};

type IssueCounter = {
  count: number;
  resetAt: number;
};

const challenges = new Map<string, CaptchaChallenge>();
const issueCounters = new Map<string, IssueCounter>();

export type CaptchaVerification =
  | "valid"
  | "missing"
  | "expired"
  | "wrong"
  | "ip-mismatch";

export class CaptchaIssueRateLimitError extends Error {
  constructor() {
    super("Đã yêu cầu quá nhiều mã CAPTCHA. Vui lòng thử lại sau 15 phút");
    this.name = "CaptchaIssueRateLimitError";
  }
}

function hashAnswer(answer: string): Buffer {
  return createHash("sha256").update(answer.toUpperCase(), "utf8").digest();
}

function randomCode(): string {
  const bytes = randomBytes(CAPTCHA_LENGTH);
  return Array.from(bytes, (byte) => CAPTCHA_ALPHABET[byte % CAPTCHA_ALPHABET.length]).join("");
}

function randomInt(maximum: number): number {
  return randomBytes(2).readUInt16BE(0) % maximum;
}

function pruneExpired(now = Date.now()): void {
  for (const [id, challenge] of challenges) {
    if (challenge.expiresAt <= now) challenges.delete(id);
  }
  for (const [ip, counter] of issueCounters) {
    if (counter.resetAt <= now) issueCounters.delete(ip);
  }
  if (challenges.size > MAX_ACTIVE_CHALLENGES) {
    const excess = challenges.size - MAX_ACTIVE_CHALLENGES;
    let removed = 0;
    for (const id of challenges.keys()) {
      challenges.delete(id);
      removed += 1;
      if (removed >= excess) break;
    }
  }
  if (issueCounters.size > MAX_TRACKED_IPS) {
    const excess = issueCounters.size - MAX_TRACKED_IPS;
    let removed = 0;
    for (const ip of issueCounters.keys()) {
      issueCounters.delete(ip);
      removed += 1;
      if (removed >= excess) break;
    }
  }
}

function reserveIssue(ip: string, now: number): void {
  pruneExpired(now);
  const current = issueCounters.get(ip);
  if (current && current.resetAt > now && current.count >= MAX_ISSUES_PER_IP) {
    throw new CaptchaIssueRateLimitError();
  }
  if (!current || current.resetAt <= now) {
    issueCounters.set(ip, { count: 1, resetAt: now + ISSUE_WINDOW_MS });
  } else {
    issueCounters.set(ip, { ...current, count: current.count + 1 });
  }
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character] ?? character);
}

async function renderCaptchaPng(code: string): Promise<Buffer> {
  const fonts = ["DejaVu Sans", "DejaVu Serif", "DejaVu Sans Mono"];
  const characters = Array.from(code, (character, index) => {
    const x = 27 + index * 39 + randomInt(7);
    const y = 46 + randomInt(11);
    const rotation = -22 + randomInt(45);
    const skew = -10 + randomInt(21);
    const size = 29 + randomInt(8);
    const font = fonts[randomInt(fonts.length)];
    const color = index % 2 === 0 ? "#173b5c" : "#0877d5";
    return `<text x="${x}" y="${y}" transform="rotate(${rotation} ${x} ${y}) skewX(${skew})" fill="${color}" font-family="${font}" font-size="${size}" font-weight="700">${escapeXml(character)}</text>`;
  }).join("");
  const curves = Array.from({ length: 9 }, (_, index) => {
    const y1 = randomInt(CAPTCHA_HEIGHT);
    const y2 = randomInt(CAPTCHA_HEIGHT);
    const controlY = randomInt(CAPTCHA_HEIGHT);
    return `<path d="M${index * 31 - 20} ${y1} Q${index * 31 + 20} ${controlY} ${index * 31 + 62} ${y2}" stroke="${index % 2 ? "#76bce0" : "#9aaec0"}" stroke-opacity=".58" stroke-width="${1 + randomInt(3)}" fill="none"/>`;
  }).join("");
  const dots = Array.from({ length: 55 }, () => (
    `<circle cx="${randomInt(CAPTCHA_WIDTH)}" cy="${randomInt(CAPTCHA_HEIGHT)}" r="${1 + randomInt(3)}" fill="${randomInt(2) ? "#77bde3" : "#a3b6c8"}" fill-opacity=".5"/>`
  )).join("");
  const seed = randomInt(65_535);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CAPTCHA_WIDTH}" height="${CAPTCHA_HEIGHT}" viewBox="0 0 ${CAPTCHA_WIDTH} ${CAPTCHA_HEIGHT}"><defs><filter id="warp" x="-10%" y="-20%" width="120%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".012 .045" numOctaves="2" seed="${seed}" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="${4 + randomInt(5)}" xChannelSelector="R" yChannelSelector="G"/></filter></defs><rect width="100%" height="100%" rx="12" fill="#eff8ff"/><g filter="url(#warp)">${dots}${curves}${characters}</g><rect x="1" y="1" width="${CAPTCHA_WIDTH - 2}" height="${CAPTCHA_HEIGHT - 2}" rx="11" fill="none" stroke="#bde4f9"/></svg>`;
  return sharp(Buffer.from(svg, "utf8"))
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
}

export async function issueCaptcha(
  ip: string,
  options: { now?: number; ttlMs?: number; code?: string } = {},
): Promise<{ challengeId: string; image: string; expiresAt: string }> {
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? CAPTCHA_TTL_MS;
  reserveIssue(ip, now);
  const code = options.code ?? randomCode();
  if (code.length !== CAPTCHA_LENGTH || Array.from(code).some((character) => !CAPTCHA_ALPHABET.includes(character))) {
    throw new Error("CAPTCHA code must contain exactly six supported characters");
  }
  const challengeId = randomBytes(32).toString("base64url");
  const expiresAt = now + ttlMs;
  challenges.set(challengeId, {
    answerHash: hashAnswer(code),
    ip,
    expiresAt,
  });
  return {
    challengeId,
    image: `data:image/png;base64,${(await renderCaptchaPng(code)).toString("base64")}`,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export function verifyAndConsumeCaptcha(
  challengeId: string,
  answer: string,
  ip: string,
  now = Date.now(),
): CaptchaVerification {
  const challenge = challenges.get(challengeId);
  if (!challenge) {
    pruneExpired(now);
    return "missing";
  }

  challenges.delete(challengeId);
  pruneExpired(now);
  if (challenge.expiresAt <= now) return "expired";
  if (challenge.ip !== ip) return "ip-mismatch";

  const expected = challenge.answerHash;
  const actual = hashAnswer(answer.trim());
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? "valid" : "wrong";
}