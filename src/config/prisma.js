import { PrismaClient } from "../../prisma/generated/client/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import "./env.js";

let client = null;

const createClient = () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  // Serverless functions each hold their own pool, so keep it small; Neon's
  // pooler (the "-pooler" host) multiplexes these onto real connections.
  const adapter = new PrismaPg(
    {
      connectionString,
      max: Number(process.env.DB_POOL_MAX) || 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 15_000,
    },
    process.env.DB_SCHEMA ? { schema: process.env.DB_SCHEMA } : undefined,
  );

  return new PrismaClient({ adapter });
};

export const getPrisma = () => {
  if (!client) client = createClient();
  return client;
};

export const disconnectPrisma = async () => {
  if (!client) return;
  const current = client;
  client = null;
  await current.$disconnect();
};

/**
 * Lazily-initialised client: importing this module never opens a connection
 * or throws, so the app (and tests) can load before env vars are inspected.
 */
const prisma = new Proxy(
  {},
  {
    get: (_target, property) => {
      const value = getPrisma()[property];
      return typeof value === "function" ? value.bind(getPrisma()) : value;
    },
  },
);

export default prisma;
