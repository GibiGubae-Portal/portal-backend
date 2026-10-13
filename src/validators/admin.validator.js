import Joi from "joi";
import { studentIdSchema } from "./common.js";

export const PERMISSION_KEYS = [
  "readUsers",
  "registerUsers",
  "editAnyUser",
  "editSpecificUsers",
  "removeAnyUsers",
  "removeSpecificUsers",
];

export const permissionsSchema = Joi.object(
  Object.fromEntries(PERMISSION_KEYS.map((key) => [key, Joi.boolean()])),
);

// Passwords are never trimmed: what the admin types is what gets hashed.
const passwordSchema = Joi.string().min(8).max(128);

export const loginSchema = Joi.object({
  studentid: Joi.string().trim().min(1).max(20).required(),
  adminpassword: Joi.string().min(1).max(128).required(),
});

export const registerAdminSchema = Joi.object({
  studentid: studentIdSchema.required(),
  adminusername: Joi.string().trim().min(1).max(50).required(),
  adminpassword: passwordSchema.required(),
  roleName: Joi.string().trim().min(1).max(50).required(),
  permissions: permissionsSchema,
});

export const updateAdminSchema = Joi.object({
  studentid: studentIdSchema,
  adminusername: Joi.string().trim().min(1).max(50),
  adminpassword: passwordSchema.empty(""),
  permissions: permissionsSchema,
}).min(1);
