/**
 * Awareness relay format. The server relays `awareness` frames without decoding them, so we use
 * a plain payload: UTF-8 JSON `{clientId, state}` (`state: null` = "I left"). No y-protocols.
 */
export interface AwarenessMessage {
  clientId: number;
  state: unknown;
}

export function encodeAwareness(msg: AwarenessMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg));
}

/** Returns null for anything that is not a well-formed awareness message. */
export function decodeAwareness(bytes: Uint8Array): AwarenessMessage | null {
  try {
    const v = JSON.parse(new TextDecoder().decode(bytes)) as Partial<AwarenessMessage>;
    if (typeof v.clientId !== "number") return null;
    return { clientId: v.clientId, state: v.state ?? null };
  } catch {
    return null;
  }
}

/** Remote peers of one document, dropped when they have not been heard from for `timeoutMs`. */
export class RemoteAwareness {
  private peers = new Map<number, { state: unknown; seen: number }>();

  constructor(
    readonly timeoutMs: number,
    private readonly now: () => number = () => Date.now()
  ) {}

  /** Record a message; returns true if this peer was not known before. `state === null` removes it. */
  update(clientId: number, state: unknown, at: number = this.now()): boolean {
    if (state === null) {
      this.peers.delete(clientId);
      return false;
    }
    const isNew = !this.peers.has(clientId);
    this.peers.set(clientId, { state, seen: at });
    return isNew;
  }

  /** Drop stale peers; returns true if any were dropped. */
  sweep(at: number = this.now()): boolean {
    let dropped = false;
    for (const [id, p] of this.peers) {
      if (at - p.seen > this.timeoutMs) {
        this.peers.delete(id);
        dropped = true;
      }
    }
    return dropped;
  }

  states(): Map<number, unknown> {
    return new Map([...this.peers].map(([id, p]) => [id, p.state]));
  }

  get size(): number {
    return this.peers.size;
  }

  clear(): boolean {
    const had = this.peers.size > 0;
    this.peers.clear();
    return had;
  }
}
