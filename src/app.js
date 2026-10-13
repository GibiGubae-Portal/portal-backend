import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { getAllowedOrigins } from "./config/env.js";
import apiRoutes from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  // Vercel (and most hosts) sit behind a proxy; needed for correct client
  // IPs in rate limiting and for Secure cookies.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Same-origin / server-to-server requests have no Origin header.
        if (!origin) return callback(null, true);
        callback(null, getAllowedOrigins().includes(origin.replace(/\/+$/, "")));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.get("/", (_req, res) => {
    res.json({ success: true, name: "Gbi Gubae API", docs: "/api/health" });
  });

  app.use("/api", apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

const app = createApp();
export default app;
