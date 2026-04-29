import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as path from "path";

const rootEnvPath = path.resolve(__dirname, "../../..", ".env");
dotenv.config({ path: rootEnvPath });

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

export default pool;
