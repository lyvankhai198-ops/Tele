import assert from "node:assert/strict";
import { once } from "node:events";
import net from "node:net";
import { TelegramProxySocket, type TelegramProxyConfig } from "./telegram-proxy-socket";

async function startProxy(onConnection: (socket: net.Socket) => void) {
  const server = net.createServer(onConnection);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    port: address.port,
    close: async () => {
      server.close();
      await once(server, "close");
    },
  };
}

function proxyConfig(port: number, type: TelegramProxyConfig["type"], username?: string, password?: string): TelegramProxyConfig {
  return { type, host: "127.0.0.1", address: "127.0.0.1", family: 4, port, username, password };
}

async function testHttpConnectWithAuth() {
  let request = "";
  let resolveRequest: (() => void) | undefined;
  const receivedRequest = new Promise<void>((resolve) => { resolveRequest = resolve; });
  const proxyServer = await startProxy((socket) => {
    socket.on("data", (chunk) => {
      request += chunk.toString("latin1");
      if (!request.includes("\r\n\r\n")) return;
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      resolveRequest?.();
    });
  });
  const socket = new TelegramProxySocket(proxyConfig(proxyServer.port, "http", "proxy-user", "proxy-pass"));
  try {
    await socket.connect(443, "149.154.167.50");
    await receivedRequest;
    assert.match(request, /^CONNECT 149\.154\.167\.50:443 HTTP\/1\.1/m);
    assert.match(request, /Proxy-Authorization: Basic cHJveHktdXNlcjpwcm94eS1wYXNz/);
  } finally {
    await socket.close();
    await proxyServer.close();
  }
}

async function testSocks5ConnectWithAuth() {
  let buffer = Buffer.alloc(0);
  let stage = 0;
  let resolveConnect: (() => void) | undefined;
  const connected = new Promise<void>((resolve) => { resolveConnect = resolve; });
  const proxyServer = await startProxy((socket) => {
    socket.on("data", (chunk) => {
      if (!Buffer.isBuffer(chunk)) return;
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        if (stage === 0) {
          if (buffer.length < 4) return;
          assert.deepEqual([...buffer.subarray(0, 4)], [5, 2, 0, 2]);
          buffer = buffer.subarray(4);
          socket.write(Buffer.from([5, 2]));
          stage = 1;
        } else if (stage === 1) {
          if (buffer.length < 2) return;
          const usernameLength = buffer[1];
          if (buffer.length < 3 + usernameLength) return;
          const passwordLength = buffer[2 + usernameLength];
          if (buffer.length < 3 + usernameLength + passwordLength) return;
          assert.equal(buffer[0], 1);
          assert.equal(buffer.subarray(2, 2 + usernameLength).toString(), "proxy-user");
          assert.equal(buffer.subarray(3 + usernameLength, 3 + usernameLength + passwordLength).toString(), "proxy-pass");
          buffer = buffer.subarray(3 + usernameLength + passwordLength);
          socket.write(Buffer.from([1, 0]));
          stage = 2;
        } else if (stage === 2) {
          if (buffer.length < 10) return;
          assert.deepEqual([...buffer.subarray(0, 10)], [5, 1, 0, 1, 149, 154, 167, 50, 1, 187]);
          socket.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
          resolveConnect?.();
          return;
        } else {
          return;
        }
      }
    });
  });
  const socket = new TelegramProxySocket(proxyConfig(proxyServer.port, "socks5", "proxy-user", "proxy-pass"));
  try {
    await socket.connect(443, "149.154.167.50");
    await connected;
  } finally {
    await socket.close();
    await proxyServer.close();
  }
}

await testHttpConnectWithAuth();
await testSocks5ConnectWithAuth();
console.log("Telegram HTTP CONNECT and SOCKS5 proxy handshake checks passed.");