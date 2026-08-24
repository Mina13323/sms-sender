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

const HEADER_NAME = /^[A-Za-z0-9-]{1,64}$/;

export const httpConfigSchema = z.object({
  method: z.enum(["POST", "GET"]).default("POST"),
  authType: z
    .enum(["NONE", "API_KEY_HEADER", "API_KEY_QUERY", "BEARER", "BASIC", "CUSTOM_HEADER"])
    .default("NONE"),
  authName: z.string().trim().max(64).optional().or(z.literal("")).transform((v) => v || undefined),
  authValueTemplate: z.string().trim().max(300).optional().or(z.literal("")).transform((v) => v || undefined),
  contentType: z
    .enum(["application/json", "application/x-www-form-urlencoded"])
    .default("application/json"),
  headers: z
    .record(z.string().regex(HEADER_NAME, "Invalid header name"), z.string().max(500))
    .refine((h) => Object.keys(h).length <= 20, "Too many headers")
    .optional(),
  queryParams: z
    .record(z.string().min(1).max(64), z.string().max(500))
    .refine((q) => Object.keys(q).length <= 20, "Too many query parameters")
    .optional(),
  bodyTemplate: z.string().max(5000).optional().or(z.literal("")).transform((v) => v || undefined),
  timeoutMs: z.number().int().min(1000).max(60000).default(15000),
  successCodes: z.array(z.number().int().min(100).max(599)).max(10).default([200, 201, 202]),
  messageIdPath: z.string().trim().max(200).optional().or(z.literal("")).transform((v) => v || undefined),
  statusPath: z.string().trim().max(200).optional().or(z.literal("")).transform((v) => v || undefined),
});
export type HttpConfigData = z.infer<typeof httpConfigSchema>;

export const providerCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  type: z.enum(["TWILIO", "MOCK", "HTTP"]),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  priority: z.number().int().min(1).max(1000).default(100),
  apiBaseUrl: z
    .union([z.string().trim().url().max(500), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" ? null : v)),
  accountSid: z.string().trim().max(200).optional(),

  apiKey: z.string().trim().max(500).optional(),
  apiSecret: z.string().trim().max(500).optional(),
  senderId: z.string().trim().max(50).nullable().optional(),
  config: httpConfigSchema.optional(),
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
