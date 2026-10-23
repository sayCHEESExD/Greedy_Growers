import { matchMaker } from '@colyseus/core';
import { MAX_PLAYERS_PER_ROOM, ROOM_NAME } from '@greedy/shared';
import { logger } from './util/logger.js';

const SCOPE = 'bloxity/rooms';

/** How often this pod tells the matchmaker what it holds. */
const INTERVAL_MS = 2_000;
/** A report that has not answered by now is dropped; the next one follows. */
const TIMEOUT_MS = 3_000;

/**
 * THE MATCHMAKER'S VIEW OF THIS POD.
 *
 * Every two seconds: `POST ${MATCHMAKER_REPORT_URL}/${BLOXITY_GAME_ID}/rooms`
 * with this pod's name, its connected players and its rooms. This feeds the
 * cross-pod room directory (Boxity's "Open Rooms" list and {playUrl}/v1/dir),
 * pod placement and the CCU chart.
 *
 * Fire-and-forget: a slow or failed report never touches the game, and only
 * the FIRST failure in a run is logged (then the recovery). Inert unless Legion
 * injected MATCHMAKER_REPORT_URL, BLOXITY_REPORT_TOKEN, BLOXITY_GAME_ID and
 * POD_NAME, so local development does nothing.
 */
export interface RoomReporter {
  stop(): void;
}

const INERT: RoomReporter = { stop: () => undefined };

export const installRoomReporter = (): RoomReporter => {
  const base = process.env['MATCHMAKER_REPORT_URL']?.trim();
  const token = process.env['BLOXITY_REPORT_TOKEN']?.trim();
  const gameId = process.env['BLOXITY_GAME_ID']?.trim();
  const podName = process.env['POD_NAME']?.trim();
  if (!base || !token || !gameId || !podName) {
    logger.info(SCOPE, 'room reporting off (MATCHMAKER_REPORT_URL / BLOXITY_REPORT_TOKEN / BLOXITY_GAME_ID / POD_NAME not all set)');
    return INERT;
  }
  const url = `${base.replace(/\/+$/, '')}/${encodeURIComponent(gameId)}/rooms`;

  let inFlight = false;
  let failing = false;

  const report = async (): Promise<void> => {
    if (inFlight) return;
    inFlight = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const live = await matchMaker.query({ name: ROOM_NAME });
      const rooms = live.map((room) => ({
        colyseusRoomId: room.roomId,
        clients: room.clients,
        maxClients: room.maxClients || MAX_PLAYERS_PER_ROOM,
        locked: room.locked,
        private: room.private,
      }));
      const players = rooms.reduce((sum, room) => sum + room.clients, 0);
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ podName, players, rooms }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${(await response.text().catch(() => '')).slice(0, 200)}`);
      if (failing) logger.info(SCOPE, 'room reports reaching the matchmaker again');
      failing = false;
    } catch (error) {
      if (!failing) logger.warn(SCOPE, `room report failed (further failures not logged until it recovers): ${String(error)}`);
      failing = true;
    } finally {
      clearTimeout(timer);
      inFlight = false;
    }
  };

  const interval = setInterval(() => void report(), INTERVAL_MS);
  interval.unref?.();
  void report();
  logger.info(SCOPE, `reporting rooms for "${gameId}" as pod "${podName}" every ${INTERVAL_MS / 1000}s`);
  return { stop: () => clearInterval(interval) };
};
