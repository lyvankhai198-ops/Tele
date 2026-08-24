import { randomUUID } from "node:crypto";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

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

  async getObjectEntityUploadURL(): Promise<string> {
    return (await this.createObjectEntityUpload()).uploadURL;
  }

  async createObjectEntityUpload(): Promise<{ uploadURL: string; objectPath: string }> {
    const objectPath = `${this.getPrivateObjectDir()}/uploads/${randomUUID()}`;
    const { bucketName, objectName } = parseObjectPath(objectPath);
    const uploadURL = await signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
    return {
      uploadURL,
      objectPath: `/objects/${objectName.slice(this.getPrivateObjectDir().split("/").slice(2).join("/").length).replace(/^\/+/, "")}`,
    };
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) return rawPath;
    const url = new URL(rawPath);
    const privateDir = this.getPrivateObjectDir();
    const privateObjectPath = `/${privateDir}`;
    if (!url.pathname.startsWith(privateObjectPath)) return url.pathname;
    return `/objects/${url.pathname.slice(privateObjectPath.length).replace(/^\/+/, "")}`;
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
  method: "GET" | "PUT";
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