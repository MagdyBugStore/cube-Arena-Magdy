# البنية التحتية (Architecture) للعبة MagdyGame

الملف ده بيشرح “الهيكل العام” للعبة بالكامل: إزاي الـ frontend بيتبني من systems، وإزاي الـ backend بيخدم اللعبة وبيشغّل الـ multiplayer rooms، وإزاي الداتا بتتحرك بين الطرفين.

## نظرة سريعة

- **Backend (Node.js + Geckos.io server)** بيعمل حاجتين:
  - Static server بيخدم ملفات اللعبة من فولدر [game](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/index.html)
  - Realtime multiplayer فوق نفس الـ HTTP server باستخدام geckos: [server.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/server.js), [attachRooms.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/rooms/attachRooms.js)
- **Frontend (Three.js + Systems)**: نقطة الدخول [main.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/main.js) “بتجمع” كل السيستمز وتوصلهم ببعض، لكن معظم المنطق الحقيقي موجود في modules منفصلة داخل `game/src/**`.

## Entry Points وتشغيل النظام

### 1) Backend Entry

- نقطة الدخول: [backend/server.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/server.js)
- بيعمل:
  - إنشاء HTTP server: [createHttpServer.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/http/createHttpServer.js)
  - تركيب geckos server على نفس الـ HTTP server
  - تركيب rooms/match logic: [attachRooms.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/rooms/attachRooms.js)

### 2) Frontend Entry

- الصفحة الأساسية: [game/index.html](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/index.html)
  - importmap لـ `@geckos.io/client` من `/_deps/...`
  - تحميل `protobuf.min.js` من `/_deps/...`
  - تحميل نقطة الدخول: `./src/main.js`
- نقطة دخول اللعبة: [game/src/main.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/main.js)
  - بتقرأ URL params (تشغيل test/mp/debug…)
  - بتنشئ Scene/Camera/Renderer
  - بتبني الـ systems وتربطها على update loop

## Pattern الأساسي: Updatable Systems

الـ frontend مبني على فكرة بسيطة:

- عندك Environment واحد (scene + camera + renderer + loop): [SceneEnvironment](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/env/SceneEnvironment.js)
- أي “نظام” أو “كيان” عايز يتحدث كل frame بيعمل `update(dt, t)`
- الـ main بيركب الـ updatables في `env.updatables`، وبعد كده `env.start()` يعمل loop.

