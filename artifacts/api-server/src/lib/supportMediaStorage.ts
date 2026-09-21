import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const SUPPORT_MEDIA_PREFIX = "/objects/support-chat/";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const UPLOAD_TTL_MS = 15 * 60_000;
const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SUPPORT_MEDIA_PATH = new RegExp(`^${SUPPORT_MEDIA_PREFIX}(${UUID_PATTERN})$`, "i");
const acceptedContentTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

type PendingUpload = {
  objectPath: string;
  contentType: string;
  size: number;
  expiresAt: number;
  uploaded: boolean;
};

type DetectedImage = {
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
};

export class SupportMediaNotFoundError extends Error {
  constructor() {
    super("Support image not found");
    this.name = "SupportMediaNotFoundError";
  }
}

export class SupportMediaUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupportMediaUploadError";
  }
}

export class SupportMediaStorage {
  private readonly pendingUploads = new Map<string, PendingUpload>();

  async prepareImageUpload(input: { size: number; contentType: string }): Promise<{
    uploadId: string;
    uploadURL: string;
    objectPath: string;
  }> {
    this.removeExpiredUploads();
    if (
      !Number.isInteger(input.size)
      || input.size < 1
      || input.size > MAX_IMAGE_BYTES
      || !acceptedContentTypes.has(input.contentType)
    ) {
      throw new SupportMediaUploadError("Ảnh phải là JPEG, PNG, WebP hoặc GIF và không vượt quá 10 MB.");
    }
    await this.ensureStorageDirectory();
    const uploadId = randomUUID();
    const objectPath = `${SUPPORT_MEDIA_PREFIX}${uploadId}`;
    this.pendingUploads.set(uploadId, {
      objectPath,
      contentType: input.contentType,
      size: input.size,
      expiresAt: Date.now() + UPLOAD_TTL_MS,
      uploaded: false,
    });
    return {
      uploadId,
      uploadURL: `/api/support-chat/images/uploads/${uploadId}`,
      objectPath,
    };
  }

  async storeImageUpload(input: {
    uploadId: string;
    contentType: string;
    request: Readable;
  }): Promise<void> {
    const pending = this.pendingUploads.get(input.uploadId);
    if (!pending || pending.expiresAt <= Date.now() || pending.uploaded) {
      throw new SupportMediaUploadError("Yêu cầu tải ảnh không còn hợp lệ.");
    }
    if (pending.contentType !== input.contentType) {
      throw new SupportMediaUploadError("Loại ảnh không khớp với yêu cầu tải lên.");
    }
    const temporary = path.join(this.storageDirectory(), `.support-upload-${input.uploadId}-${randomUUID()}`);
    let size = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        if (size > MAX_IMAGE_BYTES || size > pending.size) {
          callback(new SupportMediaUploadError("Kích thước ảnh không khớp với yêu cầu tải lên."));
          return;
        }
        callback(null, chunk);
      },
    });
    try {
      await pipeline(input.request, limiter, createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
      if (size !== pending.size) throw new SupportMediaUploadError("Kích thước ảnh không khớp với yêu cầu tải lên.");
      const detected = await this.detectImage(temporary);
      if (!detected || detected.contentType !== pending.contentType) {
        throw new SupportMediaUploadError("Nội dung ảnh không khớp với loại file đã chọn.");
      }
      await rename(temporary, this.filePathFor(pending.objectPath));
      pending.uploaded = true;
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async claimImageUpload(uploadId: string): Promise<{ objectPath: string; contentType: string } | null> {
    const pending = this.pendingUploads.get(uploadId);
    if (!pending || !pending.uploaded || pending.expiresAt <= Date.now()) return null;
    this.pendingUploads.delete(uploadId);
    return { objectPath: pending.objectPath, contentType: pending.contentType };
  }

  async storeTelegramImage(input: { bytes: Buffer; contentType?: string }): Promise<{
    objectPath: string;
    contentType: string;
  }> {
    if (input.bytes.length < 1 || input.bytes.length > MAX_IMAGE_BYTES) {
      throw new SupportMediaUploadError("Ảnh Telegram vượt quá giới hạn 10 MB.");
    }
    await this.ensureStorageDirectory();
    const uploadId = randomUUID();
    const objectPath = `${SUPPORT_MEDIA_PREFIX}${uploadId}`;
    const temporary = path.join(this.storageDirectory(), `.support-telegram-${uploadId}`);
    try {
      await import("node:fs/promises").then(({ writeFile }) => writeFile(temporary, input.bytes, { flag: "wx", mode: 0o600 }));
      const detected = await this.detectImage(temporary);
      if (!detected) throw new SupportMediaUploadError("Telegram file không phải là ảnh hợp lệ.");
      if (input.contentType && input.contentType !== detected.contentType) {
        throw new SupportMediaUploadError("Loại ảnh Telegram không hợp lệ.");
      }
      await rename(temporary, this.filePathFor(objectPath));
      return { objectPath, contentType: detected.contentType };
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async readImage(rawPath: string): Promise<{ filePath: string; contentType: string; size: number }> {
    const filePath = this.filePathFor(rawPath);
    try {
      const file = await stat(filePath);
      if (!file.isFile() || file.size < 1 || file.size > MAX_IMAGE_BYTES) throw new SupportMediaNotFoundError();
      const detected = await this.detectImage(filePath);
      if (!detected) throw new SupportMediaNotFoundError();
      return { filePath, contentType: detected.contentType, size: file.size };
    } catch (error) {
      if (error instanceof SupportMediaNotFoundError || (error as NodeJS.ErrnoException)?.code === "ENOENT") {
        throw new SupportMediaNotFoundError();
      }
      throw error;
    }
  }

  async deleteImage(rawPath: string): Promise<void> {
    if (!SUPPORT_MEDIA_PATH.test(rawPath)) return;
    await unlink(this.filePathFor(rawPath)).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
    });
  }

  private async detectImage(filePath: string): Promise<DetectedImage | null> {
    const handle = await open(filePath, "r");
    try {
      const bytes = Buffer.alloc(32);
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
      return detectImage(bytes.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  }

  private storageDirectory(): string {
    const configured = process.env.TELECAMPAIGN_MEDIA_DIR?.trim();
    if (configured) return path.resolve(configured);
    if (process.env.NODE_ENV === "production") return "/var/lib/telecampaign/media";
    return path.resolve(process.cwd(), ".telecampaign-media");
  }

  private async ensureStorageDirectory(): Promise<void> {
    await mkdir(this.storageDirectory(), { recursive: true, mode: 0o700 });
  }

  private filePathFor(rawPath: string): string {
    const match = rawPath.match(SUPPORT_MEDIA_PATH);
    if (!match) throw new SupportMediaNotFoundError();
    return path.join(this.storageDirectory(), match[1].toLowerCase());
  }

  private removeExpiredUploads(): void {
    const now = Date.now();
    for (const [uploadId, pending] of this.pendingUploads) {
      if (pending.expiresAt <= now) {
        this.pendingUploads.delete(uploadId);
        if (pending.uploaded) void this.deleteImage(pending.objectPath);
      }
    }
  }
}

function detectImage(bytes: Uint8Array): DetectedImage | null {
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) return { contentType: "image/png" };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg" };
  }
  if (bytes.length >= 6 && String.fromCharCode(...bytes.slice(0, 6)) === "GIF89a") return { contentType: "image/gif" };
  if (bytes.length >= 6 && String.fromCharCode(...bytes.slice(0, 6)) === "GIF87a") return { contentType: "image/gif" };
  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) return { contentType: "image/webp" };
  return null;
}

export const supportMediaStorage = new SupportMediaStorage();