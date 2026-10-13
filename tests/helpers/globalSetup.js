import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const MIGRATIONS_DIR = join(import.meta.dirname, "../../prisma/migrations");

const connectionString = () => process.env.TEST_DATABASE_URL;

const PUBLIC_TABLES = ["admin", "Role", "User", "universityusers"];

// Row counts of the real tables, used to prove tests never touch them.
const publicFingerprint = async (client) => {
  const counts = {};
  for (const table of PUBLIC_TABLES) {
    const exists = await client.query("SELECT to_regclass($1) AS t", [`public."${table}"`]);
    if (!exists.rows[0].t) continue;
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM public."${table}"`);
    counts[table] = rows[0].n;
  }
  return JSON.stringify(counts);
};

// Applies every Prisma migration into an isolated schema.
export async function setup({ config }) {
  const url = connectionString();
  if (!url) {
    console.warn("TEST_DATABASE_URL not set - integration tests will be skipped.");
    return;
  }
  if (process.env.DATABASE_URL && new URL(url).pathname === new URL(process.env.DATABASE_URL).pathname &&
      new URL(url).host === new URL(process.env.DATABASE_URL).host) {
    throw new Error("TEST_DATABASE_URL must point at a different database than DATABASE_URL");
  }
  const schema = config.env.DB_SCHEMA;
  if (!/^test_[a-z0-9_]+$/.test(schema)) {
    throw new Error(`Refusing to use non-test schema "${schema}"`);
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  let before;
  try {
    before = await publicFingerprint(client);
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const dir of dirs) {
      const sql = readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8")
        .replace(/CREATE SCHEMA IF NOT EXISTS "public";/g, "");
      await client.query(sql);
    }
  } finally {
    await client.end();
  }

  return async () => {
    const cleanup = new pg.Client({ connectionString: url });
    await cleanup.connect();
    try {
      await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      const after = await publicFingerprint(cleanup);
      if (after !== before) {
        throw new Error(
          `Integration tests modified the public schema! before=${before} after=${after}`,
        );
      }
    } finally {
      await cleanup.end();
    }
  };
}
