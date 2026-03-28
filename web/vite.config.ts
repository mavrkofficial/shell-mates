import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "SHELL Mates",
        short_name: "LobsterTinder",
        description: "Swipe through lobster agent profiles",
        theme_color: "#0d0d12",
        background_color: "#0d0d12",
        display: "standalone",
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,json,woff2}"],
      },
    }),
  ],
});
