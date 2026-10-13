import prisma from "../config/prisma.js";
import { isSuperAdminName } from "../config/env.js";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "../utils/authCookie.js";
import { forbidden, unauthorized } from "../utils/errors.js";

const ADMIN_AUTH_SELECT = {
  studentid: true,
  adminusername: true,
  readUsers: true,
  registerUsers: true,
  editAnyUser: true,
  editSpecificUsers: true,
  removeAnyUsers: true,
  removeSpecificUsers: true,
  passwordUpdatedAt: true,
};

const extractToken = (req) => {
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
  if (cookieToken) return cookieToken;

  const header = req.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
};

/** Requires a valid session and attaches the admin to `req.admin`. */
export async function protect(req, _res, next) {
  const token = extractToken(req);
  if (!token) throw unauthorized("Not authenticated");

  let decoded;
  try {
    decoded = verifyAuthToken(token);
  } catch {
    throw unauthorized("Session is invalid or has expired");
  }
  if (typeof decoded?.studentid !== "string") {
    throw unauthorized("Session is invalid or has expired");
  }

  const admin = await prisma.admin.findUnique({
    where: { studentid: decoded.studentid },
    select: ADMIN_AUTH_SELECT,
  });
  if (!admin) throw unauthorized("Account no longer exists");

  // Tokens issued before the last password change are revoked.
  if (
    admin.passwordUpdatedAt &&
    decoded.iat &&
    decoded.iat * 1000 < admin.passwordUpdatedAt.getTime() - 1000
  ) {
    throw unauthorized("Session expired after a password change");
  }

  const { passwordUpdatedAt: _omit, ...rest } = admin;
  req.admin = { ...rest, isSuperAdmin: isSuperAdminName(admin.adminusername) };
  next();
}

export function requireSuperAdmin(req, _res, next) {
  if (!req.admin?.isSuperAdmin) {
    throw forbidden("Only super admins can perform this action");
  }
  next();
}

export default protect;
