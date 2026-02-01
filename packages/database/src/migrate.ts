import pool from './index';

async function migrate() {
  try {
    // Create tables as defined in README
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

    console.log('Database schema created successfully!');
  } catch (error) {
    console.error('Error during migration:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
