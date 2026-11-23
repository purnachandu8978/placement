import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  // Vercel and custom root domains deploy at '/'. GitHub Pages project sites deploy at '/placement/'.
  const isVercel = Boolean(process.env.VERCEL);
  const defaultProdBase = isVercel ? '/' : '/placement/';
  const basePath = process.env.VITE_BASE_PATH || (mode === 'production' ? defaultProdBase : '/');

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

