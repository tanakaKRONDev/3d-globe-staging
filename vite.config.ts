import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') }
  },
  build: { assetsInlineLimit: 0 },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/cesium/Build/Cesium/Workers/*',
          dest: 'cesium/Workers'
        },
        {
          src: 'node_modules/cesium/Build/Cesium/Assets/*',
          dest: 'cesium/Assets'
        },
        {
          src: 'node_modules/cesium/Build/Cesium/Widgets/*',
          dest: 'cesium/Widgets'
        },
        {
          src: 'node_modules/cesium/Build/Cesium/ThirdParty/*',
          dest: 'cesium/ThirdParty'
        }
      ]
    })
  ],
  define: {
    // Define global variables for Cesium
    CESIUM_BASE_URL: JSON.stringify('/cesium/')
  },
  css: {
    preprocessorOptions: {
      css: {
        // Import Cesium CSS
        additionalData: `@import "cesium/Build/Cesium/Widgets/widgets.css";`
      }
    }
  }
})