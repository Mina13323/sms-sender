import { describe, expect, it } from "vitest";
import { providerUpdateSchema } from "@/lib/schema";

describe("providerUpdateSchema apiBaseUrl clearing", () => {
  it("omitted field keeps existing value (undefined)", () => {
    const parsed = providerUpdateSchema.parse({ name: "Twilio" });
    expect(parsed.apiBaseUrl).toBeUndefined();
  });
  it("empty string clears the override (null)", () => {
    const parsed = providerUpdateSchema.parse({ apiBaseUrl: "" });
    expect(parsed.apiBaseUrl).toBeNull();
  });
  it("explicit null clears the override", () => {
    const parsed = providerUpdateSchema.parse({ apiBaseUrl: null });
    expect(parsed.apiBaseUrl).toBeNull();
  });
  it("valid URL is accepted", () => {
    const parsed = providerUpdateSchema.parse({ apiBaseUrl: "https://api.twilio.com" });
    expect(parsed.apiBaseUrl).toBe("https://api.twilio.com");
  });
  it("invalid URL is rejected", () => {
    expect(providerUpdateSchema.safeParse({ apiBaseUrl: "not-a-url" }).success).toBe(false);
  });
});
