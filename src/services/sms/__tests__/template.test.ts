import { describe, expect, it } from "vitest";
import { getJsonPath, listTemplateVars, renderTemplate } from "@/services/sms/template";

describe("renderTemplate", () => {
  const vars = {
    to: "+221771234567",
    message: 'Hello "world"\nline2',
    from: "MyBrand",
    sender: "MyBrand",
    apiKey: "sk-123",
  };

  it("replaces {{to}}, {{message}} and {{from}}", () => {
    const out = renderTemplate('{"to":"{{to}}","body":"{{message}}","from":"{{from}}"}', vars, "json");
    const parsed = JSON.parse(out);
    expect(parsed.to).toBe("+221771234567");
    expect(parsed.body).toBe('Hello "world"\nline2'); // JSON-escaped correctly
    expect(parsed.from).toBe("MyBrand");
  });

  it("supports arbitrary provider field names (no hardcoding)", () => {
    const out = renderTemplate(
      '{"recipient":"{{to}}","text":"{{message}}","originator":"{{sender}}"}',
      vars,
      "json",
    );
    const parsed = JSON.parse(out);
    expect(parsed.recipient).toBe("+221771234567");
    expect(parsed.originator).toBe("MyBrand");
  });

  it("url-encodes values in form mode", () => {
    const out = renderTemplate("to={{to}}&text={{message}}", vars, "form");
    expect(out).toContain("to=%2B221771234567");
    expect(out).toContain("Hello%20%22world%22%0Aline2");
  });

  it("leaves unknown variables untouched (whitelist)", () => {
    expect(renderTemplate("{{to}} {{evil}} {{constructor}}", vars, "raw")).toBe(
      "+221771234567 {{evil}} {{constructor}}",
    );
  });

  it("substitutes missing variables with empty string", () => {
    expect(renderTemplate("[{{country}}]", vars, "raw")).toBe("[]");
  });

  it("never executes code (data-only)", () => {
    const out = renderTemplate('{"x":"{{message}}"}', { message: '"};process.exit(1);//' }, "json");
    expect(() => JSON.parse(out)).not.toThrow(); // stays a valid JSON string
    expect(JSON.parse(out).x).toBe('"};process.exit(1);//');
  });
});

describe("listTemplateVars", () => {
  it("lists referenced variables", () => {
    expect(listTemplateVars("{{to}} {{ message }} {{to}}")).toEqual(["to", "message"]);
  });
});

describe("getJsonPath", () => {
  const obj = { message_id: "abc", data: { id: "xyz", state: "sent" }, list: [{ id: 7 }] };
  it("reads $.field", () => {
    expect(getJsonPath(obj, "$.message_id")).toBe("abc");
  });
  it("reads nested $.data.id", () => {
    expect(getJsonPath(obj, "$.data.id")).toBe("xyz");
    expect(getJsonPath(obj, "$.data.state")).toBe("sent");
  });
  it("reads array indices", () => {
    expect(getJsonPath(obj, "$.list[0].id")).toBe(7);
    expect(getJsonPath(obj, "$.list.0.id")).toBe(7);
  });
  it("returns undefined for missing paths", () => {
    expect(getJsonPath(obj, "$.nope.deep")).toBeUndefined();
    expect(getJsonPath(null, "$.x")).toBeUndefined();
  });
});
