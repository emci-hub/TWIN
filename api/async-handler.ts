// Express 4 does not catch rejected promises thrown out of an async route
// handler — an unhandled DB/provider error would otherwise just hang the
// request with nothing in the logs. Every async route in server.ts is
// wrapped with this so errors always reach the global error-handling
// middleware (which logs them and returns a real response) instead of
// disappearing. See docs/BUILD.md Phase 7: "basic error logging."

import type { NextFunction, Request, RequestHandler, Response } from "express";

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
