# Local integration accounts

> Superseded: `seed_rating_demo` is retired. Use the isolated scenario demo in
> [demo.md](demo.md). The older credentials and commands below are historical
> reference only; they are not the current setup procedure.

This seed is intentionally limited to `development` and `test`. It is repeatable and does not delete unrelated data.

The application runtime never substitutes frontend-only fixtures for the API.
This optional command only creates predictable accounts in a local Django
database for manual integration testing.

## Quick setup

```powershell
$env:DJANGO_ENVIRONMENT="development"
python manage.py migrate
python manage.py seed_rating_demo
```

Both test accounts use `DemoRating123!`:

| State | Phone | Target doctor | Expected result |
|---|---|---|---|
| Eligible | `09121111101` | `/doctors/arman-hosseini` | Multipart rating modal opens |
| Blocked | `09121111102` | `/doctors/arman-hosseini` | «شما هنوز به این پزشک مراجعه نکردید» |

Use «خروج از حساب کاربری» in the user panel to switch accounts.

## Seeded ratings and comments

| Doctor | Rating | Comment |
|---|---:|---|
| آرمان حسینی | 5 | برخورد بسیار محترمانه بود و درباره روند درمان کامل توضیح دادند. |
| آرمان حسینی | 4 | درمان ریشه با دقت انجام شد و درد بعد از درمان خیلی کم بود. |
| آرمان حسینی | 5 | برای درمان مجدد مراجعه کردم؛ نتیجه عالی و زمان انتظار مناسب بود. |
| نازنین کریمی | 5 | طراحی روکش بسیار طبیعی بود و نتیجه از انتظارم بهتر شد. |
| نازنین کریمی | 4 | توضیحات دقیق و برخورد حرفه‌ای؛ پذیرش هم منظم انجام شد. |
| نازنین کریمی | 4 | کار باکیفیت بود و درباره مراقبت‌های بعد از درمان راهنمایی شدم. |
| سارا مرادی | 5 | با صبوری اضطراب کودک را کم کردند و تجربه خیلی خوبی داشتیم. |
| سارا مرادی | 5 | محیط مناسب کودک و توضیحات روشن برای والدین بسیار عالی بود. |
| سارا مرادی | 4 | رفتار تیم پذیرش خوب بود و فرزندم بدون ترس درمان شد. |
| رضا احمدی | 5 | جراحی با برنامه‌ریزی دقیق انجام شد و دوره نقاهت راحتی داشتم. |
| رضا احمدی | 4 | پزشک باحوصله بود و همه مراحل جراحی را قبل از شروع توضیح داد. |
| رضا احمدی | 4 | نتیجه درمان خوب بود؛ فقط زمان انتظار کمی طولانی شد. |
| پریسا ابراهیمی | 5 | روند ارتودنسی منظم و نتیجه لبخند بسیار رضایت‌بخش بود. |
| پریسا ابراهیمی | 4 | در هر جلسه پیشرفت درمان را واضح توضیح می‌دادند. |
| پریسا ابراهیمی | 5 | برخورد عالی، محیط تمیز و برنامه‌ریزی نوبت‌ها دقیق بود. |
| میلاد صادقی | 4 | درمان لثه با دقت انجام شد و آموزش مراقبت خانگی مفید بود. |
| میلاد صادقی | 5 | تشخیص دقیق و پیگیری بعد از درمان باعث اطمینان من شد. |
| میلاد صادقی | 4 | رفتار حرفه‌ای و نتیجه درمان خوب بود. |
| لیلا رحمانی | 5 | تصویربرداری سریع انجام شد و گزارش بسیار کامل بود. |
| لیلا رحمانی | 4 | محیط منظم و توضیحات پزشک درباره نتیجه تصویر واضح بود. |
| لیلا رحمانی | 5 | بدون معطلی کار انجام شد و برخورد کارکنان عالی بود. |
| نیما فرهادی | 4 | برای تشخیص ضایعه دهانی با دقت معاینه و راهنمایی شدم. |
| نیما فرهادی | 5 | توضیحات علمی و قابل فهم بود و درمان نتیجه خوبی داشت. |
| نیما فرهادی | 4 | پزشک صبور و دقیق بود و روند پیگیری منظم انجام شد. |
