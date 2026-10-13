import { describe, expect, it } from "vitest";
import { AppError, toErrorResponse } from "../../src/utils/errors.js";

describe("toErrorResponse", () => {
  it("passes AppError status and message through", () => {
    const { status, body } = toErrorResponse(new AppError("Nope", 403));
    expect(status).toBe(403);
    expect(body).toEqual({ success: false, message: "Nope" });
  });

  it("maps unique-constraint violations to 409 with the field name", () => {
    const { status, body } = toErrorResponse({
      code: "P2002",
      meta: { target: ["phone"] },
    });
    expect(status).toBe(409);
    expect(body.message).toContain("Phone number");
  });

  it("maps missing records to 404", () => {
    expect(toErrorResponse({ code: "P2025" }).status).toBe(404);
  });

  it("maps malformed JSON to 400", () => {
    expect(toErrorResponse({ type: "entity.parse.failed" }).status).toBe(400);
  });

  it("maps connection failures to 503", () => {
    expect(toErrorResponse({ code: "P1001" }).status).toBe(503);
    expect(toErrorResponse({ code: "ETIMEDOUT", name: "PrismaClientKnownRequestError" }).status).toBe(503);
  });

  it("hides internal messages unless exposeInternal is set", () => {
    const err = new Error("secret stack detail");
    expect(toErrorResponse(err).body.message).toBe("Internal server error");
    expect(
      toErrorResponse(err, { exposeInternal: true }).body.message,
    ).toBe("secret stack detail");
  });
});
