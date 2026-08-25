import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { chmod, mkdir, open, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const ADMIN_NOTIFICATION_MEDIA_PREFIX = "/objects/admin-notifications/";
const MAX_MEDIA_BYTES = 52_428_800;
const UPLOAD_TTL_MS = 15 * 60_000;
const ORPHAN_RETENTION_MS = 60 * 60_000;
const MAX_MEDIA_FILES = 500;
const MAX_TOTAL_MEDIA_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_CONCURRENT_UPLOADS = 2;
const MAX_ORPHAN_CLEANUP_PER_RUN = 50;
const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ADMIN_NOTIFICATION_MEDIA_PATH = new RegExp(`^${ADMIN_NOTIFICATION_MEDIA_PREFIX}(${UUID_PATTERN})$`, "i");

type MediaType = "image" | "video";
type PendingUpload = {
  ownerUserId: string;
  objectPath: string;
  contentType: string;
  size: number;
  expiresAt: number;
};
type DetectedMedia = { mediaType: MediaType; contentType: string };

const acceptedContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

export class NotificationMediaNotFoundError extends Error {
  constructor() {
    super("Notification media not found");
    this.name = "NotificationMediaNotFoundError";
  }
}

export class NotificationMediaUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationMediaUploadError";
  }
}

export class NotificationMediaStorage {
  private readonly pendingUploads = new Map<string, PendingUpload>();
  private activeUploads = 0;

  isAdminNotificationMediaPath(rawPath: string): boolean {
    return ADMIN_NOTIFICATION_MEDIA_PATH.test(rawPath);
  }

  async prepareAdminNotificationUpload(input: {
    ownerUserId: string;
    contentType: string;
    size: number;
  }): Promise<{ uploadURL: string; objectPath: string }> {
    const contentType = normalizeContentType(input.contentType);
    if (!acceptedContentTypes.has(contentType) || !Number.isInteger(input.size) || input.size < 1 || input.size > MAX_MEDIA_BYTES) {
      throw new NotificationMediaUploadError("Media upload is invalid.");
    }

    await this.ensureStorageDirectory();
    this.removeExpiredPendingUploads();
    const stored = await this.storedMediaUsage();
    const reserved = this.pendingMediaUsage();
    if (
      stored.fileCount + reserved.fileCount + 1 > MAX_MEDIA_FILES
      || stored.totalBytes + reserved.totalBytes + input.size > MAX_TOTAL_MEDIA_BYTES
    ) {
      throw new NotificationMediaUploadError("Notification media capacity has been reached.");
    }

    const uploadId = randomUUID();
    const objectPath = `${ADMIN_NOTIFICATION_MEDIA_PREFIX}${uploadId}`;
    this.pendingUploads.set(uploadId, {
      ownerUserId: input.ownerUserId,
      objectPath,
      contentType,
      size: input.size,
      expiresAt: Date.now() + UPLOAD_TTL_MS,
    });

    return {
      uploadURL: `/api/admin/notifications/uploads/${uploadId}`,
      objectPath,
    };
  }

  async storeAdminNotificationUpload(input: {
    uploadId: string;
    ownerUserId: string;
    contentType: string;
    body: Readable;
  }): Promise<void> {
    this.removeExpiredPendingUploads();
    const pending = this.pendingUploads.get(input.uploadId);
    if (!pending || pending.ownerUserId !== input.ownerUserId) throw new NotificationMediaNotFoundError();
    if (pending.contentType !== normalizeContentType(input.contentType)) {
      throw new NotificationMediaUploadError("Media content type does not match the requested upload.");
    }
    if (this.activeUploads >= MAX_CONCURRENT_UPLOADS) throw new NotificationMediaUploadError("Too many media uploads are in progress.");

    const destination = this.filePathFor(pending.objectPath);
    const temporary = path.join(this.storageDirectory(), `.upload-${input.uploadId}-${randomUUID()}`);
    let size = 0;
    let headerSize = 0;
    const header = Buffer.alloc(64);
    const sizeAndHeaderCheck = new Transform({
      transform(chunk: Buffer | Uint8Array, _encoding, callback) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        if (size + bytes.length > pending.size || size + bytes.length > MAX_MEDIA_BYTES) {
          callback(new NotificationMediaUploadError("Media size does not match the requested upload."));
          return;
        }
        const copyLength = Math.min(header.length - headerSize, bytes.length);
        if (copyLength) bytes.copy(header, headerSize, 0, copyLength);
        headerSize += copyLength;
        size += bytes.length;
        callback(null, bytes);
      },
    });
    try {
      this.activeUploads += 1;
      await this.ensureStorageDirectory();
      await pipeline(input.body, sizeAndHeaderCheck, createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
      if (size !== pending.size) throw new NotificationMediaUploadError("Media size does not match the requested upload.");
      const detected = detectMedia(header.subarray(0, headerSize));
      if (!detected || detected.contentType !== pending.contentType) {
        throw new NotificationMediaUploadError("Media content does not match the selected file type.");
      }
      const stored = await this.storedMediaUsage();
      const otherReserved = this.pendingMediaUsage(input.uploadId);
      if (
        stored.fileCount + otherReserved.fileCount + 1 > MAX_MEDIA_FILES
        || stored.totalBytes + otherReserved.totalBytes + pending.size > MAX_TOTAL_MEDIA_BYTES
      ) {
        throw new NotificationMediaUploadError("Notification media capacity has been reached.");
      }
      await rename(temporary, destination);
      this.pendingUploads.delete(input.uploadId);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    } finally {
      this.activeUploads = Math.max(0, this.activeUploads - 1);
    }
  }

