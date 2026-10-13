import { describe, expect, it } from "vitest";
import { canDeleteUser, canEditUser, canReadUser } from "../../src/controllers/user.controller.js";

const user = { createdBy: "OWNER" };
const admin = (overrides) => ({ studentid: "OTHER", isSuperAdmin: false, ...overrides });

describe("user permissions", () => {
  it("lets super admins do everything", () => {
    const a = admin({ isSuperAdmin: true });
    expect(canReadUser(a, user) && canEditUser(a, user) && canDeleteUser(a, user)).toBe(true);
  });

  it("limits 'specific' permissions to users the admin created", () => {
    const owner = admin({ studentid: "OWNER", editSpecificUsers: true, removeSpecificUsers: true });
    const stranger = admin({ editSpecificUsers: true, removeSpecificUsers: true });
    expect(canEditUser(owner, user)).toBe(true);
    expect(canDeleteUser(owner, user)).toBe(true);
    expect(canEditUser(stranger, user)).toBe(false);
    expect(canDeleteUser(stranger, user)).toBe(false);
  });

  it("'any' permissions apply regardless of owner", () => {
    expect(canEditUser(admin({ editAnyUser: true }), user)).toBe(true);
    expect(canDeleteUser(admin({ removeAnyUsers: true }), user)).toBe(true);
  });

  it("denies everything to an admin without permissions", () => {
    const a = admin({});
    expect(canReadUser(a, user) || canEditUser(a, user) || canDeleteUser(a, user)).toBe(false);
  });

  it("never treats a null createdBy as owned", () => {
    const a = admin({ studentid: null, editSpecificUsers: true });
    expect(canEditUser(a, { createdBy: null })).toBe(false);
  });
});
