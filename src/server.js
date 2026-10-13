import app from "./app.js";
import { disconnectPrisma } from "./config/prisma.js";

const port = Number(process.env.PORT) || 5500;

const server = app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

const shutdown = (signal) => {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await disconnectPrisma().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});
