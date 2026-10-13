import Joi from "joi";
import { badRequest } from "../utils/errors.js";

/**
 * Validates `input` against `schema`, returning the converted value or
 * throwing a 400 AppError whose message is the first validation problem.
 */
export const validate = (schema, input) => {
  const { error, value } = schema.validate(input ?? {}, {
    abortEarly: false,
    stripUnknown: true,
    errors: { wrap: { label: false } },
  });
  if (error) {
    throw badRequest(
      error.details[0].message,
      error.details.map((d) => ({ field: d.path.join("."), message: d.message })),
    );
  }
  return value;
};

// Student IDs end up in URLs, so they may not contain "/" (use "-") or
// other URL-breaking characters. Inner spaces are tolerated because some
// existing records have them.
export const studentIdSchema = Joi.string()
  .trim()
  .min(1)
  .max(20)
  .pattern(/^[^/\\?#%]+$/)
  .messages({
    "string.pattern.base":
      "Student ID may not contain '/', '\\', '?', '#' or '%'. Use a hyphen (-) instead.",
  });

export const parseStudentIdParam = (raw) =>
  validate(Joi.object({ id: studentIdSchema.required().label("Student ID") }), {
    id: raw,
  }).id;

export const parseNumericIdParam = (raw) =>
  validate(
    Joi.object({ id: Joi.number().integer().positive().required().label("ID") }),
    { id: raw },
  ).id;
