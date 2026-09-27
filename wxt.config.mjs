import { readFileSync } from 'node:fs';
import { defineConfig } from 'wxt';
import { hostPermission, serverOrigin } from './scripts/extension-origin.mjs';

const sourceManifest = JSON.parse(readFileSync(new URL('./extension/manifest.json', import.meta.url), 'utf8'));
const { manifest_version, background, host_permissions, ...identityAndPermissions } = sourceManifest;

export default defineConfig({
  srcDir: 'extension',
  outDir: 'artifacts',
  outDirTemplate: 'extension',
  manifest: {
    ...identityAndPermissions,
    host_permissions: [hostPermission]
  },
  vite: () => ({
    define: {
      __VOCABULARIUM_API_URL__: JSON.stringify(serverOrigin)
    },
    build: { minify: false }
  })
});
