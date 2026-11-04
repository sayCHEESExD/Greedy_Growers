import { serverConfig } from '../config/serverConfig.js';
import { logger } from '../util/logger.js';

const SCOPE = 'bloxity/ads';

/** A verify that has not answered by now counts as not verified. */
const TIMEOUT_MS = 8_000;

/**
 * IS THIS REWARDED AD REAL? `POST {BLOXITY_API_URL}/v1/ads/reward/verify` with
 * `{ gameSlug, rewardToken }`; true ONLY for an answer with `valid: true`.
 *
 * Each token works once, for this game, within five minutes, so a token
 * replayed, forged or minted for another game is refused by Boxity itself.
 * Fails closed: a timeout, a network error or any other answer grants nothing.
 */
export const verifyRewardToken = async (rewardToken: string): Promise<boolean> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${serverConfig.bloxity.apiUrl}/v1/ads/reward/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ gameSlug: serverConfig.gameSlug, rewardToken }),
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as { valid?: unknown; reason?: unknown } | null;
    const valid = response.ok && body?.valid === true;
    if (!valid) logger.info(SCOPE, `reward token refused (HTTP ${response.status}${body?.reason ? ` ${String(body.reason)}` : ''})`);
    return valid;
  } catch (error) {
    logger.warn(SCOPE, `reward verify failed: ${String(error)}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
};
