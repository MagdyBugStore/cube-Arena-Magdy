# خطة نقل “قواعد اللعبة فقط” من study إلى كودنا

## الهدف
- نقل قواعد اللعب الأساسية (الأكل/الدمج/النقاط/القتال/الـrespawn/سلوك الأعداء) كما هي موصوفة في [GAME_RULES.md](file:///c:/Users/A/OneDrive/Desktop/Cubes%202048.io%20%F0%9F%95%B9%EF%B8%8F%20Play%20on%20CrazyGames_files/study/GAME_RULES.md).
- إبقاء كل ما يخص الشكل والحركة والإحساس (سرعات اللاعبين، أحجامهم الفعلية، شكل المكعب، طريقة تحرك الرأس والذيل، شكل الأرض والـmap) كما هو في كودنا الحالي.

## المرجع الرسمي للقواعد
- القواعد مكتوبة بشكل “قابل للتنفيذ” داخل [GAME_RULES.md](file:///c:/Users/A/OneDrive/Desktop/Cubes%202048.io%20%F0%9F%95%B9%EF%B8%8F%20Play%20on%20CrazyGames_files/study/GAME_RULES.md).
- مصدر الحقيقة في نسخة الدراسة (للمراجعة فقط أثناء النقل):
  - [startGame.js](file:///c:/Users/A/OneDrive/Desktop/Cubes%202048.io%20%F0%9F%95%B9%EF%B8%8F%20Play%20on%20CrazyGames_files/study/src/game/startGame.js)
  - [FreeCubeSpawner.js](file:///c:/Users/A/OneDrive/Desktop/Cubes%202048.io%20%F0%9F%95%B9%EF%B8%8F%20Play%20on%20CrazyGames_files/study/src/systems/FreeCubeSpawner.js)
  - [PathTracker.js](file:///c:/Users/A/OneDrive/Desktop/Cubes%202048.io%20%F0%9F%95%B9%EF%B8%8F%20Play%20on%20CrazyGames_files/study/src/core/PathTracker.js)

## ما الذي سنعتبره “قواعد” وما الذي سنعتبره “إحساس/حركة” في كودنا؟
- قواعد (سننقلها): شروط الأكل، إدخال قيم للذيل عبر Queue، ترتيب الذيل، الدمج (Tail-Tail + Head-Tail) وترتيبه الزمني، قواعد قتال الرأس/الرأس والرأس/ذيل، إجراءات respawn.
- إحساس/حركة (لن نغيره): طريقة تحريك اللاعب واتجاهه، تتبع الذيل لمسار اللاعب كما هو عندنا، السرعات، حجم المكعبات/شكلها كما هي في [CubeFactory.js](file:///c:/Users/A/OneDrive/Desktop/Cubes%202048.io%20%F0%9F%95%B9%EF%B8%8F%20Play%20on%20CrazyGames_files/src/entities/CubeFactory.js) و[Player.js](file:///c:/Users/A/OneDrive/Desktop/Cubes%202048.io%20%F0%9F%95%B9%EF%B8%8F%20Play%20on%20CrazyGames_files/src/entities/Player.js).

## ملخص القواعد التي سيتم نقلها (مختصر تنفيذي)
- أكل مكعب FREE: مسموح إذا `cube.value <= head.value`، والأكل لا يرفع قيمة الرأس مباشرة؛ بل يضيف القيمة إلى Queue للذيل.
- إدخال قيمة للذيل: القيمة تدخل من Queue، وتُدرج في الذيل بحيث يظل الذيل مرتبًا تنازليًا بالقيم.
- الدمج:
  - Head-Tail: إذا قيمة أول ذيل == قيمة الرأس ⇒ الرأس يتضاعف والقطعة تُزال.
  - Tail-Tail: إذا قطعتان متجاورتان في الذيل لهما نفس القيمة ⇒ تُدمجان إلى قطعة واحدة بقيمة مضاعفة.
  - الدمج متسلسل (ليس كل الدمجات دفعة واحدة): في كل tick يتم تنفيذ “حدث دمج واحد” بعد delays قصيرة.
- قتال Player vs Enemy:
  - Head vs Head: الأكبر (حسب الحجم/القيمة) يأكل الأصغر؛ المتساويان يحصل repel فقط.
  - Head vs Enemy Tail: لو `seg.value <= player.value` اللاعب يأكل القطعة؛ وإلا يحصل resolve overlap فقط بدون أكل.
- Respawn:
  - عند موت اللاعب: يتم تصفير الذيل وإرجاع قيمة الرأس للقيمة الابتدائية، ثم respawn في مكان آمن (بعيد عن الأعداء).
  - عند أكل عدو: respawn للعدو بنفس فكرة مكان آمن مع تصفير ذيله.

## خريطة نقل القواعد إلى كودنا الحالي
### 1) تعريف “State” للقواعد بدون لمس الحركة
- نضيف Game State بسيط يخص القواعد فقط:
  - `playerValue` (قيمة رأس اللاعب) بدل الاعتماد على قيمة Cube الحالية فقط.
  - `tailValues: number[]` مرآة لقيم الذيل (نحدث Cube.setValue على القطع الموجودة بالفعل).
  - `tailInsertQueue: number[]`
  - `mergeTimers/state` لتنفيذ الدمج المتسلسل بالـdt (حتى لو لم نعمل أنيميشن).
- الـPlayer الحالي عندنا [Player.js](file:///c:/Users/A/OneDrive/Desktop/Cubes%202048.io%20%F0%9F%95%B9%EF%B8%8F%20Play%20on%20CrazyGames_files/src/entities/Player.js) سيظل مسؤولًا عن الحركة والتتبع، لكن سنسمح للذيل أن يزيد/ينقص عدده حسب القواعد بدل `tailLength` الثابت.

### 2) Free Cubes (Collectibles)
- نضيف كيان FreeCube بسيط:
  - `value`
  - `mesh`
  - `bounding box/sphere`
  - `fallSpeed` (اختياري؛ لو عندنا نظام سقوط بالفعل نستخدمه، وإلا نجعلها ثابتة على الأرض)
- نعمل spawner على نمط [FreeCubeSpawner.js](file:///c:/Users/A/OneDrive/Desktop/Cubes%202048.io%20%F0%9F%95%B9%EF%B8%8F%20Play%20on%20CrazyGames_files/study/src/systems/FreeCubeSpawner.js):
  - القيم المحتملة: `[1, 2, 4, 8, 16]`
  - حد أقصى لعدد المكعبات على الخريطة
  - spawn interval min/max

### 3) الاصطدام: أكل الـFREE
- كل frame:
  - نحسب تقاطع رأس اللاعب مع FreeCubes.
  - إذا `cube.value <= playerValue` ⇒ نحذف المكعب ونضيف قيمته إلى `tailInsertQueue`.
  - غير ذلك ⇒ لا يحدث شيء.

### 4) Tail Feeding Flow (Queue → Insert → Merge)
- عندما تكون Queue غير فارغة ولا يوجد merge جاري:
  - نسحب قيمة واحدة ونضيف “قطعة ذيل” جديدة.
  - إدراجها في المكان الصحيح للحفاظ على الترتيب التنازلي (أول index حيث `tail[i] < value`).
- بعد الإدراج:
  - نبدأ مؤقت دمج (delay).
  - في كل tick وبعد انتهاء التأخير ننفذ قاعدة واحدة فقط بالترتيب:
    - Head-Tail merge لو ممكن
    - وإلا أول Tail-Tail merge موجود
  - بعد كل دمج: نعيد ترتيب الذيل تنازليًا.
- تمثيل الذيل بصريًا:
  - نضيف/نحذف عناصر `Player.tail` (Cube instances) عند الحاجة.
  - تحديث القيمة يتم عبر `Cube.setValue()` على القطع الموجودة.
  - لا نغير خوارزمية تحريك الذيل الحالية؛ فقط عدد القطع وقيمها.

### 5) قتال Player vs Enemies
- نضيف Enemies كـPlayers/NPCs بنفس كلاس [Player.js](file:///c:/Users/A/OneDrive/Desktop/Cubes%202048.io%20%F0%9F%95%B9%EF%B8%8F%20Play%20on%20CrazyGames_files/src/entities/Player.js) أو كلاس Enemy منفصل لكن بنفس “حركة/تتبع” موجودة في كودنا.
- قواعد القتال:
  - Head-Head: مقارنة بالحجم الموجود فعلًا عندنا (`cube.size`) أو بالقيمة (`cube.value`) لأنهما مرتبطين.
  - عند الأكل: قيمة المأكول تُضاف إلى Queue للآكل، والمأكول يعمل respawn.
  - Head vs Enemy Tail: نفس شرط `seg.value <= head.value` للأكل؛ وإلا push بسيط/resolve overlap بدون تدمير.

### 6) Respawn
- Respawn اللاعب:
  - إعادة `playerValue` للقيمة الابتدائية (مثلاً 2).
  - حذف الذيل بالكامل.
  - اختيار مكان spawn بعيد عن الأعداء داخل bounds الحالية (bounds عندنا من `mapSize`).
- Respawn العدو:
  - نفس الفكرة مع إعادة القيمة الابتدائية وتصفير الذيل.

### 7) Score/HUD (لو مطلوب)
- لو نريد نفس منطق الدراسة: score الأساسي مرتبط بقيمة الرأس (مع killCount).
- في كودنا لا يوجد HUD حاليًا؛ نقرر لاحقًا هل نعرضه أم لا، بدون أن يؤثر على القواعد.

## خطة التنفيذ (مراحل)
1) فصل قواعد اللعبة في Module “pure rules” (دوال تعمل على أرقام/arrays) ثم طبقة “ربط” تغيّر الـMeshes/Cubes.
2) إضافة FreeCubes + spawner داخل حلقة التحديث الموجودة في [src/main.js](file:///c:/Users/A/OneDrive/Desktop/Cubes%202048.io%20%F0%9F%95%B9%EF%B8%8F%20Play%20on%20CrazyGames_files/src/main.js).
3) تطبيق قواعد الأكل للاعب → Queue.
4) تطبيق Tail insert + merge scheduler تدريجيًا (بدون أنيميشن مبدئيًا).
5) إضافة أعداء + قرار AI بسيط (hunt/escape/idle) على نفس سياسة study، لكن مع الحفاظ على حركة/سرعة كودنا.
6) إضافة collision rules الخاصة بالقتال (head/head وhead/tail).
7) اختبار القواعد عبر حالات ثابتة (مثلاً: إدخال قيم [2,2,2] يعطي دمجات متسلسلة صحيحة) ثم اختبار بصري داخل المشهد.

## معايير القبول (Definition of Done)
- Free cubes لا تُؤكل إلا إذا قيمتها <= قيمة الرأس.
- الأكل يزيد Queue فقط، وليس قيمة الرأس مباشرة.
- الذيل يظل مرتبًا تنازليًا بعد أي إدخال أو دمج.
- الدمج يحدث وفق التسلسل: Head-Tail أولًا ثم Tail-Tail، وبحدث واحد في كل tick (مع delays).
- قتال الرأس/الرأس: الأكبر يأكل الأصغر، والمتساويان repel فقط.
- Respawn يعيد القيم والذيل بشكل صحيح ويمنع spawn فوق تهديد مباشر.
