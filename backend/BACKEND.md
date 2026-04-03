# Backend Overview (Node.js + Geckos.io)

الـ backend في المشروع ده معمول كـ Node.js server بسيط بدون Express، وفي نفس الوقت بيشغّل Multiplayer realtime باستخدام مكتبة **@geckos.io/server** (والـ frontend بيستخدم **@geckos.io/client**).

## التكنولوجيا المستخدمة

- **Node.js (ES Modules)**  
  المشروع شغال بـ `"type": "module"` في [package.json](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/package.json)، فالتعامل بيكون بـ `import/export` بدل `require`.
- **HTTP Server (built-in http module)**  
  السيرفر بيخدم ملفات اللعبة (static files) وبيخدم dependencies محددة من `node_modules` عبر endpoint مخصص.
- **@geckos.io/server**  
  ده layer realtime network. بيركب فوق نفس الـ HTTP server وبيوفر `io` و `channel` وإيفنتات (emit/on) وغرف (rooms).
- **protobufjs**  
  موجود dependency علشان الـ frontend بيبعت/يستقبل `player:update` كـ binary payloads (protobuf) لتقليل حجم الداتا وزيادة السرعة.

## شكل المشروع (Architecture)

Entry point:
- [server.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/server.js)

Modules:
- Config / Env:
  - [src/config.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/config.js)
- HTTP Layer:
  - [src/http/createHttpServer.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/http/createHttpServer.js)
  - [src/http/utils.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/http/utils.js)
  - [src/http/mimeTypes.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/http/mimeTypes.js)
- Multiplayer / Rooms:
  - [src/rooms/attachRooms.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/rooms/attachRooms.js)
- Network logging helper:
  - [src/net/createNetLog.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/net/createNetLog.js)

الفكرة: `server.js` بيعمل wiring فقط (يبني HTTP server، يركّب geckos، يركّب rooms logic)، وباقي التفاصيل متقسمة حسب المسؤولية.

## تشغيل السيرفر

من داخل فولدر `backend`:

```powershell
npm install
npm start
```

أو:

```powershell
node server.js
```

وعند التشغيل بيطبع URLs جاهزة:
- `http://localhost:3001`
- `http://<LAN-IP>:3001` (لو شغال على شبكة)

الكود المسؤول عن طباعة الـ URLs: [server.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/server.js)

## HTTP: Serving static game + deps

### 1) Static files (اللعبة نفسها)

السيرفر بيخدم محتويات فولدر اللعبة:
- `PUBLIC_DIR = ../game` (بالنسبة لـ backend)

يعني:
- `/` => `/index.html`
- أي مسار تاني => ملف داخل `game/`

الـ implementation في:
- [createHttpServer.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/http/createHttpServer.js)

### 2) Deps from node_modules عبر /_deps/

عشان الـ frontend يقدر يحمّل بعض الحزم مباشرة، السيرفر بيسمح بقراءة ملفات معينة فقط من `node_modules` عبر:
- `/_deps/<path-inside-node_modules>`

مع whitelist prefixes فقط (أمان):
- `@geckos.io/`
- `@yandeu/`
- `protobufjs/`
- `@protobufjs/`

التحكم في الـ allowed prefixes موجود في:
- [config.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/config.js)

### 3) أمان المسارات (Path Traversal Protection)

أي مسار جاي من الـ URL بيتعمل له sanitize قبل `path.resolve` علشان يمنع إن حد يطلب `../../` ويطلع برة فولدر اللعبة أو `node_modules`.

المسؤول عن ده:
- `safeResolveUnder(baseDir, urlPath)` في [utils.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/http/utils.js)

## Multiplayer: Rooms + Events (Geckos.io)

### ربط geckos على نفس HTTP server

- `const io = geckos()`
- `io.addServer(httpServer)`

ده موجود في:
- [server.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/server.js)

### attachRooms(io)

كل منطق الغرف وإيفنتات اللاعبين متجمع في:
- [attachRooms.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/rooms/attachRooms.js)

داخلياً بيحتفظ بـ:
- `rooms: Map<roomId, room>`
- `channelStats: Map<channelId, stats>`

#### شكل بيانات الـ room (مبسّط)

- `roomId: string`
- `status: "waiting" | "started"`
- `hostId: string | null`
- `arenaType: string`
- `maxPlayers: number`
- `players: Map<playerId, { id, name, joinedAt }>`

### أهم الإيفنتات بين الـ frontend والـ backend

#### Connection

- Server -> Client:
  - `welcome { playerId }`

#### Rooms list (Lobby)

- Client -> Server:
  - `rooms:list-request {}`
- Server -> Client:
  - `rooms:list { rooms: [...] }`

#### Create / Join / Leave

- Client -> Server:
  - `room:create { roomId, name, arenaType, maxPlayers }`
  - `room:join { roomId, name }`
  - `room:leave {}`
- Server -> Clients:
  - `player:joined { roomId, player }`
  - `player:left { roomId, playerId }`
  - `room:state { roomId, status, hostId, arenaType, maxPlayers, players: [...] }`
  - `room:started { roomId, arenaType }`
  - `room:error { message }`

ملاحظة مهمة: عند دخول لاعب جديد، السيرفر بيعمل:
- Broadcast `player:joined` لكل الغرفة
- وبيرسل للداخل الجديد `player:joined` لكل اللاعبين الموجودين بالفعل (Replay) علشان الـ frontend يرسمهم داخل اللعبة
- وبيرسل له `room:state` مباشرةً

ده موجود في:
- `emitExistingPlayersTo(...)` داخل [attachRooms.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/rooms/attachRooms.js)

#### Start room (Host only)

- Client -> Server:
  - `room:start { roomId }`

السيرفر يتحقق:
- لازم الـ sender يكون `hostId`
- لازم `status === "waiting"`
- لازم players >= 2

#### Realtime movement/state

- Client -> Server:
  - `player:update` (Binary payload: ArrayBuffer / TypedArray)
- Server -> Clients (في نفس الغرفة):
  - `player:update` (نفس الـ binary)

الـ backend لا يقوم بعمل decode للـ protobuf هنا، هو بيعمل relay سريع داخل الغرفة.

## Logging و Debugging

في [config.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/config.js) تقدر تتحكم بالـ env vars دي:

- `NET_LOG`  
  لو `true/1` يطبع logs عامة.
- `NET_LOG_IMPORTANT`  
  افتراضياً شغال حتى لو `NET_LOG` مقفول (علشان إيفنتات مهمة).
- `NET_LOG_SNAPSHOT` + `NET_LOG_INTERVAL_MS`  
  Snapshot دوري لحالة السيرفر: عدد الاتصالات والغرف ومحتوى مختصر.
- `NET_ROOMS_CASE` + `NET_ROOMS_CASE_INTERVAL_MS`  
  طباعة دورية لـ rooms summary زي اللي ظهر عندك في التيرمنال (`rooms:case`).

الـ logger معمول كـ factory:
- [createNetLog.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/net/createNetLog.js)

## ليه مش مستخدمين Express؟

الـ backend هنا بسيط جداً:
- static file server
- endpoint واحد `/ _deps /...` بفلترة أمان
- geckos realtime فوق نفس السيرفر

فاستخدام `http` built-in يقلل dependencies ويخلي التحكم في كل request واضح ومباشر.

