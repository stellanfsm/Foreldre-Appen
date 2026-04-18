import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// TODO: remove build fingerprint after deploy verification (also vite-env.d.ts + BuildFingerprintMarker + AppShell)
const buildFingerprintIso = new Date().toISOString()

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_BUILD_FINGERPRINT__: JSON.stringify(buildFingerprintIso),
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['tests/e2e/**'],
  },
})
