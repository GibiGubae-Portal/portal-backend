import { beforeEach, describe, expect, it } from "vitest";
import { hasDatabase, loginAs, loginSuperAdmin, resetDb } from "../helpers/db.js";

describe.skipIf(!hasDatabase)("roles API", () => {
  let agent;
  beforeEach(async () => {
    await resetDb();
    agent = await loginSuperAdmin();
  });

  it("supports full CRUD", async () => {
    const created = await agent.post("/api/role").send({ name: " Viewer ", readUsers: true });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: "Viewer", readUsers: true, registerUsers: false });
    const { id } = created.body.data;

    expect((await agent.get("/api/role")).body.data).toHaveLength(1);
    expect((await agent.get(`/api/role/${id}`)).body.data.name).toBe("Viewer");

    const updated = await agent.put(`/api/role/${id}`).send({ registerUsers: true });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ name: "Viewer", readUsers: true, registerUsers: true });

    expect((await agent.delete(`/api/role/${id}`)).status).toBe(200);
    expect((await agent.get(`/api/role/${id}`)).status).toBe(404);
  });

  it("rejects duplicates, bad ids, missing names and unknown fields", async () => {
    await agent.post("/api/role").send({ name: "Viewer" });
    expect((await agent.post("/api/role").send({ name: "Viewer" })).status).toBe(409);
    expect((await agent.post("/api/role").send({ readUsers: true })).status).toBe(400);
    expect((await agent.get("/api/role/abc")).status).toBe(400);
    expect((await agent.put("/api/role/999").send({ name: "X" })).status).toBe(404);
    expect((await agent.delete("/api/role/999")).status).toBe(404);

    // Unknown fields (e.g. trying to set the id) are stripped, not passed to the DB
    const res = await agent.post("/api/role").send({ name: "Other", id: 5000, bogus: 1 });
    expect(res.status).toBe(201);
    expect(res.body.data.id).not.toBe(5000);
  });

  it("rename to an existing name is a conflict", async () => {
    await agent.post("/api/role").send({ name: "A" });
    const b = await agent.post("/api/role").send({ name: "B" });
    expect((await agent.put(`/api/role/${b.body.data.id}`).send({ name: "A" })).status).toBe(409);
  });

  it("is forbidden for regular admins", async () => {
    const regular = await loginAs({ studentid: "A-1", readUsers: true });
    expect((await regular.get("/api/role")).status).toBe(403);
    expect((await regular.post("/api/role").send({ name: "X" })).status).toBe(403);
  });
});
