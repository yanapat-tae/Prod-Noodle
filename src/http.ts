export class RequestFailure extends Error {
  readonly uncertain: boolean;
  readonly status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'RequestFailure';
    this.status = status;
    this.uncertain = status === null || status >= 500;
  }
}

// Only reads and writes carrying an idempotency key can be retried automatically.
export async function requestJson<T>(target: string, init: RequestInit, idempotencyKey?: string): Promise<T> {
  const retrySafe = (init.method ?? 'GET') === 'GET' || !!idempotencyKey;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(target, { ...init, signal: AbortSignal.timeout(20000) });
      const data: unknown = await response.json();
      if (!response.ok) {
        const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
          ? data.error : 'ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่';
        throw new RequestFailure(message, response.status);
      }
      return data as T;
    } catch (error) {
      const uncertain = !(error instanceof RequestFailure) || error.uncertain;
      if (uncertain && retrySafe && attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 250));
        continue;
      }
      if (error instanceof RequestFailure && !idempotencyKey) throw error;
      if (uncertain) throw new RequestFailure(idempotencyKey
        ? 'ยังยืนยันไม่ได้ว่าร้านได้รับออเดอร์แล้ว กรุณาตรวจเน็ต แล้วลองส่งรายการเดิมอีกครั้ง'
        : 'เชื่อมต่อร้านไม่สำเร็จ กรุณาตรวจเน็ต แล้วลองอีกครั้ง', null);
      throw error;
    }
  }
  throw new RequestFailure('เชื่อมต่อร้านไม่สำเร็จ กรุณาลองอีกครั้ง', null);
}
