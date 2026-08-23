import net from "node:net";
import { PromisedNetSockets } from "telegram/extensions/index.js";

const PROXY_TIMEOUT_MS = 10_000;
const MAX_HTTP_HEADERS_BYTES = 8 * 1024;

export type TelegramProxyConfig = {
  type: "http" | "socks5";
  host: string;
  address: string;
  family: 4 | 6;
  port: number;
  username?: string;
  password?: string;
};

export class TelegramProxyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramProxyError";
  }
}

function ipv6Bytes(address: string): Buffer {
  const ipv4Start = address.lastIndexOf(":");
  const ipv4Tail = address.slice(ipv4Start + 1);
  const normalized = ipv4Tail.includes(".")
    ? `${address.slice(0, ipv4Start + 1)}${ipv4Tail.split(".").map(Number).reduce<string[]>((groups, value, index, values) => {
      if (index % 2 === 0) groups.push(((value << 8) | values[index + 1]).toString(16));
      return groups;
    }, []).join(":")}`
    : address;
  const [left, right = ""] = normalized.split("::");
  const leftGroups = left ? left.split(":") : [];
  const rightGroups = right ? right.split(":") : [];
  const groups = [...leftGroups, ...Array(8 - leftGroups.length - rightGroups.length).fill("0"), ...rightGroups];
  const bytes = Buffer.alloc(16);
  groups.forEach((group, index) => bytes.writeUInt16BE(Number.parseInt(group || "0", 16), index * 2));
  return bytes;
}

function targetAddressBytes(host: string): Buffer {
  const family = net.isIP(host);
  if (family === 4) {
    const parts = host.split(".").map(Number);
    if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
      return Buffer.from(parts);
    }
  }
  if (family === 6) return ipv6Bytes(host);
  const encoded = Buffer.from(host, "utf8");
  if (encoded.length > 255) throw new TelegramProxyError("The Telegram proxy target is invalid.");
  return Buffer.concat([Buffer.from([encoded.length]), encoded]);
}

export class TelegramProxySocket extends PromisedNetSockets {
  private socket?: net.Socket;
  private buffer = Buffer.alloc(0);
  private socketClosed = true;
  private waiters = new Set<{ resolve: () => void; reject: (error: Error) => void }>();
  private readonly proxyConfig?: TelegramProxyConfig;

  constructor(proxy?: TelegramProxyConfig) {
    super();
    this.proxyConfig = proxy;
  }

  private signalData() {
    for (const waiter of this.waiters) waiter.resolve();
    this.waiters.clear();
  }

  private rejectWaiters(error: Error) {
    for (const waiter of this.waiters) waiter.reject(error);
    this.waiters.clear();
  }

  private waitForMoreData(): Promise<void> {
    if (this.socketClosed) return Promise.reject(new TelegramProxyError("The Telegram proxy connection closed."));
    return new Promise((resolve, reject) => this.waiters.add({ resolve, reject }));
  }

  private fail(error: Error) {
    this.socketClosed = true;
    this.rejectWaiters(error);
    if (this.socket && !this.socket.destroyed) this.socket.destroy();
  }

  private async readExactlyFromProxy(length: number): Promise<Buffer> {
    while (this.buffer.length < length) await this.waitForMoreData();
    const result = this.buffer.subarray(0, length);
    this.buffer = this.buffer.subarray(length);
    return result;
  }

