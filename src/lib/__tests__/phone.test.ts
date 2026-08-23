import { describe, expect, it } from "vitest";
import { normalizePhone, parseRecipients } from "@/lib/phone";

describe("normalizePhone", () => {
  it("accepts valid E.164", () => {
    expect(normalizePhone("+221771234567")).toBe("+221771234567");
  });
  it("strips spaces, dashes, parentheses and dots", () => {
    expect(normalizePhone("+1 (415) 555-01.99")).toBe("+14155550199");
  });
  it("converts 00 prefix to +", () => {
    expect(normalizePhone("00221771234567")).toBe("+221771234567");
  });
  it("rejects numbers without international prefix", () => {
    expect(normalizePhone("0771234567")).toBeNull();
    expect(normalizePhone("771234567")).toBeNull();
  });
  it("rejects garbage", () => {
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("+12")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
  it("rejects too-long numbers", () => {
    expect(normalizePhone("+1234567890123456")).toBeNull();
  });
});

describe("parseRecipients", () => {
  it("parses newline and comma separated lists", () => {
    const parsed = parseRecipients("+221771234567\n+14155550199, +962791234567");
    expect(parsed.valid).toHaveLength(3);
    expect(parsed.invalid).toHaveLength(0);
  });
  it("dedupes recipients", () => {
    const parsed = parseRecipients("+221771234567\n+221 77 123 45 67");
    expect(parsed.valid).toEqual(["+221771234567"]);
  });
  it("collects invalid entries", () => {
    const parsed = parseRecipients("+221771234567\nnot-a-number");
    expect(parsed.valid).toHaveLength(1);
    expect(parsed.invalid).toEqual(["not-a-number"]);
  });
});
