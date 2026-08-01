# Argyra — Solicitud de ingreso

App de registro / encuesta / panel de administración para Argyra, hecha con
React + Vite, usando **Firebase Authentication** (email + contraseña) y
**Firestore** como base de datos. Pensada para subir a GitHub y desplegar
en Firebase Hosting o GitHub Pages.

## 1. Crear el proyecto de Firebase

1. Ve a https://console.firebase.google.com y crea un proyecto nuevo.
2. En **Authentication → Sign-in method**, activa **Correo electrónico/contraseña**.
3. En **Firestore Database**, crea una base de datos (modo producción).
4. En **Configuración del proyecto → Tus apps**, agrega una app **Web** y copia
   el objeto `firebaseConfig` que te muestra.
5. Pega esos valores en `src/firebase.js`, reemplazando los que dicen
   `TU_API_KEY`, etc. **Estos valores no son secretos** — es normal que
   queden en el repositorio de GitHub; la seguridad real la dan las reglas
   de Firestore (`firestore.rules`), no ocultar esta config.

## 2. Publicar las reglas de Firestore

Puedes pegar el contenido de `firestore.rules` directamente en
**Firestore Database → Reglas** en la consola de Firebase, o usar la
CLI (`firebase deploy --only firestore:rules`) si ya tienes el proyecto
vinculado con `firebase init`.

## 3. Hacerte administrador

El panel de administración no usa una contraseña fija: revisa si tu
usuario está en la colección `admins`. Para dártelo a ti mismo:

1. Regístrate normalmente en la app (con tu nick, contraseña, teléfono, correo).
2. En la consola de Firebase, ve a **Authentication** y copia tu **UID**.
3. En **Firestore Database**, crea manualmente la colección `admins` con
   un documento cuyo **ID sea exactamente ese UID** (el contenido puede
   quedar vacío, `{}`).
4. Ya puedes entrar al panel desde el botón "Panel de administración" al
   pie de la página.

## 4. Instalar y correr en local

```bash
npm install
npm run dev
```

Abre la URL que te muestre Vite (normalmente `http://localhost:5173`).

## 5. Subir a GitHub

```bash
git init
git add .
git commit -m "Argyra: registro, encuesta y panel admin"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

## 6. Desplegar

### Opción A — Firebase Hosting (recomendada, mismo proyecto que la base de datos)

```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # elige el proyecto que creaste, carpeta pública = dist
npm run build
firebase deploy
```

### Opción B — GitHub Pages

1. En `vite.config.js`, descomenta la línea `base:` y pon el nombre exacto
   de tu repositorio, por ejemplo `base: "/argyra-web/"`.
2. Instala el paquete de despliegue y publica la carpeta `dist`:
   ```bash
   npm install -D gh-pages
   npm run build
   npx gh-pages -d dist
   ```
3. En GitHub, ve a **Settings → Pages** y confirma que la fuente sea la
   rama `gh-pages`.

## Notas importantes

- Las contraseñas **no las guarda esta app**: las gestiona Firebase
  Authentication de forma segura. Firestore solo guarda nick, teléfono,
  correo, respuestas de la encuesta, estado y rango.
- El login se hace por **nick**: la app busca primero en la colección
  `usernames` el correo asociado a ese nick, y con ese correo inicia
  sesión en Firebase Auth. Por eso esa colección permite lectura pública
  (solo expone el correo ligado a un nick, nunca la contraseña).
- Cuando aceptas a alguien y le asignas un rango en el panel, la persona
  ve automáticamente su rango y sus enlaces de grupo (configúralos en la
  pestaña "Enlaces por rango" del panel admin) la próxima vez que entre a
  su perfil.
