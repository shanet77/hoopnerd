export class SnapshotQueue {
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly label: string,
    private readonly entity: string,
  ) {}

  run(key: string, task: () => Promise<void>): Promise<void> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const queued = previous
      .catch(() => undefined)
      .then(task)
      .catch((error) => {
        console.error(
          `[${this.label}] Failed to persist ${this.entity} ${key}:`,
          error,
        );
      });
    const next = queued.finally(() => {
      if (this.queues.get(key) === next) {
        this.queues.delete(key);
      }
    });
    this.queues.set(key, next);
    return next;
  }
}
