import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  port: parseInt(process.env.PORT ?? "4000", 10),
  mongodbUri: required("MONGODB_URI"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  // Per client IP. A whole warehouse behind one public IP (phones + portal)
  // shares it, so production may need more than the default.
  rateLimitPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE ?? "300", 10),
};
