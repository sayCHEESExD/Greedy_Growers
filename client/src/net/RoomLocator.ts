import { bloxityEnvironment } from '../bloxity/environment.js';
import { logger } from '../util/logger.js';

const SCOPE = 'net/rooms';

const TIMEOUT_MS = 4000;

/** Where a named room can be joined: the relay to the pod that holds it. */
export interface RoomLocation {
  readonly roomId: string;
  /** ws(s) URL of the relay to the room's pod. */
  readonly endpoint: string;
}

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const asWs = (url: string): string => url.replace(/^http/i, 'ws');

const rowsOf = (body: unknown): Row[] => {
  if (Array.isArray(body)) return body as Row[];
  const b = (body ?? {}) as Row;
  if (Array.isArray(b['rooms'])) return b['rooms'] as Row[];
  if (b['room'] && typeof b['room'] === 'object') return [b['room'] as Row];
  return b['colyseusRoomId'] ? [b] : [];
};

/**
 * RESOLVE A HOSTED ROOM BEFORE JOINING IT (`?roomId=`).
 *
 * A bare joinById lands on whichever relay the matchmaker allocates, which
 * holds the room only by coincidence. So the room is looked up in Boxity's
 * cross-pod directory, `GET {playUrl}/v1/dir/<hostingId>/list` (fed by
 * `server/src/legion-room-reporter.ts`), and joined through ITS `joinUrl`.
 *
 * Null when the room is gone, full, or the directory cannot be read: the
 * caller then falls back to normal matchmaking. Never throws.
 */
export const locateRoom = async (hostingId: string, roomId: string): Promise<RoomLocation | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${bloxityEnvironment().playUrl}/v1/dir/${encodeURIComponent(hostingId)}/list`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const row = rowsOf(await response.json()).find((candidate) => str(candidate['colyseusRoomId']) === roomId);
    if (!row) {
      logger.info(SCOPE, `room ${roomId} is not listed (closed?); joining normally`);
      return null;
    }
    const clients = num(row['clients']);
    const max = num(row['maxClients']);
    if (row['locked'] === true || (max > 0 && clients >= max)) {
      logger.info(SCOPE, `room ${roomId} is full; joining normally`);
      return null;
    }
    const joinUrl = str(row['joinUrl']);
    if (!joinUrl) {
      logger.warn(SCOPE, `room ${roomId} is listed without a joinUrl; joining normally`);
      return null;
    }
    return { roomId, endpoint: asWs(joinUrl) };
  } catch (error) {
    logger.warn(SCOPE, `room directory unreadable (${String(error)}); joining normally`);
    return null;
  } finally {
    clearTimeout(timer);
  }
};
