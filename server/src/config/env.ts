import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z
    .string()
    .default("3000")
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().positive()),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url({ message: "DATABASE_URL must be a valid URL" }),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  UPLOADS_DIR: z.string().optional(),
  BCRYPT_ROUNDS: z
    .string()
    .default("12")
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(8).max(15)),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const [key, issues] of Object.entries(parsed.error.flatten().fieldErrors)) {
    console.error(`  ${key}: ${issues?.join(", ")}`);
  }
  process.exit(1);
}

const data = parsed.data;

export const env = {
  port: data.PORT,
  nodeEnv: data.NODE_ENV,
  databaseUrl: data.DATABASE_URL,
  jwtSecret: data.JWT_SECRET,
  jwtExpiresIn: data.JWT_EXPIRES_IN,
  corsOrigin: data.CORS_ORIGIN,
  bcryptRounds: data.BCRYPT_ROUNDS,
  resendApiKey: data.RESEND_API_KEY,
  resendFrom: data.RESEND_FROM,
  isProd: data.NODE_ENV === "production",
} as const;
