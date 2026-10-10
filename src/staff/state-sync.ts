import type { StaffState } from '../api.ts';
import type { Order } from '../domain.ts';

export const emptyStaffState = (): StaffState => ({ orders: [], visits: {}, summaries: [] });

// One controller per login. A slow snapshot must not erase updates received while
// it was in flight, and a previous login must never write into the current one.
export class StaffStateSync {
  private active = true;
  private state = emptyStaffState();
  private pending = new Map<string, Order>();
  private inFlight: Promise<void> | null = null;
  private again = false;
  private read: () => Promise<StaffState>;
  private publish: (state: StaffState, changed?: Order) => void;
  private reportError: (error: unknown) => void;

  constructor(
    read: () => Promise<StaffState>,
    publish: (state: StaffState, changed?: Order) => void,
    reportError: (error: unknown) => void,
  ) {
    this.read = read;
    this.publish = publish;
    this.reportError = reportError;
  }

  accept(order: Order) {
    if (!this.active) return;
    this.pending.set(order.id, order);
    this.state = {
      ...this.state,
      orders: [...this.state.orders.filter((value) => value.id !== order.id), order],
    };
    this.publish(this.state, order);
  }

  refresh(): Promise<void> {
    if (!this.active) return Promise.resolve();
    if (this.inFlight) {
      this.again = true;
      return this.inFlight;
    }
    this.inFlight = this.load().finally(() => {
      this.inFlight = null;
      if (this.active && this.again) void this.refresh();
    });
    return this.inFlight;
  }

  private async load() {
    this.again = false;
    this.pending.clear();
    try {
      const snapshot = await this.read();
      if (!this.active) return;
      this.state = {
        ...snapshot,
        orders: [
          ...snapshot.orders.filter((order) => !this.pending.has(order.id)),
          ...this.pending.values(),
        ],
      };
      this.publish(this.state);
    } catch (error) {
      if (this.active) this.reportError(error);
    }
  }

  dispose() {
    this.active = false;
    this.pending.clear();
  }
}
