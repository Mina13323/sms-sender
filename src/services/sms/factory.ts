import { ProviderRuntimeConfig, SmsProvider } from "./sms-provider";
import { TwilioProvider } from "./providers/twilio-provider";
import { MockProvider } from "./providers/mock-provider";

/**
 * Creates the adapter for a configured provider instance.
 * To support a new provider protocol: implement an adapter and add it here
 * plus its form metadata in PROVIDER_TYPES (sms-provider.ts).
 */
export function createProviderAdapter(config: ProviderRuntimeConfig): SmsProvider {
  switch (config.type) {
    case "TWILIO":
      return new TwilioProvider(config);
    case "MOCK":
      return new MockProvider();
    default: {
      const exhaustive: never = config.type;
      throw new Error(`Unsupported provider type: ${exhaustive}`);
    }
  }
}
