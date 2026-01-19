import * as fs from 'fs';
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

// Function to seed the database from CSV files
async function seedDatabase() {
  try {
    // Run migrations first to ensure tables and constraints exist
    await runMigrations();

    const datasetsDir = '../../datasets/';
    const files = fs.readdirSync(datasetsDir);

    for (const file of files) {
      if (file.endsWith('.csv')) {
        console.log(`Processing file: ${file}`);

        const results: any[] = [];

        // Parse the CSV file
        await new Promise<void>((resolve, reject) => {
          fs.createReadStream(datasetsDir + file)
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
          console.log(`Processing row: ${JSON.stringify(row)}`);

          // Insert team if it doesn't exist
          let teamResult = await pool.query(
            'INSERT INTO teams (team_name, city, abbreviation) VALUES ($1, $2, $3) ON CONFLICT (abbreviation) DO UPDATE SET team_name = EXCLUDED.team_name, city = EXCLUDED.city RETURNING id',
            [row.Team, row.City, row.Abbreviation]
          );

          const teamId = teamResult.rows[0].id;
          console.log(`Team ID: ${teamId}`);

          // Insert player if it doesn't exist, or get the existing player's ID
          let playerResult = await pool.query(
            'INSERT INTO players (player_name, position) VALUES ($1, $2) ON CONFLICT (player_name) DO UPDATE SET position = EXCLUDED.position RETURNING id',
            [row.Player, row.Pos]
          );

          const playerId = playerResult.rows[0].id;
          console.log(`Player ID: ${playerId}`);

          // Insert roster entry
          await pool.query(
            'INSERT INTO rosters (player_id, team_id, season_year) VALUES ($1, $2, $3) ON CONFLICT (player_id, team_id, season_year) DO UPDATE SET season_year = EXCLUDED.season_year',
            [playerId, teamId, row.Year]
          );
          console.log(`Roster entry inserted for player ${playerId}, team ${teamId}, year ${row.Year}`);
        }

        console.log(`Successfully processed ${file}`);
      }
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
