# Migración a la nueva estructura Argyra

## Qué cambió
- **Comunidades**: nueva colección `communities` (comunidad con subcomunidades/líder/embajadores, o grupo independiente).
- **Roles**: ahora son 4 — Líder, Coordinador, Miembro, Nuevo (reemplaza Kangu/Domeisha/Taicho/Sin Chan). Los Coordinadores se marcan con una o más ramas.
- **Ramas de Argyra**: Laboratorio, Guardia y Expansión, Relaciones Externas, Comunidad Casual, Publicidad (nueva).
- **Sello Argyra**: insignia aparte del rol, se activa al aceptar el ingreso y solo se quita si la comunidad/persona es expulsada.
- **Directorio Central**: anuncios globales o por comunidad (colección `announcements`).
- **Embajadas**: espacio privado por comunidad (subcolección `communities/{id}/embassy`), visible solo a miembros de esa comunidad, sus embajadores, Líderes y Coordinadores de Relaciones Externas.
- **Sistema de pase**: formulario para pedir ser Coordinador de una rama (colección `passRequests`), lo aprueba un admin.

## Vaciar la base de datos (arrancar en cero)
No tengo acceso de red a tu proyecto de Firebase desde aquí, así que este paso lo corres tú:

1. **Borra las colecciones actuales** desde la consola de Firebase (Firestore → cada colección → los tres puntos → "Delete collection"): `users`, `directory`, `usernames`, `admins`, `groups`, `leaders`, `news`. (Si ya las reemplazaste por las nuevas reglas, `groups`/`leaders` quedan obsoletas y puedes borrarlas igual.)
2. **Borra los usuarios de Firebase Authentication** (Authentication → Users → selecciona todos → Delete), excepto que planees recrear `indrhack` de cero también (recomendado).
3. **Despliega `firestore.rules`** (nuevo, incluido en este paquete) en Firebase Console o con `firebase deploy --only firestore:rules`.
4. **Vuelve a registrarte como `indrhack`** desde la app (pantalla Registrarse). Al iniciar sesión con ese nick, la app se autoasigna el rol de administrador automáticamente (ver `firestore.rules`, función `isSuperAdmin`/bootstrap de `admins`).
5. Desde el Panel de administración, crea las comunidades reales (Dynasty Ark Nexus, Kizune Network, etc.) y ve aceptando las solicitudes de ingreso que lleguen.

## Notas
- El acordeón `groups`/`leaders`/`news` de la versión anterior ya no se usa en la interfaz; puedes dejarlas en las reglas sin riesgo o quitarlas si prefieres limpiar del todo (no las referencia ningún componente nuevo salvo `news`, que quedó por compatibilidad y no tiene pantalla).
- Todo el modelo de datos nuevo está documentado como comentario al inicio de `src/App.jsx`.
