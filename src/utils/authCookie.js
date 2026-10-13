import jwt from "jsonwebtoken";
import { getJwtSecret, isProduction } from "../config/env.js";

export const AUTH_COOKIE_NAME = "jwt";
const TOKEN_TTL_SECONDS = 10 * 24 * 60 * 60;

export function getAuthCookieOptions() {
  const production = isProduction();
  return {
    httpOnly: true,
    // Production cookies must be Secure; SameSite=None lets them work both
    // through the frontend's same-origin /api rewrite and cross-site.
    secure: production,
    sameSite: production ? "none" : "lax",
    path: "/",
  };
}

export function signAuthToken(studentid) {
  return jwt.sign({ studentid }, getJwtSecret(), {
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

export function verifyAuthToken(token) {
  return jwt.verify(token, getJwtSecret());
}

export function setAuthCookie(res, studentid) {
  const token = signAuthToken(studentid);
  res.cookie(AUTH_COOKIE_NAME, token, {
    ...getAuthCookieOptions(),
    maxAge: TOKEN_TTL_SECONDS * 1000,
  });
  return token;
}

export function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, getAuthCookieOptions());
}
