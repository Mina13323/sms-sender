import { describe, expect, it } from "vitest";
import {
  mapTwilioStatus,
  normalizeTwilioBaseUrl,
} from "@/services/sms/providers/twilio-provider";

describe("normalizeTwilioBaseUrl", () => {
  it("defaults when empty", () => {
    expect(normalizeTwilioBaseUrl(undefined)).toBe("https://api.twilio.com");
    expect(normalizeTwilioBaseUrl("")).toBe("https://api.twilio.com");
    expect(normalizeTwilioBaseUrl("   ")).toBe("https://api.twilio.com");
  });
  it("strips trailing slashes", () => {
    expect(normalizeTwilioBaseUrl("https://api.twilio.com/")).toBe("https://api.twilio.com");
    expect(normalizeTwilioBaseUrl("https://api.twilio.com///")).toBe("https://api.twilio.com");
  });
  it("strips an accidental /2010-04-01 version path (the HTTP 404 cause)", () => {
    expect(normalizeTwilioBaseUrl("https://api.twilio.com/2010-04-01")).toBe(
      "https://api.twilio.com",
    );
    expect(normalizeTwilioBaseUrl("https://api.twilio.com/2010-04-01/")).toBe(
      "https://api.twilio.com",
    );
    expect(normalizeTwilioBaseUrl("https://api.twilio.com/2010-04-01/Accounts")).toBe(
      "https://api.twilio.com",
    );
  });
  it("keeps legitimate custom hosts (e.g. regional/edge)", () => {
    expect(normalizeTwilioBaseUrl("https://api.dublin.ie1.twilio.com")).toBe(
      "https://api.dublin.ie1.twilio.com",
    );
  });
});

describe("mapTwilioStatus", () => {

  it("maps queued/accepted/scheduled to submitted", () => {
    expect(mapTwilioStatus("queued")).toBe("submitted");
    expect(mapTwilioStatus("accepted")).toBe("submitted");
    expect(mapTwilioStatus("scheduled")).toBe("submitted");
  });
  it("maps sent/sending to sent", () => {
    expect(mapTwilioStatus("sent")).toBe("sent");
    expect(mapTwilioStatus("sending")).toBe("sent");
  });
  it("maps delivered", () => {
    expect(mapTwilioStatus("delivered")).toBe("delivered");
  });
  it("maps undelivered and failed", () => {
    expect(mapTwilioStatus("undelivered")).toBe("undelivered");
    expect(mapTwilioStatus("failed")).toBe("failed");
  });
  it("never claims delivery for unknown statuses", () => {
    expect(mapTwilioStatus(undefined)).toBe("submitted");
    expect(mapTwilioStatus("weird")).toBe("submitted");
  });
});
