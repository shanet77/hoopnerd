type PlayerSession = {
  token: string;
  playerId: number;
};

const playerSessions = new Map<string, PlayerSession>();

const getKey = (roomId: string, playerName: string) =>
  `${roomId.toUpperCase()}::${playerName.trim().toLowerCase()}`;

export const getPlayerSession = (roomId: string, playerName: string) =>
  playerSessions.get(getKey(roomId, playerName));

export const setPlayerSession = (
  roomId: string,
  playerName: string,
  session: PlayerSession
) => {
  playerSessions.set(getKey(roomId, playerName), session);
};

export const clearPlayerSession = (roomId: string, playerName: string) => {
  playerSessions.delete(getKey(roomId, playerName));
};

const NAME_KEY = "hoopnerd_player_name";

export const getPlayerName = (): string => {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(NAME_KEY) || "";
};

export const setPlayerName = (name: string): void => {
  if (typeof window === "undefined") return;
  const trimmed = name.trim();
  if (trimmed) {
    localStorage.setItem(NAME_KEY, trimmed);
  } else {
    localStorage.removeItem(NAME_KEY);
  }
};
