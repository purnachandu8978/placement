import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  // Use VITE_BASE_PATH if explicitly provided, else in production default to repository subpath '/placement/', or '/' in dev
  const basePath = process.env.VITE_BASE_PATH || (mode === 'production' ? '/placement/' : '/');

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'github-pages-spa',
        closeBundle() {
          const distPath = path.resolve(__dirname, 'dist');
          const indexPath = path.join(distPath, 'index.html');
          const notFoundPath = path.join(distPath, '404.html');
          const nojekyllPath = path.join(distPath, '.nojekyll');
          if (fs.existsSync(indexPath)) {
            fs.copyFileSync(indexPath, notFoundPath);
            fs.writeFileSync(nojekyllPath, '');
          }
        },
      },
    ],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            firebase: ['firebase/app', 'firebase/auth'],
            icons: ['lucide-react'],
          },
        },
      },
    },
  };
})

