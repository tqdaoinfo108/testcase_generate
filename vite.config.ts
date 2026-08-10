import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const base = '/testcase_generate/';
  const nvidiaApiKey = "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";

  return {
    base,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify; file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api/nvidia': {
          target: 'https://integrate.api.nvidia.com',
          changeOrigin: true,
          headers: {
            Authorization: `Bearer ${nvidiaApiKey}`,
          },
          rewrite: (requestPath) => requestPath.replace(/^\/api\/nvidia/, '/v1'),
        },
      },
    },
  };
});