  private async readHttpHeaders(): Promise<Buffer> {
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd !== -1) {
        const result = this.buffer.subarray(0, headerEnd + 4);
        this.buffer = this.buffer.subarray(headerEnd + 4);
        return result;
      }
      if (this.buffer.length > MAX_HTTP_HEADERS_BYTES) {
        throw new TelegramProxyError("The HTTP proxy returned an invalid response.");
      }
      await this.waitForMoreData();
    }
  }

  private async openSocket(): Promise<net.Socket> {
    if (!this.proxyConfig) throw new TelegramProxyError("Telegram proxy configuration is missing.");
    const socket = net.createConnection({
      host: this.proxyConfig.address,
      port: this.proxyConfig.port,
      family: this.proxyConfig.family,
    });
    socket.setTimeout(PROXY_TIMEOUT_MS);
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        socket.off("connect", onConnect);
        socket.off("error", onError);
        socket.off("timeout", onTimeout);
      };
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        socket.destroy();
        reject(new TelegramProxyError("The Telegram proxy refused the connection."));
      };
      const onTimeout = () => {
        cleanup();
        socket.destroy();
        reject(new TelegramProxyError("The Telegram proxy connection timed out."));
      };
      socket.once("connect", onConnect);
      socket.once("error", onError);
      socket.once("timeout", onTimeout);
    });
    return socket;
  }

  private attachSocket(socket: net.Socket) {
    this.socket = socket;
    this.socketClosed = false;
    socket.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.signalData();
    });
    socket.on("error", () => {
      this.fail(new TelegramProxyError("The Telegram proxy connection failed."));
    });
    socket.on("close", () => {
      if (!this.socketClosed) this.fail(new TelegramProxyError("The Telegram proxy closed the connection."));
    });
  }

  private async connectHttp(targetHost: string, targetPort: number) {
    const authority = net.isIP(targetHost) === 6 ? `[${targetHost}]:${targetPort}` : `${targetHost}:${targetPort}`;
    const headers = [
      `CONNECT ${authority} HTTP/1.1`,
      `Host: ${authority}`,
      "Proxy-Connection: Keep-Alive",
    ];
    if (this.proxyConfig?.username !== undefined || this.proxyConfig?.password !== undefined) {
      headers.push(`Proxy-Authorization: Basic ${Buffer.from(`${this.proxyConfig.username ?? ""}:${this.proxyConfig.password ?? ""}`).toString("base64")}`);
    }
    this.socket?.write(`${headers.join("\r\n")}\r\n\r\n`);
    const response = (await this.readHttpHeaders()).toString("latin1");
    const firstLine = response.split("\r\n")[0] ?? "";
    const match = /^HTTP\/\d(?:\.\d)?\s+(\d{3})\b/.exec(firstLine);
    if (!match) throw new TelegramProxyError("The HTTP proxy returned an invalid response.");
    if (Number(match[1]) !== 200) throw new TelegramProxyError("The HTTP proxy rejected the Telegram tunnel.");
  }

  private async connectSocks5(targetHost: string, targetPort: number) {
    const hasCredentials = this.proxyConfig?.username !== undefined || this.proxyConfig?.password !== undefined;
    this.socket?.write(Buffer.from([5, hasCredentials ? 2 : 1, 0, ...(hasCredentials ? [2] : [])]));
    const methodReply = await this.readExactlyFromProxy(2);
    if (methodReply[0] !== 5 || methodReply[1] === 0xff) {
      throw new TelegramProxyError("The SOCKS5 proxy rejected the authentication methods.");
    }
    if (methodReply[1] === 2) {
      if (!hasCredentials) throw new TelegramProxyError("The SOCKS5 proxy requires username and password.");
      const username = Buffer.from(this.proxyConfig?.username ?? "", "utf8");
      const password = Buffer.from(this.proxyConfig?.password ?? "", "utf8");
      if (username.length > 255 || password.length > 255) throw new TelegramProxyError("The Telegram proxy credentials are too long.");
      this.socket?.write(Buffer.concat([
        Buffer.from([1, username.length]),
        username,
        Buffer.from([password.length]),
        password,
      ]));
      const authReply = await this.readExactlyFromProxy(2);
      if (authReply[0] !== 1 || authReply[1] !== 0) {
        throw new TelegramProxyError("The SOCKS5 proxy rejected the credentials.");
      }
    } else if (methodReply[1] !== 0) {
      throw new TelegramProxyError("The SOCKS5 proxy requires an unsupported authentication method.");
    }

    const target = targetAddressBytes(targetHost);
    const addressType = net.isIP(targetHost) === 4 ? 1 : net.isIP(targetHost) === 6 ? 4 : 3;
    this.socket?.write(Buffer.concat([
      Buffer.from([5, 1, 0, addressType]),
      target,
      Buffer.from([(targetPort >> 8) & 0xff, targetPort & 0xff]),
    ]));
    const connectReply = await this.readExactlyFromProxy(4);
    if (connectReply[0] !== 5 || connectReply[1] !== 0) {
      throw new TelegramProxyError("The SOCKS5 proxy rejected the Telegram tunnel.");
    }
    const replyLength = connectReply[3] === 1 ? 4 : connectReply[3] === 3
      ? (await this.readExactlyFromProxy(1))[0]
      : connectReply[3] === 4 ? 16 : 0;
    if (!replyLength) throw new TelegramProxyError("The SOCKS5 proxy returned an invalid address.");
    await this.readExactlyFromProxy(replyLength + 2);
  }

  override async connect(port: number, ip: string): Promise<unknown> {
    this.buffer = Buffer.alloc(0);
    const socket = await this.openSocket();
    this.attachSocket(socket);
    const onHandshakeTimeout = () => this.fail(new TelegramProxyError("The Telegram proxy response timed out."));
    const handshakeDeadline = setTimeout(onHandshakeTimeout, PROXY_TIMEOUT_MS);
    socket.on("timeout", onHandshakeTimeout);
    try {
      if (this.proxyConfig?.type === "socks5") {
        await this.connectSocks5(ip, port);
      } else {
        await this.connectHttp(ip, port);
      }
      clearTimeout(handshakeDeadline);
      socket.off("timeout", onHandshakeTimeout);
      socket.setTimeout(0);
      return this;
    } catch (error) {
      clearTimeout(handshakeDeadline);
      socket.off("timeout", onHandshakeTimeout);
      await this.close();
      if (error instanceof TelegramProxyError) throw error;
      throw new TelegramProxyError("The Telegram proxy handshake failed.");
    }
  }

  override async readExactly(length: number): Promise<Buffer> {
    return this.readExactlyFromProxy(length);
  }

  override async read(length: number): Promise<Buffer> {
    while (this.buffer.length === 0) await this.waitForMoreData();
    const result = this.buffer.subarray(0, length);
    this.buffer = this.buffer.subarray(length);
    return result;
  }

  override async readAll(): Promise<Buffer> {
    while (this.buffer.length === 0) await this.waitForMoreData();
    const result = this.buffer;
    this.buffer = Buffer.alloc(0);
    return result;
  }

  override write(data: Buffer): void {
    if (this.socketClosed || !this.socket) throw new TelegramProxyError("The Telegram proxy connection is closed.");
    this.socket.write(data);
  }

  override async close(): Promise<void> {
    this.socketClosed = true;
    this.rejectWaiters(new TelegramProxyError("The Telegram proxy connection closed."));
    this.socket?.destroy();
    this.socket?.unref();
    this.socket = undefined;
  }

  override async receive(): Promise<void> {
    // Data is buffered by attachSocket for both the proxy handshake and MTProto.
  }
}