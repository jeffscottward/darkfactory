import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { drizzle } from "drizzle-orm/node-postgres";

// The standalone CLI loads TypeScript through Jiti, which cannot evaluate the
// repository's public `.civet` schema export. This Node-only mirror contains no
// runtime binding or connection. The stale check and integration schema
// comparison keep its generated contract aligned with the production factory.
const toolingDatabase = drizzle.mock();

export const auth = betterAuth({
  baseURL: "https://darkfactory.localhost",
  secret: "schema-generation-only-secret-32-characters",
  trustedOrigins: ["https://darkfactory.localhost"],
  database: drizzleAdapter(toolingDatabase, {
    provider: "pg",
    schema: {},
    transaction: true,
  }),
  advanced: {
    useSecureCookies: true,
    disableCSRFCheck: false,
    disableOriginCheck: false,
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
  },
  user: {
    additionalFields: {
      role: {
        type: ["member", "admin"],
        required: true,
        input: false,
        returned: true,
        defaultValue: "member",
      },
      status: {
        type: ["active", "suspended", "deactivated"],
        required: true,
        input: false,
        returned: true,
        defaultValue: "active",
      },
    },
  },
});

export default auth;
