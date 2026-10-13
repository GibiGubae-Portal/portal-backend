import { describe, expect, it } from "vitest";
import { parseNumericIdParam, parseStudentIdParam, validate } from "../../src/validators/common.js";
import { userQuerySchema, userSchema } from "../../src/validators/user.validator.js";
import { registerAdminSchema, updateAdminSchema } from "../../src/validators/admin.validator.js";

const baseUser = {
  studentid: "UGR-1234-16",
  firstname: " Abebe ",
  lastname: "Tesfaye",
  gender: "Male",
  phone: "0911223344",
  birthdate: "2000-01-01",
  nationality: "Ethiopian",
  universityusers: {
    departmentname: "IS",
    sponsorshiptype: "Government",
    participation: "None",
    batch: 2016,
    role: "Member",
  },
};

describe("userSchema", () => {
  it("normalizes the legacy 'not_specified' enum spelling", () => {
    const value = validate(userSchema, {
      ...baseUser,
      region: "not_specified",
      mothertongue: "not_specified",
    });
    expect(value.region).toBe("Not_Specified");
    expect(value.mothertongue).toBe("Not_Specified");
  });

  it("accepts the canonical 'Not_Specified' spelling (edit flow)", () => {
    const value = validate(userSchema, { ...baseUser, region: "Not_Specified" });
    expect(value.region).toBe("Not_Specified");
  });

  it("applies defaults and trims text", () => {
    const value = validate(userSchema, baseUser);
    expect(value.firstname).toBe("Abebe");
    expect(value.middlename).toBe("");
    expect(value.baptismalname).toBe("None");
    expect(value.useremail).toBeNull();
    expect(value.universityusers.mealcard).toBe("not_specified");
    expect(value.birthdate).toBeInstanceOf(Date);
  });

  it("turns blank/null optional fields into their defaults", () => {
    const value = validate(userSchema, {
      ...baseUser,
      middlename: null,
      useremail: "",
      telegram_username: null,
      universityusers: { ...baseUser.universityusers, confessionfather: "", emergencyphone: "" },
    });
    expect(value.middlename).toBe("");
    expect(value.useremail).toBeNull();
    expect(value.telegram_username).toBe("not_specified");
    expect(value.universityusers.confessionfather).toBe("not_specified");
    expect(value.universityusers.emergencyphone).toBeNull();
  });

  it("strips unknown and server-owned fields", () => {
    const value = validate(userSchema, {
      ...baseUser,
      userid: 99,
      createdBy: "hacker",
      createdAt: "2020-01-01",
    });
    expect(value).not.toHaveProperty("userid");
    expect(value).not.toHaveProperty("createdBy");
  });

  it.each([
    ["slash in student id", { studentid: "UGR/1234/16" }],
    ["invalid email", { useremail: "not-an-email" }],
    ["future birthdate", { birthdate: "2999-01-01" }],
    ["bad gender", { gender: "Other" }],
    ["bad phone", { phone: "call me" }],
    ["missing university info", { universityusers: undefined }],
  ])("rejects %s", (_label, override) => {
    expect(() => validate(userSchema, { ...baseUser, ...override })).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });
});

describe("userQuerySchema", () => {
  it("coerces paging and booleans with sane defaults", () => {
    const q = validate(userQuerySchema, { page: "2", cafeteriaaccess: "true", batch: "" });
    expect(q).toMatchObject({ page: 2, limit: 10, cafeteriaaccess: true, sortOrder: "desc" });
    expect(q.batch).toBeUndefined();
  });

  it("rejects out-of-range limits and unknown enum values", () => {
    expect(() => validate(userQuerySchema, { limit: "1000" })).toThrow();
    expect(() => validate(userQuerySchema, { gender: "Robot" })).toThrow();
    expect(() => validate(userQuerySchema, { sortBy: "adminpassword" })).toThrow();
  });
});

describe("admin schemas", () => {
  it("requires an 8+ character password on register", () => {
    expect(() =>
      validate(registerAdminSchema, {
        studentid: "A1",
        adminusername: "x",
        adminpassword: "short",
        roleName: "Viewer",
      }),
    ).toThrow(/at least 8/);
  });

  it("treats an empty password on update as 'unchanged'", () => {
    const value = validate(updateAdminSchema, { adminusername: "New", adminpassword: "" });
    expect(value.adminpassword).toBeUndefined();
  });
});

describe("id params", () => {
  it("parses valid ids and rejects bad ones", () => {
    expect(parseStudentIdParam(" UGR-1-16 ")).toBe("UGR-1-16");
    expect(() => parseStudentIdParam("a/b")).toThrow();
    expect(parseStudentIdParam("UGR -1347-17")).toBe("UGR -1347-17"); // legacy record
    expect(parseNumericIdParam("12")).toBe(12);
    expect(() => parseNumericIdParam("abc")).toThrow();
    expect(() => parseNumericIdParam("-1")).toThrow();
  });
});
