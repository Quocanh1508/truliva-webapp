import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'www',
    // app-config.json chỉ khai báo index.js/index.css → nhúng ảnh linh vật và banner Noel vào JS thay vì tách file riêng
    assetsInlineLimit: (filePath: string) => (/[\/]assets[\/](livy|noel)[^\/]*\.(png|webp)$/.test(filePath) ? true : undefined),
    rollupOptions: {
      output: {
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
        banner: '(function(){\n',
        footer: '\n})();'
      }
    }
  }
});
