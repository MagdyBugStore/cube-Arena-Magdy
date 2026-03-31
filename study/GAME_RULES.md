# Cube Arena — مواصفات “Machine-Oriented” (للـAI أكثر من الإنسان)

الهدف من الملف ده إنه يبقى مرجع “قابل للترجمة” لقواعد اللعبة: تعريف البيانات (State)، الدوال المشتقة، ترتيب تحديث الإطار (Tick Pipeline)، وقواعد الاصطدام/الأكل/الدمج بشكل شبه-خوارزمي.

مصدر الحقيقة (Source of Truth):
- `src/game/startGame.js`
- `src/game/config.js`
- `src/systems/FreeCubeSpawner.js`
- `src/core/PathTracker.js`
- `src/game/math.js`

## 1) نموذج البيانات (Data Model)

### 1.1 كائنات أساسية

**CubeMesh**
- `position: (x, y, z)`
- `rotation.y`
- `userData`:
  - `type ∈ { free, head, tail }`
  - `value: number` (قيمة مكتوبة على المكعب)
  - `baseScale: number` (نسبة التحجيم مقارنةً بـ`CFG.cubeSize`)
  - `entity: CubeEntity`
  - `box: Box3` (AABB للاصطدامات)

**CubeEntity** (`src/entities/CubeEntity.js`)
- `type ∈ { FREE, HEAD, TAIL }`
- `value: number`
- `size: number`
- `fallSpeed: number` (لـFREE فقط)
- `isSettled: boolean` (لـFREE فقط)
- `box: Box3` متزامن مع الـMesh

**Player (Head)**
- ممثل كمكعب `CubeMesh` واحد (`state.player`)
- قيمة الرأس: `state.playerValue`
- اتجاه حركة مستمر: `state.playerMoveDir: Vector3` (عادةً y=0)

**EnemyAgent** (`src/entities/EnemyAgent.js`)
- `mesh: CubeMesh` (الرأس)
- `value: number` (قيمة الرأس)
- `dir: Vector3` اتجاه الحركة
- `tail: CubeMesh[]`
- `pathTracker: PathTracker`
- `headBox: Box3`
- State للـTail flow:
  - `tailInsertQueue: number[]`
  - `tailInsertAnim | tailMergeAnim | headTailMergeAnim: object|null`
  - `tailMergeDelayTimer: number`
- State للـAI:
  - `aiThinkTimer: number`
  - `aiMode ∈ { idle, hunt_agent, hunt_cube, escape }`
  - `aiTarget: object|null`

### 1.2 حالة اللعبة (Game State) — ملخص عملي
المصدر: `src/game/createInitialState.js`

**Core**
- `state.cubes: CubeMesh[]` (مكعبات FREE الحالية)
- `state.enemies: EnemyAgent[]`
- `state.tail: CubeMesh[]` (Tail اللاعب)

**Player respawn**
- `state.playerPendingRespawn: boolean`
- `state.playerDeathFollowTimer: number`
- `state.playerDeathFollowTarget: CubeMesh|null`

**Tail flow**
- `state.tailInsertQueue: number[]`
- `state.tailInsertAnim | state.tailMergeAnim | state.headTailMergeAnim: object|null`
- `state.tailMergeDelayTimer: number`

## 2) دوال مشتقة (Derived Functions)

### 2.1 smoothingT
المصدر: `src/game/math.js`

```text
smoothingT(lerpPerSecond, dt) = 1 - exp(-lerpPerSecond * dt)
```

### 2.2 تحويل Value إلى Size
المصدر: `cubeSizeForValue()` في `src/game/startGame.js`

```text
v = max(2, value)
level = max(0, round(log2(v)) - 1)
size = CFG.cubeSize * (CFG.cubeScaleGrowthPerLevel ^ level)
```

### 2.3 معامل سرعة حسب القيمة (Speed scale by size level)
المصدر: `getSpeedScaleForValue()` في `src/game/startGame.js`

