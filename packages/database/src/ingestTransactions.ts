import * as fs from 'fs';
import * as path from 'path';
import pool from './index';
import { splitTeamName } from './teamName';

const datasetsDir = path.resolve(__dirname, '../../../datasets');
const { getTeamAbbreviation, getTeamName } = require(path.join(datasetsDir, 'team_abbreviation_map.js'));

const LA_CLIPPERS_ABBREV = 'LAC';

function resolveTeamAbbreviation(teamName: string): string {
  if (teamName === 'LA Clippers') return LA_CLIPPERS_ABBREV;
  return getTeamAbbreviation(teamName);
}

interface TransactionCounts {
  signed: number;
  reSigned: number;
  received: number;
  converted: number;
  claimed: number;
  waived: number;
  draft: number;
  skipped: number;
}

interface ParsedTransaction {
  type: string;
  team: string;
  position: string;
  player: string;
}

const signedReSignedRe = /^(.+?) (signed|re-signed) (forward|guard|center) (.+?) to a .+\.$/;
const receivedRe = /^(.+?) received (forward|guard|center) (.+?) from .+\.$/;
const convertedRe = /^(.+?) converted the contract of (forward|guard|center) (.+?) to .+\.$/;
const claimedRe = /^(.+?) claimed (forward|guard|center) (.+?) off waivers\.$/;
const waivedRe = /^(.+?) waived (forward|guard|center) .+\.$/;

function parseTransactionLine(line: string): ParsedTransaction | null {
  if (line.includes('draft consideration')) return null;

  let match = line.match(signedReSignedRe);
  if (match) {
    return { type: match[2], team: match[1], position: match[3], player: match[4] };
  }

  match = line.match(receivedRe);
  if (match) {
    return { type: 'received', team: match[1], position: match[2], player: match[3] };
  }

  match = line.match(convertedRe);
  if (match) {
    return { type: 'converted', team: match[1], position: match[2], player: match[3] };
  }

  match = line.match(claimedRe);
  if (match) {
    return { type: 'claimed', team: match[1], position: match[2], player: match[3] };
  }

  match = line.match(waivedRe);
  if (match) {
    return { type: 'waived', team: match[1], position: match[2], player: match[3] };
  }

  return null;
}

function isDateHeader(line: string): boolean {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days.some(d => line.startsWith(d));
}

interface OffseasonMove {
  player: string;
  team: string;
  type: string;
  position?: string;
  pick?: number;
  from?: string;
}

interface OffseasonFile {
  seasonYear: number;
  moves: OffseasonMove[];
}

async function upsertTeamId(abbreviation: string): Promise<number> {
  const fullTeamName = getTeamName(abbreviation);
  const { city, teamName } = splitTeamName(fullTeamName);
  const result = await pool.query(
    `INSERT INTO teams (team_name, city, abbreviation)
     VALUES ($1, $2, $3)
     ON CONFLICT (abbreviation) DO UPDATE
       SET team_name = EXCLUDED.team_name,
           city = EXCLUDED.city
     RETURNING id`,
    [teamName, city, abbreviation]
  );
  return result.rows[0].id;
}

async function upsertPlayerId(
  name: string,
  position?: string
): Promise<{ id: number; isNew: boolean }> {
  const result = await pool.query(
    `INSERT INTO players (player_name, position)
     VALUES ($1, $2)
     ON CONFLICT (player_name) DO UPDATE
       SET position = COALESCE(EXCLUDED.position, players.position)
     RETURNING id, (xmax = 0) AS is_new`,
    [name, position ?? null]
  );
  return { id: result.rows[0].id, isNew: result.rows[0].is_new };
}

