export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  host: process.env.HOST || "0.0.0.0",
  logLevel: process.env.LOG_LEVEL || "info",

  livekit: {
    apiKey: process.env.LIVEKIT_API_KEY || "",
    apiSecret: process.env.LIVEKIT_API_SECRET || "",
    url: process.env.LIVEKIT_URL || "",
  },

  auth: {
    apiKey: process.env.API_KEY || "dev-api-key",
    internalToken: process.env.INTERNAL_AUTH_TOKEN || "dev-internal-token",
  },
} as const;
