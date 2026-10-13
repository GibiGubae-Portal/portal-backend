import prisma from "../config/prisma.js";
import { getSuperAdmins, isSuperAdminName } from "../config/env.js";
import { clearAuthCookie, setAuthCookie } from "../utils/authCookie.js";
import { getDummyHash, hashPassword, verifyPassword } from "../utils/password.js";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  unauthorized,
} from "../utils/errors.js";
import { parseStudentIdParam, validate } from "../validators/common.js";
import {
  loginSchema,
  PERMISSION_KEYS,
  registerAdminSchema,
  updateAdminSchema,
} from "../validators/admin.validator.js";

const pickPermissions = (source = {}, fallback = {}) =>
  Object.fromEntries(
    PERMISSION_KEYS.map((key) => [key, source[key] ?? fallback[key] ?? false]),
  );

export const toAdminResponse = (admin, usersCreatedCount = 0) => {
  const isSuperAdmin = isSuperAdminName(admin.adminusername);
  return {
    studentid: admin.studentid,
    adminusername: admin.adminusername,
    passwordUpdatedAt: admin.passwordUpdatedAt,
    createdAt: admin.createdAt,
    isSuperAdmin,
    role: isSuperAdmin ? "Super Admin" : "Admin",
    usersCreatedCount,
    permissions: pickPermissions(admin),
  };
};

export const login = async (req, res) => {
  const { studentid, adminpassword } = validate(loginSchema, req.body);

  // Some legacy admin IDs were stored with surrounding whitespace, so match
  // either the trimmed input or the ID exactly as typed.
  const candidates = [...new Set([studentid, req.body.studentid])];
  const admin = await prisma.admin.findFirst({
    where: { studentid: { in: candidates } },
  });

  // Always run a hash comparison so response time doesn't reveal whether
  // the student ID exists.
  const passwordOk = await verifyPassword(
    admin?.adminpassword ?? (await getDummyHash()),
    adminpassword,
  );
  if (!admin || !passwordOk) {
    throw unauthorized("Invalid student ID or password");
  }

  setAuthCookie(res, admin.studentid);
  res.status(200).json({
    success: true,
    message: "Logged in successfully",
    admin: toAdminResponse(admin),
  });
};

export const logout = (_req, res) => {
  clearAuthCookie(res);
  res.status(200).json({ success: true, message: "Logged out successfully" });
};

export const currentSession = (req, res) => {
  const { admin } = req;
  res.status(200).json({
    success: true,
    user: {
      studentid: admin.studentid,
      adminusername: admin.adminusername,
      isAuthenticated: true,
      isSuperAdmin: admin.isSuperAdmin,
      role: admin.isSuperAdmin ? "Super Admin" : "Admin",
      permissions: pickPermissions(admin),
    },
  });
};

export const registerAdmin = async (req, res) => {
  const { studentid, adminusername, adminpassword, roleName, permissions } =
    validate(registerAdminSchema, req.body);

  const existing = await prisma.admin.findUnique({ where: { studentid } });
  if (existing) throw conflict("An admin with this student ID already exists");

  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) throw badRequest("Selected role does not exist");

  const admin = await prisma.admin.create({
    data: {
      studentid,
      adminusername,
      adminpassword: await hashPassword(adminpassword),
      ...pickPermissions(permissions, role),
    },
  });

  res.status(201).json({
    success: true,
    message: "Admin created",
    admin: toAdminResponse(admin),
  });
};

export const getAdmins = async (_req, res) => {
  const [admins, createdCounts] = await Promise.all([
    prisma.admin.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.user.groupBy({
      by: ["createdBy"],
      _count: { _all: true },
      where: { createdBy: { not: null } },
    }),
  ]);

  const countByAdmin = Object.fromEntries(
    createdCounts.map((row) => [row.createdBy, row._count._all]),
  );

  res.status(200).json({
    success: true,
    admins: admins.map((admin) =>
      toAdminResponse(admin, countByAdmin[admin.studentid] ?? 0),
    ),
  });
};

export const getAdmin = async (req, res) => {
  const studentid = parseStudentIdParam(req.params.id);
  const admin = await prisma.admin.findUnique({ where: { studentid } });
  if (!admin) throw notFound("Admin not found");

  const usersCreatedCount = await prisma.user.count({
    where: { createdBy: studentid },
  });
  res
    .status(200)
    .json({ success: true, admin: toAdminResponse(admin, usersCreatedCount) });
};

export const updateAdmin = async (req, res) => {
  const currentId = parseStudentIdParam(req.params.id);
  const changes = validate(updateAdminSchema, req.body);

  const existing = await prisma.admin.findUnique({
    where: { studentid: currentId },
  });
  if (!existing) throw notFound("Admin not found");

  if (changes.studentid && changes.studentid !== currentId) {
    const clash = await prisma.admin.findUnique({
      where: { studentid: changes.studentid },
    });
    if (clash) throw conflict("An admin with this student ID already exists");
  }

  const passwordChanged = changes.adminpassword !== undefined;
  const updated = await prisma.$transaction(async (tx) => {
    const admin = await tx.admin.update({
      where: { studentid: currentId },
      data: {
        studentid: changes.studentid ?? existing.studentid,
        adminusername: changes.adminusername ?? existing.adminusername,
        ...(passwordChanged
          ? {
              adminpassword: await hashPassword(changes.adminpassword),
              passwordUpdatedAt: new Date(),
            }
          : {}),
        ...pickPermissions(changes.permissions, existing),
      },
    });

    // Keep "created by" ownership pointing at the admin after an ID change.
    if (admin.studentid !== currentId) {
      await tx.user.updateMany({
        where: { createdBy: currentId },
        data: { createdBy: admin.studentid },
      });
    }
    return admin;
  });

  // A super admin editing their own account keeps their session alive.
  if (
    currentId === req.admin.studentid &&
    (passwordChanged || updated.studentid !== currentId)
  ) {
    setAuthCookie(res, updated.studentid);
  }

  res.status(200).json({
    success: true,
    updatedAdmin: toAdminResponse(updated),
  });
};

export const deleteAdmin = async (req, res) => {
  const studentid = parseStudentIdParam(req.params.id);

  if (studentid === req.admin.studentid) {
    throw badRequest("You cannot delete your own account");
  }

  const admin = await prisma.admin.findUnique({ where: { studentid } });
  if (!admin) throw notFound("Admin not found");

  if (isSuperAdminName(admin.adminusername)) {
    const superAdminCount = await prisma.admin.count({
      where: { adminusername: { in: getSuperAdmins() } },
    });
    if (superAdminCount <= 1) {
      throw forbidden("Cannot delete the last super admin");
    }
  }

  await prisma.admin.delete({ where: { studentid } });
  res.status(200).json({ success: true, message: "Admin deleted successfully" });
};

export const deleteAllAdmins = async (_req, res) => {
  const superAdmins = getSuperAdmins();
  if (superAdmins.length === 0) {
    throw badRequest("No super admins are configured");
  }

  const { count } = await prisma.admin.deleteMany({
    where: { adminusername: { notIn: superAdmins } },
  });
  res.status(200).json({
    success: true,
    message: "All non-super admins deleted successfully",
    deletedCount: count,
  });
};
