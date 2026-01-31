"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var pg_1 = require("pg");
var dotenv = require("dotenv");
var path = require("path");
var rootEnvPath = path.resolve(__dirname, "../../..", ".env");
dotenv.config({ path: rootEnvPath });
var dbName = process.env.NODE_ENV === "test"
    ? "connectaball_test"
    : process.env.DB_NAME || "connectaball_dev";
var pool = process.env.DATABASE_URL
    ? new pg_1.Pool({
        connectionString: process.env.DATABASE_URL,
    })
    : new pg_1.Pool({
        user: process.env.DB_USER || "postgres",
        host: process.env.DB_HOST || "localhost",
        database: dbName,
        password: process.env.DB_PASSWORD || "postgres",
        port: parseInt(process.env.DB_PORT || "5432"),
    });
exports.default = pool;
