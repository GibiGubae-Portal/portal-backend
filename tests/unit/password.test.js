import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/utils/password.js";

describe("password hashing", () => {
  it("verifies the original password and rejects others", async () => {
    const hash = await hashPassword("correct horse");
    expect(hash).toMatch(/^[0-9a-f]{128}\.[0-9a-f]{32}$/);
    expect(await verifyPassword(hash, "correct horse")).toBe(true);
    expect(await verifyPassword(hash, "correct horse ")).toBe(false);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });

  it("produces a different salt each time", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("returns false instead of throwing on malformed input", async () => {
    expect(await verifyPassword("plaintext", "plaintext")).toBe(false);
    expect(await verifyPassword("abc.def", "x")).toBe(false);
    expect(await verifyPassword(null, "x")).toBe(false);
    expect(await verifyPassword(await hashPassword("a"), "")).toBe(false);
  });

  it("rejects empty passwords when hashing", async () => {
    await expect(hashPassword("")).rejects.toThrow();
  });
});
