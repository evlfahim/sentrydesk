import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      // The real `vscode` module only exists inside the extension host;
      // tests replace this stub with vi.mock('vscode', ...)
      vscode: path.resolve(__dirname, 'src/__tests__/__stubs__/vscode.ts'),
      // Test against core sources so a stale packages/core/dist can't skew results
      '@sentrydesk/core': path.resolve(__dirname, '../core/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    root: __dirname,
    include: ['src/__tests__/**/*.test.ts'],
  },
})
