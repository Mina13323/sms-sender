import { ProviderRuntimeConfig, SmsProvider } from "./sms-provider";
import { TwilioProvider } from "./providers/twilio-provider";
import { VonageProvider } from "./providers/vonage-provider";
import { MockProvider } from "./providers/mock-provider";
import { GenericHttpProvider } from "./providers/http-provider";

/**
 * Creates the adapter for a configured provider instance.
 *
 * Most providers need NO code changes: use the Generic HTTP / REST type and
 * configure endpoint/auth/templates from the Admin UI. Only providers with a
 * non-HTTP or highly specialized protocol need a dedicated adapter here.
 */
export function createProviderAdapter(config: ProviderRuntimeConfig): SmsProvider {
  switch (config.type) {
    case "TWILIO":
      return new TwilioProvider(config);
    case "VONAGE":
      return new VonageProvider(config);
    case "MOCK":
      return new MockProvider();
    case "HTTP":
      return new GenericHttpProvider(config);
    default: {
      const exhaustive: never = config.type;
      throw new Error(`Unsupported provider type: ${exhaustive}`);
    }
  }
}
