import express, { type Express } from "express";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";
import { verifySePayApiKey, verifySePayWebhook } from "./lib/verify-sepay";
import { receiveSePayTransfer } from "./lib/sepay-payments";

const app: Express = express();

function isTrustedProxy(address: string): boolean {
  const normalized = address.replace(/^::ffff:/, "");
  if (normalized === "::1" || normalized === "127.0.0.1") return true;
  if (process.env.NODE_ENV === "production") return false;
  if (normalized.startsWith("10.") || normalized.startsWith("192.168.")) return true;
  const match = normalized.match(/^172\.(\d{1,3})\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

app.set("trust proxy", isTrustedProxy);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cookieParser());
// This route must precede express.json() so API Key/HMAC checks receive the original bytes.
app.post("/api/payments/sepay/webhook", express.raw({ type: "application/json", limit: "64kb" }), async (req, res): Promise<void> => {
  const apiKey = process.env.SEPAY_WEBHOOK_API_KEY;
  const hmacSecret = process.env.SEPAY_WEBHOOK_SECRET;
  if (!apiKey && !hmacSecret) { res.status(503).json({ success: false }); return; }
  const payload = (apiKey ? verifySePayApiKey(req.body, req.headers, apiKey) : null)
    ?? (hmacSecret ? verifySePayWebhook(req.body, req.headers, hmacSecret) : null);
  if (!payload) { res.status(401).json({ success: false }); return; }
  try {
    await receiveSePayTransfer(payload);
    res.json({ success: true });
  } catch (error) {
    req.log.error({ err: error }, "SePay payment reconciliation failed");
    res.status(500).json({ success: false });
  }
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

app.use("/api", router);

export default app;
