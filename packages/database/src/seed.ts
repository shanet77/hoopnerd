import * as fs from 'fs';
import * as path from 'path';
import * as csv from 'csv-parser';
import pool from './index';
import { ingestTransactions, ingestOffseasonTransactions } from './ingestTransactions';
import { splitTeamName } from './teamName';

const waitForDatabase = async (retries = 10, delayMs = 3000) => {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      if (attempt === retries) throw error;
      console.log(`Database not ready (attempt ${attempt}/${retries}). Retrying...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
};

const hasSeededData = async (): Promise<boolean> => {
  const tableResult = await pool.query(`SELECT to_regclass('public.players') AS table_name`);
  if (!tableResult.rows[0]?.table_name) return false;

  const countResult = await pool.query(`SELECT COUNT(*)::int AS count FROM players`);
  return (countResult.rows[0]?.count ?? 0) > 0;
};

// Function to ensure schema exists
async function ensureSchema() {
  try {
    // Create tables as defined in README with proper constraints
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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS solo_runs (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL,
        display_name VARCHAR(150) NOT NULL,
        streak_count INTEGER NOT NULL,
        end_reason VARCHAR(20) NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS solo_runs_streak_idx
      ON solo_runs (streak_count DESC);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS solo_runs_user_idx
      ON solo_runs (user_id, streak_count DESC);
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS solo_bests (
        user_id UUID PRIMARY KEY,
        display_name VARCHAR(150) NOT NULL,
        best_streak INTEGER NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS active_games (
        id TEXT NOT NULL,
        kind VARCHAR(10) NOT NULL,
        state JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id, kind)
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS active_games_kind_updated_at_idx
      ON active_games (kind, updated_at);
    `);

    console.log('Database schema ensured successfully!');
  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  }
}

const datasetsDir = path.resolve(__dirname, '../../../datasets');
const { getTeamName } = require(path.join(datasetsDir, 'team_abbreviation_map.js'));

// Function to seed the database from the player season CSV
async function seedDatabase() {
  try {
    await waitForDatabase();
    await ensureSchema();

    const alreadySeeded = await hasSeededData();
    if (alreadySeeded) {
      console.log('Database already seeded. Skipping CSV step.');
    } else {
      const file = 'player_season_info.csv';
      const filePath = path.join(datasetsDir, file);
      console.log(`Processing file: ${filePath}`);

      const results: any[] = [];

      await new Promise<void>((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csv.default())
          .on('data', (data: any) => results.push(data))
          .on('end', () => {
            console.log(`Parsed ${results.length} records from ${file}`);
            resolve();
          })
          .on('error', reject);
      });

      for (const row of results) {
        if (row.lg !== 'NBA') continue;

        const teamAbbreviation = String(row.team || '').toUpperCase();
        if (!teamAbbreviation) continue;

        const fullTeamName = getTeamName(teamAbbreviation);
        const { city, teamName } = splitTeamName(fullTeamName);
        const resolvedTeamName = teamName || fullTeamName;
        const resolvedCity = city || fullTeamName;
        const seasonYear = Number.parseInt(row.season, 10);

        if (!resolvedTeamName || !resolvedCity) {
          console.warn('Skipping row due to missing team info:', {
            season: row.season,
            lg: row.lg,
            team: row.team,
            player: row.player,
            player_id: row.player_id,
            resolvedTeamName,
            resolvedCity,
          });
          continue;
        }

        const teamResult = await pool.query(
          'INSERT INTO teams (team_name, city, abbreviation) VALUES ($1, $2, $3) ON CONFLICT (abbreviation) DO UPDATE SET team_name = EXCLUDED.team_name, city = EXCLUDED.city RETURNING id',
          [resolvedTeamName, resolvedCity, teamAbbreviation]
        );

        const teamId = teamResult.rows[0].id;

        const playerResult = await pool.query(
          'INSERT INTO players (player_name, position) VALUES ($1, $2) ON CONFLICT (player_name) DO UPDATE SET position = EXCLUDED.position RETURNING id',
          [row.player, row.pos]
        );

        const playerId = playerResult.rows[0].id;

        await pool.query(
          'INSERT INTO rosters (player_id, team_id, season_year) VALUES ($1, $2, $3) ON CONFLICT (player_id, team_id, season_year) DO UPDATE SET season_year = EXCLUDED.season_year',
          [playerId, teamId, seasonYear]
        );
      }

      console.log('CSV seeding completed successfully!');
    }

    console.log('Starting transaction ingestion...');
    await ingestTransactions(2026);

    console.log('Starting 2026 offseason ingestion...');
    await ingestOffseasonTransactions(2027);
  } catch (error) {
    console.error('Error during seeding:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedDatabase();
