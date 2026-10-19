export function generateRunId(exists: (runId: string) => boolean): string {
  let candidate = Math.random().toString(36).substring(2, 8).toUpperCase();
  while (exists(candidate)) {
    candidate = Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  return candidate;
}
