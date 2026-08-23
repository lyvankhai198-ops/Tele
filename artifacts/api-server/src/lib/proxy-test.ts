import { lookup } from "node:dns/promises";
import net from "node:net";

const TEST_TARGET_HOST = "api.telegram.org";
const TEST_TARGET_PORT = 443;
const TEST_TIMEOUT_MS = 10_000;
const MAX_HTTP_RESPONSE_BYTES = 8 * 1024;

type ProxyType = "http" | "socks5";
type ResolvedProxyAddress = { address: string; family: 4 | 6 };

export type ProxyTestConfig = {
  type: ProxyType;
  host: string;
  port: number;
  username?: string;
  password?: string;
};

class ProxyTestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProxyTestError";
  }
}

function isPublicIpv4(address: string): boolean {
  const [first, second, third] = address.split(".").map(Number);
  if (first === 0 || first === 10 || first === 127 || first >= 224) return false;
  if (first === 100 && second >= 64 && second <= 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && (second === 0 || second === 88 || second === 168)) return false;
  if (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100))) return false;
  if (first === 203 && second === 0 && third === 113) return false;
  return true;
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

function isPublicIpv6(address: string): boolean {
  const bytes = ipv6Bytes(address);
  const isAllZero = bytes.every((value) => value === 0);
  const isLoopback = bytes.subarray(0, 15).every((value) => value === 0) && bytes[15] === 1;
  const isIpv4Mapped = bytes.subarray(0, 10).every((value) => value === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  const isIpv4Compatible = bytes.subarray(0, 12).every((value) => value === 0);
  const isLinkLocal = bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80;
  const isUniqueLocal = (bytes[0] & 0xfe) === 0xfc;
  const isMulticast = bytes[0] === 0xff;
  const isDocumentation = bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8;
  const isBenchmark = bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x02 && bytes.subarray(4, 6).every((value) => value === 0);
  const isOrchid = bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x00 && (bytes[3] & 0xf0) === 0x10;
  return !(isAllZero || isLoopback || isIpv4Mapped || isIpv4Compatible || isLinkLocal || isUniqueLocal || isMulticast || isDocumentation || isBenchmark || isOrchid);
}

function isPublicAddress(address: string, family: number): address is string {
  return family === 4 ? isPublicIpv4(address) : family === 6 ? isPublicIpv6(address) : false;
}

async function resolvePublicProxyAddress(host: string): Promise<ResolvedProxyAddress> {
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new ProxyTestError("The proxy host could not be resolved.");
  }
  if (!addresses.length || addresses.some(({ address, family }) => !isPublicAddress(address, family))) {
    throw new ProxyTestError("Proxy testing is only available for publicly routable addresses.");
  }
  const first = addresses[0];
  return { address: first.address, family: first.family as 4 | 6 };
}

function connectToProxy(proxy: ResolvedProxyAddress, port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: proxy.address, port, family: proxy.family });

    const cleanup = () => {
      socket.off("connect", onConnect);
      socket.off("error", onError);
      socket.off("timeout", onTimeout);
    };
    const onConnect = () => {
      cleanup();
      resolve(socket);
    };
    const onError = () => {
      cleanup();
      socket.destroy();
      reject(new ProxyTestError("The proxy refused the connection."));
    };
    const onTimeout = () => {
      cleanup();
      socket.destroy();
      reject(new ProxyTestError("The proxy connection timed out."));
    };

    socket.once("connect", onConnect);
    socket.once("error", onError);
    socket.once("timeout", onTimeout);
    socket.setTimeout(TEST_TIMEOUT_MS);
  });
}

function waitForReply<T>(
  socket: net.Socket,
  parse: (buffer: Buffer) => T | null,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);

    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("timeout", onTimeout);
      socket.setTimeout(0);
    };
    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        const result = parse(buffer);
        if (result !== null) {
          cleanup();
          resolve(result);
        }
      } catch (error) {
        fail(error instanceof Error ? error : new ProxyTestError("Invalid proxy response."));
      }
    };
    const onError = () => fail(new ProxyTestError("The proxy closed the connection."));
    const onTimeout = () => fail(new ProxyTestError("The proxy response timed out."));

    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("timeout", onTimeout);
    socket.setTimeout(TEST_TIMEOUT_MS);
  });
}

function httpStatusCode(buffer: Buffer): number | null {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd === -1) {
    if (buffer.length > MAX_HTTP_RESPONSE_BYTES) {
      throw new ProxyTestError("The proxy returned an invalid response.");
    }
    return null;
  }

  const firstLine = buffer.subarray(0, headerEnd).toString("latin1").split("\r\n")[0] ?? "";
  const match = /^HTTP\/\d(?:\.\d)?\s+(\d{3})\b/.exec(firstLine);
  if (!match) throw new ProxyTestError("The proxy returned an invalid response.");
  return Number(match[1]);
}

