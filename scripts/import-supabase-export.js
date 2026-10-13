/**
 * Imports a Supabase CSV export (Table Editor "Export to CSV") into Postgres.
 *
 *   node scripts/import-supabase-export.js [--dir exported] [--schema public] [--commit]
 *
 * Safety properties:
 *  - Dry run by default: everything runs inside one transaction that is rolled
 *    back unless --commit is given.
 *  - Refuses to run unless every target table is empty (never merges/overwrites).
 *  - Preserves primary keys, then advances the id sequences past them.
 *  - Before committing, reads every row back and compares every column (as
 *    Postgres renders it) with the CSV. Any difference aborts and rolls back.
 *
 * CSV exports cannot distinguish NULL from an empty string, so an empty cell
 * becomes NULL for nullable columns and '' for NOT NULL text columns.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import pg from "pg";
import "dotenv/config";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const DIR = option("--dir", "exported");
const SCHEMA = option("--schema", "public");
const COMMIT = flag("--commit");

if (!/^[a-z_][a-z0-9_]*$/.test(SCHEMA)) throw new Error(`Bad schema name: ${SCHEMA}`);

// Column spec: [name, sqlType, nullable]. sqlType is used for casts; enum
// types are schema-qualified below.
const TABLES = [
  {
    name: "Role",
    file: "Role_rows.csv",
    pk: "id",
    sequence: "id",
    columns: [
      ["id", "integer", false],
      ["name", "text", false],
      ["readUsers", "boolean", false],
      ["registerUsers", "boolean", false],
      ["editAnyUser", "boolean", false],
      ["editSpecificUsers", "boolean", false],
      ["removeAnyUsers", "boolean", false],
      ["removeSpecificUsers", "boolean", false],
    ],
  },
  {
    name: "admin",
    file: "admin_rows.csv",
    pk: "adminid",
    sequence: "adminid",
    columns: [
      ["adminid", "integer", false],
      ["studentid", "text", false],
      ["adminusername", "text", false],
      ["adminpassword", "text", false],
      ["readUsers", "boolean", false],
      ["registerUsers", "boolean", false],
      ["editAnyUser", "boolean", false],
      ["editSpecificUsers", "boolean", false],
      ["removeAnyUsers", "boolean", false],
      ["removeSpecificUsers", "boolean", false],
      ["passwordUpdatedAt", "timestamp(3)", true],
      ["createdAt", "timestamp(3)", true],
    ],
  },
  {
    name: "User",
    file: "User_rows.csv",
    pk: "userid",
    sequence: "userid",
    columns: [
      ["userid", "integer", false],
      ["studentid", "text", false],
      ["createdBy", "text", true],
      ["firstname", "text", false],
      ["middlename", "text", false],
      ["lastname", "text", false],
      ["gender", "enum:gender_type", false],
      ["baptismalname", "text", false],
      ["phone", "text", false],
      ["birthdate", "date", false],
      ["useremail", "text", true],
      ["nationality", "text", false],
      ["isphysicallydisabled", "enum:disability_type", false],
      ["zonename", "text", false],
      ["mothertongue", "enum:languages_type", false],
      ["createdAt", "timestamp(3)", true],
      ["region", "enum:regions_type", false],
      ["clergicalstatus", "enum:clerical_status", false],
      ["telegram_username", "text", false],
    ],
  },
  {
    name: "universityusers",
    file: "universityusers_rows.csv",
    pk: "userid",
    sequence: null,
    columns: [
      ["userid", "integer", false],
      ["departmentname", "text", false],
      ["sponsorshiptype", "enum:sponsorship_type", false],
      ["participation", "enum:participation_type", false],
      ["cafeteriaaccess", "boolean", true],
      ["mealcard", "text", true],
      ["cafeterianame", "text", true],
      ["emergencyname", "text", true],
      ["emergencyphone", "text", true],
      ["batch", "integer", false],
      ["confessionfather", "text", true],
      ["advisors", "enum:advisor_type", false],
      ["role", "enum:role_type", false],
      ["coursetaken", "boolean", false],
      ["holidayincampus", "boolean", true],
      ["tookcourse", "boolean", true],
      ["activitylevel", "enum:activity_type", false],
    ],
  },
];

/** RFC 4180 parser: quoted fields, escaped quotes, commas/newlines in quotes. */
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (inQuotes) throw new Error("Unterminated quoted field");
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...data] = rows.filter((r) => !(r.length === 1 && r[0] === ""));
  return data.map((r, n) => {
    if (r.length !== header.length) {
      throw new Error(`Row ${n + 2} has ${r.length} fields, header has ${header.length}`);
    }
    return Object.fromEntries(header.map((h, i) => [h, r[i]]));
  });
}

const sqlType = (type) =>
  type.startsWith("enum:") ? `"${SCHEMA}"."${type.slice(5)}"` : type;

/** Value to bind for an insert (strings; Postgres casts them). */
const toParam = (raw, [, type, nullable]) => {
  if (raw === "") {
    if (nullable) return null;
    if (type === "text") return "";
    throw new Error(`Empty value for NOT NULL ${type} column`);
  }
  return raw;
};

/** What Postgres should render (`col::text`) for this CSV cell. */
const expectedText = (raw, column) => {
  const value = toParam(raw, column);
  return value === null ? null : value;
};

const fingerprint = (rows) =>
  createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 16);

