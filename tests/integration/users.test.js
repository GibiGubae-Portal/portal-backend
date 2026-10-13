import { beforeEach, describe, expect, it } from "vitest";
import { buildUser, hasDatabase, loginAs, loginSuperAdmin, prisma, resetDb } from "../helpers/db.js";

describe.skipIf(!hasDatabase)("users API", () => {
  let superAgent;
  beforeEach(async () => {
    await resetDb();
    superAgent = await loginSuperAdmin();
  });

  describe("create", () => {
    it("creates a user exactly as the frontend form sends it", async () => {
      // The legacy form sends lower-case "not_specified" and a full Date string
      const payload = buildUser({
        region: "not_specified",
        mothertongue: "not_specified",
        birthdate: new Date("2001-05-04T00:00:00.000Z").toISOString(),
        useremail: null,
        universityusers: {
          participation: "Hymns_and_Arts_Section",
          role: "Member",
          confessionfather: "Not Specified",
          mealcard: "Not Specified",
        },
      });
      const res = await superAgent.post("/api/user").send(payload);
      expect(res.status).toBe(201);
      expect(res.body.user).toMatchObject({
        studentid: payload.studentid,
        region: "Not_Specified",
        mothertongue: "Not_Specified",
        useremail: null,
        createdBy: "SUPER-1",
        birthdate: "2001-05-04T00:00:00.000Z",
        universityusers: { participation: "Hymns_and_Arts_Section", role: "Member" },
      });
    });

    it("allows many users without an email (no unique-default collision)", async () => {
      expect((await superAgent.post("/api/user").send(buildUser())).status).toBe(201);
      expect((await superAgent.post("/api/user").send(buildUser({ useremail: "" }))).status).toBe(201);
    });

    it("forces role to None when not participating", async () => {
      const res = await superAgent
        .post("/api/user")
        .send(buildUser({ universityusers: { participation: "None", role: "ClassManager" } }));
      expect(res.body.user.universityusers.role).toBe("None");
    });

    it("returns 409 for duplicate student id, phone or email", async () => {
      const first = buildUser({ useremail: "a@example.com" });
      await superAgent.post("/api/user").send(first);

      const dupId = await superAgent.post("/api/user").send(buildUser({ studentid: first.studentid }));
      expect(dupId.status).toBe(409);

      const dupPhone = await superAgent.post("/api/user").send(buildUser({ phone: first.phone }));
      expect(dupPhone.status).toBe(409);
      expect(dupPhone.body.message).toMatch(/Phone/);

      const dupEmail = await superAgent.post("/api/user").send(buildUser({ useremail: "A@example.com" }));
      expect(dupEmail.status).toBe(409);
    });

    it("returns 400 with a message for invalid payloads", async () => {
      const res = await superAgent.post("/api/user").send(buildUser({ gender: "X" }));
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/gender/);
      expect((await superAgent.post("/api/user").send({})).status).toBe(400);
    });

    it("is forbidden without registerUsers", async () => {
      const reader = await loginAs({ studentid: "R-1", readUsers: true });
      expect((await reader.post("/api/user").send(buildUser())).status).toBe(403);
    });
  });

  describe("list", () => {
    beforeEach(async () => {
      const users = [
        buildUser({ firstname: "Alpha", gender: "Female", universityusers: { batch: 2015, departmentname: "Medicine", cafeteriaaccess: true } }),
        buildUser({ firstname: "Bravo", universityusers: { batch: 2016, sponsorshiptype: "Scholarship", participation: "Hymns_and_Arts_Section", role: "Member" } }),
        buildUser({ firstname: "Charlie", clergicalstatus: "Deacon", universityusers: { batch: 2016 } }),
      ];
      for (const u of users) {
        expect((await superAgent.post("/api/user").send(u)).status).toBe(201);
      }
    });

    it("paginates", async () => {
      const res = await superAgent.get("/api/user?page=1&limit=2");
      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(2);
      expect(res.body.pagination).toMatchObject({ totalUsers: 3, totalPages: 2, hasNext: true, hasPrev: false });
      const page2 = await superAgent.get("/api/user?page=2&limit=2");
      expect(page2.body.users).toHaveLength(1);
    });

    it("searches case-insensitively", async () => {
      const res = await superAgent.get("/api/user?q=brav");
      expect(res.body.users.map((u) => u.firstname)).toEqual(["Bravo"]);
    });

    it.each([
      ["gender=Female", ["Alpha"]],
      ["batch=2016", ["Bravo", "Charlie"]],
      ["departmentname=medic", ["Alpha"]],
      ["sponsorshiptype=Scholarship", ["Bravo"]],
      ["participation=Hymns_and_Arts_Section", ["Bravo"]],
      ["cafeteriaaccess=true", ["Alpha"]],
      ["clergicalstatus=Deacon", ["Charlie"]],
      ["batch=2016&gender=Male&q=char", ["Charlie"]],
    ])("filters by %s", async (query, expected) => {
      const res = await superAgent.get(`/api/user?${query}&sortBy=firstname&sortOrder=asc`);
      expect(res.status).toBe(200);
      expect(res.body.users.map((u) => u.firstname)).toEqual(expected);
    });

    it("sorts by user and university fields", async () => {
      const byName = await superAgent.get("/api/user?sortBy=firstname&sortOrder=desc");
      expect(byName.body.users.map((u) => u.firstname)).toEqual(["Charlie", "Bravo", "Alpha"]);
      const byBatch = await superAgent.get("/api/user?sortBy=batch&sortOrder=asc");
      expect(byBatch.body.users[0].firstname).toBe("Alpha");
    });

    it("rejects invalid query params with 400 instead of crashing", async () => {
      expect((await superAgent.get("/api/user?gender=Robot")).status).toBe(400);
      expect((await superAgent.get("/api/user?limit=5000")).status).toBe(400);
      expect((await superAgent.get("/api/user?sortBy=adminpassword")).status).toBe(400);
    });

    it("scopes registrars without readUsers to their own users", async () => {
      const registrar = await loginAs({ studentid: "REG-1", registerUsers: true });
      await registrar.post("/api/user").send(buildUser({ firstname: "Mine" }));
      const res = await registrar.get("/api/user");
      expect(res.body.users.map((u) => u.firstname)).toEqual(["Mine"]);
      expect(res.body.pagination.totalUsers).toBe(1);
    });

    it("returns an empty list for admins with no user permissions", async () => {
      const nobody = await loginAs({ studentid: "NOBODY" });
      const res = await nobody.get("/api/user");
      expect(res.status).toBe(200);
      expect(res.body.users).toEqual([]);
    });
  });

  describe("read / update / delete", () => {
    let user;
    beforeEach(async () => {
      user = buildUser();
      await superAgent.post("/api/user").send(user);
    });

    it("gets a single user and 404s for unknown ids", async () => {
      const res = await superAgent.get(`/api/user/${user.studentid}`);
      expect(res.status).toBe(200);
      expect(res.body.user.studentid).toBe(user.studentid);
      expect((await superAgent.get("/api/user/NOPE-1")).status).toBe(404);
    });

    it("updates using the object the frontend got back from the API (round trip)", async () => {
      const { body } = await superAgent.get(`/api/user/${user.studentid}`);
      const edited = { ...body.user, firstname: "Edited", region: "Not_Specified" };
      const res = await superAgent.put(`/api/user/${user.studentid}`).send(edited);
      expect(res.status).toBe(200);
      expect(res.body.updatedUser).toMatchObject({ firstname: "Edited", region: "Not_Specified" });
      expect(res.body.updatedUser.createdBy).toBe("SUPER-1"); // not overwritable
    });

    it("can change a user's student id, but not to one that exists", async () => {
      const other = buildUser();
      await superAgent.post("/api/user").send(other);
      const clash = await superAgent.put(`/api/user/${user.studentid}`).send({ ...user, studentid: other.studentid });
      expect(clash.status).toBe(409);
      const ok = await superAgent.put(`/api/user/${user.studentid}`).send({ ...user, studentid: "UGR-9999-16" });
      expect(ok.status).toBe(200);
      expect((await superAgent.get("/api/user/UGR-9999-16")).status).toBe(200);
    });

    it("updates a legacy user that has no university record", async () => {
      const { universityusers, ...bare } = buildUser();
      await prisma.user.create({ data: { ...bare, birthdate: new Date("2000-01-01") } });
      const res = await superAgent.put(`/api/user/${bare.studentid}`).send({ ...bare, universityusers });
      expect(res.status).toBe(200);
      expect(res.body.updatedUser.universityusers.departmentname).toBe(universityusers.departmentname);
    });

    it("enforces ownership for 'specific' permissions", async () => {
      const editor = await loginAs({ studentid: "ED-1", readUsers: true, editSpecificUsers: true, removeSpecificUsers: true });
      expect((await editor.put(`/api/user/${user.studentid}`).send(user)).status).toBe(403);
      expect((await editor.delete(`/api/user/${user.studentid}`)).status).toBe(403);

      const anyEditor = await loginAs({ studentid: "ED-2", editAnyUser: true });
      expect((await anyEditor.put(`/api/user/${user.studentid}`).send(user)).status).toBe(200);
    });

    it("lets a registrar view/edit/delete only users they created", async () => {
      const registrar = await loginAs({ studentid: "REG-1", registerUsers: true });
      expect((await registrar.get(`/api/user/${user.studentid}`)).status).toBe(403);

      const mine = buildUser();
      await registrar.post("/api/user").send(mine);
      expect((await registrar.get(`/api/user/${mine.studentid}`)).status).toBe(200);
      expect((await registrar.put(`/api/user/${mine.studentid}`).send({ ...mine, firstname: "X" })).status).toBe(200);
      expect((await registrar.delete(`/api/user/${mine.studentid}`)).status).toBe(200);
    });

    it("deletes a user and its university record", async () => {
      const res = await superAgent.delete(`/api/user/${user.studentid}`);
      expect(res.status).toBe(200);
      expect(await prisma.universityusers.count()).toBe(0);
      expect((await superAgent.delete(`/api/user/${user.studentid}`)).status).toBe(404);
    });

    it("rejects slashes in id params", async () => {
      expect((await superAgent.get("/api/user/UGR%2F1%2F16")).status).toBe(400);
    });
  });

  describe("analytics and bulk delete", () => {
    it("computes analytics server-side", async () => {
      await superAgent.post("/api/user").send(
        buildUser({ gender: "Female", universityusers: { departmentname: "Medicine", activitylevel: "Not_Active" } }),
      );
      await superAgent.post("/api/user").send(
        buildUser({
          universityusers: {
            departmentname: " medicine ",
            batch: 2015,
            participation: "Hymns_and_Arts_Section",
            role: "Member",
            activitylevel: "Very_Active",
          },
        }),
      );
      const res = await superAgent.get("/api/user/analytics");
      expect(res.status).toBe(200);
      expect(res.body.analytics).toEqual({
        total: 2,
        activeUsers: 1,
        withRole: 1,
        participating: 1,
        participationRate: 50,
        participationBreakdown: { None: 1, Hymns_and_Arts_Section: 1 },
        activityBreakdown: { Not_Active: 1, Very_Active: 1 },
        genderBreakdown: { Female: 1, Male: 1 },
        batchBreakdown: { 2015: 1, 2016: 1 },
        departmentBreakdown: { Medicine: 2 },
      });
    });

    it("scopes analytics to the users an admin can see", async () => {
      await superAgent.post("/api/user").send(buildUser());
      const registrar = await loginAs({ studentid: "REG-1", registerUsers: true });
      await registrar.post("/api/user").send(buildUser());
      const res = await registrar.get("/api/user/analytics");
      expect(res.status).toBe(200);
      expect(res.body.analytics.total).toBe(1);

      const nobody = await loginAs({ studentid: "NOBODY" });
      expect((await nobody.get("/api/user/analytics")).body.analytics.total).toBe(0);
    });

    it("returns zeros for an empty database", async () => {
      const res = await superAgent.get("/api/user/analytics");
      expect(res.body.analytics).toMatchObject({ total: 0, participationRate: 0 });
    });

    it("restricts delete-all to super admins", async () => {
      const reader = await loginAs({ studentid: "R-1", readUsers: true });
      expect((await reader.delete("/api/user")).status).toBe(403);

      await superAgent.post("/api/user").send(buildUser());
      const res = await superAgent.delete("/api/user");
      expect(res.status).toBe(200);
      expect(res.body.deletedCount).toBe(1);
    });
  });
});
