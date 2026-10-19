export interface IdleSweeperOptions<T> {
  intervalMs: number;
  idleTtlMs: number;
  entries: () => IterableIterator<[string, T]>;
  lastActivityAt: (key: string, entry: T) => number;
  isEvictable?: (entry: T) => boolean;
  onEvict: (key: string, entry: T) => void;
}

export class IdleSweeper<T> {
  private readonly timer: NodeJS.Timeout;

  constructor(private readonly options: IdleSweeperOptions<T>) {
    this.timer = setInterval(() => this.sweep(), options.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
  }

  private sweep(): void {
    const cutoff = Date.now() - this.options.idleTtlMs;
    for (const [key, entry] of this.options.entries()) {
      if (this.options.isEvictable && !this.options.isEvictable(entry)) {
        continue;
      }
      if (this.options.lastActivityAt(key, entry) < cutoff) {
        this.options.onEvict(key, entry);
      }
    }
  }
}
