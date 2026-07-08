import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base must match the GitHub repo name so assets load correctly
// when the site is served from https://<user>.github.io/art-mak-content-agent/
export default defineConfig({
  plugins: [react()],
  base: "/art-mak-content-agent/",
});
