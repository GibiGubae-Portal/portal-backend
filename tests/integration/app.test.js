import request from "supertest";
import { describe, expect, it } from "vitest";
import { app, hasDatabase } from "../helpers/db.js";

describe.skipIf(!hasDatabase)("app plumbing", () => {
  it("reports health including the database", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", database: "up" });
  });

  it("returns JSON 404 for unknown routes", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 (not 500) for malformed JSON", async () => {
    const res = await request(app)
      .post("/api/admin/login")
      .set("Content-Type", "application/json")
      .send('{"studentid": ');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Malformed JSON/);
  });

  it("allows CORS with credentials for the configured frontend only", async () => {
    const ok = await request(app)
      .options("/api/auth/current")
      .set("Origin", "https://frontend.example.com")
      .set("Access-Control-Request-Method", "GET");
    expect(ok.headers["access-control-allow-origin"]).toBe("https://frontend.example.com");
    expect(ok.headers["access-control-allow-credentials"]).toBe("true");

    const blocked = await request(app)
      .get("/api/health")
      .set("Origin", "https://evil.example.com");
    expect(blocked.status).toBe(200); // not a server error
    expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
