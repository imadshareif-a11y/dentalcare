# رفع نسخة تجريبية أونلاين (تيست)

هدف هذا الدليل: رابط واحد يعمل عليه مُختبِر، مع Postgres وAPI وواجهة من نفس السيرفر.

## المعمارية

- خدمة واحدة على **Railway** (أو منصة مشابهة)
- Postgres مُدار
- Backend Express يخدم `/api` + ملفات `dentalcare-frontend/dist`
- الواجهة تُبنى بـ `VITE_API_BASE=/api` (نفس الدومين)

```text
Browser  →  https://your-app.up.railway.app/
              ├── /          → React SPA
              └── /api/...   → Express
                    └── Postgres
```

## المتطلبات قبل الرفع

1. المشروع على **GitHub** (الجذر فيه `schema.sql` و`railway.toml` و`dentalcare-backend` و`dentalcare-frontend`).
2. حساب [Railway](https://railway.app) مربوط بنفس حساب GitHub.
3. قيمة قوية لـ `JWT_SECRET`.

### إذا المشروع لسه مش على GitHub

من مجلد المشروع على جهازك (PowerShell):

```powershell
# أنشئ repo فارغ على github.com ثم:
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git add .
git commit -m "Prepare trial deploy"
git push -u origin master
```

(بدّل الرابط باسم حسابك والمستودع. لا ترفع ملف `.env` فيه أسرار.)

## خطوات Railway (من الواجهة)

### أ) مشروع + قاعدة بيانات

1. ادخل [railway.app](https://railway.app) → **Login** بـ GitHub إن طُلب.
2. **New Project**.
3. اختر **Provision PostgreSQL** (أو من داخل المشروع: **+ Create** → **Database** → **PostgreSQL**).

### ب) إضافة خدمة التطبيق من GitHub — هنا اللي كنت تسأل عنه

بعد ما يصير عندك Project فيه Postgres:

1. داخل المشروع اضغط الزر **`+ Create`** (أعلى يمين اللوحة أو وسطها).
2. اختر **`GitHub Repo`** (أحيانًا اسمها **Deploy from GitHub repo**).
3. أول مرة: **Configure GitHub App** / **Grant access** واختر المستودع (أو كل الحساب).
4. من القائمة اختر مستودع **DentalCare** اللي رفعت عليه المشروع.
5. Railway بيضيف خدمة جديدة ويبدأ Deploy.

**Root Directory:**  
إذا المستودع نفسه هو مجلد المشروع وفيه `railway.toml` في الجذر → **اترك Root Directory فارغًا** (هذا هو المطلوب).  
لا تختر `dentalcare-backend` وحدها كـ Root، وإلا ما يلاقي `railway.toml` ولا يبني الواجهة.

للتأكد لاحقًا: اضغط على خدمة الويب → **Settings** → قسم **Source** / **Root Directory** → فاضي أو `/`.

### ج) ربط قاعدة البيانات والمتغيرات

1. اضغط خدمة **الويب** (مش Postgres) → تبويب **Variables**.
2. **Add Variable** / **Variable Reference**:
   - اسم: `DATABASE_URL`
   - قيمة: من Postgres → عادة `Postgres.DATABASE_URL` (Reference)
3. أضف يدويًا:
   - `JWT_SECRET` = سلسلة عشوائية طويلة
   - `NODE_ENV` = `production`
4. احفظ؛ غالبًا يعيد Deploy تلقائيًا.

### د) رابط الموقع للمُختبِر

1. خدمة الويب → **Settings** → **Networking** → **Generate Domain**.
2. انسخ الرابط `https://….up.railway.app`.

### هـ) تهيئة القاعدة مرة واحدة

1. خدمة الويب → **Shell** (أو **Railway CLI**).
2. انتظر حتى يكتمل آخر **Deploy** من GitHub، ثم نفّذ:

```bash
npm run patch:trial-db
npm run migrate:all
npm run seed:trial
```

`patch:trial-db` يصلح أعمدة/جداول أساسية ناقصة على Postgres فاضي.  
`migrate:all` يكمّل باقي الـ migrations (عيادات، عملات، صناديق، …).

## خطوات Railway (ملخص قديم)

1. **New Project** → أضف **PostgreSQL**.
2. **`+ Create` → `GitHub Repo`** (Root Directory فارغ إن `railway.toml` بالجذر).
3. اربط `DATABASE_URL` + `JWT_SECRET` + `NODE_ENV=production`.
4. Generate Domain.
5. Shell: `migrate:all` ثم `seed:trial`.

## حسابات التيست الافتراضية (`seed:trial`)

| الدخول | رمز العيادة | المستخدم | كلمة المرور الافتراضية |
|--------|-------------|----------|-------------------------|
| مدير المنصة | (فارغ) | `platform` | `TrialPlatform1!` |
| مالك العيادة | يظهر في مخرجات الـ seed (`slug`) | `owner` | `TrialOwner1!` |

غيّر كلمات المرور فورًا بعد التيست. يمكن تخصيصها عبر:

```bash
TRIAL_PLATFORM_USER=platform
TRIAL_PLATFORM_PASSWORD='...'
TRIAL_CLINIC_NAME='عيادة تجريبية'
TRIAL_CLINIC_USER=owner
TRIAL_CLINIC_PASSWORD='...'
```

## بناء محلي للتحقق

```bash
# من جذر المشروع
cd dentalcare-frontend
set VITE_API_BASE=/api
npm ci
npm run build

cd ../dentalcare-backend
set NODE_ENV=production
set SERVE_FRONTEND=1
npm start
```

على Linux/macOS استخدم `export VITE_API_BASE=/api` بدل `set`.

## ملاحظات أمان للنسخة التجريبية

- لا تضع بيانات مرضى حقيقية.
- عطّل واتساب/AI أو استخدم مفاتيح تجريبية فقط.
- لا تشارك حساب `platform` مع المُختبِر إن لم يلزم.
- النسخة ليست إنتاجًا نهائيًا (نسخ احتياطي مجدول، دومين خاص، مراقبة).

## استكشاف أخطاء شائعة

| العرض | السبب المحتمل |
|--------|----------------|
| صفحة بيضاء + 404 على `/` | لم يُبنَ `dentalcare-frontend/dist` أو `SERVE_FRONTEND=0` |
| API يعمل والواجهة تفشل على localhost:5000 | البناء بدون `VITE_API_BASE=/api` |
| خطأ اتصال DB | `DATABASE_URL` غير مربوط أو SSL |
| `schema.sql not found` | Root Directory ليس جذر المستودع |
| عملات/صناديق مكررة | تشغيل `seed` + `migrate` أكثر من مرة — نفّذ `npm run dedupe:financials` |
| شجرة حسابات مكررة (نفس الرقم) | نفس السبب — `dedupe:financials` يدمج حسب الرمز + الاسم |

## أوامر مفيدة

```bash
npm run patch:trial-db  # إصلاح سريع لجداول/أعمدة ناقصة
npm run migrate:all     # schema + كل migrations
npm run dedupe:financials  # إزالة عملات/صناديق مكررة (مرة بعد التكرار)
npm run seed:trial      # منصة + عيادة تجريبية (idempotent)
npm start               # تشغيل الـ API (+ SPA في الإنتاج)
```
