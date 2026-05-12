import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import vitePluginBundleObfuscator from 'vite-plugin-bundle-obfuscator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  root: 'client',
  base: '/', 
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'client/index.html'),
        login: resolve(__dirname, 'client/login.html'),
        admin: resolve(__dirname, 'client/admin.html'),
        reward: resolve(__dirname, 'client/reward.html'),
        upgrade: resolve(__dirname, 'client/upgrade.html'),
        docs: resolve(__dirname, 'client/docs.html')
      }
    }
  },
  plugins: [
    vitePluginBundleObfuscator({
      log: true,
      threadPool: true,
      options: {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75, 
        numbersToExpressions: true,
        simplify: true,
        stringArray: true,
        stringArrayShuffle: true,
        splitStrings: true,
        stringArrayThreshold: 0.75, 
        selfDefending: true,
        disableConsoleOutput: true
      }
    })
  ]
});