import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'

// Add-on injection: VSCC_ADDONS names a module (absolute, or relative to the
// working directory) that default-exports DashboardAddons. Unset, the
// `vscc-addons` entry is the no-op src/addons/none.ts and the build is unchanged.
const external = process.env.VSCC_ADDONS
const addonsEntry = external
  ? resolve(external)
  : fileURLToPath(new URL('./src/addons/none.ts', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { 'vscc-addons': addonsEntry },
    // A module outside this tree must share this build's React and MUI.
    ...(external ? { dedupe: ['react', 'react-dom', '@mui/material', '@emotion/react'] } : {}),
  },
  ...(external ? { server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), dirname(addonsEntry)] } } } : {}),
})
