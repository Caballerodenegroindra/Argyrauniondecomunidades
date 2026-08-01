import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" usa rutas relativas para los archivos generados (JS/CSS).
// Así funciona sin importar el nombre exacto del repositorio de GitHub
// ni si el usuario le cambia el nombre más adelante — evita la pantalla
// en blanco causada por una ruta base mal escrita.
export default defineConfig({
  plugins: [react()],
  base: "./",
});