async function ingestTransactions(seasonYear: number = 2026): Promise<void> {
  const filePath = path.join(datasetsDir, 'transactions_2025-26.txt');
  if (!fs.existsSync(filePath)) {
    console.log(`Transactions file not found at ${filePath}. Skipping transaction ingestion.`);
    return;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const counts: TransactionCounts = {
    signed: 0,
    reSigned: 0,
    received: 0,
    converted: 0,
    claimed: 0,
    waived: 0,
    draft: 0,
    skipped: 0,
  };

  let playersAdded = 0;
  let rosterEntriesAdded = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === 'Logo') continue;
    if (line === 'undefined Headshot') continue;
    if (line === '2026' || line === '2025') continue;
    if (isDateHeader(line)) continue;

    if (line.includes('draft consideration')) {
      counts.draft += 1;
      continue;
    }

    const parsed = parseTransactionLine(line);
    if (!parsed) {
      counts.skipped += 1;
      continue;
    }

    if (parsed.type === 'waived') {
      counts.waived += 1;
      continue;
    }

    const typeKey = parsed.type === 're-signed' ? 'reSigned' : parsed.type as keyof TransactionCounts;
    counts[typeKey] += 1;

    const abbreviation = resolveTeamAbbreviation(parsed.team);

    const fullTeamName = getTeamName(abbreviation);
    const cityParts = fullTeamName.split(' ');
    const mascot = cityParts.pop() || fullTeamName;
    const city = cityParts.join(' ') || fullTeamName;

    const teamResult = await pool.query(
      `INSERT INTO teams (team_name, city, abbreviation)
       VALUES ($1, $2, $3)
       ON CONFLICT (abbreviation) DO UPDATE
         SET team_name = EXCLUDED.team_name,
             city = EXCLUDED.city
       RETURNING id`,
      [mascot, city, abbreviation]
    );
    const teamId: number = teamResult.rows[0].id;

    const playerResult = await pool.query(
      `INSERT INTO players (player_name, position)
       VALUES ($1, $2)
       ON CONFLICT (player_name) DO UPDATE
         SET position = EXCLUDED.position
       RETURNING id, (xmax = 0) AS is_new`,
      [parsed.player, parsed.position]
    );
    const playerId: number = playerResult.rows[0].id;
    if (playerResult.rows[0].is_new) {
      playersAdded += 1;
    }

    const rosterResult = await pool.query(
      `INSERT INTO rosters (player_id, team_id, season_year)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [playerId, teamId, seasonYear]
    );
    if ((rosterResult.rowCount ?? 0) > 0) {
      rosterEntriesAdded += 1;
    }
  }

  console.log(
    `Transaction ingestion complete. ` +
    `Added ${playersAdded} players, ${rosterEntriesAdded} roster entries. ` +
    `Skipped ${counts.waived} waived, ${counts.draft} draft consideration, ${counts.skipped} unrecognized lines. ` +
    `Processed: ${counts.signed} signed, ${counts.reSigned} re-signed, ${counts.received} received, ` +
    `${counts.converted} converted, ${counts.claimed} claimed.`
  );
}

async function ingestOffseasonTransactions(seasonYear?: number): Promise<void> {
  const filePath = path.join(datasetsDir, 'transactions_2026-offseason.json');
  if (!fs.existsSync(filePath)) {
    console.log(`Offseason transactions file not found at ${filePath}. Skipping offseason ingestion.`);
    return;
  }

  const file: OffseasonFile = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const targetSeason = seasonYear ?? file.seasonYear;

  const counts: Record<string, number> = {};
  const seenPlayers = new Set<string>();
  let playersAdded = 0;
  let rosterEntriesAdded = 0;
  let duplicatesSkipped = 0;

  for (const move of file.moves) {
    counts[move.type] = (counts[move.type] ?? 0) + 1;

    const key = move.player.toLowerCase();
    if (seenPlayers.has(key)) {
      duplicatesSkipped += 1;
      continue;
    }
    seenPlayers.add(key);

    const teamId = await upsertTeamId(move.team);
    const player = await upsertPlayerId(move.player, move.position);
    if (player.isNew) playersAdded += 1;

    const rosterResult = await pool.query(
      `INSERT INTO rosters (player_id, team_id, season_year)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [player.id, teamId, targetSeason]
    );
    if ((rosterResult.rowCount ?? 0) > 0) {
      rosterEntriesAdded += 1;
    }
  }

  const breakdown = Object.entries(counts)
    .map(([type, count]) => `${count} ${type}`)
    .join(', ');

  console.log(
    `Offseason ingestion complete for season ${targetSeason}. ` +
    `Added ${playersAdded} players, ${rosterEntriesAdded} roster entries. ` +
    `Processed: ${breakdown}.` +
    (duplicatesSkipped > 0 ? ` Skipped ${duplicatesSkipped} duplicate players.` : '')
  );
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const seasonFlag = args.indexOf('--season');
  const seasonYear = seasonFlag >= 0 ? parseInt(args[seasonFlag + 1], 10) : undefined;

  const run = args.includes('--offseason')
    ? () => ingestOffseasonTransactions(seasonYear)
    : () => ingestTransactions(seasonYear ?? 2026);

  run()
    .then(() => {
      console.log('Transaction ingestion finished successfully.');
    })
    .catch((error) => {
      console.error('Transaction ingestion failed:', error);
      process.exit(1);
    })
    .finally(() => pool.end());
}

export { ingestTransactions, ingestOffseasonTransactions };
