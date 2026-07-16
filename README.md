# Гросбух — особистий планувальник

Календар-планер з синхронізацією між телефоном і комп'ютером через [Streamlit Cloud](https://share.streamlit.io/) та [Supabase](https://supabase.com).

## Структура проєкту

```
планер/
├── app.py                 # Streamlit — точка входу
├── requirements.txt
├── static/
│   ├── index.html         # розмітка
│   ├── css/planner.css    # стилі
│   └── js/
│       ├── storage.js     # збереження (Supabase / localStorage)
│       └── planner.js     # логіка календаря
├── supabase/schema.sql    # SQL для створення таблиці
└── planner.html           # legacy (локальний файл, без синхронізації)
```

## Важливо: не відкривайте planner.html через «Файли» на iPhone

Переглядач файлів iOS **не виконує JavaScript** — кнопки не працюють, календар порожній.  
Використовуйте **URL у Safari або Chrome** після деплою.

---

## 1. Налаштування Supabase (5 хв)

1. Створіть проєкт на [supabase.com](https://supabase.com)
2. Відкрийте **SQL Editor** → вставте вміст [`supabase/schema.sql`](supabase/schema.sql) → Run
3. У **Settings → API** скопіюйте:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`

---

## 2. Деплой на Streamlit Cloud

1. Завантажте папку `планер/` у **GitHub-репозиторій**
2. Зайдіть на [share.streamlit.io](https://share.streamlit.io/) → **New app**
3. Вкажіть репозиторій, гілку `main`, файл **`app.py`**
4. У **Settings → Secrets** додайте:

```toml
SUPABASE_URL = "https://ВАШ-ПРОЄКТ.supabase.co"
SUPABASE_ANON_KEY = "eyJ..."
PLANNER_ROW_ID = "main"
```

5. Натисніть **Deploy** — отримаєте URL на кшталт:
   `https://grosbuh-planner.streamlit.app`

---

## 3. Локальний запуск (для перевірки)

```bash
cd планер
pip install -r requirements.txt
streamlit run app.py
```

Без Secrets дані зберігаються лише в **localStorage** браузера.

З Secrets (можна створити `.streamlit/secrets.toml` локально):

```toml
SUPABASE_URL = "https://..."
SUPABASE_ANON_KEY = "eyJ..."
PLANNER_ROW_ID = "main"
```

---

## 4. Як відкрити на телефоні

| Спосіб | Інструкція |
|--------|------------|
| **Браузер** | Відкрийте URL додатку в **Safari** (iOS) або **Chrome** (Android) |
| **Закладка** | Поділитися → Додати закладку |
| **Як додаток (iOS)** | Safari → Поділитися → **На Початковий екран** |
| **Як додаток (Android)** | Chrome → меню → **Встановити додаток** |
| **QR-код** | Згенеруйте QR з URL (наприклад [qr-code-generator.com](https://www.qr-code-generator.com/)) |

Після додавання на головний екран планер відкривається як повноцінний додаток з синхронізацією через Supabase.

---

## Синхронізація даних

- Усі зміни (записи, кольори, тема) зберігаються в Supabase автоматично (~300 мс після дії)
- Той самий URL на телефоні та комп'ютері → **одні й ті самі дані**
- Один користувач (`PLANNER_ROW_ID = "main"`)

---

## Мобільні жести

- **Свайп вліво/вправо** по календарю — змінити місяць
- **Утримуй і перетягни** блок — перенести на інший день
- **Свайп вниз** по панелі дня — закрити
- **Тема** — кнопка з вибором кольору фону
