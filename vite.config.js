import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Si despliegas en GitHub Pages en un repo que NO es "usuario.github.io",
// descomenta la línea de "base" y pon el nombre exacto de tu repositorio.
export default defineConfig({
  plugins: [react()],
  // base: "/nombre-de-tu-repo/",
});
