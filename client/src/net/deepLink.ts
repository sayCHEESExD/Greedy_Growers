/**
 * THE ROOM A LINK ASKS FOR. Boxity's "Open Rooms" Join button, a friend
 * invite and a CrazyGames invite all open the game with
 * `?roomId=<colyseus room id>`. Read once, validated, and consumed: a
 * reconnect later in the session must not drag the player back into a room
 * they have since left.
 */
const ROOM_ID = /^[A-Za-z0-9_-]{4,32}$/;

let pending: string | null = null;
let read = false;

const readRoomId = (): string | null => {
  try {
    const raw = new URLSearchParams(window.location.search).get('roomId');
    return raw && ROOM_ID.test(raw) ? raw : null;
  } catch {
    return null;
  }
};

/** The room the page was opened for, once; null after that (or without one). */
export const takeDeepLinkRoom = (): string | null => {
  if (!read) {
    read = true;
    pending = readRoomId();
  }
  const room = pending;
  pending = null;
  return room;
};
