import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
    ],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    build: {
      // Restore default 500 kB warning threshold so oversized chunks surface
      chunkSizeWarningLimit: 500,

      // Enable minification (esbuild is default, fast)
      minify: 'esbuild',

      // Inline assets smaller than 4 kB as base64 to save round-trips
      assetsInlineLimit: 4096,

      // Source maps off in production (reduces bundle size ~30%)
      sourcemap: false,

      // Enable CSS code splitting — each chunk gets only the CSS it needs
      cssCodeSplit: true,

      rollupOptions: {
        output: {
          // --- Manual chunk splitting for optimal caching ---
          manualChunks(id) {
            // Core React runtime — rarely changes, long cache life
            if (id.includes('node_modules/react/') ||
                id.includes('node_modules/react-dom/') ||
                id.includes('node_modules/react-router-dom/') ||
                id.includes('node_modules/react-router/') ||
                id.includes('node_modules/scheduler/')) {
              return 'vendor';
            }
            // Supabase client — large, changes independently
            if (id.includes('node_modules/@supabase/')) {
              return 'supabase';
            }
            // Lucide icon tree — Vite tree-shakes individual icons,
            // but the chunk boundary still helps incremental caching
            if (id.includes('node_modules/lucide-react/')) {
              return 'icons';
            }
            // Motion (Framer Motion v12) — separate chunk so it doesn't
            // bloat components that don't animate
            if (id.includes('node_modules/motion/') ||
                id.includes('node_modules/@motionone/')) {
              return 'motion';
            }
            // validator / sanitization libs (backend utilities pulled in
            // only if a client module imports them directly)
            if (id.includes('node_modules/validator/')) {
              return 'utils';
            }
          },

          // Content-hashed filenames for immutable caching
          entryFileNames:  'assets/[name]-[hash].js',
          chunkFileNames:  'assets/[name]-[hash].js',
          assetFileNames:  'assets/[name]-[hash][extname]',
        },

        // Tree-shaking — Rollup marks side-effect-free modules
        treeshake: {
          // Treat all node_modules as side-effect free unless package.json says otherwise
          moduleSideEffects: (id) => !id.includes('node_modules'),
          // Aggressively remove unused exports
          propertyReadSideEffects: false,
        },
      },
    },

    // Optimise dev server (faster cold starts)
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        '@supabase/supabase-js',
        'lucide-react',
      ],
      // Exclude server-only packages from pre-bundling
      exclude: [
        'bcrypt',
        'nodemailer',
        'busboy',
        'multer',
        'helmet',
        'hpp',
        'isomorphic-dompurify',
        '@google/genai',
      ],
    },

    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
      hmr:   process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },

    // Ensure esbuild strips dead-code and console.log in production
    esbuild: {
      drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
      legalComments: 'none',
    },
  };
});
