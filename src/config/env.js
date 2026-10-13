import "dotenv/config";

const DEV_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
];

const splitList = (value) =>
  (value || "")
    .split(",")
    .map((item) => item.trim().replace(/\/+$/, ""))
    .filter(Boolean);

export const isProduction = () =>
  process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

/**
 * SUPER_ADMINS is normally a JSON array (`["a", "b"]`), but a plain
 * comma-separated list is accepted too so a mis-typed env var can't lock
 * every super admin out.
 */
export const getSuperAdmins = () => {
  const raw = (process.env.SUPER_ADMINS || "").trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((name) => String(name).trim()).filter(Boolean);
    }
    if (typeof parsed === "string") return [parsed.trim()].filter(Boolean);
  } catch {
    // fall through to comma-separated parsing
  }

  return raw
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((name) => name.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
};

export const isSuperAdminName = (adminusername) =>
  getSuperAdmins().includes(adminusername);

export const getAllowedOrigins = () => {
  const configured = [
    ...splitList(process.env.FRONTEND_URL),
    ...splitList(process.env.CORS_ORIGINS),
  ];
  return isProduction() ? configured : [...configured, ...DEV_ORIGINS];
};

export const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return secret;
};