```text
clampedValue = max(2, value)
level = max(0, round(log2(clampedValue)) - 1)
factor = 1 - level * decayPerLevel
speedScale = max(minFactor, factor)
```

### 2.4 سرعة اللاعب/العدو الفعلية

```text
playerSpeed = CFG.playerSpeed * CFG.gameSpeedMultiplier * speedScale(playerValue, CFG.playerMinSpeedFactor, CFG.playerSpeedDecayPerLevel)
enemySpeed  = enemy.speed      * CFG.gameSpeedMultiplier * speedScale(enemy.value,      CFG.enemyMinSpeedFactor,  CFG.enemySpeedDecayPerLevel)
```

## 3) مساحة اللعب (Play Area / Bounds)
المصدر: `getGroundBounds()` في `src/game/startGame.js`

```text
half = (CFG.playAreaSize || CFG.groundSize) / 2
margin = CFG.cubeSize
bounds = {
  minX = -half + margin
  maxX =  half - margin
  minZ = -half + margin
  maxZ =  half - margin
}
```

أي تموضع للاعب أو عدو خارج bounds يتم “Clamp” إلى الداخل.

## 4) نموذج التحديث (Tick Pipeline)
المصدر: `update(dt)` في `src/game/startGame.js`

### 4.1 dt
```text
dtRaw = clamp((now - lastTime)/1000, 0, 0.05)
dt = dtRaw
```

### 4.2 ترتيب التحديث (مهم للـAI/الـSimulation)

```text
update(dt):
  if !player || !ground: return

  isRespawnPending = state.playerPendingRespawn

  if !isRespawnPending:
    steerFromMouse(dt)  // raycast على الأرض -> playerMoveDir (سلس)
    movePlayer(dt)      // position += dir * playerSpeed * dt; clamp bounds; y = size/2

  state.gameTimeSec += dt

  updateCamera(dt)      // يمكن أن يتبع القاتل أثناء respawn pending

  freeCubeSpawner.update(dt * CFG.gameSpeedMultiplier)

  if !isRespawnPending:
    collectFreeCubesForPlayer()   // edible only
    recordPlayerPathPoint()
    updatePlayerTailFeedingFlow(dt)  // insert anim + merge anims
    updatePlayerTailPositions(dt)

  updateEnemies(dt)               // move + collect + tailflow + tailfollow لكل عدو
  handleEnemyVsEnemyInteractions()

  if !isRespawnPending:
    checkPlayerVsEnemyHeads()
    checkPlayerHitEnemyTail()
  else:
    state.playerDeathFollowTimer -= dt
    if timer<=0: finishPlayerRespawn()

  updateScatterCubes(dt)          // موجود كمنظومة منفصلة (حاليًا لا يتم تفعيل scatter من منطق قتال)
  applyPlayerPulse(dt)
  updateHud()
```

## 5) مكعبات FREE (Collectibles) — قواعد “صالحة للأكل”

### 5.1 Spawn + fall
المصدر: `src/systems/FreeCubeSpawner.js`

- قيم الـFREE الحالية: `values = [1, 2, 4, 8, 16]`
- عند spawn:
  - `y` يبدأ في `[CFG.freeCubeSpawnHeightMin, CFG.freeCubeSpawnHeightMax]`
  - سقوط: `y -= fallSpeed * dt` إلى أن يصل `y <= size/2` ثم `isSettled=true`
- حد أقصى: `CFG.freeCubeMaxCount`

### 5.2 قاعدة الأكل الأساسية (Edibility predicate)
ينطبق على اللاعب وعلى أي EnemyAgent:

```text
canEatFreeCube(headValue, cubeValue) := cubeValue <= headValue
```

### 5.3 تأثير الأكل
الأكل لا يزيد قيمة الرأس فورًا. الأكل يضيف “قيمة” إلى Queue لتدخل الـTail:

```text
onEatFreeCube(value):
  remove cube mesh from scene
  enqueueTailValue(value)   // لللاعب أو للعدو
```

## 6) Tail System — قواعد قابلة للتنفيذ

