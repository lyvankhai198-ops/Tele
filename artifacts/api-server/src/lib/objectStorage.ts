import { randomUUID } from "node:crypto";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const ADMIN_NOTIFICATION_MEDIA_PREFIX = "admin-notifications/";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
  }
}

export class ObjectStorageService {
  private getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR?.trim();
    if (!dir) throw new Error("PRIVATE_OBJECT_DIR is not configured");
    return dir.replace(/\/$/, "");
  }

  isAdminNotificationMediaPath(rawPath: string): boolean {
    return /^\/objects\/admin-notifications\/[0-9a-f-]{36}$/i.test(rawPath);
  }

  async createAdminNotificationUpload(): Promise<{ uploadURL: string; objectPath: string }> {
    const objectPath = `${this.getPrivateObjectDir()}/${ADMIN_NOTIFICATION_MEDIA_PREFIX}${randomUUID()}`;
    const { bucketName, objectName } = parseObjectPath(objectPath);
    const uploadURL = await signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
    return {
      uploadURL,
      objectPath: `/objects/${objectName.slice(this.privateObjectName().length).replace(/^\/+/, "")}`,
    };
  }

  async verifyAdminNotificationMedia(rawPath: string): Promise<{ mediaType: "image" | "video"; size: number }> {
    if (!this.isAdminNotificationMediaPath(rawPath)) throw new ObjectNotFoundError();
    const response = await fetch(await this.getObjectEntityDownloadURL(rawPath), {
      headers: { Range: "bytes=0-31" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new ObjectNotFoundError();
    const bytes = new Uint8Array(await response.arrayBuffer());
    const size = contentLength(response);
    const mediaType = sniffMediaType(bytes);
    if (!mediaType || !size) throw new ObjectNotFoundError();
    return { mediaType, size };
  }

  async getObjectEntityDownloadURL(rawPath: string): Promise<string> {
    if (!rawPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    const objectEntityPath = `${this.getPrivateObjectDir()}/${rawPath.slice("/objects/".length)}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    return signObjectURL({
      bucketName,
      objectName,
      method: "GET",
      ttlSec: 300,
    });
  }

  async deleteAdminNotificationMedia(rawPath: string): Promise<void> {
    if (!this.isAdminNotificationMediaPath(rawPath)) return;
    const objectEntityPath = `${this.getPrivateObjectDir()}/${rawPath.slice("/objects/".length)}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const response = await fetch(await signObjectURL({ bucketName, objectName, method: "DELETE", ttlSec: 300 }), {
      method: "DELETE",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete notification media (${response.status})`);
    }
  }

  private privateObjectName(): string {
    return parseObjectPath(this.getPrivateObjectDir()).objectName;
  }
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const parts = normalized.split("/");
  if (parts.length < 3 || !parts[1] || !parts.slice(2).join("/")) {
    throw new Error("Invalid object storage path");
  }
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

async function signObjectURL(input: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE";
  ttlSec: number;
}): Promise<string> {
  const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: input.bucketName,
      object_name: input.objectName,
      method: input.method,
      expires_at: new Date(Date.now() + input.ttlSec * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Failed to sign object URL (${response.status})`);
  const payload = await response.json() as { signed_url?: string };
  if (!payload.signed_url) throw new Error("Object storage returned no signed URL");
  return payload.signed_url;
}

function contentLength(response: Response): number | null {
  const contentRange = response.headers.get("content-range");
  const rangedSize = contentRange?.match(/\/(\d+)$/)?.[1];
  const rawSize = rangedSize ?? response.headers.get("content-length");
  const size = rawSize ? Number(rawSize) : NaN;
  return Number.isInteger(size) && size > 0 && size <= 52_428_800 ? size : null;
}

function sniffMediaType(bytes: Uint8Array): "image" | "video" | null {
  const startsWith = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (startsWith(0x89, 0x50, 0x4e, 0x47) || startsWith(0xff, 0xd8, 0xff) || startsWith(0x47, 0x49, 0x46, 0x38)) return "image";
  if (startsWith(0x52, 0x49, 0x46, 0x46) && startsWith(0x52, 0x49, 0x46, 0x46, bytes[4] ?? -1, bytes[5] ?? -1, bytes[6] ?? -1, bytes[7] ?? -1, 0x57, 0x45, 0x42, 0x50)) return "image";
  if (startsWith(0x1a, 0x45, 0xdf, 0xa3)) return "video";
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return "video";
  return null;
}