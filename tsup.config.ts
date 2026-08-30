import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  external: [
    'react',
    'react-native',
    '@react-native-async-storage/async-storage',
    // Optional at runtime and absent at build time. Without this the bundler
    // tries to resolve the require() that probes for it and fails the build,
    // which is the opposite of optional.
    'react-native-play-install-referrer',
  ],
});
