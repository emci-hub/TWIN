import { describe, it, expect } from "vitest";
import { resolveSsl } from "./db.js";

describe("resolveSsl", () => {
  it("returns undefined for a plain local connection string with no sslmode", () => {
    expect(resolveSsl("postgres://user:pass@localhost:5432/mydb")).toBeUndefined();
  });
  it("returns undefined when sslmode=disable is explicit", () => {
    expect(resolveSsl("postgres://user:pass@localhost:5432/mydb?sslmode=disable")).toBeUndefined();
  });
  it("returns rejectUnauthorized: false for sslmode=require (the Supabase pooler case)", () => {
    expect(resolveSsl("postgresql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require")).toEqual({ rejectUnauthorized: false });
  });
  it("returns rejectUnauthorized: false for other non-disable sslmodes too", () => {
    expect(resolveSsl("postgres://user:pass@host:5432/mydb?sslmode=verify-full")).toEqual({ rejectUnauthorized: false });
  });
  it("does not throw on a malformed connection string — just returns undefined", () => {
    expect(resolveSsl("not a url at all")).toBeUndefined();
  });
});
