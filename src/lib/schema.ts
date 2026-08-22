import { z } from "zod";

export const leadFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  phone: z
    .string()
    .min(10, "Phone number is too short")
    .max(20, "Phone number is too long")
    .regex(/^\+?[1-9]\d{1,14}$/, "Please enter a valid E.164 phone number (e.g. +1234567890)"),
  message: z.string().min(10, "Message must be at least 10 characters").max(1000, "Message is too long"),
  smsConsent: z.boolean().refine((val) => val === true, {
    message: "You must consent to receive SMS messages",
  }),
});

export type LeadFormData = z.infer<typeof leadFormSchema>;
