import { describe, expect, it } from "vitest";
import { mapTwilioStatus } from "@/services/sms/providers/twilio-provider";

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
