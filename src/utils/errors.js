export class AppError extends Error {
  constructor(message, statusCode = 500, details) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }
}

export const badRequest = (message, details) =>
  new AppError(message, 400, details);
export const unauthorized = (message = "Not authorized") =>
  new AppError(message, 401);
export const forbidden = (message = "Forbidden") => new AppError(message, 403);
export const notFound = (message = "Not found") => new AppError(message, 404);
export const conflict = (message) => new AppError(message, 409);

// Driver-level connection failures surface with these codes.
const NETWORK_ERROR_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
]);

const FIELD_LABELS = {
  studentid: "Student ID",
  phone: "Phone number",
  useremail: "Email",
  name: "Name",
};

const describeTarget = (meta) => {
  const target =
    meta?.target ?? meta?.driverAdapterError?.cause?.constraint?.fields;
  const fields = Array.isArray(target)
    ? target
    : typeof target === "string"
      ? [target]
      : [];
  return fields.map((field) => FIELD_LABELS[field] ?? field).join(", ");
};

/**
 * Maps any thrown value to `{ status, body }`. Known Prisma errors become
 * client errors with a readable message; unexpected errors never leak
 * internals in production.
 */
export const toErrorResponse = (err, { exposeInternal = false } = {}) => {
  if (err instanceof AppError) {
    return {
      status: err.statusCode,
      body: {
        success: false,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    };
  }

  // body-parser: malformed JSON / payload too large
  if (err?.type === "entity.parse.failed") {
    return {
      status: 400,
      body: { success: false, message: "Malformed JSON request body" },
    };
  }
  if (err?.type === "entity.too.large") {
    return {
      status: 413,
      body: { success: false, message: "Request body is too large" },
    };
  }

  switch (err?.code) {
    case "P2002": {
      const fields = describeTarget(err.meta);
      return {
        status: 409,
        body: {
          success: false,
          message: fields
            ? `A record with this ${fields} already exists`
            : "A record with these details already exists",
        },
      };
    }
    case "P2025":
    case "P2015":
      return {
        status: 404,
        body: { success: false, message: "Record not found" },
      };
    case "P2003":
    case "P2014":
      return {
        status: 409,
        body: { success: false, message: "Related record constraint failed" },
      };
    case "P2000":
      return {
        status: 400,
        body: { success: false, message: "A value is too long for its field" },
      };
    case "P2005":
    case "P2006":
    case "P2007":
    case "P2011":
    case "P2012":
      return {
        status: 400,
        body: { success: false, message: "Invalid data for a database field" },
      };
    default:
      break;
  }

  if (err?.name === "PrismaClientValidationError") {
    return {
      status: 400,
      body: { success: false, message: "Invalid request data" },
    };
  }

  if (
    (typeof err?.code === "string" && err.code.startsWith("P1")) ||
    NETWORK_ERROR_CODES.has(err?.code) ||
    NETWORK_ERROR_CODES.has(err?.cause?.code) ||
    err?.name === "PrismaClientInitializationError"
  ) {
    return {
      status: 503,
      body: {
        success: false,
        message: "Database is temporarily unavailable. Please try again.",
      },
    };
  }

  const status =
    Number.isInteger(err?.status) && err.status >= 400 && err.status < 600
      ? err.status
      : 500;

  return {
    status,
    body: {
      success: false,
      message:
        status < 500 || exposeInternal
          ? err?.message || "Unexpected error"
          : "Internal server error",
    },
  };
};
