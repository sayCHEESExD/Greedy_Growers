import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const clientRoot = fileURLToPath(new URL('.', import.meta.url));
const repoAssets = fileURLToPath(new URL('../assets', import.meta.url));

/**
 * Files that live in `assets/` but are never loaded at runtime, so they must
 * not be shipped to browsers. base_rig.fbx is byte-identical to player.fbx.
 */
const UNSHIPPED_ASSETS = [
  'player/base_rig.fbx',
  'ui/energy.png',
  'ui/trail.png',
  'ui/inventory.png',
  'ui/rebirth.png',
  'ui/sound.png',
  'ui/trophy.png',
  'ui/upgrades.png',
];
/**
 * Directories copied by publicDir that the build ships another way: the audio
 * (imported by `AudioManager`) is emitted under content-hashed names in
 * `assets/`, so the plain copies would only be a second, stale-prone download.
 * (The HUD icons are imported by `Hud` the same way and listed above; only
 * `ui/shop.png` ships as a file, for the favicon and the loading screen.)
 */
const UNSHIPPED_DIRS = ['audio'];

/** Drops UNSHIPPED_ASSETS after Vite copies publicDir into the build output. */
const pruneUnusedAssets = (): Plugin => ({
  name: 'hero:prune-unused-assets',
  apply: 'build',
  async closeBundle() {
    for (const relativePath of UNSHIPPED_ASSETS) {
      await rm(join(clientRoot, 'dist', relativePath), { force: true });
    }
    for (const relativePath of UNSHIPPED_DIRS) {
      await rm(join(clientRoot, 'dist', relativePath), { recursive: true, force: true });
    }
  },
});

/**
 * Fails the build if any shipped file's name holds a character the game host
 * cannot serve. The host answers a percent-encoded space with 400 Bad Request:
 * that one space once cost production its music and its bite sound while
 * everything worked locally.
 */
const refuseUnsafeNames = (): Plugin => ({
  name: 'hero:refuse-unsafe-names',
  apply: 'build',
  enforce: 'post',
  async closeBundle() {
    const bad: string[] = [];
    const walk = async (dir: string, rel: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = rel ? `${rel}/${entry.name}` : entry.name;
        if (!/^[A-Za-z0-9._-]+$/.test(entry.name)) bad.push(path);
        if (entry.isDirectory()) await walk(join(dir, entry.name), path);
      }
    };
    await walk(join(clientRoot, 'dist'), '');
    if (bad.length) throw new Error(`files the host cannot serve (rename them: letters, digits, . _ - only): ${bad.join(', ')}`);
  },
});

/**
 * THE LOCAL BOXITY, told to a standalone dev page.
 *
 * Boxity tells a game which environment it runs in; a page the dev server
 * serves is told by this, before any of the game's code (and before the SDK)
 * runs. `apply: 'serve'`: a production build never carries it, so a deployed
 * page is told by Boxity itself - or, told nothing, runs against prod.
 */
const localBoxityEnvironment = (): Plugin => ({
  name: 'greedy:local-boxity-env',
  apply: 'serve',
  transformIndexHtml: () => [
    {
      tag: 'script',
      injectTo: 'head-prepend',
      children:
        "window.BLOXITY_ENV = { env: 'local', apiUrl: 'http://localhost:4000', playUrl: 'http://localhost:2567', " +
        "portalUrl: 'http://localhost:3000', staticUrl: 'https://static.bloxity.io' };",
    },
  ],
});

export default defineConfig({
  plugins: [localBoxityEnvironment(), pruneUnusedAssets(), refuseUnsafeNames()],
  root: clientRoot,
  /**
   * Serve the repo-level `assets/` directory directly as the public root, so
   * the FBX and its texture are reachable at `/player/*` with NO duplicate
   * copies of the source assets inside the client workspace.
   */
  publicDir: repoAssets,
  server: {
    // Deliberately not Vite's default 5173: the previous game in this series
    // runs its own dev server there, and sharing the port means whichever
    // started first silently serves both projects.
    port: 6888,
    strictPort: true,
    // Reachable from a phone on the same LAN for mobile testing.
    host: true,
  },
  preview: {
    port: 4888,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    // Browser build budget is 12 MB; warn well before we get close.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          net: ['colyseus.js'],
        },
      },
    },
  },
});
