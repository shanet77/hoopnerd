import { Pool } from "pg";
import * as path from "path";

// Load env from monorepo root .env. Node built-in (no dotenv dep).
// No-op when the file is absent (e.g. production, where env comes from the
// orchestrator) and never overrides vars already set.
try {
  process.loadEnvFile(path.resolve(__dirname, "../../..", ".env"));
} catch {
  // .env not present — rely on ambient environment
}

const dbName =
  process.env.NODE_ENV === "test"
    ? "connectaball_test"
    : process.env.DB_NAME || "connectaball_dev";

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
    })
  : new Pool({
      user: process.env.DB_USER || "postgres",
      host: process.env.DB_HOST || "localhost",
      database: dbName,
      password: process.env.DB_PASSWORD || "postgres",
      port: parseInt(process.env.DB_PORT || "5432"),
    });

export { runMigrations } from "./migrate";
export { PgRepository } from "./PgRepository";
export { InMemoryRepository } from "./InMemoryRepository";
export type {
  Repository,
  SoloRunRecord,
  SoloRunRecordResult,
} from "./repository";

export default pool;
