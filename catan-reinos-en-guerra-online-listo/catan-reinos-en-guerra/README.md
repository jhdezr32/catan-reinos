# CATÁN: REINOS EN GUERRA — versión online lista para publicar

Multijugador real para 3-4 personas desde ordenadores distintos, sin instalar nada: se abre un enlace en el navegador.
Arquitectura: **un único Cloudflare Worker** que sirve la página (`/`), una API HTTP (`/api/create`, `/api/join`, `/api/room/CÓDIGO`, `/api/health`)
y un **Durable Object `Game` por sala** (estado de la partida + WebSockets en tiempo real). Frontend y servidor están en el mismo dominio.

## Qué fallaba (y cómo se ha corregido)
1. «Crear partida» no mostraba nada cuando la página no tenía el servidor Worker detrás (p. ej. abrir `src/index.html` como archivo, o alojar solo el HTML):
   el cliente abría un WebSocket a una dirección inválida (`ws://ws/CODIGO`), fallaba y **reintentaba en silencio para siempre**, sin ningún mensaje.
   Ahora: el cliente llama a `POST /api/create`, valida el nombre, bloquea el botón mientras trabaja, muestra cualquier error en pantalla (y en la consola, con detalle técnico) y permite reintentar. Si se abre como `file://` lo avisa desde el principio.
2. El servidor antiguo **creaba una sala nueva con cualquier código** (incluso inexistente) y no distinguía «crear» de «unirse». Ahora la sala se crea solo con `/api/create` (código único garantizado por el propio Durable Object) y unirse a una sala inexistente da error 404 sin crear nada.
3. Sin validación de nombre, nombres repetidos, sala llena o partida empezada; sin límite de reintentos de conexión; sin estado de conexión visible. Todo corregido (ver informe de pruebas).

## Estructura
- `src/index.html` — frontend (se incrusta en el Worker). `src/engine.js` — reglas (puro, sin red). `src/server.js` — Worker + Durable Object.
- `dist/worker.js` — **archivo que se despliega**, generado con `python3 build.py` (que además verifica la sintaxis). Ya está generado y es coherente con `src/`.
- `wrangler.toml` — configuración (Durable Object `Game` + migración `new_sqlite_classes`, obligatoria en el plan gratuito).
- `test/` — pruebas (motor, integración con servidor+WebSocket, interfaz en Chromium, regresión del error de crear partida).

## Reglas implementadas
Tablero de 19 hexágonos, colocación inicial (2 rondas), dados, producción, carreteras/asentamientos/ciudades con límites de piezas, ladrón y descarte con 7, banco 4:1, 9 puertos (3:1 y 2:1),
intercambios entre jugadores, mazo de 25 cartas (caballero, monopolio, año de abundancia, 2 carreteras, puntos de victoria), camino más largo, ejército más grande, victoria a 10 puntos (con revelado de puntos ocultos al final).
Reinos: Azul = Asturias, Amarillo = Rumanía, Rojo = Alemania, Blanco = Canarias.
Online: lobby sincronizado, reino único por jugador, el anfitrión solo empieza con 3-4 conectados y reinos distintos, servidor autoritativo (valida cada acción y descarta duplicadas con `seq`),
cartas y recursos ajenos nunca se envían, identidad por token secreto (guardado en el navegador), reconexión automática y tras recargar (F5), jugadores desconectados visibles, el anfitrión puede expulsar desconectados en el lobby y **saltar el turno** de un desconectado durante la partida.

## Pruebas (ejecutadas realmente)
`npm install` (una vez) y `npm test`. Resultado en el entorno de desarrollo: motor 15 + 21 + 9, salto de turno 3, integración 54 (incluye una partida de 3 y otra de 4 bots jugadas por WebSocket hasta la victoria), interfaz Chromium 30 + 16.
**Importante:** el servidor se probó con un simulador del runtime de Cloudflare (`test/cf-sim.mjs`), **no con Cloudflare real ni con `wrangler dev`/workerd**. Por eso el despliegue real hay que comprobarlo (ver abajo).
Ejecutar el juego en local: `npm run local` y abrir http://127.0.0.1:8787 (varias pestañas = varios jugadores).

## NO verificado / pendiente
- Despliegue en Cloudflare real y comportamiento con latencia de Internet real; partida con 3-4 personas reales.
- Diseño: es funcional pero sencillo (sin escudos originales, sin animación de dados, sin tutorial interactivo, interfaz móvil no probada en dispositivos).
- Las ofertas de intercambio son para todos los jugadores (no dirigidas a uno concreto).
- No se puede saltar la colocación inicial de un jugador desconectado: hay que esperar a que vuelva (o crear otra partida).
- Las salas inactivas se borran solas a las 12 h sin conexiones.

## Publicar (sin instalar nada) — GitHub + Cloudflare
Cloudflare Workers Free admite Durable Objects solo con SQLite; `wrangler.toml` ya lo tiene. No hay variables de entorno ni secretos que configurar, ni recursos que crear a mano (la migración crea el Durable Object al desplegar).
1. Crea cuentas gratuitas: https://github.com/signup y https://dash.cloudflare.com/sign-up
2. GitHub → «New repository» → nombre `catan-reinos` → «Create repository» → «uploading an existing file» → arrastra el CONTENIDO de la carpeta descomprimida (`src`, `dist`, `test`, `wrangler.toml`, `package.json`, `build.py`, `README.md`) → «Commit changes».
3. Cloudflare → «Workers & Pages» → «Create» → «Import a repository» (Workers Builds) → conecta GitHub → elige `catan-reinos`.
   Nombre del Worker: **`catan-reinos`** (debe coincidir con `name` de `wrangler.toml`). Comando de build: vacío. Comando de deploy: `npx wrangler deploy`. «Save and Deploy».
4. Cloudflare muestra la URL pública `https://catan-reinos.<tu-subdominio>.workers.dev`.
5. Comprueba: `…/api/health` debe responder `{"ok":true,…}`. Abre la URL, escribe tu nombre → «Crear partida» → verás el código y «Copiar enlace».
6. Envía el enlace (`…workers.dev/#CODIGO`) a tus amigos: lo abren, escriben su nombre, «Unirse», eligen reino. Tú pulsas «Empezar partida».
Si algo falla: Cloudflare → tu Worker → «Logs»/«Deployments»; y la consola del navegador (F12) muestra líneas `[catan] …`.
Alternativa con terminal: instala Node.js, `npm install`, `npx wrangler login`, `npx wrangler deploy`.
Si cambias el código: `python3 build.py` regenera `dist/worker.js` antes de subir.