نقاط مهمة:
- `dt` معمول له cap (`<= 0.05`) علشان الاستقرار: [SceneEnvironment.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/env/SceneEnvironment.js#L129-L156)
- فيه `paused` mode: نفس الـ render بيشتغل لكن بدون تحديث systems.

## تقسيمة فولدر game/src (Frontend)

### env/

- **SceneEnvironment**: مسؤول عن setup/render loop/resize/shadows: [SceneEnvironment.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/env/SceneEnvironment.js)

### entities/

- **Player**: كيان اللاعب (Head cube + Tail cubes + حركة + knockback + tail feed/merge): [Player.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/entities/Player.js)
- **CubeFactory**: مصنع لإنشاء cubes من value/level (لون + حجم): [CubeFactory.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/entities/CubeFactory.js)

### systems/ (أنظمة عامة غير مرتبطة بالماتش مباشرة)

- **FreeCubeSpawner**: سباون وتحديث الـ free cubes (وفي الـ MP بيتحول لأداة عرض net cubes لما `enabled=false`): [FreeCubeSpawner.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/systems/FreeCubeSpawner.js)

### gameplay/ (Gameplay Systems)

- **spawnSystem**: respawn/placement logic: [spawnSystem.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/gameplay/spawnSystem.js)
- **tailSystem**: helpers لإسقاط/حذف tail segments (ومنع الإسقاط في MP): [tailSystem.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/gameplay/tailSystem.js)
- **collisionsSystem**: collisions بين لاعب/لاعب، لاعب/ذيل، لاعب/كعبات:
  - في الـ MP: جمع الكعبات بيكون request للسيرفر (`cube:collect`) بدل remove محلي: [collisionsSystem.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/gameplay/collisionsSystem.js#L63-L75)
  - في الـ SP: بيحصل remove محلي + enqueueTailValue
- **matchSystem**: إدارة حالة الماتش (وقت، remaining، killfeed، leaderboard، end overlays): [matchSystem.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/gameplay/matchSystem.js)
- **sessionSystem**: flow الدخول/الخروج/بدء اللعب (join/leave/start) مع UI: [sessionSystem.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/gameplay/sessionSystem.js)
- **netCubes**: إدارة net cubes داخل الـ free spawner باستخدام `spawnNet/removeByNetId`: [netCubes.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/gameplay/netCubes.js)
- **matchUtils**: helper functions (format time + اختيار فائز): [matchUtils.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/gameplay/matchUtils.js)

### net/

- **netSystem**: geckos client + protobuf encode/decode + remote interpolation + lobby events + cube/tail events:
  - proto schema + quantization: [netSystem.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/net/netSystem.js#L121-L146)
  - إرسال updates بمعدل ثابت (15Hz) + relay events: [netSystem.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/net/netSystem.js#L455-L509)
  - استقبال `tail:enqueue` وتطبيقه على اللاعب الصحيح بالـ `playerNum`: [netSystem.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/net/netSystem.js#L371-L381)

### ui/

- **lobbyUi**: overlay/rooms list/lobby state/start/leave buttons: [lobbyUi.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/ui/lobbyUi.js)
- **hudSystem**: scoreboard بسيط (يعرض head.value كقيمة): [hudSystem.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/ui/hudSystem.js)
- **minimapSystem**: minimap canvas بيترسم 15Hz ويعرض لاعبين + اتجاه: [minimapSystem.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/ui/minimapSystem.js)
- **userProfile**: حفظ/تحميل user name من localStorage: [userProfile.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/ui/userProfile.js)

### camera/

- **cameraSystem**: متابعة لاعب/سبكتاتور + test camera mode: [cameraSystem.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/camera/cameraSystem.js)

### world/

- **GameMap**: إنشاء أرضية + fence + textures حسب نوع الـ arena: [GameMap.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/world/GameMap.js)
- **arenaUtils**: normalizeArenaType + movementBoundsForArena + localStorage: [arenaUtils.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/world/arenaUtils.js)

## دور main.js بعد الريفاكتور

[main.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/main.js) بقى مسؤول عن “التجميع والربط” فقط:

- يقرأ flags من URL params (mp/test/netlog/bots…)
- يجهّز `env` والـ shadow helpers
- يجهّز arena + `applyArenaType`
- ينشئ الكيانات الأساسية: `player` + `bots`
- ينشئ الـ systems ويربطها:
  - `net.update`, `camera follow`, `bots update`, `collisions.update`, `hud.update`, `match.tick`
- يركب UI handlers وnet handlers
- يحتوي handler واحد مهم للـ MP: `startMatchFromRoom(payload)` لتطبيق snapshot البداية.

## Multiplayer Architecture (Backend ↔ Frontend)

### 1) Rooms + Lobby (Backend)

الـ backend بيحتفظ بـ:

- `rooms: Map<roomId, room>`
- `matches: Map<roomId, matchState>` (cubes + rng + spawn timer)

المكان: [attachRooms.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/rooms/attachRooms.js)

أهم events:

- `rooms:list-request` → `rooms:list`
- `room:create` / `room:join` / `room:leave`
- `room:state` snapshot (players + host + arenaType…)
- `room:started` snapshot البداية (seed/mapSize/spawns/cubes)

ملاحظة تقنية مهمة: السيرفر لا يعدل `channel.roomId` مباشرة، بيستخدم `channelRoomIds: Map` لتفادي crash: [attachRooms.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/rooms/attachRooms.js#L228-L237)

### 2) Match Start Snapshot

عند `room:start`:

- السيرفر يعمل seed + RNG
- يحدد bounds حسب arenaType (نفس الـ logic الموجودة في الـ frontend): [attachRooms.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/rooms/attachRooms.js#L37-L48)
- يولّد spawns لكل لاعب (`num,x,z,dx,dz`)
- يولّد initial cubes (`id,value,x,z`)
- يبعت `room:started` للغرفة: [attachRooms.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/rooms/attachRooms.js#L437-L445)

في الـ frontend:
- `netSystem` يستقبل `room:started` وينادي handler
- `main.startMatchFromRoom` يطبق arena/UI ويعمل reset ثم `sessionSystem.joinArena(mySpawn)` ويجهّز remotes.

### 3) Realtime Movement (player:update)

الفكرة: السيرفر “relay سريع” للباينري:

- Client يبعث `player:update` (protobuf bytes)
- Server يبث نفس الباينري لكل الغرفة بدون decode: [attachRooms.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/rooms/attachRooms.js#L466-L479)
- Clients يفكوا protobuf ويمشّوا remote interpolation: [netSystem.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/net/netSystem.js#L324-L357)

الميزة: أقل تكلفة على السيرفر، وأقل bandwidth بسبب quantization.

### 4) Cubes + Tail Growth (Server-authoritative)

- Server بيعمل spawn دوري للكعبات في الماتش: [attachRooms.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/rooms/attachRooms.js#L424-L433)
- Client عند اصطدامه بـ cube:
  - في MP: يبعث `cube:collect` للسيرفر: [collisionsSystem.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/gameplay/collisionsSystem.js#L63-L69)
- Server يتحقق ويقرر:
  - يبعت `cube:collected` (يشيلها من الكل)
  - ويبعت `tail:enqueue` بقيمة الـ cube للاعب الصحيح: [attachRooms.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/rooms/attachRooms.js#L448-L464)
- Client يستقبل `tail:enqueue` ويعمل `enqueueTailValue` + score: [netSystem.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/net/netSystem.js#L371-L381)

## HTTP Serving (Backend)

الـ backend بيخدم:

- **ملفات اللعبة static** من فولدر `game/`:
  - `/` → `index.html`
  - أي path تاني → ملف داخل `game/`
  - التنفيذ: [createHttpServer.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/http/createHttpServer.js#L21-L39)
- **Dependencies محددة فقط** من `node_modules` عبر `/_deps/...` باستخدام allowlist prefixes (أمان):
  - التنفيذ: [createHttpServer.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/http/createHttpServer.js#L6-L19)
  - إعداد prefixes: [config.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/config.js)
- **حماية من Path Traversal** باستخدام resolve آمن تحت baseDir:
  - [utils.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/http/utils.js)

## Debugging & Flags

### Frontend (URL params)

المفاتيح الأساسية موجودة في [main.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/main.js):

- `?test=1` وضع اختبار
- `?mp=0` تعطيل multiplayer حتى لو geckos/protobuf موجودين
- `?netlog=1` تفعيل logs للشبكة في المتصفح
- `?netcase=1` snapshot دوري لحالة net client
- `?bots=20` تحديد عدد البوتس (غالبًا SP)
- `?minimap=0` تعطيل minimap

### Backend (Env vars)

موجودة في [backend/src/config.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/config.js) وموضحة بالتفصيل في [BACKEND.md](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/BACKEND.md).

## تشابه logic بين الـ Backend والـ Frontend

فيه منطق متكرر intentionally عشان الاتنين “يتفقوا” على نفس قواعد الـ arena:

- `movementBoundsForArena` موجود في:
  - Frontend: [arenaUtils.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/world/arenaUtils.js)
  - Backend: [attachRooms.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/rooms/attachRooms.js#L37-L48)

ده بيساعد إن spawns/cubes اللي السيرفر يولدها تبقى داخل نفس الحدود اللي اللعبة بتطبقها.

## أين تضيف/تعدل Features بسرعة؟

- **Gameplay rules**: عدل/أضف system داخل `game/src/gameplay/*` واربطه في [main.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/main.js)
- **Networking**: 
  - Events + room lifecycle: [attachRooms.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/backend/src/rooms/attachRooms.js)
  - Client handlers/encoding: [netSystem.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/net/netSystem.js)
- **UI flow**: [lobbyUi.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/ui/lobbyUi.js) + [matchSystem.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/gameplay/matchSystem.js) + [sessionSystem.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/gameplay/sessionSystem.js)
- **Rendering / Camera / Minimap**: [SceneEnvironment.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/env/SceneEnvironment.js), [cameraSystem.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/camera/cameraSystem.js), [minimapSystem.js](file:///c:/Users/A/OneDrive/Desktop/MagdyGame/game/src/ui/minimapSystem.js)
