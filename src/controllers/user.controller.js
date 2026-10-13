import prisma from "../config/prisma.js";
import { conflict, forbidden, notFound } from "../utils/errors.js";
import { parseStudentIdParam, validate } from "../validators/common.js";
import { userQuerySchema, userSchema } from "../validators/user.validator.js";

const USER_SORT_FIELDS = new Set([
  "firstname",
  "lastname",
  "studentid",
  "gender",
  "clergicalstatus",
  "createdAt",
]);

const isOwner = (admin, user) =>
  Boolean(admin?.studentid) && admin.studentid === user.createdBy;

export const canReadUser = (admin, user) =>
  Boolean(admin?.isSuperAdmin || admin?.readUsers || isOwner(admin, user));

export const canEditUser = (admin, user) => {
  if (admin?.isSuperAdmin || admin?.editAnyUser) return true;
  if (admin?.editSpecificUsers || admin?.registerUsers) {
    return isOwner(admin, user);
  }
  return false;
};

export const canDeleteUser = (admin, user) => {
  if (admin?.isSuperAdmin || admin?.removeAnyUsers) return true;
  if (admin?.removeSpecificUsers || admin?.registerUsers) {
    return isOwner(admin, user);
  }
  return false;
};

const serializeUser = (user) => ({
  ...user,
  birthdate: user.birthdate instanceof Date ? user.birthdate.toISOString() : user.birthdate,
});

// A member who doesn't participate in a section can't hold a role in one.
const normalizeUniversityData = (university) => ({
  ...university,
  role: university.participation === "None" ? "None" : university.role,
});

export const addUser = async (req, res) => {
  if (!req.admin.isSuperAdmin && !req.admin.registerUsers) {
    throw forbidden("You are not allowed to register users");
  }

  const { universityusers, ...userData } = validate(userSchema, req.body);

  const existing = await prisma.user.findUnique({
    where: { studentid: userData.studentid },
    select: { userid: true },
  });
  if (existing) throw conflict("A user with this student ID already exists");

  const user = await prisma.user.create({
    data: {
      ...userData,
      createdBy: req.admin.studentid,
      universityusers: { create: normalizeUniversityData(universityusers) },
    },
    include: { universityusers: true },
  });

  res.status(201).json({ success: true, user: serializeUser(user) });
};

export const updateUser = async (req, res) => {
  const studentid = parseStudentIdParam(req.params.id);
  const { universityusers, ...userData } = validate(userSchema, req.body);

  const existing = await prisma.user.findUnique({ where: { studentid } });
  if (!existing) throw notFound("User not found");
  if (!canEditUser(req.admin, existing)) {
    throw forbidden("You are not allowed to edit this user");
  }

  if (userData.studentid !== studentid) {
    const clash = await prisma.user.findUnique({
      where: { studentid: userData.studentid },
      select: { userid: true },
    });
    if (clash) throw conflict("A user with this student ID already exists");
  }

  const university = normalizeUniversityData(universityusers);
  const updatedUser = await prisma.user.update({
    where: { studentid },
    data: {
      ...userData,
      // Older rows may lack a university record, so upsert instead of update.
      universityusers: {
        upsert: { create: university, update: university },
      },
    },
    include: { universityusers: true },
  });

  res.status(200).json({ success: true, updatedUser: serializeUser(updatedUser) });
};

/**
 * Users an admin may list: everyone with readUsers (or super admin), only
 * their own registrations with registerUsers, otherwise nobody (null).
 */
export const visibleUsersWhere = (admin) => {
  if (admin?.isSuperAdmin || admin?.readUsers) return {};
  if (admin?.registerUsers) return { createdBy: admin.studentid };
  return null;
};

export const getUsers = async (req, res) => {
  const query = validate(userQuerySchema, req.query);
  const { page, limit } = query;

  const scope = visibleUsersWhere(req.admin);
  if (!scope) {
    return res.status(200).json({
      success: true,
      users: [],
      pagination: {
        totalUsers: 0,
        totalPages: 0,
        currentPage: page,
        limit,
        hasNext: false,
        hasPrev: false,
      },
    });
  }
  const where = { ...scope };

  if (query.q) {
    where.OR = ["studentid", "firstname", "middlename", "lastname", "phone"].map(
      (field) => ({ [field]: { contains: query.q, mode: "insensitive" } }),
    );
  }
  if (query.gender) where.gender = query.gender;
  if (query.clergicalstatus) where.clergicalstatus = query.clergicalstatus;

  const department = query.departmentname ?? query.department;
  const universityWhere = {
    ...(query.batch ? { batch: query.batch } : {}),
    ...(query.participation ? { participation: query.participation } : {}),
    ...(department
      ? { departmentname: { contains: department, mode: "insensitive" } }
      : {}),
    ...(query.sponsorshiptype ? { sponsorshiptype: query.sponsorshiptype } : {}),
    ...(query.cafeteriaaccess !== undefined
      ? { cafeteriaaccess: query.cafeteriaaccess }
      : {}),
    ...(query.tookcourse !== undefined ? { tookcourse: query.tookcourse } : {}),
  };
  if (Object.keys(universityWhere).length > 0) {
    where.universityusers = { is: universityWhere };
  }

  let orderBy = [{ userid: "desc" }];
  if (query.sortBy) {
    const primary = USER_SORT_FIELDS.has(query.sortBy)
      ? { [query.sortBy]: query.sortOrder }
      : { universityusers: { [query.sortBy]: query.sortOrder } };
    // Tie-break on userid so pagination is stable.
    orderBy = [primary, { userid: "desc" }];
  }

  const [totalUsers, users] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: { universityusers: true },
    }),
  ]);

  const totalPages = Math.ceil(totalUsers / limit);
  res.status(200).json({
    success: true,
    users: users.map(serializeUser),
    pagination: {
      totalUsers,
      totalPages,
      currentPage: page,
      limit,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  });
};

