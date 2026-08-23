import {
  ProviderHealthResult,
  SendSmsInput,
  SendSmsResult,
  SmsProvider,
} from "../sms-provider";

/**
 * Development-only provider that simulates a successful submission.
 * Never logs recipients or message bodies.
 */
export class MockProvider implements SmsProvider {
  async sendSms(_input: SendSmsInput): Promise<SendSmsResult> {
    void _input;
    await new Promise((resolve) => setTimeout(resolve, 150));
    return {
      success: true,
      providerMessageId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: "submitted",
    };
  }

  async validateConfiguration(): Promise<ProviderHealthResult> {
    return { ok: true, message: "Mock provider is always available (development only)." };
  }
}
