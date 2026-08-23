import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPrivateIp, validateOutboundUrl } from "@/lib/ssrf";

describe("isPrivateIp", () => {
  it("flags loopback, private and reserved IPv4", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata
      "0.0.0.0",
      "100.64.1.1",
      "224.0.0.1",
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });
  it("allows public IPv4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "41.82.0.10"]) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });
  it("flags private/link-local IPv6", () => {
    for (const ip of ["::1", "::", "fe80::1", "fc00::1", "fd12::1", "::ffff:192.168.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });
  it("allows public IPv6", () => {
    expect(isPrivateIp("2001:4860:4860::8888")).toBe(false);
  });
});

describe("validateOutboundUrl", () => {
  it("accepts public https URLs", () => {
    expect(validateOutboundUrl("https://api.example.com/v1/sms").ok).toBe(true);
  });
  it("rejects non-http protocols", () => {
    expect(validateOutboundUrl("ftp://api.example.com").ok).toBe(false);
    expect(validateOutboundUrl("file:///etc/passwd").ok).toBe(false);
  });
  it("rejects localhost and internal hostnames", () => {
    expect(validateOutboundUrl("https://localhost/sms").ok).toBe(false);
    expect(validateOutboundUrl("https://foo.localhost/sms").ok).toBe(false);
    expect(validateOutboundUrl("https://metadata.google.internal/x").ok).toBe(false);
    expect(validateOutboundUrl("https://service.internal/x").ok).toBe(false);
  });
  it("rejects private IP literals", () => {
    expect(validateOutboundUrl("https://127.0.0.1/sms").ok).toBe(false);
    expect(validateOutboundUrl("https://0.0.0.0/sms").ok).toBe(false);
    expect(validateOutboundUrl("https://192.168.1.10/sms").ok).toBe(false);
    expect(validateOutboundUrl("https://169.254.169.254/latest/meta-data").ok).toBe(false);
    expect(validateOutboundUrl("https://[::1]/sms").ok).toBe(false);
  });
  it("rejects URLs with embedded credentials", () => {
    expect(validateOutboundUrl("https://user:pass@api.example.com/sms").ok).toBe(false);
  });
  it("rejects invalid URLs", () => {
    expect(validateOutboundUrl("not a url").ok).toBe(false);
  });
});

describe("validateOutboundUrl with SMS_HTTP_ALLOW_LOCAL=1 (dev escape hatch)", () => {
  beforeEach(() => {
    vi.stubEnv("SMS_HTTP_ALLOW_LOCAL", "1");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows loopback targets only", () => {
    expect(validateOutboundUrl("http://127.0.0.1:4545/sms").ok).toBe(true);
    expect(validateOutboundUrl("http://localhost:4545/sms").ok).toBe(true);
    expect(validateOutboundUrl("http://[::1]:4545/sms").ok).toBe(true);
  });

  it("still rejects metadata, private ranges and internal hostnames", () => {
    expect(validateOutboundUrl("https://169.254.169.254/latest/meta-data").ok).toBe(false);
    expect(validateOutboundUrl("https://192.168.1.10/sms").ok).toBe(false);
    expect(validateOutboundUrl("https://10.0.0.5/sms").ok).toBe(false);
    expect(validateOutboundUrl("https://db.internal/sms").ok).toBe(false);
    expect(validateOutboundUrl("https://metadata.google.internal/x").ok).toBe(false);
  });
});

