import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as coreDomainSchema from "./core-domain-schema";
import * as schema from "./schema";
import * as transactionSchema from "./transaction-schema";

export const databaseClient = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

export const db = drizzle(databaseClient, {
  schema: { ...schema, ...coreDomainSchema, ...transactionSchema },
});
