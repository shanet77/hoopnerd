/**
 * NBA Team Abbreviation Map
 * Maps 3-letter team abbreviations to full team names
 */

const teamAbbreviationMap = {
  // Eastern Conference
  ATL: "Atlanta Hawks",
  BOS: "Boston Celtics",
  BKN: "Brooklyn Nets",
  CHA: "Charlotte Hornets",
  CHI: "Chicago Bulls",
  CLE: "Cleveland Cavaliers",
  DET: "Detroit Pistons",
  IND: "Indiana Pacers",
  MIA: "Miami Heat",
  MIL: "Milwaukee Bucks",
  NYK: "New York Knicks",
  ORL: "Orlando Magic",
  PHI: "Philadelphia 76ers",
  TOR: "Toronto Raptors",
  WAS: "Washington Wizards",

  // Western Conference
  DAL: "Dallas Mavericks",
  DEN: "Denver Nuggets",
  GSW: "Golden State Warriors",
  HOU: "Houston Rockets",
  LAC: "Los Angeles Clippers",
  LAL: "Los Angeles Lakers",
  MEM: "Memphis Grizzlies",
  MIN: "Minnesota Timberwolves",
  NOP: "New Orleans Pelicans",
  OKC: "Oklahoma City Thunder",
  PHX: "Phoenix Suns",
  POR: "Portland Trail Blazers",
  SAC: "Sacramento Kings",
  SAS: "San Antonio Spurs",
  UTA: "Utah Jazz",

  // Additional variations/legacy abbreviations
  PHO: "Phoenix Suns", // Alternative abbreviation
  NO: "New Orleans Pelicans", // Legacy
  SA: "San Antonio Spurs", // Legacy
  GS: "Golden State Warriors", // Legacy
  CHO: "Charlotte Bobcats",
  FTW: "Fort Wayne Pistons",
  INO: "Indianapolis Olympians",
  CHS: "Chicago Stags",
  DNN: "Denver Nuggets",
  TRI: "Tri-Cities Blackhawks",
  AND: "Anderson Packers",
  PHW: "Philadelphia Warriors",
  WAT: "Waterloo Hawks",
  SHE: "Sheboygan Redskins",
  ROC: "Rochester Royals",
  BLB: "Baltimore Bullets",
  MNL: "Minneapolis Lakers",
  SYR: "Syracuse Nationals",
  WSC: "Washington Capitols",
  MLH: "Milwaukee Hawks",
  STL: "St. Louis Hawks",
  CIN: "Cincinnati Royals",
  CHP: "Chicago Packers",
  SFW: "San Francisco Warriors",
  CHZ: "Chicago Zephyrs",
  BAL: "Baltimore Bullets",
  SDR: "San Diego Rockets",
  INA: "Indiana Pacers",
  DNR: "Denver Rockets",
  KEN: "Kentucky Colonels",
  OAK: "Oakland Oaks",
  NOB: "New Orleans Buccaneers",
  ANA: "Anaheim Amigos",
  DLC: "Dallas Chaparrals",
  NJA: "New Jersey Americans",
  MNM: "Minnesota Muskies",
  PTP: "Pittsburgh Pipers",
  HSM: "Houston Mavericks",
  SEA: "Seattle SuperSonics",
  LAS: "Los Angeles Stars",
  MMF: "Miami Floridians",
  MNP: "Minnesota Pipers",
  NYA: "New York Nets",
  CAR: "Carolina Cougars",
  WSA: "Washington Caps",
  PTC: "Pittsburgh Condors",
  VIR: "Virginia Squires",
  FLO: "The Floridians",
  TEX: "Texas Chaparrals",
  UTS: "Utah Stars",
  BUF: "Buffalo Braves",
  MMT: "Memphis Tams",
  KCO: "Kansas City-Omaha Kings",
  SDA: "San Diego Conquistadors",
  SAA: "San Antonio Spurs",
  SSL: "Spirits of St. Louis",
  DNA: "Denver Nuggets",
  NOJ: "New Orleans Jazz",
  MMS: "Memphis Sounds",
  WSB: "Washington Bullets",
  SDS: "San Diego Sails",
  KCK: "Kansas City Kings",
  NYN: "New York Nets",
  NJN: "New Jersey Nets",
  SDC: "San Diego Clippers",
  CHH: "Charlotte Hornets",
  VAN: "Vancouver Grizzlies",
};

/**
 * Get full team name from abbreviation
 * @param {string} abbreviation - Team abbreviation (e.g., "CHI")
 * @returns {string} Full team name or abbreviation if not found
 */
export function getTeamName(abbreviation) {
  return teamAbbreviationMap[abbreviation?.toUpperCase()] || abbreviation;
}

/**
 * Get abbreviation from full team name
 * @param {string} teamName - Full team name
 * @returns {string} Team abbreviation or original name if not found
 */
export function getTeamAbbreviation(teamName) {
  if (!teamName) return "";

  const normalizedName = teamName.toLowerCase();
  const entry = Object.entries(teamAbbreviationMap).find(
    ([_, name]) => name.toLowerCase() === normalizedName,
  );

  return entry ? entry[0] : teamName;
}

/**
 * Check if abbreviation exists in map
 * @param {string} abbreviation - Team abbreviation to check
 * @returns {boolean} True if abbreviation exists
 */
export function isValidTeamAbbreviation(abbreviation) {
  return abbreviation?.toUpperCase() in teamAbbreviationMap;
}

/**
 * Get all team abbreviations
 * @returns {string[]} Array of all team abbreviations
 */
export function getAllTeamAbbreviations() {
  return Object.keys(teamAbbreviationMap);
}

/**
 * Get all team names
 * @returns {string[]} Array of all team names
 */
export function getAllTeamNames() {
  return Object.values(teamAbbreviationMap);
}

export default teamAbbreviationMap;
