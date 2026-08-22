export interface SendSmsInput {
  to: string;
  body: string;
}

export interface SendSmsResult {
  success: boolean;
  providerMessageId?: string;
  status?: string;
  error?: string;
}

export interface SmsProvider {
  sendMessage(input: SendSmsInput): Promise<SendSmsResult>;
}

import { MockProvider } from "./providers/mock-provider";
import { TwilioProvider } from "./providers/twilio-provider";

export function getSmsProvider(): SmsProvider {
  const providerType = process.env.SMS_PROVIDER || "mock";
  
  if (providerType === "twilio") {
    return new TwilioProvider();
  }
  
  return new MockProvider();
}
