import { describe, expect, it } from "vitest";
import { describeServerError, toErrorResponse } from "@/lib/server-errors";

describe("describeServerError", () => {
  it("flags a missing/malformed APP_ENCRYPTION_KEY", () => {
    const r = describeServerError(new Error("APP_ENCRYPTION_KEY is not configured"));
    expect(r.status).toBe(500);
    expect(r.message).toMatch(/APP_ENCRYPTION_KEY/i);
  });

  it("flags an un-applied schema (missing table/column)", () => {
    const r = describeServerError(new Error('relation "providers" does not exist'));
    expect(r.status).toBe(500);
    expect(r.message).toMatch(/migrat/i);
  });

  it("flags a missing DATABASE_URL", () => {
    const r = describeServerError(new Error("DATABASE_URL is not configured"));
    expect(r.message).toMatch(/DATABASE_URL/i);
  });

  it("falls back to a generic message for unknown errors", () => {
    const r = describeServerError(new Error("something totally unexpected"));
    expect(r.status).toBe(500);
    expect(r.message).toMatch(/Something went wrong/i);
  });

  it("handles non-Error throws", () => {
    const r = describeServerError("a string error");
    expect(r.status).toBe(500);
    expect(r.message).toBeTruthy();
  });
});

describe("toErrorResponse", () => {
  it("returns a NextResponse with the mapped message", async () => {
    const res = toErrorResponse(new Error("APP_ENCRYPTION_KEY must be 32 bytes"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/APP_ENCRYPTION_KEY/i);
  });
});
