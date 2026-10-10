import type { Order } from '../domain.ts';

// Realtime notifications launch reads which may finish in a different order.
// Only the latest read for each order is allowed to reach the screen.
export function orderUpdates(
  read: (id: string) => Promise<Order>,
  refresh: (order?: Order) => void,
) {
  const versions = new Map<string, number>();
  let active = true;
  return {
    async receive(id: string, deleted = false) {
      if (!active) return;
      const version = (versions.get(id) ?? 0) + 1;
      versions.set(id, version);
      if (deleted) {
        refresh();
        return;
      }
      try {
        const order = await read(id);
        if (active && versions.get(id) === version) refresh(order);
      } catch {
        if (active && versions.get(id) === version) refresh();
      }
    },
    dispose() {
      active = false;
      versions.clear();
    },
  };
}