export const getUser = async (req, res) => {
  const studentid = parseStudentIdParam(req.params.id);
  const user = await prisma.user.findUnique({
    where: { studentid },
    include: { universityusers: true },
  });
  if (!user) throw notFound("User not found");
  if (!canReadUser(req.admin, user)) {
    throw forbidden("You are not allowed to view this user");
  }

  res.status(200).json({ success: true, user: serializeUser(user) });
};

export const deleteUser = async (req, res) => {
  const studentid = parseStudentIdParam(req.params.id);
  const user = await prisma.user.findUnique({ where: { studentid } });
  if (!user) throw notFound("User not found");
  if (!canDeleteUser(req.admin, user)) {
    throw forbidden("You are not allowed to delete this user");
  }

  await prisma.user.delete({ where: { studentid } });
  res.status(200).json({ success: true, message: "User deleted successfully" });
};

export const deleteAllUsers = async (_req, res) => {
  const { count } = await prisma.user.deleteMany({});
  res.status(200).json({
    success: true,
    message: "All users deleted successfully",
    deletedCount: count,
  });
};

const toBreakdown = (groups, key) =>
  Object.fromEntries(groups.map((g) => [g[key], g._count._all]));

export const getAnalytics = async (req, res) => {
  const scope = visibleUsersWhere(req.admin);
  if (!scope) {
    return res.status(200).json({
      success: true,
      analytics: {
        total: 0,
        activeUsers: 0,
        withRole: 0,
        participating: 0,
        participationRate: 0,
        participationBreakdown: {},
        activityBreakdown: {},
        genderBreakdown: {},
        batchBreakdown: {},
        departmentBreakdown: {},
      },
    });
  }

  const university = Object.keys(scope).length ? { User: scope } : {};
  const groupUniversity = (by) =>
    prisma.universityusers.groupBy({
      by: [by],
      where: university,
      _count: { _all: true },
    });

  const [total, participation, activity, batches, departments, genders, withRole] =
    await Promise.all([
      prisma.user.count({ where: scope }),
      groupUniversity("participation"),
      groupUniversity("activitylevel"),
      groupUniversity("batch"),
      groupUniversity("departmentname"),
      prisma.user.groupBy({ by: ["gender"], where: scope, _count: { _all: true } }),
      prisma.universityusers.count({ where: { ...university, role: { not: "None" } } }),
    ]);

  const participationBreakdown = toBreakdown(participation, "participation");
  // Users without a university record count as not participating.
  const withRecord = participation.reduce((n, g) => n + g._count._all, 0);
  if (total > withRecord) {
    participationBreakdown.None = (participationBreakdown.None ?? 0) + (total - withRecord);
  }
  const participating = total - (participationBreakdown.None ?? 0);

  const activityBreakdown = toBreakdown(activity, "activitylevel");
  const activeUsers =
    (activityBreakdown.Active ?? 0) + (activityBreakdown.Very_Active ?? 0);

  // Department names are free text; group case/space variants together.
  const departmentBreakdown = {};
  for (const g of departments) {
    const name = g.departmentname.trim().replace(/\s+/g, " ") || "Unknown";
    const key =
      Object.keys(departmentBreakdown).find(
        (k) => k.toLowerCase() === name.toLowerCase(),
      ) ?? name;
    departmentBreakdown[key] = (departmentBreakdown[key] ?? 0) + g._count._all;
  }

  res.status(200).json({
    success: true,
    analytics: {
      total,
      activeUsers,
      withRole,
      participating,
      participationRate:
        total === 0 ? 0 : Number(((participating / total) * 100).toFixed(2)),
      participationBreakdown,
      activityBreakdown,
      genderBreakdown: toBreakdown(genders, "gender"),
      batchBreakdown: toBreakdown(batches, "batch"),
      departmentBreakdown,
    },
  });
};