### 6.1 تمثيل Tail
- Tail هي قائمة `CubeMesh[]` مرتبطة برأس معيّن.
- كل عنصر Tail لديه `userData.value` و`userData.box`.

### 6.2 إدخال قيمة إلى الـTail (Queue → Insert Animation → Tail list)
المصدر: `updateTailFeedingFlow(dt)` لللاعب و`updateEnemyTailFeedingFlow(enemy, dt)` للأعداء.

**States**
- `tailInsertAnim == null` و`tailInsertQueue.length>0` ⇒ يبدأ Insert
- أثناء insert: مكعب جديد بيتحرك تدريجيًا لنقطة target على Path خلف الرأس.
- عند اكتمال الأنيميشن (`t>=1`): المكعب يدخل في `tail[]` ثم يبدأ/يتاح دمج.

**قرار مكان الإدخال**
المصدر: `getTailInsertIndex(value)` و`getEnemyTailInsertIndex(enemy, value)`

```text
insertIndex(value, tailValuesDescSorted):
  return أول i حيث tail[i].value < value
  وإلا نهاية القائمة
```

### 6.3 Invariant: ترتيب تنازلي
المصدر: `sortTailDescendingByValue(tailList)`

```text
tail must be sorted by value descending after:
  - finishing insert
  - finishing any merge
```

### 6.4 مسافة خلف الرأس (Size-aware spacing)
المصدر: `getPlayerTailBehindDist()` و`getEnemyTailBehindDist()`

لكل segment index `i`:
```text
behindDist(i) = Σ_{j=0..i} gap(prevSize, currSize)
gap = prevSize/2 + currSize/2 + tinyPadding
tinyPadding = max(0.04, CFG.cubeSize * 0.06)
```

### 6.5 Follow-the-leader عبر PathTracker
المصدر: `PathTracker` في `src/core/PathTracker.js`

- الرأس يسجل نقاط (x,z) على مساره عند تجاوز حد مسافة `CFG.pathPointMinDist`.
- لكل segment: يتم أخذ نقطة على المسار عند مسافة `targetCumDist = pathTotalDist - behindDist(i)`.
- الإحداثيات تُنعّم باستخدام Catmull-Rom interpolation.

## 7) Merge Rules — تعريف صارم

### 7.1 أنواع الدمج
**Tail-Tail merge**
- يحدث بين عنصرين متجاورين في `tail[]`.
- شرط الدمج: `tail[i].value == tail[i+1].value`.
- النتيجة: `tail[i].value *= 2` و`tail[i+1]` يُحذف من المشهد والقائمة.

**Head-Tail merge**
- يحدث بين الرأس وأول عنصر فقط `tail[0]`.
- شرط الدمج: `tail[0].value == head.value`.
- النتيجة: `head.value *= 2` و`tail[0]` يُحذف.

### 7.2 Scheduler للدمج (بالترتيب وبـDelay)
المصدر: `updateTailFeedingFlow(dt)` و`updateEnemyTailFeedingFlow(enemy, dt)`

```text
each tick:
  if insert animation active: update it; if finished -> insert + sort
  else if tailMergeAnim active: update; if finished -> finalize merge + sort; return
  else if headTailMergeAnim active: update; if finished -> finalize head merge + sort; return
  else if tailMergeDelayTimer>0: decrement; return
  else:
    if head-tail merge is possible: start headTailMergeAnim; return
    if any adjacent equal pair exists: start tailMergeAnim(firstPairIndex); return
```

النتيجة: الدمج “متسلسل” وليس دفعة واحدة (حتى لو فيه كذا pair).

## 8) Combat / Collisions — قواعد أكل/دفع

### 8.1 Player head vs Enemy head
المصدر: `checkPlayerVsEnemyHeads()`

الحدث يُفعل عند `playerBox intersects enemyHeadBox`.

**المقارنة بالـSize**
- `playerSize = cubeSizeForValue(playerValue)`
- `enemySize  = cubeSizeForValue(enemy.value)`

