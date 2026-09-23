import { createHash } from "node:crypto";

const BSC_RPC = "https://bsc-dataseed.binance.org";
const TRON_RPC = "https://api.trongrid.io";
const BSC_USDT = "0x55d398326f99059ff775485246999027b3197955";
const TRON_USDT = "41a614f803b6fd780986a42c78ec9c7f77e6ac4a";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a9df523b3ef";
const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000;
const ORDER_LIFETIME_MS = 10 * 60 * 1000;
const MIN_BSC_CONFIRMATIONS = 15;
const MIN_TRON_CONFIRMATIONS = 20;
const REQUEST_TIMEOUT_MS = 10_000;

type VerificationInput = {
  network: "BEP20" | "TRC20";
  txHash: string;
  destination: string;
  amount: string;
  createdAt: Date;
};

type Result = { confirmed: boolean; reason?: string };

function fail(reason: string): Result {
  return { confirmed: false, reason };
}

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function bscRpc(method: string, params: unknown[]): Promise<unknown> {
  const body = await requestJson(BSC_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!body || typeof body !== "object" || !("result" in body) || "error" in body) {
    throw new Error("BSC_INVALID_RESPONSE");
  }
  return (body as { result: unknown }).result;
}

function hexQuantity(value: unknown): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) throw new Error("INVALID_HEX");
  return BigInt(value);
}

function parseAmount(amount: string, decimals: number): bigint {
  if (typeof amount !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount)) {
    throw new Error("INVALID_AMOUNT");
  }
  const [whole, fraction = ""] = amount.split(".");
  if (fraction.length > decimals) throw new Error("AMOUNT_PRECISION");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
}

function validDate(date: Date): boolean {
  return date instanceof Date && Number.isFinite(date.getTime());
}

