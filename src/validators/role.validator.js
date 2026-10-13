import Joi from "joi";
import { PERMISSION_KEYS } from "./admin.validator.js";

const permissionFields = Object.fromEntries(
  PERMISSION_KEYS.map((key) => [key, Joi.boolean()]),
);

export const createRoleSchema = Joi.object({
  name: Joi.string().trim().min(1).max(50).required(),
  ...Object.fromEntries(
    PERMISSION_KEYS.map((key) => [key, Joi.boolean().default(false)]),
  ),
});

export const updateRoleSchema = Joi.object({
  name: Joi.string().trim().min(1).max(50),
  ...permissionFields,
}).min(1);
