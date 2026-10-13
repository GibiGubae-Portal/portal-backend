import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { signAuthToken } from "../../src/utils/authCookie.js";
import { app, createAdmin, hasDatabase, loginAs, loginSuperAdmin, PASSWORD, prisma, resetDb } from "../helpers/db.js";

describe.skipIf(!hasDatabase)("authentication", () => {
  beforeEach(resetDb);

  it("rejects missing credentials with 400", async () => {
    const res = await request(app).post("/api/admin/login").send({});
    expect(res.status).toBe(400);
  });

  it("rejects unknown accounts and wrong passwords with the same 401", async () => {
    await createAdmin({ studentid: "A-1" });
    const unknown = await request(app)
      .post("/api/admin/login")
      .send({ studentid: "NOPE", adminpassword: PASSWORD });
    const wrong = await request(app)
      .post("/api/admin/login")
      .send({ studentid: "A-1", adminpassword: "wrong-password" });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  it("logs in (trimming the student id), sets an httpOnly cookie, and never returns the hash", async () => {
    await createAdmin({ studentid: "A-1", readUsers: true });
    const res = await request(app)
      .post("/api/admin/login")
      .send({ studentid: "  A-1 ", adminpassword: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"][0]).toMatch(/^jwt=.+HttpOnly/);
    expect(JSON.stringify(res.body)).not.toContain("adminpassword");
    expect(res.body.admin.permissions.readUsers).toBe(true);
  });

  it("returns the current session, then clears it on logout", async () => {
    const agent = await loginAs({ studentid: "A-1", registerUsers: true });

    const current = await agent.get("/api/auth/current");
    expect(current.status).toBe(200);
    expect(current.body.user).toMatchObject({
      studentid: "A-1",
      isAuthenticated: true,
      isSuperAdmin: false,
      permissions: { registerUsers: true, readUsers: false },
    });

    const logout = await agent.post("/api/auth/logout");
    expect(logout.status).toBe(200);
    expect((await agent.get("/api/auth/current")).status).toBe(401);
  });

  it("flags super admins from SUPER_ADMINS", async () => {
    const agent = await loginSuperAdmin();
    const res = await agent.get("/api/auth/current");
    expect(res.body.user).toMatchObject({ isSuperAdmin: true, role: "Super Admin" });
  });

  it("accepts a Bearer token as an alternative to the cookie", async () => {
    await createAdmin({ studentid: "A-1" });
    const res = await request(app)
      .get("/api/auth/current")
      .set("Authorization", `Bearer ${signAuthToken("A-1")}`);
    expect(res.status).toBe(200);
  });

  it.each([
    ["no token", undefined],
    ["garbage token", "Bearer not-a-jwt"],
  ])("returns 401 with %s", async (_label, header) => {
    const req = request(app).get("/api/user");
    if (header) req.set("Authorization", header);
    const res = await req;
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("revokes sessions of deleted admins", async () => {
    const agent = await loginAs({ studentid: "A-1" });
    await prisma.admin.delete({ where: { studentid: "A-1" } });
    expect((await agent.get("/api/auth/current")).status).toBe(401);
  });

  it("revokes older sessions when the password is changed", async () => {
    const agent = await loginAs({ studentid: "A-1" });
    const superAgent = await loginSuperAdmin();
    await new Promise((r) => setTimeout(r, 1100));
    const res = await superAgent.put("/api/admin/A-1").send({ adminpassword: "brand-new-pass" });
    expect(res.status).toBe(200);
    expect((await agent.get("/api/auth/current")).status).toBe(401);

    const relogin = await request(app)
      .post("/api/admin/login")
      .send({ studentid: "A-1", adminpassword: "brand-new-pass" });
    expect(relogin.status).toBe(200);
  });
});
