type StoredSoloRun = {
  runId: string;
  runToken: string;
};

const USER_ID_KEY = "hoopnerd_user_id";
const SOLO_BEST_KEY = "hoopnerd_solo_best";
const SOLO_RUN_KEY = "hoopnerd_solo_run";

export const getUserId = (): string => {
  if (typeof window === "undefined") return "";
  const existing = localStorage.getItem(USER_ID_KEY);
  if (existing) return existing;
  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(USER_ID_KEY, generated);
  return generated;
};

export const getSoloBest = (): number => {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(SOLO_BEST_KEY);
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const setSoloBest = (streak: number): void => {
  if (typeof window === "undefined") return;
  localStorage.setItem(SOLO_BEST_KEY, String(streak));
};

export const getStoredSoloRun = (): StoredSoloRun | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SOLO_RUN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSoloRun;
    if (
      typeof parsed.runId !== "string" ||
      typeof parsed.runToken !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const setStoredSoloRun = (run: StoredSoloRun): void => {
  if (typeof window === "undefined") return;
  localStorage.setItem(SOLO_RUN_KEY, JSON.stringify(run));
};

export const clearStoredSoloRun = (): void => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SOLO_RUN_KEY);
};
