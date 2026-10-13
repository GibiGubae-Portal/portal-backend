import request from "supertest";
import app from "../../src/app.js";
import prisma from "../../src/config/prisma.js";
import { hashPassword } from "../../src/utils/password.js";

// vitest.config.js points DATABASE_URL at TEST_DATABASE_URL for test workers.
export const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);
if (hasDatabase && process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) {
  throw new Error("Integration tests must run against TEST_DATABASE_URL only");
}

export { app, prisma };

export const PASSWORD = "Password123!";

const TEST_SCHEMA = process.env.DB_SCHEMA;

// Hard guard: tests must only ever run inside a throwaway test_* schema.
if (hasDatabase && !/^test_[a-z0-9_]+$/.test(TEST_SCHEMA ?? "")) {
  throw new Error(
    `Refusing to run integration tests: DB_SCHEMA="${TEST_SCHEMA}" is not a test_* schema`,
  );
}

export async function resetDb() {
  // Raw SQL is NOT scoped by the Prisma adapter's schema option, so every
  // table name must be fully qualified with the test schema.
  const tables = ["universityusers", "User", "admin", "Role"]
    .map((table) => `"${TEST_SCHEMA}"."${table}"`)
    .join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}

export async function createAdmin({
  studentid,
  adminusername = `admin-${studentid}`,
  password = PASSWORD,
  ...permissions
}) {
  return prisma.admin.create({
    data: {
      studentid,
      adminusername,
      adminpassword: await hashPassword(password),
      ...permissions,
    },
  });
}

/** Creates (if needed) and logs in an admin; returns a cookie-carrying agent. */
export async function loginAs(adminData) {
  const existing = await prisma.admin.findUnique({
    where: { studentid: adminData.studentid },
  });
  if (!existing) await createAdmin(adminData);

  const agent = request.agent(app);
  const res = await agent
    .post("/api/admin/login")
    .send({ studentid: adminData.studentid, adminpassword: adminData.password ?? PASSWORD });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${adminData.studentid}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return agent;
}

export const loginSuperAdmin = () =>
  loginAs({ studentid: "SUPER-1", adminusername: "Test Super" });

let userCounter = 0;
export function buildUser(overrides = {}) {
  userCounter += 1;
  const n = String(userCounter).padStart(4, "0");
  const { universityusers, ...rest } = overrides;
  return {
    studentid: `UGR-${n}-16`,
    firstname: "Abebe",
    middlename: "Kebede",
    lastname: "Tesfaye",
    gender: "Male",
    phone: `09${String(10000000 + userCounter).slice(-8)}`,
    birthdate: "2000-01-15",
    nationality: "Ethiopian",
    region: "Addis_Ababa",
    mothertongue: "Amharic",
    ...rest,
    universityusers: {
      departmentname: "Information Systems",
      sponsorshiptype: "Government",
      participation: "None",
      batch: 2016,
      role: "None",
      ...universityusers,
    },
  };
}
