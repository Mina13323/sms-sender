import { NextRequest, NextResponse } from "next/server";
import { leadFormSchema } from "@/lib/schema";
import { getSmsProvider } from "@/services/sms/sms-provider";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate the request body
    const result = leadFormSchema.safeParse(body);

    if (!result.success) {
      console.warn("SMS Request failed validation.");
      return NextResponse.json(
        { success: false, message: "Invalid input. Please check your form." },
        { status: 400 }
      );
    }

    const { phone, message } = result.data;

    // We do NOT store anything in the database as per requirement.
    // We also do not log PII (no phone, no name, no message).

    const provider = getSmsProvider();
    
    const smsResult = await provider.sendMessage({
      to: phone,
      body: message,
    });

    if (!smsResult.success) {
      console.error("SMS Provider returned an error.");
      return NextResponse.json(
        { success: false, message: "We could not send your message. Please try again." },
        { status: 500 }
      );
    }

    console.log("SMS request completed successfully.");
    return NextResponse.json(
      { success: true, message: "Your message has been sent successfully." },
      { status: 200 }
    );
  } catch {
    console.error("An unexpected error occurred during SMS request processing.");
    return NextResponse.json(
      { success: false, message: "We could not send your message. Please try again." },
      { status: 500 }
    );
  }
}