  async verifyAdminNotificationMedia(rawPath: string): Promise<{ mediaType: MediaType; size: number }> {
    const media = await this.readAdminNotificationMedia(rawPath);
    return { mediaType: media.mediaType, size: media.size };
  }

  async readAdminNotificationMedia(rawPath: string): Promise<{
    filePath: string;
    mediaType: MediaType;
    contentType: string;
    size: number;
  }> {
    const filePath = this.filePathFor(rawPath);
    try {
      const file = await stat(filePath);
      if (!file.isFile() || file.size < 1 || file.size > MAX_MEDIA_BYTES) throw new NotificationMediaNotFoundError();
      const header = await open(filePath, "r");
      const bytes = Buffer.alloc(64);
      const { bytesRead } = await header.read(bytes, 0, bytes.length, 0).finally(() => header.close());
      const detected = detectMedia(bytes.subarray(0, bytesRead));
      if (!detected) throw new NotificationMediaNotFoundError();
      return { filePath, ...detected, size: file.size };
    } catch (error) {
      if (error instanceof NotificationMediaNotFoundError || isNotFoundError(error)) throw new NotificationMediaNotFoundError();
      throw error;
    }
  }

  async deleteAdminNotificationMedia(rawPath: string): Promise<void> {
    if (!this.isAdminNotificationMediaPath(rawPath)) return;
    await unlink(this.filePathFor(rawPath)).catch((error: unknown) => {
      if (!isNotFoundError(error)) throw error;
    });
  }

  async cleanupUnreferencedAdminNotificationMedia(isReferenced: (mediaPath: string) => Promise<boolean>): Promise<number> {
    await this.ensureStorageDirectory();
    this.removeExpiredPendingUploads();
    const now = Date.now();
    let deleted = 0;

    for (const entry of await readdir(this.storageDirectory(), { withFileTypes: true })) {
      if (deleted >= MAX_ORPHAN_CLEANUP_PER_RUN) break;
      if (!entry.isFile()) continue;
      const rawPath = entry.name.startsWith(".upload-")
        ? null
        : `${ADMIN_NOTIFICATION_MEDIA_PREFIX}${entry.name}`;
      if (rawPath && !this.isAdminNotificationMediaPath(rawPath)) continue;
      const filePath = path.join(this.storageDirectory(), entry.name);
      const file = await stat(filePath).catch(() => null);
      if (!file || now - file.mtimeMs < ORPHAN_RETENTION_MS) continue;
      if (rawPath && await isReferenced(rawPath)) continue;
      await unlink(filePath).catch((error: unknown) => {
        if (!isNotFoundError(error)) throw error;
      });
      deleted += 1;
    }

    return deleted;
  }

  private storageDirectory(): string {
    const configured = process.env.TELECAMPAIGN_MEDIA_DIR?.trim();
    if (configured) return path.resolve(configured);
    if (process.env.NODE_ENV === "production") return "/var/lib/telecampaign/media";
    return path.resolve(process.cwd(), ".telecampaign-media");
  }

  private async ensureStorageDirectory(): Promise<void> {
    const directory = this.storageDirectory();
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
  }

  private filePathFor(rawPath: string): string {
    const match = rawPath.match(ADMIN_NOTIFICATION_MEDIA_PATH);
    if (!match) throw new NotificationMediaNotFoundError();
    return path.join(this.storageDirectory(), match[1].toLowerCase());
  }

  private removeExpiredPendingUploads(): void {
    const now = Date.now();
    for (const [uploadId, upload] of this.pendingUploads) {
      if (upload.expiresAt <= now) this.pendingUploads.delete(uploadId);
    }
  }

  private pendingMediaUsage(excludeUploadId?: string): { fileCount: number; totalBytes: number } {
    let fileCount = 0;
    let totalBytes = 0;
    for (const [uploadId, pending] of this.pendingUploads) {
      if (uploadId === excludeUploadId) continue;
      fileCount += 1;
      totalBytes += pending.size;
    }
    return { fileCount, totalBytes };
  }

  private async storedMediaUsage(): Promise<{ fileCount: number; totalBytes: number }> {
    let fileCount = 0;
    let totalBytes = 0;
    for (const entry of await readdir(this.storageDirectory(), { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!this.isAdminNotificationMediaPath(`${ADMIN_NOTIFICATION_MEDIA_PREFIX}${entry.name}`)) continue;
      const file = await stat(path.join(this.storageDirectory(), entry.name));
      fileCount += 1;
      totalBytes += file.size;
      if (fileCount > MAX_MEDIA_FILES || totalBytes > MAX_TOTAL_MEDIA_BYTES) break;
    }
    return { fileCount, totalBytes };
  }
}

function normalizeContentType(rawContentType: string): string {
  return rawContentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function detectMedia(bytes: Uint8Array): DetectedMedia | null {
  const startsWith = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return { mediaType: "image", contentType: "image/png" };
  if (startsWith(0xff, 0xd8, 0xff)) return { mediaType: "image", contentType: "image/jpeg" };
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return { mediaType: "image", contentType: "image/gif" };
  if (
    startsWith(0x52, 0x49, 0x46, 0x46)
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50
  ) {
    return { mediaType: "image", contentType: "image/webp" };
  }
  if (startsWith(0x1a, 0x45, 0xdf, 0xa3)) return { mediaType: "video", contentType: "video/webm" };
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    return { mediaType: "video", contentType: brand === "qt  " ? "video/quicktime" : "video/mp4" };
  }
  return null;
}

function isNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}