async function main() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DIRECT_URL or DATABASE_URL is required");

  const data = TABLES.map((table) => {
    const rows = parseCsv(readFileSync(join(DIR, table.file), "utf8"));
    const header = Object.keys(rows[0] ?? {});
    const expected = table.columns.map(([c]) => c).sort();
    if (JSON.stringify([...header].sort()) !== JSON.stringify(expected)) {
      throw new Error(
        `${table.file}: columns ${JSON.stringify(header)} do not match ${JSON.stringify(expected)}`,
      );
    }
    return { ...table, rows };
  });

  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 20_000 });
  await client.connect();
  console.log(`Target: schema "${SCHEMA}" on ${new URL(connectionString).host}`);
  console.log(`Mode:   ${COMMIT ? "COMMIT" : "DRY RUN (rolled back)"}\n`);

  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");

    // 1. Target must be empty.
    for (const t of data) {
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM "${SCHEMA}"."${t.name}"`,
      );
      if (rows[0].n !== 0) {
        throw new Error(`"${SCHEMA}"."${t.name}" already has ${rows[0].n} rows - refusing to import`);
      }
    }

    // 2. Insert, parents before children, in batches.
    for (const t of data) {
      const cols = t.columns;
      const BATCH = 200;
      for (let start = 0; start < t.rows.length; start += BATCH) {
        const chunk = t.rows.slice(start, start + BATCH);
        const params = [];
        const tuples = chunk.map((row) => {
          const placeholders = cols.map((col) => {
            params.push(toParam(row[col[0]], col));
            return `$${params.length}::${sqlType(col[1])}`;
          });
          return `(${placeholders.join(", ")})`;
        });
        await client.query(
          `INSERT INTO "${SCHEMA}"."${t.name}" (${cols.map(([c]) => `"${c}"`).join(", ")}) VALUES ${tuples.join(", ")}`,
          params,
        );
      }
      if (t.sequence) {
        await client.query(
          `SELECT setval(pg_get_serial_sequence($1, $2), GREATEST((SELECT max("${t.sequence}") FROM "${SCHEMA}"."${t.name}"), 1))`,
          [`"${SCHEMA}"."${t.name}"`, t.sequence],
        );
      }
      console.log(`inserted ${String(t.rows.length).padStart(4)} rows into ${t.name}`);
    }

    // 3. Read everything back and compare cell by cell.
    let mismatches = 0;
    console.log("");
    for (const t of data) {
      const select = t.columns.map(([c]) => `t."${c}"::text AS "${c}"`).join(", ");
      // Order by the real (integer) column, not the text alias.
      const { rows: dbRows } = await client.query(
        `SELECT ${select} FROM "${SCHEMA}"."${t.name}" AS t ORDER BY t."${t.pk}"`,
      );
      const expected = [...t.rows]
        .sort((a, b) => Number(a[t.pk]) - Number(b[t.pk]))
        .map((row) =>
          Object.fromEntries(t.columns.map((col) => [col[0], expectedText(row[col[0]], col)])),
        );

      if (dbRows.length !== expected.length) {
        console.error(`${t.name}: row count ${dbRows.length} != ${expected.length}`);
        mismatches++;
      }
      for (let i = 0; i < expected.length; i++) {
        for (const [c] of t.columns) {
          if (dbRows[i]?.[c] !== expected[i][c]) {
            mismatches++;
            if (mismatches <= 20) {
              console.error(
                `${t.name}[${t.pk}=${expected[i][t.pk]}].${c}: db=${JSON.stringify(dbRows[i]?.[c])} csv=${JSON.stringify(expected[i][c])}`,
              );
            }
          }
        }
      }
      const same = fingerprint(dbRows) === fingerprint(expected);
      console.log(
        `verified ${t.name.padEnd(16)} rows=${dbRows.length} fingerprint=${fingerprint(dbRows)} ${same ? "MATCH" : "DIFFERENT"}`,
      );
    }

    // 4. Relational checks.
    const checks = [
      [`universityusers without a User`, `SELECT count(*)::int AS n FROM "${SCHEMA}"."universityusers" u LEFT JOIN "${SCHEMA}"."User" p USING (userid) WHERE p.userid IS NULL`],
      [`Users without universityusers`, `SELECT count(*)::int AS n FROM "${SCHEMA}"."User" p LEFT JOIN "${SCHEMA}"."universityusers" u USING (userid) WHERE u.userid IS NULL`],
    ];
    for (const [label, sql] of checks) {
      const { rows } = await client.query(sql);
      console.log(`check: ${label}: ${rows[0].n}`);
      if (rows[0].n !== 0) mismatches++;
    }

    if (mismatches > 0) {
      throw new Error(`${mismatches} verification problem(s) - rolled back, nothing was written`);
    }

    if (COMMIT) {
      await client.query("COMMIT");
      console.log("\nCOMMITTED. All rows verified.");
    } else {
      await client.query("ROLLBACK");
      console.log("\nDry run OK - all rows verified, then rolled back. Re-run with --commit to write.");
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  const detail = error.message || error.code || error.errors?.[0]?.code || String(error);
  console.error(
    `\nImport failed: ${detail}\n` +
      "The transaction was rolled back. (If the connection dropped during COMMIT itself, " +
      "re-run: it refuses to import into non-empty tables, which tells you it committed.)",
  );
  process.exitCode = 1;
});
