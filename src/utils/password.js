import { promisify } from "node:util";
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

// Stored format: "<hex hash>.<hex salt>"
export const hashPassword = async (password) => {
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("Password must be a non-empty string");
  }
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return `${derived.toString("hex")}.${salt}`;
};

/** Returns false (never throws) for malformed input or stored values. */
export const verifyPassword = async (storedPassword, suppliedPassword) => {
  if (
    typeof storedPassword !== "string" ||
    typeof suppliedPassword !== "string" ||
    suppliedPassword.length === 0
  ) {
    return false;
  }

  const [hashHex, salt] = storedPassword.split(".");
  if (!hashHex || !salt || !/^[0-9a-f]+$/i.test(hashHex)) return false;

  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== KEY_LENGTH) return false;

  const derived = await scryptAsync(suppliedPassword, salt, KEY_LENGTH);
  return timingSafeEqual(derived, expected);
};

// Pre-computed hash used to keep login timing constant for unknown accounts.
let dummyHash;
export const getDummyHash = async () => {
  dummyHash ??= await hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
};
