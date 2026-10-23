import type { Farmer } from '../farm/Farmer.js';

/**
 * EVERY GARDENER THIS POD HOLDS, across all of its rooms - what the Boxity
 * reporters read. Each room registers its own (server-owned) farmers on
 * create and lets go on dispose; nothing here is ever written from a packet.
 */
const sources = new Set<() => Iterable<Farmer>>();

export const trackFarmers = (source: () => Iterable<Farmer>): (() => void) => {
  sources.add(source);
  return () => {
    sources.delete(source);
  };
};

export const liveFarmers = (): Farmer[] => {
  const out: Farmer[] = [];
  for (const source of sources) for (const f of source()) out.push(f);
  return out;
};

/**
 * The Boxity identity of a farmer: `legion_<account id>`, or null for a guest
 * (who has no Boxity account to attach a stat or a score to). This game keeps
 * no per-mode profiles, but a `#m...` suffix is stripped all the same.
 */
export const boxityUserIdOf = (f: Farmer): string | null => {
  const id = (f.accountId ?? '').split('#m')[0]?.trim();
  return id ? `legion_${id}` : null;
};