**Case A: playerSize > enemySize**
- اللاعب يأكل العدو:
  - `enqueueTailValue(enemy.value)` للّاعب
  - `killCount++`
  - `resetEnemyAfterEaten(enemy)` (Respawn)

**Case B: playerSize < enemySize**
- العدو يأكل اللاعب:
  - `enqueueEnemyTailValue(enemy, playerValue)`
  - `resetPlayerAfterEaten(enemy)`
  - player يدخل respawn pending ويختفي مؤقتًا

**Case C: sizes equal**
- لا أكل
- repel/bounce:
  - حساب normal `(nx,nz)` بين الرأسين
  - حساب penetration مقابل `targetGap = playerSize/2 + enemySize/2 + 0.01`
  - دفع كلا الكيانين بنصف الاختراق داخل bounds
  - تحديث اتجاهات الحركة لعكس/تباعد

### 8.2 Player head vs Enemy tail segments
المصدر: `checkPlayerHitEnemyTail()`

الحدث يُفعل عند `playerBox intersects seg.box` (seg من Tail عدو).

**Case A: seg.value <= player.value**
- اللاعب يأكل القطعة:
  - إزالة القطعة من Tail العدو ومن المشهد
  - `enqueueTailValue(seg.value)` للّاعب

**Case B: seg.value > player.value**
- لا أكل
- resolve overlap فقط (دفع اللاعب بعيدًا عن القطعة للحفاظ على non-overlap):
  - normal = اتجاه من seg → player (أو playerMoveDir لو المسافة صفرية)
  - targetGap = playerSize/2 + segSize/2 + 0.01
  - إذا penetration>0: player.position += normal * penetration ثم clamp bounds

### 8.3 Enemy vs Enemy
المصدر: `handleEnemyVsEnemyInteractions()`

**Head vs Head**
- شرط تماس تقريبي: distance² <= ((sizeA+sizeB)/2)² + epsilon
- إذا `abs(sizeA - sizeB) <= sizeEqEps`: repel
- وإلا الأكبر يأكل الأصغر:
  - `enqueueEnemyTailValue(eater, eaten.value)`
  - `resetEnemyAfterEaten(eaten)`

**Head vs Tail (Enemy eats enemy tail)**
- يتم فحص كل `eater` ضد Tail للآخرين:
  - شرط اقتراب بالمسافة ثم Box intersection
  - إذا `segSize + sizeEqEps < eaterSize`: eater يأكل seg (تُزال من tail، وتضاف قيمتها لـQueue)
  - إذا sizes متساوية تقريبًا: repel بسيط للـhead لتجنب jitter

## 9) Enemy AI — سياسة القرار (Decision Policy)
المصدر: `pickEnemyDecision()` + helpers في `src/game/startGame.js`

### 9.1 مدخلات القرار
- Prey agent candidates:
  - اللاعب (إذا داخل radius)
  - أي Enemy آخر
  - شرط الصلاحية: `enemy.value - prey.value >= CFG.enemyPreyValueAdvantageMin`
  - شرط المسافة: داخل `CFG.enemyPreyDetectRadius`
- Prey cube candidates:
  - أي Free cube داخل `CFG.enemyPreyDetectRadius`
  - شرط الصلاحية: `cube.value <= enemy.value`
- Threat candidates:
  - اللاعب/أعداء آخرين أكبر منه
  - شرط الفعل: داخل `panicRadius`

### 9.2 ترتيب الأولويات (كما هو في الكود)
```text
if preyAgent and preyCube:
  pick the nearer (by distSq)
else if preyAgent:
  hunt_agent(preyAgent)
else if preyCube:
  hunt_cube(preyCube)
else if threat exists:
  escape(threat)
else:
  idle()
```

### 9.3 تنفيذ الحركة من القرار
- `escape`: direction = normalize(enemyPos - threatPos) و `speed *= CFG.enemyEscapeSpeedMultiplier`
- `hunt_*`: direction = normalize(targetPos - enemyPos)
- `idle`: اتجاه عشوائي يتم تغييره كل `enemyDirChangeEverySec` تقريبًا
- كل الحالات:
  - اتجاه الحركة يتم Lerp بسلاسة (`enemySteerLerpPerSecond`)
  - الاصطدام مع bounds يعكس مركبة الاتجاه المقابلة (reflect)

