import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { app, buildUser, createAdmin, hasDatabase, loginAs, loginSuperAdmin, prisma, resetDb } from "../helpers/db.js";

describe.skipIf(!hasDatabase)("admins API", () => {
  let agent;
  beforeEach(async () => {
    await resetDb();
    agent = await loginSuperAdmin();
    await prisma.role.create({ data: { name: "Registrar", readUsers: true, registerUsers: true } });
  });

  const newAdmin = (overrides = {}) => ({
    studentid: "ADM-1",
    adminusername: "Registrar One",
    adminpassword: "password-123",
    roleName: "Registrar",
    ...overrides,
  });

  it("creates an admin with the role's permissions, and the admin can log in", async () => {
    const res = await agent.post("/api/admin").send(newAdmin());
    expect(res.status).toBe(201);
    expect(res.body.admin).toMatchObject({
      studentid: "ADM-1",
      isSuperAdmin: false,
      permissions: { readUsers: true, registerUsers: true, editAnyUser: false },
    });

    const login = await request(app)
      .post("/api/admin/login")
      .send({ studentid: "ADM-1", adminpassword: "password-123" });
    expect(login.status).toBe(200);
  });

  it("lets explicit permissions override the role's", async () => {
    const res = await agent
      .post("/api/admin")
      .send(newAdmin({ permissions: { readUsers: false, editAnyUser: true } }));
    expect(res.body.admin.permissions).toMatchObject({
      readUsers: false,
      registerUsers: true,
      editAnyUser: true,
    });
  });

  it.each([
    ["unknown role", { roleName: "Nope" }, 400],
    ["short password", { adminpassword: "short" }, 400],
    ["slash in id", { studentid: "A/1" }, 400],
  ])("rejects %s", async (_label, override, status) => {
    expect((await agent.post("/api/admin").send(newAdmin(override))).status).toBe(status);
  });

  it("rejects duplicate student ids with 409", async () => {
    await agent.post("/api/admin").send(newAdmin());
    expect((await agent.post("/api/admin").send(newAdmin())).status).toBe(409);
  });

  it("lists admins with how many users each registered", async () => {
    await createAdmin({ studentid: "ADM-1", adminusername: "One" });
    await prisma.user.create({
      data: {
        ...(({ universityusers, ...u }) => u)(buildUser()),
        birthdate: new Date("2000-01-01"),
        createdBy: "ADM-1",
      },
    });
    const res = await agent.get("/api/admin");
    expect(res.status).toBe(200);
    const one = res.body.admins.find((a) => a.studentid === "ADM-1");
    expect(one.usersCreatedCount).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain("adminpassword");
  });

  it("updates username/permissions without touching the password", async () => {
    await agent.post("/api/admin").send(newAdmin());
    const res = await agent
      .put("/api/admin/ADM-1")
      .send({ adminusername: "Renamed", adminpassword: "", permissions: { editAnyUser: true } });
    expect(res.status).toBe(200);
    expect(res.body.updatedAdmin).toMatchObject({
      adminusername: "Renamed",
      permissions: { readUsers: true, editAnyUser: true },
    });
    const login = await request(app)
      .post("/api/admin/login")
      .send({ studentid: "ADM-1", adminpassword: "password-123" });
    expect(login.status).toBe(200);
  });

  it("moves registered-user ownership when an admin's student id changes", async () => {
    await createAdmin({ studentid: "OLD-ID" });
    await prisma.user.create({
      data: {
        ...(({ universityusers, ...u }) => u)(buildUser()),
        birthdate: new Date("2000-01-01"),
        createdBy: "OLD-ID",
      },
    });
    const res = await agent.put("/api/admin/OLD-ID").send({ studentid: "NEW-ID" });
    expect(res.status).toBe(200);
    expect(await prisma.user.count({ where: { createdBy: "NEW-ID" } })).toBe(1);
  });

  it("handles missing admins and id conflicts on update", async () => {
    expect((await agent.put("/api/admin/NOPE").send({ adminusername: "x" })).status).toBe(404);
    await createAdmin({ studentid: "A" });
    await createAdmin({ studentid: "B" });
    expect((await agent.put("/api/admin/A").send({ studentid: "B" })).status).toBe(409);
    expect((await agent.put("/api/admin/A").send({})).status).toBe(400);
  });

  it("deletes admins but not yourself or the last super admin", async () => {
    await createAdmin({ studentid: "ADM-1" });
    expect((await agent.delete("/api/admin/ADM-1")).status).toBe(200);
    expect((await agent.delete("/api/admin/ADM-1")).status).toBe(404);
    expect((await agent.delete("/api/admin/SUPER-1")).status).toBe(400);

    // a second super admin can delete the first while another remains
    await createAdmin({ studentid: "SUPER-2", adminusername: "Second Super" });
    const second = await loginAs({ studentid: "SUPER-2", adminusername: "Second Super" });
    expect((await second.delete("/api/admin/SUPER-1")).status).toBe(200);
  });

  it("delete-all removes only non-super admins", async () => {
    await createAdmin({ studentid: "ADM-1" });
    await createAdmin({ studentid: "ADM-2" });
    const res = await agent.delete("/api/admin");
    expect(res.status).toBe(200);
    expect(res.body.deletedCount).toBe(2);
    expect(await prisma.admin.count()).toBe(1);
  });

  it("is forbidden for regular admins", async () => {
    const regular = await loginAs({ studentid: "R-1", readUsers: true, registerUsers: true });
    expect((await regular.get("/api/admin")).status).toBe(403);
    expect((await regular.post("/api/admin").send(newAdmin())).status).toBe(403);
    expect((await regular.delete("/api/admin/SUPER-1")).status).toBe(403);
  });
});
