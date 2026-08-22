import { SmsProvider, SendSmsInput, SendSmsResult } from "../sms-provider";

export class MockProvider implements SmsProvider {
  async sendMessage(_input: SendSmsInput): Promise<SendSmsResult> {
    // We explicitly avoid logging the exact 'to' and 'body' to prevent PII leakage.
    console.log("MockProvider: Attempting to send SMS message.");
    
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    console.log("MockProvider: SMS sent successfully.");

    return {
      success: true,
      providerMessageId: `mock-${Date.now()}`,
      status: "sent"
    };
  }
}