async function testHttpProxy(socket: net.Socket, username?: string, password?: string): Promise<void> {
  const requestHeaders = [
    `CONNECT ${TEST_TARGET_HOST}:${TEST_TARGET_PORT} HTTP/1.1`,
    `Host: ${TEST_TARGET_HOST}:${TEST_TARGET_PORT}`,
    "Proxy-Connection: Keep-Alive",
  ];
  if (username !== undefined || password !== undefined) {
    requestHeaders.push(`Proxy-Authorization: Basic ${Buffer.from(`${username ?? ""}:${password ?? ""}`).toString("base64")}`);
  }
  socket.write(`${requestHeaders.join("\r\n")}\r\n\r\n`);

  const status = await waitForReply(socket, httpStatusCode);
  if (status !== 200) {
    throw new ProxyTestError(`The HTTP proxy rejected the tunnel (status ${status}).`);
  }
}

function socks5Method(buffer: Buffer): number | null {
  if (buffer.length < 2) return null;
  if (buffer[0] !== 5) throw new ProxyTestError("The proxy returned an invalid SOCKS5 response.");
  return buffer[1];
}

function socks5AuthStatus(buffer: Buffer): number | null {
  if (buffer.length < 2) return null;
  if (buffer[0] !== 1) throw new ProxyTestError("The proxy returned an invalid authentication response.");
  return buffer[1];
}

function socks5ConnectReply(buffer: Buffer): boolean | null {
  if (buffer.length < 2) return null;
  if (buffer[0] !== 5) throw new ProxyTestError("The proxy returned an invalid SOCKS5 response.");
  if (buffer[1] !== 0) throw new ProxyTestError("The SOCKS5 proxy rejected the tunnel.");
  if (buffer.length < 4) return null;

  const addressLength = buffer[3] === 1 ? 4 : buffer[3] === 3
    ? (buffer.length >= 5 ? 1 + buffer[4] : Number.POSITIVE_INFINITY)
    : buffer[3] === 4 ? 16 : Number.NaN;
  if (!Number.isFinite(addressLength)) {
    if (Number.isNaN(addressLength)) throw new ProxyTestError("The proxy returned an invalid SOCKS5 address.");
    return null;
  }
  return buffer.length >= 4 + addressLength + 2;
}

async function testSocks5Proxy(socket: net.Socket, username?: string, password?: string): Promise<void> {
  const hasCredentials = username !== undefined || password !== undefined;
  socket.write(Buffer.from([5, hasCredentials ? 2 : 1, 0, ...(hasCredentials ? [2] : [])]));

  const method = await waitForReply(socket, socks5Method);
  if (method === 0xff) throw new ProxyTestError("The SOCKS5 proxy rejected the authentication methods.");
  if (method === 2) {
    if (!hasCredentials) throw new ProxyTestError("The SOCKS5 proxy requires username and password.");
    const user = Buffer.from(username ?? "");
    const pass = Buffer.from(password ?? "");
    if (user.length > 255 || pass.length > 255) throw new ProxyTestError("The proxy credentials are too long.");
    socket.write(Buffer.concat([Buffer.from([1, user.length]), user, Buffer.from([pass.length]), pass]));
    const authStatus = await waitForReply(socket, socks5AuthStatus);
    if (authStatus !== 0) throw new ProxyTestError("The SOCKS5 proxy rejected the credentials.");
  } else if (method !== 0) {
    throw new ProxyTestError("The SOCKS5 proxy requires an unsupported authentication method.");
  }

  const target = Buffer.from(TEST_TARGET_HOST, "ascii");
  socket.write(Buffer.concat([
    Buffer.from([5, 1, 0, 3, target.length]),
    target,
    Buffer.from([(TEST_TARGET_PORT >> 8) & 0xff, TEST_TARGET_PORT & 0xff]),
  ]));
  const connected = await waitForReply(socket, socks5ConnectReply);
  if (!connected) throw new ProxyTestError("The SOCKS5 proxy returned an incomplete response.");
}

export async function testProxyConnection(config: ProxyTestConfig): Promise<void> {
  const resolvedProxy = await resolvePublicProxyAddress(config.host);
  const socket = await connectToProxy(resolvedProxy, config.port);
  try {
    if (config.type === "socks5") {
      await testSocks5Proxy(socket, config.username, config.password);
    } else {
      await testHttpProxy(socket, config.username, config.password);
    }
  } finally {
    socket.destroy();
  }
}