async function verifyBsc(input: VerificationInput, expectedAmount: bigint): Promise<Result> {
  if (!/^0x[0-9a-f]{64}$/i.test(input.txHash) || !/^0x[0-9a-f]{40}$/i.test(input.destination)) {
    return fail("INVALID_IDENTIFIER");
  }
  const [tx, receipt, finalized, latest] = await Promise.all([
    bscRpc("eth_getTransactionByHash", [input.txHash]),
    bscRpc("eth_getTransactionReceipt", [input.txHash]),
    bscRpc("eth_getBlockByNumber", ["finalized", false]),
    bscRpc("eth_getBlockByNumber", ["latest", false]),
  ]);
  if (!tx || typeof tx !== "object" || !receipt || typeof receipt !== "object") return fail("NOT_FOUND");
  if (!finalized || typeof finalized !== "object" || !latest || typeof latest !== "object") return fail("INVALID_CHAIN_STATE");
  const txObject = tx as Record<string, unknown>;
  const receiptObject = receipt as Record<string, unknown>;
  const finalObject = finalized as Record<string, unknown>;
  const latestObject = latest as Record<string, unknown>;
  if (typeof txObject.hash !== "string" || txObject.hash.toLowerCase() !== input.txHash.toLowerCase()
    || typeof receiptObject.transactionHash !== "string"
    || receiptObject.transactionHash.toLowerCase() !== input.txHash.toLowerCase()) return fail("HASH_MISMATCH");
  if (receiptObject.status !== "0x1") return fail("TRANSACTION_FAILED");
  const blockNumber = hexQuantity(receiptObject.blockNumber);
  const finalizedNumber = hexQuantity(finalObject.number);
  const latestNumber = hexQuantity(latestObject.number);
  if (finalizedNumber < blockNumber || latestNumber < finalizedNumber) return fail("NOT_FINALIZED");
  if (finalizedNumber - blockNumber + 1n < BigInt(MIN_BSC_CONFIRMATIONS)) return fail("INSUFFICIENT_CONFIRMATIONS");
  const block = await bscRpc("eth_getBlockByNumber", [`0x${blockNumber.toString(16)}`, false]);
  if (!block || typeof block !== "object") return fail("INVALID_BLOCK");
  const timestamp = Number(hexQuantity((block as Record<string, unknown>).timestamp)) * 1000;
  if (!Number.isSafeInteger(timestamp)) return fail("INVALID_BLOCK_TIME");
  const now = Date.now();
  if (timestamp < input.createdAt.getTime() - MAX_CLOCK_SKEW_MS) return fail("BEFORE_ORDER");
  if (timestamp > input.createdAt.getTime() + ORDER_LIFETIME_MS || timestamp > now + MAX_CLOCK_SKEW_MS) return fail("AFTER_ORDER");
  if (!Array.isArray(receiptObject.logs)) return fail("INVALID_RECEIPT");
  const wanted = input.destination.toLowerCase().slice(2).padStart(64, "0");
  const amountHex = `0x${expectedAmount.toString(16).padStart(64, "0")}`;
  const matched = receiptObject.logs.some((log) => {
    if (!log || typeof log !== "object") return false;
    const item = log as Record<string, unknown>;
    return typeof item.address === "string" && item.address.toLowerCase() === BSC_USDT
      && Array.isArray(item.topics) && item.topics.length >= 3
      && typeof item.topics[0] === "string" && item.topics[0].toLowerCase() === TRANSFER_TOPIC
      && typeof item.topics[2] === "string" && item.topics[2].toLowerCase() === `0x${wanted}`
      && typeof item.data === "string" && item.data.toLowerCase() === amountHex;
  });
  return matched ? { confirmed: true } : fail("TRANSFER_NOT_MATCHED");
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function tronAddressHex(address: string): string | null {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) return null;
  let value = 0n;
  for (const char of address) {
    const digit = BASE58.indexOf(char);
    if (digit < 0) return null;
    value = value * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (value) { bytes.unshift(Number(value & 255n)); value >>= 8n; }
  for (let i = 0; i < address.length && address[i] === "1"; i++) bytes.unshift(0);
  if (bytes.length !== 25) return null;
  const payload = Buffer.from(bytes.slice(0, 21));
  const checksum = Buffer.from(bytes.slice(21));
  const digest = createHash("sha256").update(createHash("sha256").update(payload).digest()).digest();
  return checksum.equals(digest.subarray(0, 4)) && payload[0] === 0x41 ? payload.toString("hex") : null;
}

export function isValidTronAddress(address: string): boolean {
  return tronAddressHex(address) !== null;
}

async function tronRpc(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await requestJson(`${TRON_RPC}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("TRON_INVALID_RESPONSE");
  return result as Record<string, unknown>;
}

async function verifyTron(input: VerificationInput, expectedAmount: bigint): Promise<Result> {
  const destination = tronAddressHex(input.destination);
  if (!destination || !/^[a-f0-9]{64}$/i.test(input.txHash)) return fail("INVALID_IDENTIFIER");
  const [tx, info, nowBlock] = await Promise.all([
    tronRpc("/wallet/gettransactionbyid", { value: input.txHash }),
    tronRpc("/wallet/gettransactioninfobyid", { value: input.txHash }),
    tronRpc("/wallet/getnowblock", {}),
  ]);
  if (typeof tx.txID !== "string" || tx.txID.toLowerCase() !== input.txHash.toLowerCase()
    || typeof info.id !== "string" || info.id.toLowerCase() !== input.txHash.toLowerCase()) return fail("HASH_MISMATCH");
  if (!info.receipt || typeof info.receipt !== "object" || (info.receipt as Record<string, unknown>).result !== "SUCCESS") return fail("TRANSACTION_FAILED");
  // TronGrid's transaction-info `log` entries are the node's receipt event
  // logs: address and topics are hex (without 0x), and data is a 32-byte hex
  // ABI value. Do not infer a transfer from calldata: transferFrom and router
  // transactions can legitimately have a different transaction destination.
  if (!Array.isArray(info.log)) return fail("INVALID_RECEIPT_LOGS");
  const wantedTail = destination.slice(2);
  const amountData = expectedAmount.toString(16).padStart(64, "0");
  const matched = info.log.some((log) => {
    if (!log || typeof log !== "object") return false;
    const item = log as Record<string, unknown>;
    // TRON nodes may expose the EVM log address as 20 bytes (without the
    // network prefix) or as the full 21-byte hex address.
    if (typeof item.address !== "string"
      || ![TRON_USDT, TRON_USDT.slice(2)].includes(item.address.toLowerCase())
      || !Array.isArray(item.topics) || item.topics.length < 3
      || typeof item.topics[0] !== "string" || item.topics[0].toLowerCase() !== TRANSFER_TOPIC.slice(2)
      || typeof item.topics[2] !== "string" || item.topics[2].toLowerCase() !== wantedTail.padStart(64, "0")
      || typeof item.data !== "string" || !/^[0-9a-f]{64}$/i.test(item.data)) return false;
    return item.data.toLowerCase() === amountData;
  });
  if (!matched) return fail("TRANSFER_NOT_MATCHED");
  const blockNumber = info.blockNumber;
  const blockTime = info.blockTimeStamp;
  const chainNumber = nowBlock.block_header && typeof nowBlock.block_header === "object"
    ? (nowBlock.block_header as Record<string, unknown>).raw_data : undefined;
  const latest = chainNumber && typeof chainNumber === "object" ? (chainNumber as Record<string, unknown>).number : undefined;
  if (typeof blockNumber !== "number" || !Number.isSafeInteger(blockNumber) || typeof blockTime !== "number"
    || typeof latest !== "number" || latest < blockNumber || latest - blockNumber + 1 < MIN_TRON_CONFIRMATIONS) return fail("INSUFFICIENT_CONFIRMATIONS");
  const timestamp = blockTime;
  if (timestamp < input.createdAt.getTime() - MAX_CLOCK_SKEW_MS || timestamp > input.createdAt.getTime() + ORDER_LIFETIME_MS || timestamp > Date.now() + MAX_CLOCK_SKEW_MS) return fail("INVALID_BLOCK_TIME");
  return { confirmed: true };
}

export async function verifyUsdtTransfer(input: VerificationInput): Promise<Result> {
  if (!input || !validDate(input.createdAt) || (input.network !== "BEP20" && input.network !== "TRC20")) return fail("INVALID_INPUT");
  try {
    const decimals = input.network === "BEP20" ? 18 : 6;
    const expectedAmount = parseAmount(input.amount, decimals);
    if (expectedAmount <= 0n) return fail("INVALID_AMOUNT");
    return input.network === "BEP20" ? await verifyBsc(input, expectedAmount) : await verifyTron(input, expectedAmount);
  } catch {
    return fail("PROVIDER_ERROR");
  }
}