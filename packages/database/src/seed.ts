import * as fs from 'fs';
import * as path from 'path';
import * as csv from 'csv-parser';
import pool from './index';

// Function to run migrations first
async function runMigrations() {
  try {
    // Drop tables if they exist to ensure clean state with proper constraints
    await pool.query(`DROP TABLE IF EXISTS rosters;`);
    await pool.query(`DROP TABLE IF EXISTS players;`);
    await pool.query(`DROP TABLE IF EXISTS teams;`);

    // Create tables as defined in README with proper constraints
    await pool.query(`
      CREATE TABLE teams (
        id SERIAL PRIMARY KEY,
        team_name VARCHAR(100) NOT NULL,
        city VARCHAR(100) NOT NULL,
        abbreviation CHAR(3) UNIQUE
      );
    `);

    await pool.query(`
      CREATE TABLE players (
        id SERIAL PRIMARY KEY,
        player_name VARCHAR(150) NOT NULL,
        position VARCHAR(50),
        UNIQUE (player_name)
      );
    `);

    await pool.query(`
      CREATE TABLE rosters (
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        season_year INTEGER NOT NULL,

        PRIMARY KEY (player_id, team_id, season_year)
      );
    `);

    console.log('Database schema created successfully!');
  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  }
}

const datasetsDir = path.resolve(__dirname, '../../../datasets');
const { getTeamName } = require(path.join(datasetsDir, 'team_abbreviation_map.js'));

const multiWordMascots = new Set(['Trail Blazers']);

function splitTeamName(fullTeamName: string) {
  if (!fullTeamName) {
    return { city: '', teamName: '' };
  }

  const ofIndex = fullTeamName.indexOf(' of ');
  if (ofIndex > -1) {
    return {
      teamName: fullTeamName.slice(0, ofIndex).trim(),
      city: fullTeamName.slice(ofIndex + 4).trim(),
    };
  }

  for (const mascot of multiWordMascots) {
    if (fullTeamName.endsWith(mascot)) {
      return {
        city: fullTeamName.slice(0, -mascot.length).trim(),
        teamName: mascot,
      };
    }
  }

  const parts = fullTeamName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { city: fullTeamName, teamName: fullTeamName };
  }

  return {
    city: parts.slice(0, -1).join(' '),
    teamName: parts[parts.length - 1],
  };
}

// Function to seed the database from the player season CSV
async function seedDatabase() {
  try {
    // Run migrations first to ensure tables and constraints exist
    await runMigrations();

    const file = 'player_season_info.csv';
    const filePath = path.join(datasetsDir, file);
    console.log(`Processing file: ${filePath}`);

    const results: any[] = [];

    // Parse the CSV file
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

    // Process each record
    for (const row of results) {
      if (row.lg !== 'NBA') continue;

      const teamAbbreviation = String(row.team || '').toUpperCase();
      if (!teamAbbreviation) continue;

      const fullTeamName = getTeamName(teamAbbreviation);
      const { city, teamName } = splitTeamName(fullTeamName);
      const resolvedTeamName = teamName || fullTeamName;
      const resolvedCity = city || fullTeamName;
      const seasonYear = Number.parseInt(row.season, 10);

      // Insert team if it doesn't exist
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

      // Insert player if it doesn't exist, or get the existing player's ID
      const playerResult = await pool.query(
        'INSERT INTO players (player_name, position) VALUES ($1, $2) ON CONFLICT (player_name) DO UPDATE SET position = EXCLUDED.position RETURNING id',
        [row.player, row.pos]
      );

      const playerId = playerResult.rows[0].id;

      // Insert roster entry
      await pool.query(
        'INSERT INTO rosters (player_id, team_id, season_year) VALUES ($1, $2, $3) ON CONFLICT (player_id, team_id, season_year) DO UPDATE SET season_year = EXCLUDED.season_year',
        [playerId, teamId, seasonYear]
      );
    }

    console.log('Database seeding completed successfully!');
  } catch (error) {
    console.error('Error during seeding:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedDatabase();
