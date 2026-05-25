import pool from "./index";

/**
 * Run all database migrations idempotently.
 *
 * Every statement uses IF NOT EXISTS so this is safe to call
 * repeatedly on every deploy or API startup. No data is destroyed.
 */
export async function runMigrations(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS teams (
      id SERIAL PRIMARY KEY,
      team_name VARCHAR(100) NOT NULL,
      city VARCHAR(100) NOT NULL,
      abbreviation CHAR(3) UNIQUE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      id SERIAL PRIMARY KEY,
      player_name VARCHAR(150) NOT NULL,
      position VARCHAR(50),
      UNIQUE (player_name)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rosters (
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      season_year INTEGER NOT NULL,

      PRIMARY KEY (player_id, team_id, season_year)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stats_events (
      id SERIAL PRIMARY KEY,
      event_type VARCHAR(30) NOT NULL,
      player_name VARCHAR(150),
      team_name VARCHAR(120),
      season_year INTEGER,
      streak_count INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS stats_events_type_created_at_idx
    ON stats_events (event_type, created_at DESC);
  `);

  // Materialized view for player connection counts (used by CPU engine)
  await pool.query(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS player_connection_counts AS
    SELECT player_id, COUNT(DISTINCT teammate_id)::int AS connection_count
    FROM (
      SELECT r1.player_id, r2.player_id AS teammate_id
      FROM rosters r1
      JOIN rosters r2 ON r1.team_id = r2.team_id AND r1.season_year = r2.season_year
      WHERE r1.player_id != r2.player_id
    ) sub
    GROUP BY player_id;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS player_connection_counts_player_id_idx
    ON player_connection_counts (player_id);
  `);

  console.log("Database schema ensured (runMigrations).");
}

// CLI mode — run standalone, then close the pool
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log("Database schema created successfully!");
    })
    .catch((error) => {
      console.error("Error during migration:", error);
      process.exit(1);
    })
    .finally(() => pool.end());
}
