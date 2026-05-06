import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { VitePWA } from 'vite-plugin-pwa';

/** Vite `base` for asset URLs. `/` locally; for GitHub Pages project sites use `/repo-name/`. */
function viteAppBase(): string {
  const raw = process.env.VITE_BASE_PATH;
  if (raw == null || raw.trim() === '') return '/';
  const t = raw.trim();
  if (t === '/') return '/';
  const withLeading = t.startsWith('/') ? t : `/${t}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

const base = viteAppBase();

// https://vitejs.dev/config/
export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      manifest: {
        name: 'Resilience Hub',
        short_name: 'Resilience',
        start_url: base === '/' ? '.' : base,
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2ec4b6',
        icons: [
          {
            src: 'icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    }),
    react()
  ],
  server: {
    port: 5173,
    open: true,
    hmr: {
      overlay: true
    },
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true
      }
    }
  },
  build: {
    sourcemap: false,
    minify: 'esbuild',
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-mui': ['@mui/material', '@mui/icons-material'],
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/messaging'],
        }
      }
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/messaging']
  }
}); 