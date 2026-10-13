import { afterEach, describe, expect, it } from "vitest";
import { getAllowedOrigins, getSuperAdmins } from "../../src/config/env.js";

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

describe("getSuperAdmins", () => {
  it("parses a JSON array", () => {
    process.env.SUPER_ADMINS = '["Gbi_Admin@123", "Super Admin"]';
    expect(getSuperAdmins()).toEqual(["Gbi_Admin@123", "Super Admin"]);
  });

  it("falls back to comma-separated values", () => {
    process.env.SUPER_ADMINS = "Alpha, Beta";
    expect(getSuperAdmins()).toEqual(["Alpha", "Beta"]);
  });

  it("tolerates malformed JSON", () => {
    process.env.SUPER_ADMINS = '["Alpha", "Beta"';
    expect(getSuperAdmins()).toEqual(["Alpha", "Beta"]);
  });

  it("returns an empty list when unset", () => {
    delete process.env.SUPER_ADMINS;
    expect(getSuperAdmins()).toEqual([]);
  });
});

describe("getAllowedOrigins", () => {
  it("includes FRONTEND_URL and CORS_ORIGINS without trailing slashes", () => {
    process.env.FRONTEND_URL = "https://app.example.com/";
    process.env.CORS_ORIGINS = "https://a.example.com, https://b.example.com";
    const origins = getAllowedOrigins();
    expect(origins).toContain("https://app.example.com");
    expect(origins).toContain("https://b.example.com");
  });

  it("only allows localhost outside production", () => {
    process.env.NODE_ENV = "production";
    expect(getAllowedOrigins()).not.toContain("http://localhost:5173");
    process.env.NODE_ENV = "development";
    delete process.env.VERCEL;
    expect(getAllowedOrigins()).toContain("http://localhost:5173");
  });
});
