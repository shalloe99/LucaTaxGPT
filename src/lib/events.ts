// Minimal, typed EventEmitter for browser environment

export class EventEmitter<TEvents extends { [K in keyof TEvents]: (...args: any[]) => void }> {
  private events: { [K in keyof TEvents]?: Array<TEvents[K]> } = {};

  on<K extends keyof TEvents>(event: K, listener: TEvents[K]): void {
    const list = (this.events[event] ||= []);
    list.push(listener);
  }

  off<K extends keyof TEvents>(event: K, listener: TEvents[K]): void {
    const list = this.events[event];
    if (!list) return;
    this.events[event] = list.filter(l => l !== listener) as Array<TEvents[K]>;
  }

  emit<K extends keyof TEvents>(event: K, ...args: Parameters<TEvents[K]>): void {
    const list = this.events[event];
    if (!list || list.length === 0) return;
    for (const listener of list) {
      try {
        // @ts-ignore - variadic call matches by type
        listener(...args);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Event listener error:', err);
      }
    }
  }

  removeAllListeners<K extends keyof TEvents>(event?: K): void {
    if (event) {
      delete this.events[event];
    } else {
      this.events = {} as typeof this.events;
    }
  }
}

export default EventEmitter;