### 9.4 زمن إعادة التفكير (Think interval)
- `aiThinkTimer -= dt * CFG.gameSpeedMultiplier`
- عند انتهاء المؤقت:
  - يعاد حساب القرار
  - يتم اختيار interval عشوائي بين Min/Max
  - في وضع idle يتم استخدام interval أسرع لتقليل التجوال العشوائي غير المفهوم

## 10) Spawn/Respawn — إجراءات محددة

### 10.1 Spawn الأعداء في البداية
المصدر: `spawnEnemies(CFG.enemyCount)`

**Build progression**
```text
totalUnits = randInt(8, 640)
total = totalUnits * 2
parts = greedy split into descending powers of two (sum=total)
headValue = parts[0]
tailValues = parts[1..]
```

ثم:
- يتم إنشاء head mesh ثم تحديث قيمته إلى `headValue`.
- يتم إنشاء Tail من `tailValues`.
- يتم تطبيق `normalizeTailByRules(tail)`:
  - sort desc
  - دمج أي قيم متساوية متجاورة تكراريًا إلى أن تستقر
  - إزالة الزائد من meshes

### 10.2 Respawn للعدو عند ما يتاكل
المصدر: `resetEnemyAfterEaten(enemy)`
- إزالة tail meshes
- تصفير queues/animations/AI
- `enemy.value = CFG.enemyStartValue`
- اختيار مكان عشوائي داخل bounds مع محاولات متعددة لتجنب:
  - الاقتراب من اللاعب
  - الاقتراب من أعداء آخرين (minSep)
- إعادة تهيئة path history

### 10.3 Respawn للاعب عند ما يتاكل
المصدر: `resetPlayerAfterEaten(killerEnemy)` + `finishPlayerRespawn()`
- `playerValue = CFG.enemyStartValue`
- حذف Tail بالكامل
- `playerPendingRespawn = true`
- `player.visible = false`
- camera ممكن يتابع القاتل لمدة `CFG.playerDeathFollowSeconds`
- بعد انتهاء المؤقت:
  - اختيار مكان عشوائي داخل bounds مع محاولة الابتعاد عن الأعداء (شرط تقريبي 18 وحدة)
  - player.visible = true
  - reset path history

## 11) Config Surface Area — مفاتيح مؤثرة على القواعد
المصدر: `src/game/config.js`

```text
playerSpeed
gameSpeedMultiplier
playerMinSpeedFactor
playerSpeedDecayPerLevel
steerLerpPerSecond

tailInsertAnimSec
tailMergeDelaySec
tailMergeAnimSec
tailLerpPerSecond
pathPointMinDist
pathHistoryBufferDistance

collectibleCubeCount
freeCubeSpawnIntervalMinSec / MaxSec
freeCubeSpawnHeightMin / Max
freeCubeFallSpeed
freeCubeMaxCount

enemyCount
enemyStartValue
enemySpeed
enemyMinSpeedFactor
enemySpeedDecayPerLevel
enemyEscapeSpeedMultiplier
enemyDirChangeEverySec
enemySteerLerpPerSecond
enemyPreyDetectRadius
enemyThreatDetectRadius / enemyThreatPanicRadius
enemyAiThinkIntervalMinSec / MaxSec
enemyAiIdleThinkIntervalMinSec / MaxSec
enemyPreyValueAdvantageMin
enemyTailMaxSegments
```

## 12) Cheat Sheet (للاستخدام كقواعد منطقية)
- `canEatFreeCube(head, cube) := cube.value <= head.value`
- `player eats enemy head iff cubeSize(player.value) > cubeSize(enemy.value)`
- `player eats enemy tail segment iff seg.value <= player.value`
- `merge tail adjacent equals -> one doubled value`
- `merge head with tail[0] iff tail[0].value == head.value`
