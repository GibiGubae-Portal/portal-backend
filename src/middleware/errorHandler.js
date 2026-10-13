import { isProduction } from "../config/env.js";
import { notFound, toErrorResponse } from "../utils/errors.js";

export function notFoundHandler(req, _res, next) {
  next(notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  const { status, body } = toErrorResponse(err, {
    exposeInternal: !isProduction(),
  });

  if (status >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }

  if (res.headersSent) return;
  res.status(status).json(body);
}
