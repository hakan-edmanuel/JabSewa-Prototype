import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // JSX automatic runtime juga untuk transform test (tanpa `import React`).
  esbuild: { jsx: 'automatic' },
  test: {
    // Default tetap node: test murni (domain + kontrak SQL) tidak butuh DOM.
    // Test komponen menandai dirinya dengan `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      // Sengaja dibatasi ke lapisan murni + I/O yang bisa diuji tanpa browser.
      include: ['src/domain/**/*.js', 'src/data/**/*.js'],
      exclude: ['**/*.test.js'],
      reporter: ['text', 'html'],
    },
  },
})
