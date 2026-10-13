import prisma from "../config/prisma.js";
import { conflict, notFound } from "../utils/errors.js";
import { parseNumericIdParam, validate } from "../validators/common.js";
import {
  createRoleSchema,
  updateRoleSchema,
} from "../validators/role.validator.js";

const findRoleOr404 = async (id) => {
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) throw notFound("Role not found");
  return role;
};

export const createRole = async (req, res) => {
  const data = validate(createRoleSchema, req.body);

  const existing = await prisma.role.findUnique({ where: { name: data.name } });
  if (existing) throw conflict("A role with this name already exists");

  const role = await prisma.role.create({ data });
  res.status(201).json({
    success: true,
    message: "Role created successfully",
    data: role,
  });
};

export const getRoles = async (_req, res) => {
  const roles = await prisma.role.findMany({ orderBy: { id: "asc" } });
  res.status(200).json({ success: true, data: roles });
};

export const getRole = async (req, res) => {
  const role = await findRoleOr404(parseNumericIdParam(req.params.id));
  res.status(200).json({ success: true, data: role });
};

export const updateRole = async (req, res) => {
  const id = parseNumericIdParam(req.params.id);
  const changes = validate(updateRoleSchema, req.body);
  const role = await findRoleOr404(id);

  if (changes.name && changes.name !== role.name) {
    const clash = await prisma.role.findUnique({ where: { name: changes.name } });
    if (clash) throw conflict("A role with this name already exists");
  }

  const updated = await prisma.role.update({ where: { id }, data: changes });
  res.status(200).json({
    success: true,
    message: "Role updated successfully",
    data: updated,
  });
};

export const deleteRole = async (req, res) => {
  const id = parseNumericIdParam(req.params.id);
  await findRoleOr404(id);
  await prisma.role.delete({ where: { id } });
  res.status(200).json({ success: true, message: "Role deleted successfully" });
};
