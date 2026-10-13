/**
 * Idempotent seed: creates default roles and the initial super admin.
 *
 *   SUPER_ADMIN_STUDENT_ID   login ID for the super admin (default "SUPER-ADMIN")
 *   SUPER_ADMIN_USERNAME     must be listed in SUPER_ADMINS (default: first entry)
 *   SUPER_ADMIN_PASSWORD     if omitted, a random password is generated and printed once
 *
 * Re-running never overwrites an existing admin's password.
 */
import { randomBytes } from "node:crypto";
import prisma, { disconnectPrisma } from "../src/config/prisma.js";
import { getSuperAdmins } from "../src/config/env.js";
import { hashPassword } from "../src/utils/password.js";

const DEFAULT_ROLES = [
  { name: "Viewer", readUsers: true },
  {
    name: "Registrar",
    readUsers: true,
    registerUsers: true,
    editSpecificUsers: true,
    removeSpecificUsers: true,
  },
  {
    name: "Manager",
    readUsers: true,
    registerUsers: true,
    editAnyUser: true,
    editSpecificUsers: true,
    removeAnyUsers: true,
    removeSpecificUsers: true,
  },
];

async function main() {
  for (const role of DEFAULT_ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      create: role,
      update: {},
    });
  }
  console.log(`Roles ensured: ${DEFAULT_ROLES.map((r) => r.name).join(", ")}`);

  const superAdmins = getSuperAdmins();
  const username =
    process.env.SUPER_ADMIN_USERNAME?.trim() || superAdmins[0];
  if (!username) {
    throw new Error("Set SUPER_ADMINS (and optionally SUPER_ADMIN_USERNAME)");
  }
  if (!superAdmins.includes(username)) {
    throw new Error(
      `SUPER_ADMIN_USERNAME "${username}" is not listed in SUPER_ADMINS`,
    );
  }

  const studentid = process.env.SUPER_ADMIN_STUDENT_ID?.trim() || "SUPER-ADMIN";
  const existing = await prisma.admin.findUnique({ where: { studentid } });
  if (existing) {
    console.log(`Super admin "${studentid}" already exists - left unchanged.`);
    return;
  }

  const generated = !process.env.SUPER_ADMIN_PASSWORD;
  const password =
    process.env.SUPER_ADMIN_PASSWORD || randomBytes(12).toString("base64url");

  await prisma.admin.create({
    data: {
      studentid,
      adminusername: username,
      adminpassword: await hashPassword(password),
      readUsers: true,
      registerUsers: true,
      editAnyUser: true,
      editSpecificUsers: true,
      removeAnyUsers: true,
      removeSpecificUsers: true,
    },
  });

  console.log(`Super admin created: studentid="${studentid}" username="${username}"`);
  if (generated) {
    console.log(`Generated password (shown once, change it after login): ${password}`);
  }
}

main()
  .catch((error) => {
    console.error("Seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
