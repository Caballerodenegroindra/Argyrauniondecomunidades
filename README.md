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

## 3. El administrador principal

El nick **`indrhack`** es el administrador principal fijo de la comunidad:
apenas esa persona se registra e inicia sesión, la app le otorga el acceso
de administrador automáticamente (no hace falta tocar nada en la consola
de Firebase).

Desde el panel de administración → pestaña **"Administradores"**,
`indrhack` (o cualquier otro administrador) puede otorgar o quitar el
acceso de admin a cualquier otro usuario ya registrado, escribiendo su
nick. Ya no es necesario crear documentos a mano en Firestore.

**Importante:** para que esto funcione, primero debes publicar las reglas
actualizadas de `firestore.rules` (ver paso 2). Si te registras como
`indrhack` antes de publicar las reglas nuevas, simplemente vuelve a
iniciar sesión después de publicarlas y el acceso se otorgará solo.

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

### Opción B — GitHub Pages (ya configurada en este repo)

Este proyecto ya incluye `.github/workflows/deploy.yml`, que compila y
publica el sitio automáticamente cada vez que haces `git push` a `main`.
No necesitas instalar nada extra ni correr comandos de despliegue a mano.
Solo tienes que activarlo una vez en la configuración del repositorio:

1. En GitHub, ve a **Settings → Pages**.
2. En **Build and deployment → Source**, elige **GitHub Actions**
   (NO "Deploy from a branch" — si queda en esa opción, el sitio no se
   publica y la página aparece en blanco o da 404).
3. Haz `git push` a `main` (o entra a la pestaña **Actions** y corre el
   workflow "Deploy to GitHub Pages" manualmente).
4. En unos 1-2 minutos, la URL aparecerá arriba de **Settings → Pages**.

`vite.config.js` usa `base: "./"` (ruta relativa), así que funciona sin
importar el nombre exacto del repositorio.

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
