import { describe, expect, it } from "vitest";
import { countSegments, detectEncoding } from "@/lib/segments";

describe("detectEncoding", () => {
  it("detects GSM-7 for plain English", () => {
    expect(detectEncoding("Hello world")).toBe("GSM-7");
  });
  it("detects UCS-2 for Arabic", () => {
    expect(detectEncoding("مرحبا")).toBe("UCS-2");
  });
  it("detects GSM-7 with extended chars", () => {
    expect(detectEncoding("Price: 5€ [today]")).toBe("GSM-7");
  });
});

describe("countSegments", () => {
  it("returns 0 segments for empty message", () => {
    expect(countSegments("").segments).toBe(0);
  });
  it("counts 1 segment for short GSM message", () => {
    const info = countSegments("Hello");
    expect(info.segments).toBe(1);
    expect(info.units).toBe(5);
  });
  it("counts 160 GSM chars as one segment", () => {
    expect(countSegments("a".repeat(160)).segments).toBe(1);
  });
  it("counts 161 GSM chars as two segments", () => {
    expect(countSegments("a".repeat(161)).segments).toBe(2);
  });
  it("uses 153 per segment when concatenated", () => {
    expect(countSegments("a".repeat(153 * 3)).segments).toBe(3);
    expect(countSegments("a".repeat(153 * 3 + 1)).segments).toBe(4);
  });
  it("counts extended GSM chars as two units", () => {
    // 80 euro signs = 160 septets -> 1 segment; 81 -> 2
    expect(countSegments("€".repeat(80)).segments).toBe(1);
    expect(countSegments("€".repeat(81)).segments).toBe(2);
  });
  it("counts 70 unicode chars as one segment", () => {
    expect(countSegments("م".repeat(70)).segments).toBe(1);
    expect(countSegments("م".repeat(71)).segments).toBe(2);
  });
  it("uses 67 per segment for concatenated unicode", () => {
    expect(countSegments("م".repeat(67 * 2)).segments).toBe(2);
    expect(countSegments("م".repeat(67 * 2 + 1)).segments).toBe(3);
  });
});
