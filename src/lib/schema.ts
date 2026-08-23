import { z } from "zod";

// ---------- auth ----------

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required").max(200),
});
export type LoginData = z.infer<typeof loginSchema>;

// ---------- SMS send ----------

export const sendSmsSchema = z.object({
  recipients: z
    .string()
    .min(1, "Enter at least one recipient")
    .max(4000, "Recipient list is too long"),
  message: z.string().min(1, "Message is required").max(1600, "Message is too long"),
  routeId: z.string().max(100).optional().nullable(),
  consent: z.boolean().refine((v) => v === true, {
    message: "You must confirm you have consent to message the recipients",
  }),
});
export type SendSmsData = z.infer<typeof sendSmsSchema>;

// ---------- users (admin) ----------

const passwordField = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(200);

export const userCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2).max(100),
  password: passwordField,
  role: z.enum(["SUPER_ADMIN", "USER"]).default("USER"),
});

export const userUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  role: z.enum(["SUPER_ADMIN", "USER"]).optional(),
  isActive: z.boolean().optional(),
  password: passwordField.optional(),
});

// ---------- providers (admin) ----------

export const providerCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  type: z.enum(["TWILIO", "MOCK"]),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  priority: z.number().int().min(1).max(1000).default(100),
  apiBaseUrl: z.string().trim().url().max(300).optional().or(z.literal("")).transform((v) => v || undefined),
  accountSid: z.string().trim().max(200).optional(),
  apiKey: z.string().trim().max(200).optional(),
  apiSecret: z.string().trim().max(200).optional(),
  senderId: z.string().trim().max(50).optional(),
});

export const providerUpdateSchema = providerCreateSchema.partial().omit({ type: true });

// ---------- routes (admin) ----------

export const routeCreateSchema = z.object({
  country: z.string().trim().min(2).max(80),
  countryCode: z
    .string()
    .trim()
    .regex(/^\+\d{1,4}$/, "Use a dial prefix like +221")
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
  carrier: z.string().trim().min(1).max(80),
  providerId: z.string().min(1),
  senderId: z.string().trim().max(50).optional().or(z.literal("")).transform((v) => v || undefined),
  pricePerSegment: z.number().min(0).max(10),
  currency: z.string().trim().length(3).toUpperCase().default("USD"),
  priority: z.number().int().min(1).max(1000).default(100),
  isActive: z.boolean().default(true),
});

export const routeUpdateSchema = routeCreateSchema.partial();

// ---------- settings (admin) ----------

export const settingsSchema = z.object({
  smsRatePerMinute: z.number().int().min(1).max(1000).optional(),
  smsMaxRecipients: z.number().int().min(1).max(100).optional(),
});
