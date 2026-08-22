import { SmsProvider, SendSmsInput, SendSmsResult } from "../sms-provider";

export class TwilioProvider implements SmsProvider {
  async sendMessage(input: SendSmsInput): Promise<SendSmsResult> {
    const accountSid = process.env.SMS_API_KEY; // Actually we expect TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN usually, but following the generic structure:
    const from = process.env.SMS_FROM;
    
    // For twilio, we can use the basic auth with SMS_API_KEY as the token if we assume SMS_PROVIDER_USER is account sid
    // We'll stick to a standard generic fetch to the Twilio REST API for zero-dependency implementation.
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.SMS_API_KEY; // Using API_KEY as the auth token

    if (!twilioSid || !twilioAuthToken || !from) {
      console.error("Missing Twilio credentials in environment variables.");
      return { success: false, error: "Configuration error" };
    }

    try {
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": "Basic " + Buffer.from(`${twilioSid}:${twilioAuthToken}`).toString("base64")
        },
        body: new URLSearchParams({
          To: input.to,
          From: from,
          Body: input.body
        }).toString()
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Twilio API error:", data.message || "Unknown error");
        return { success: false, error: "Provider error" };
      }

      return {
        success: true,
        providerMessageId: data.sid,
        status: data.status
      };
    } catch (error) {
      console.error("Exception during Twilio API call.");
      return { success: false, error: "Network error" };
    }
  }
}
