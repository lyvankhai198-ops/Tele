import { lstat, readdir, realpath, stat, statfs } from "node:fs/promises";
import path from "node:path";

const MEDIA_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const MEDIA_MAX_FILES = 500;
const EXPORT_RETENTION_DAYS = 30;
const LOG_MAX_BYTES = 25 * 1024 * 1024 * 2 * 8;
const LOG_RETENTION_DAYS = 7;
const STORAGE_CACHE_TTL_MS = 30_000;
const MAX_DIRECTORY_FILES = 1_000;
const MAX_DIRECTORY_DEPTH = 5;
const PROJECT_DIRECTORY = path.resolve(process.env.TELECAMPAIGN_PROJECT_DIR?.trim() || process.cwd());
const TELECAMPAIGN_DATA_DIRECTORY = process.env.NODE_ENV === "production" ? "/var/lib/telecampaign" : PROJECT_DIRECTORY;
const MEDIA_DIRECTORY = process.env.TELECAMPAIGN_MEDIA_DIR?.trim()
  || path.join(TELECAMPAIGN_DATA_DIRECTORY, process.env.NODE_ENV === "production" ? "media" : ".telecampaign-media");
const EXPORT_DIRECTORY = process.env.TELECAMPAIGN_EXPORTS_DIR?.trim() || path.join(PROJECT_DIRECTORY, "exports");
const PM2_LOG_DIRECTORY = process.env.TELECAMPAIGN_PM2_LOG_DIR?.trim()
  || path.join(process.env.PM2_HOME?.trim() || "/root/.pm2", "logs");
const TELECAMPAIGN_LOG_FILES = ["telecampaign-api-out.log", "telecampaign-api-error.log"];

type DirectoryUsage = {
  available: boolean;
  bytes: number;
  fileCount: number;
  oldFileCount: number;
};

let cachedStatus: { value: Awaited<ReturnType<typeof collectStorageStatus>>; expiresAt: number } | null = null;
let pendingStatus: Promise<Awaited<ReturnType<typeof collectStorageStatus>>> | null = null;

function isWithinRoot(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function resolveSafeDirectory(directory: string, approvedRoot: string): Promise<string | null> {
  const requested = path.resolve(directory);
  const requestedRoot = path.resolve(approvedRoot);
  if (!isWithinRoot(requestedRoot, requested)) return null;
  try {
    const [canonicalRoot, canonicalDirectory, details] = await Promise.all([
      realpath(requestedRoot),
      realpath(requested),
      lstat(requested),
    ]);
    if (!details.isDirectory() || details.isSymbolicLink() || !isWithinRoot(canonicalRoot, canonicalDirectory)) return null;
    return canonicalDirectory;
  } catch {
    return null;
  }
}

async function measureDirectory(directory: string, approvedRoot: string, oldAfterDays?: number): Promise<DirectoryUsage> {
  const root = await resolveSafeDirectory(directory, approvedRoot);
  if (!root) return { available: false, bytes: 0, fileCount: 0, oldFileCount: 0 };
  const cutoff = oldAfterDays === undefined ? null : Date.now() - oldAfterDays * 24 * 60 * 60 * 1000;
  let bytes = 0;
  let fileCount = 0;
  let oldFileCount = 0;
  let exceededLimit = false;

  async function walk(current: string, depth: number): Promise<void> {
    if (depth > MAX_DIRECTORY_DEPTH || exceededLimit) {
      exceededLimit = true;
      return;
    }
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (exceededLimit) return;
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (fileCount >= MAX_DIRECTORY_FILES) {
        exceededLimit = true;
        return;
      }
      const details = await stat(entryPath);
      bytes += details.size;
      fileCount += 1;
      if (cutoff !== null && details.mtimeMs < cutoff) oldFileCount += 1;
    }
  }

  try {
    await walk(root, 0);
    if (exceededLimit) return { available: false, bytes: 0, fileCount: 0, oldFileCount: 0 };
    return { available: true, bytes, fileCount, oldFileCount };
  } catch {
    return { available: false, bytes: 0, fileCount: 0, oldFileCount: 0 };
  }
}

async function measureLogFiles(): Promise<DirectoryUsage> {
  let bytes = 0;
  let fileCount = 0;
  try {
    const directory = await lstat(PM2_LOG_DIRECTORY);
    if (!directory.isDirectory() || directory.isSymbolicLink()) return { available: false, bytes: 0, fileCount: 0, oldFileCount: 0 };
    const files = await readdir(PM2_LOG_DIRECTORY, { withFileTypes: true });
    for (const entry of files) {
      if (!entry.isFile() || !TELECAMPAIGN_LOG_FILES.some((filename) => entry.name === filename || entry.name.startsWith(`${filename}.`))) continue;
      const details = await stat(path.join(PM2_LOG_DIRECTORY, entry.name));
      bytes += details.size;
      fileCount += 1;
    }
    return { available: true, bytes, fileCount, oldFileCount: 0 };
  } catch {
    return { available: false, bytes: 0, fileCount: 0, oldFileCount: 0 };
  }
}

async function collectStorageStatus() {
  const [filesystem, media, exports, logs] = await Promise.all([
    statfs("/").catch(() => null),
    measureDirectory(MEDIA_DIRECTORY, TELECAMPAIGN_DATA_DIRECTORY),
    measureDirectory(EXPORT_DIRECTORY, PROJECT_DIRECTORY, EXPORT_RETENTION_DAYS),
    measureLogFiles(),
  ]);

  const totalBytes = filesystem ? Number(filesystem.blocks) * Number(filesystem.bsize) : 0;
  const freeBytes = filesystem ? Number(filesystem.bavail) * Number(filesystem.bsize) : 0;
  const usedBytes = Math.max(0, totalBytes - freeBytes);

  return {
    checkedAt: new Date().toISOString(),
    disk: {
      available: Boolean(filesystem),
      totalBytes,
      usedBytes,
      freeBytes,
      usedPercent: totalBytes > 0 ? Number(((usedBytes / totalBytes) * 100).toFixed(1)) : 0,
    },
    media: {
      available: media.available,
      bytes: media.bytes,
      fileCount: media.fileCount,
      maxBytes: MEDIA_MAX_BYTES,
      maxFiles: MEDIA_MAX_FILES,
    },
    exports: {
      available: exports.available,
      bytes: exports.bytes,
      fileCount: exports.fileCount,
      oldFileCount: exports.oldFileCount,
      retentionDays: EXPORT_RETENTION_DAYS,
    },
    logs: {
      available: logs.available,
      bytes: logs.bytes,
      fileCount: logs.fileCount,
      maxBytes: LOG_MAX_BYTES,
      retentionDays: LOG_RETENTION_DAYS,
    },
  };
}

export async function getStorageStatus() {
  if (cachedStatus && cachedStatus.expiresAt > Date.now()) return cachedStatus.value;
  if (pendingStatus) return pendingStatus;
  pendingStatus = collectStorageStatus().then((value) => {
    cachedStatus = { value, expiresAt: Date.now() + STORAGE_CACHE_TTL_MS };
    return value;
  }).finally(() => {
    pendingStatus = null;
  });
  return pendingStatus;
}