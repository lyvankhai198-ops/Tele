import express, { type Express } from "express";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

app.use("/api", router);

export default app;
