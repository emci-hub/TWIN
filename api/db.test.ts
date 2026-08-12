import { describe, it, expect } from "vitest";
import { resolveSsl, resolveConnectionString } from "./db.js";

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

describe("resolveConnectionString", () => {
  it("leaves a plain local connection string with no sslmode untouched", () => {
    expect(resolveConnectionString("postgres://user:pass@localhost:5432/mydb")).toBe(
      "postgres://user:pass@localhost:5432/mydb",
    );
  });
  it("leaves sslmode=disable untouched", () => {
    const input = "postgres://user:pass@localhost:5432/mydb?sslmode=disable";
    expect(resolveConnectionString(input)).toBe(input);
  });
  it("adds uselibpqcompat=true for sslmode=require (the Supabase pooler case)", () => {
    const result = resolveConnectionString(
      "postgresql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require",
    );
    const url = new URL(result);
    expect(url.searchParams.get("sslmode")).toBe("require");
    expect(url.searchParams.get("uselibpqcompat")).toBe("true");
  });
  it("does not duplicate uselibpqcompat if it's already set", () => {
    const result = resolveConnectionString(
      "postgres://user:pass@host:5432/mydb?sslmode=require&uselibpqcompat=true",
    );
    const url = new URL(result);
    expect(url.searchParams.getAll("uselibpqcompat")).toEqual(["true"]);
  });
  it("returns the original string unchanged if it's not a valid URL", () => {
    expect(resolveConnectionString("not a url at all")).toBe("not a url at all");
  });
});
