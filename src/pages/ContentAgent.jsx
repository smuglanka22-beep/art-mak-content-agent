import { useState, useEffect } from "react";
import { Sparkles, Copy, Check, Loader2, MessageSquare, Image as ImageIcon, Video, Clock, Trash2, Plus, Paperclip, X, CalendarRange } from "lucide-react";
import { callClaude } from "../lib/anthropic.js";

// ============================================================
// БРЕНД-КОНТЕКСТ
// ============================================================
const BRAND_CONTEXT = `Ты пишешь контент для Art Mak — школы объёмной живописи (техника: лепка объёмных цветов из декоративной пасты мастихином). Основатель — Алёна Макушева. Аудитория: женщины 25-45, интересующиеся рисованием как хобби или источником дохода. Флагманский курс — «Цветы мира». Помимо панно Алёна иногда делает и скульптурные аксессуары в той же технике (например часы).

ГОЛОС БРЕНДА: мягкий, вдохновляющий, тёплый, рефлексивный — не продаёт агрессивно, а приглашает попробовать. Пишет как человек, который сама прошла путь через сомнения к мастерству.`;

// Реальные рубрики Telegram/MAX (3-4 поста в неделю)
const TG_RUBRICS = [
  { id: "pano_interior", label: "🖼 Панно в интерьере", cat: "product", hint: "коллаж референсов — панно в разных комнатах и стилях" },
  { id: "pano_clock", label: "🕰 Панно + часы вместе", cat: "product", hint: "единая композиция дома, перекликающиеся рельеф и цвет" },
  { id: "process", label: "🎨 Процесс из мастерской", cat: "product", hint: "закулисье техники — как лепится один элемент" },
  { id: "book", label: "📖 Книга", cat: "personal", hint: "что читает Алёна, как это перекликается с творчеством" },
  { id: "film", label: "🎬 Фильм", cat: "personal", hint: "личная рефлексия про эстетику или мастерство" },
  { id: "tools", label: "🧰 Инструменты", cat: "personal", hint: "не только для рисования — вещи, что вдохновляют в работе" },
  { id: "navigator", label: "📋 Навигатор недели", cat: "digest", hint: "дайджест постов недели, CTA «КУРС»" },
];

// Рубрики для Историй/Карусели
const STORY_RUBRICS = [
  { id: "morning", label: "Утро художника" },
  { id: "process", label: "Процесс работы" },
  { id: "advice", label: "Советы" },
  { id: "questions", label: "Вопросы" },
  { id: "path", label: "Путь и жизнь" },
  { id: "materials", label: "Материалы" },
];

const STORY_STYLES = [
  { id: "cursive", label: "Тёмный курсивный (обучающий)" },
  { id: "redtag", label: "Красный тэг (яркий)" },
];

const REELS_FORMATS = [
  { id: "mistake", label: "Разбор ошибки" },
  { id: "insight", label: "Инсайт" },
  { id: "transform", label: "Трансформация" },
  { id: "opinion", label: "Провокационное мнение" },
  { id: "tip", label: "Совет" },
  { id: "faq", label: "Частый вопрос" },
  { id: "story", label: "Личная история" },
];

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

// ============================================================
// УТИЛИТЫ
// ============================================================
function uid() { return Date.now() + "-" + Math.random().toString(36).slice(2, 8); }

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = result.split(",")[1];
      resolve({ mime: file.type, base64, dataUrl: result });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function materialContext(material) {
  if (!material) return "";
  if (material.type === "video") {
    return `\n\nК посту прикреплён видео-материал: ${material.description || "(без описания)"}`;
  }
  return `\n\nК посту прикреплено фото — посмотри на него внимательно и опирайся на реальные детали (цвета, композицию, обстановку), которые видишь.`;
}

// ============================================================
// ПРОМПТЫ
// ============================================================
function buildTGPrompt(item, weekHeadlines) {
  const rubric = TG_RUBRICS.find((r) => r.id === item.rubric);

  if (rubric.id === "navigator") {
    return `${BRAND_CONTEXT}

Напиши пост-навигатор недели для Telegram/MAX канала — дайджест того, что обсуждали на неделе.

СТРУКТУРА (строго):
- Заголовок без точки
- Короткое вступление (1-2 предложения)
- Разделитель "❔❔❔"
- Список тем недели, каждая строка начинается с "🔴 "
- Разделитель "❔❔❔"
- CTA в конце: 📌 и приглашение на бесплатный урок или курс (упомяни слово «КУРС»)

Темы недели, которые нужно перечислить:
${weekHeadlines.length ? weekHeadlines.map((h) => `- ${h}`).join("\n") : "- (темы ещё не сгенерированы — напиши обобщённо про технику объёмной живописи)"}

Ответь только готовым текстом поста, без пояснений.`;
  }

  const structureNote =
    rubric.cat === "product"
      ? `Тон: тёплый, атмосферный, экспертный. Мягкий CTA в конце — 📌 приглашение на бесплатный урок (слово «УРОК»), но не обязательно в каждом посте.`
      : `Тон: личный, рефлексивный, без прямого CTA на курс — это "человечный" контент про вкус и кругозор, не про продажу.`;

  return `${BRAND_CONTEXT}

Напиши пост для Telegram/MAX канала @art_makusheva в рубрике "${rubric.label}" (${rubric.hint}).

СТРУКТУРА (строго соблюдай):
- Заголовок без точки в конце
- 2-3 абзаца с пустой строкой между ними
- Одна ключевая мысль выделена курсивом (оформи звёздочками *так*)
- Эмодзи умеренно: ☝️ для акцента на важной мысли
- ${structureNote}

Тема/идея от Алёны: ${item.topic || "(придумай сама в рамках рубрики)"}${materialContext(item.material)}

Ответь только готовым текстом поста, без пояснений до или после.`;
}

function buildStoryPrompt(item) {
  const rubric = STORY_RUBRICS.find((r) => r.id === item.rubric);
  const style = STORY_STYLES.find((s) => s.id === item.styleId);

  return `${BRAND_CONTEXT}

Напиши текст для Instagram Stories/карусели, рубрика "${rubric.label}", визуальный стиль "${style.label}".

${item.styleId === "cursive" ? `СТРУКТУРА:
- Короткий рукописный заголовок, 2 слова, нижний регистр
- Основной текст: 1-2 коротких абзаца, короткие строки под мобильный экран
- 2-3 ключевые фразы выдели как **важно**
- Тон обучающий, по технике` : `СТРУКТУРА:
- Тэг-рубрика заглавными буквами (2-4 слова)
- Крупный заголовок до 8 слов
- Одно ключевое слово отметь как **акцент**
- Опционально короткая подпись`}

Тема от Алёны: ${item.topic || "(придумай в рамках рубрики)"}${materialContext(item.material)}

Ответь только готовым текстом, раздели части строками "---".`;
}

function buildReelsPrompt(item) {
  const format = REELS_FORMATS.find((f) => f.id === item.format);
  return `${BRAND_CONTEXT}

Придумай Reels в формате "${format.label}".

Тема от Алёны: ${item.topic || "(придумай в рамках формата)"}${materialContext(item.material)}

Ответь ТОЛЬКО валидным JSON, без markdown-оберток:
{
  "hook": "текст хука для первых 2-3 секунд",
  "storyboard": [
    {"time":"0-3с","shot":"что в кадре","action":"что делает Алёна руками/камерой","overlay_text":"текст на экране (если есть)"},
    {"time":"3-12с","shot":"...","action":"...","overlay_text":"..."},
    {"time":"12-20с","shot":"...","action":"...","overlay_text":"..."},
    {"time":"20-27с","shot":"...","action":"...","overlay_text":"..."}
  ],
  "voiceover":"полный текст закадрового голоса/озвучки одним блоком, разговорный русский, от первого лица",
  "cta":"финальная фраза с призывом на бесплатный «УРОК»",
  "captions": ["подпись 1", "подпись 2", "подпись 3"],
  "hashtags": ["#мастихин","#декоративнаяштукатурка","#тег3","#тег4","#тег5"]
}`;
}

// ============================================================
// UI ПРИМИТИВЫ
// ============================================================
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button className="copy-btn" onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "Скопировано" : "Копировать"}
    </button>
  );
}

function MaterialPicker({ materials, value, onChange }) {
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Без материала</option>
      {materials.map((m) => (
        <option key={m.id} value={m.id}>{m.type === "photo" ? "📷" : "🎬"} {m.label}</option>
      ))}
    </select>
  );
}

// ============================================================
// ГЛАВНЫЙ КОМПОНЕНТ
// ============================================================
export default function ContentAgent() {
  const [section, setSection] = useState("materials");
  const [materials, setMaterials] = useState([]);
  const [tgPosts, setTgPosts] = useState([]);
  const [stories, setStories] = useState([]);
  const [reels, setReels] = useState([]);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("artmak-week-history");
      if (raw) setHistory(JSON.parse(raw));
    } catch (e) {}
    setHistoryLoaded(true);
  }, []);
  useEffect(() => {
    if (!historyLoaded) return;
    try {
      localStorage.setItem("artmak-week-history", JSON.stringify(history));
    } catch (e) {}
  }, [history, historyLoaded]);

  // ── Материалы ──────────────────────────────────────────────
  const addMaterial = (type) => {
    setMaterials((prev) => [...prev, { id: uid(), type, label: type === "photo" ? "Новое фото" : "Новое видео", description: "", dataUrl: null, mime: null, base64: null }]);
  };
  const updateMaterial = (id, patch) => setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const removeMaterial = (id) => setMaterials((prev) => prev.filter((m) => m.id !== id));

  const handlePhotoUpload = async (id, file) => {
    if (!file) return;
    const { mime, base64, dataUrl } = await fileToBase64(file);
    updateMaterial(id, { mime, base64, dataUrl, label: file.name });
  };

  // ── ТГ посты ──────────────────────────────────────────────
  const addTgPost = () => setTgPosts((prev) => [...prev, { id: uid(), rubric: "pano_interior", topic: "", materialId: null, result: "", loading: false, error: "" }]);
  const updateTg = (id, patch) => setTgPosts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const removeTg = (id) => setTgPosts((prev) => prev.filter((p) => p.id !== id));

  // ── Сторис ──────────────────────────────────────────────
  const addStory = () => setStories((prev) => [...prev, { id: uid(), day: DAYS[0], rubric: "morning", styleId: "cursive", topic: "", materialId: null, result: "", loading: false, error: "" }]);
  const updateStory = (id, patch) => setStories((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const removeStory = (id) => setStories((prev) => prev.filter((s) => s.id !== id));

  // ── Reels ──────────────────────────────────────────────
  const addReel = () => setReels((prev) => [...prev, { id: uid(), format: "mistake", topic: "", materialId: null, result: null, loading: false, error: "" }]);
  const updateReel = (id, patch) => setReels((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeReel = (id) => setReels((prev) => prev.filter((r) => r.id !== id));

  const getMaterial = (materialId) => materials.find((m) => m.id === materialId) || null;
  const imagePayloadFor = (material) => (material?.type === "photo" && material.base64 ? { mime: material.mime, base64: material.base64 } : null);

  // ── Генерация одного элемента ──────────────────────────────
  const generateTgOne = async (item, weekHeadlines = []) => {
    updateTg(item.id, { loading: true, error: "" });
    try {
      const material = getMaterial(item.materialId);
      const prompt = buildTGPrompt({ ...item, material }, weekHeadlines);
      const text = await callClaude(prompt, imagePayloadFor(material));
      updateTg(item.id, { result: text, loading: false });
      return text;
    } catch (e) {
      updateTg(item.id, { error: e.message || "Ошибка генерации", loading: false });
      return "";
    }
  };

  const generateStoryOne = async (item) => {
    updateStory(item.id, { loading: true, error: "" });
    try {
      const material = getMaterial(item.materialId);
      const prompt = buildStoryPrompt({ ...item, material });
      const text = await callClaude(prompt, imagePayloadFor(material));
      updateStory(item.id, { result: text, loading: false });
    } catch (e) {
      updateStory(item.id, { error: e.message || "Ошибка генерации", loading: false });
    }
  };

  const generateReelOne = async (item) => {
    updateReel(item.id, { loading: true, error: "" });
    try {
      const material = getMaterial(item.materialId);
      const prompt = buildReelsPrompt({ ...item, material });
      const text = await callClaude(prompt, imagePayloadFor(material));
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      updateReel(item.id, { result: parsed, loading: false });
    } catch (e) {
      updateReel(item.id, { error: e.message || "Ошибка генерации или разбора ответа", loading: false });
    }
  };

  // ── Генерация всей недели ──────────────────────────────
  const generateWeek = async () => {
    setGeneratingAll(true);

    // 1. Сначала все ТГ-посты, кроме навигатора
    const nonNav = tgPosts.filter((p) => p.rubric !== "navigator");
    const nav = tgPosts.filter((p) => p.rubric === "navigator");
    const headlines = [];
    for (const item of nonNav) {
      const text = await generateTgOne(item);
      const firstLine = (text.split("\n").find((l) => l.trim()) || "").trim();
      if (firstLine) headlines.push(firstLine);
    }
    // 2. Навигатор — используя заголовки уже сгенерированных постов
    for (const item of nav) {
      await generateTgOne(item, headlines);
    }
    // 3. Сторис
    for (const item of stories) {
      await generateStoryOne(item);
    }
    // 4. Reels
    for (const item of reels) {
      await generateReelOne(item);
    }

    setHistory((prev) => [
      { id: uid(), date: new Date().toISOString(), tgCount: tgPosts.length, storyCount: stories.length, reelCount: reels.length },
      ...prev.slice(0, 19),
    ]);
    setGeneratingAll(false);
  };

  const totalSlots = tgPosts.length + stories.length + reels.length;

  return (
    <div className="agent-root">
      <style>{`
        .agent-root {
          --burgundy: #6B2D3E; --burgundy-dark: #5C1E2E; --cream: #F5EDE6;
          --gold: #C9A96E; --gold-dark: #C4A35A; --terracotta: #C0392B;
          --text-dark: #3D2229; --text-muted: #8A7360;
          font-family: -apple-system, "Segoe UI", sans-serif;
          background: var(--cream); color: var(--text-dark);
          padding: 30px 26px; border-radius: 4px; max-width: 960px; margin: 0 auto;
        }
        .agent-header { border-bottom: 2px solid var(--burgundy); padding-bottom: 16px; margin-bottom: 20px; display:flex; justify-content:space-between; align-items:flex-end; }
        .agent-title { font-family: Georgia, serif; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; font-size: 23px; color: var(--burgundy-dark); margin: 0 0 4px 0; }
        .agent-subtitle { font-size: 13px; color: var(--text-muted); font-style: italic; }

        .nav-row { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
        .nav-btn { display: flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 20px; border: 1px solid #E0D4C8; background: #fff; color: var(--text-muted); font-size: 13px; font-weight: 600; cursor: pointer; }
        .nav-btn.active { background: var(--burgundy-dark); color: var(--cream); border-color: var(--burgundy-dark); }
        .nav-btn .count { background: var(--gold-dark); color: #fff; border-radius: 10px; font-size: 10px; padding: 1px 6px; margin-left: 2px; }

        .panel { background: #fff; border-radius: 4px; padding: 18px 20px; box-shadow: 0 1px 3px rgba(107,45,62,0.10); margin-bottom: 14px; }
        .panel-empty { text-align:center; padding: 30px; color: var(--text-muted); font-size: 13px; font-style: italic; }

        .field-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-muted); font-weight: 700; margin-bottom: 5px; }
        select, textarea, input[type=text] { width: 100%; font-size: 13px; padding: 8px 10px; border-radius: 3px; border: 1px solid #E0D4C8; background: #FBF7F2; color: var(--text-dark); font-family: inherit; box-sizing: border-box; }
        textarea { resize: vertical; min-height: 60px; }
        .row-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px; }
        .row-grid.three { grid-template-columns: 1fr 1fr 1fr; }
        @media (max-width: 560px) {
          .row-grid, .row-grid.three { grid-template-columns: 1fr; }
        }

        .add-btn { display:flex; align-items:center; gap:6px; background: transparent; border: 1px dashed var(--gold-dark); color: var(--burgundy-dark); padding: 9px 16px; border-radius: 20px; font-size: 12px; font-weight: 700; cursor: pointer; margin-bottom: 8px; }
        .add-btn:hover { background: #FBF7F2; }

        .item-card { border: 1px solid #EFE3D8; border-radius: 4px; padding: 14px 16px; margin-bottom: 12px; position: relative; }
        .item-remove { position: absolute; top: 10px; right: 10px; background: none; border: none; color: var(--text-muted); cursor: pointer; }
        .item-remove:hover { color: var(--terracotta); }

        .gen-btn-small { display:flex; align-items:center; gap:6px; background: var(--gold-dark); color: var(--burgundy-dark); border: none; padding: 7px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; cursor: pointer; margin-top: 8px; }
        .gen-btn-small:disabled { opacity: 0.6; cursor: default; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .result-box { background: #FBF7F2; border-left: 3px solid var(--gold-dark); border-radius: 3px; padding: 14px 16px; white-space: pre-wrap; font-size: 13px; line-height: 1.6; color: var(--text-dark); margin-top: 10px; }
        .copy-btn { display: flex; align-items: center; gap: 6px; background: transparent; border: 1px solid var(--gold-dark); color: var(--burgundy-dark); padding: 6px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; cursor: pointer; margin-top: 6px; }
        .copy-btn:hover { background: var(--gold); color: #fff; }
        .error-text { color: var(--terracotta); font-size: 12px; margin-top: 6px; }

        .master-btn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; background: var(--burgundy-dark); color: var(--cream); border: none; padding: 15px; border-radius: 3px; font-size: 15px; font-weight: 700; cursor: pointer; margin: 18px 0; }
        .master-btn:disabled { opacity: 0.6; cursor: default; }

        .material-thumb { width: 100%; height: 100px; object-fit: cover; border-radius: 3px; margin-top: 8px; }
        .material-upload-btn { display:inline-flex; align-items:center; gap:6px; background:#FBF7F2; border:1px solid #E0D4C8; padding:7px 12px; border-radius:3px; font-size:12px; cursor:pointer; color: var(--text-dark); }

        .storyboard-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
        .storyboard-table th { text-align:left; background: var(--burgundy-dark); color: var(--cream); padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }
        .storyboard-table td { padding: 7px 8px; border-bottom: 1px solid #EFE3D8; vertical-align: top; }
        .hashtag-row { display:flex; flex-wrap:wrap; gap:6px; margin-top: 8px; }
        .hashtag-chip { background: var(--gold-dark); color: #fff; font-size: 11px; padding: 2px 9px; border-radius: 12px; }

        .history-item { background:#fff; border-radius:3px; padding:10px 14px; margin-bottom:6px; font-size:12px; color: var(--text-muted); box-shadow: 0 1px 2px rgba(107,45,62,0.06); }
      `}</style>

      <div className="agent-header">
        <div>
          <h1 className="agent-title">Контент-агент</h1>
          <div className="agent-subtitle">Art Mak · планирование недели</div>
        </div>
      </div>

      <div className="nav-row">
        <button className={`nav-btn ${section === "materials" ? "active" : ""}`} onClick={() => setSection("materials")}>
          <Paperclip size={14} /> Материалы <span className="count">{materials.length}</span>
        </button>
        <button className={`nav-btn ${section === "tg" ? "active" : ""}`} onClick={() => setSection("tg")}>
          <MessageSquare size={14} /> Telegram/MAX <span className="count">{tgPosts.length}</span>
        </button>
        <button className={`nav-btn ${section === "stories" ? "active" : ""}`} onClick={() => setSection("stories")}>
          <ImageIcon size={14} /> Сторис/Карусель <span className="count">{stories.length}</span>
        </button>
        <button className={`nav-btn ${section === "reels" ? "active" : ""}`} onClick={() => setSection("reels")}>
          <Video size={14} /> Reels <span className="count">{reels.length}</span>
        </button>
      </div>

      {/* ═══════════ МАТЕРИАЛЫ ═══════════ */}
      {section === "materials" && (
        <div className="panel">
          <div className="field-label" style={{ marginBottom: 12 }}>Фото и видео на неделю (можно прикрепить к постам ниже)</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <button className="add-btn" onClick={() => addMaterial("photo")}><Plus size={13} /> Добавить фото</button>
            <button className="add-btn" onClick={() => addMaterial("video")}><Plus size={13} /> Добавить видео</button>
          </div>
          {materials.length === 0 && <div className="panel-empty">Пока нет материалов — добавь фото или видео, чтобы прикрепить их к постам, сторис или reels</div>}
          {materials.map((m) => (
            <div key={m.id} className="item-card">
              <button className="item-remove" onClick={() => removeMaterial(m.id)}><X size={15} /></button>
              <div className="field-label">{m.type === "photo" ? "📷 Фото" : "🎬 Видео"} · {m.label}</div>
              {m.type === "photo" ? (
                <>
                  <label className="material-upload-btn">
                    <Paperclip size={12} /> Загрузить файл
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handlePhotoUpload(m.id, e.target.files[0])} />
                  </label>
                  {m.dataUrl && <img src={m.dataUrl} className="material-thumb" alt="" />}
                </>
              ) : (
                <textarea placeholder="Опиши в двух словах, что происходит на видео (сам видео-файл прикреплять не нужно — просто опиши содержание, чтобы я учла его при генерации)" value={m.description} onChange={(e) => updateMaterial(m.id, { description: e.target.value })} />
              )}
            </div>
          ))}
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic", marginTop: 8 }}>
            Примечание: фото и видео-описания живут только в текущей сессии — при обновлении страницы их нужно будет прикрепить заново. Тексты и история сохраняются в этом браузере.
          </div>
        </div>
      )}

      {/* ═══════════ TELEGRAM/MAX ═══════════ */}
      {section === "tg" && (
        <div className="panel">
          <button className="add-btn" onClick={addTgPost}><Plus size={13} /> Добавить пост</button>
          {tgPosts.length === 0 && <div className="panel-empty">Добавь 3-4 поста на неделю — по одному на рубрику</div>}
          {tgPosts.map((item) => (
            <div key={item.id} className="item-card">
              <button className="item-remove" onClick={() => removeTg(item.id)}><X size={15} /></button>
              <div className="row-grid">
                <div>
                  <div className="field-label">Рубрика</div>
                  <select value={item.rubric} onChange={(e) => updateTg(item.id, { rubric: e.target.value })}>
                    {TG_RUBRICS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <div className="field-label">Материал</div>
                  <MaterialPicker materials={materials} value={item.materialId} onChange={(v) => updateTg(item.id, { materialId: v })} />
                </div>
              </div>
              <div className="field-label">Тема / идея</div>
              <textarea value={item.topic} onChange={(e) => updateTg(item.id, { topic: e.target.value })} placeholder={TG_RUBRICS.find(r => r.id === item.rubric)?.hint} />
              <button className="gen-btn-small" onClick={() => generateTgOne(item)} disabled={item.loading}>
                {item.loading ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />} {item.loading ? "Пишу..." : "Сгенерировать"}
              </button>
              {item.error && <div className="error-text">{item.error}</div>}
              {item.result && (<><div className="result-box">{item.result}</div><CopyButton text={item.result} /></>)}
            </div>
          ))}
        </div>
      )}

      {/* ═══════════ СТОРИС/КАРУСЕЛЬ ═══════════ */}
      {section === "stories" && (
        <div className="panel">
          <button className="add-btn" onClick={addStory}><Plus size={13} /> Добавить сторис</button>
          {stories.length === 0 && <div className="panel-empty">Добавь сторис на дни недели</div>}
          {stories.map((item) => (
            <div key={item.id} className="item-card">
              <button className="item-remove" onClick={() => removeStory(item.id)}><X size={15} /></button>
              <div className="row-grid three">
                <div>
                  <div className="field-label">День</div>
                  <select value={item.day} onChange={(e) => updateStory(item.id, { day: e.target.value })}>
                    {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <div className="field-label">Рубрика</div>
                  <select value={item.rubric} onChange={(e) => updateStory(item.id, { rubric: e.target.value })}>
                    {STORY_RUBRICS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <div className="field-label">Стиль карточки</div>
                  <select value={item.styleId} onChange={(e) => updateStory(item.id, { styleId: e.target.value })}>
                    {STORY_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="field-label">Материал</div>
              <MaterialPicker materials={materials} value={item.materialId} onChange={(v) => updateStory(item.id, { materialId: v })} />
              <div className="field-label" style={{ marginTop: 8 }}>Тема / идея</div>
              <textarea value={item.topic} onChange={(e) => updateStory(item.id, { topic: e.target.value })} />
              <button className="gen-btn-small" onClick={() => generateStoryOne(item)} disabled={item.loading}>
                {item.loading ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />} {item.loading ? "Пишу..." : "Сгенерировать"}
              </button>
              {item.error && <div className="error-text">{item.error}</div>}
              {item.result && (<><div className="result-box">{item.result}</div><CopyButton text={item.result} /></>)}
            </div>
          ))}
        </div>
      )}

      {/* ═══════════ REELS ═══════════ */}
      {section === "reels" && (
        <div className="panel">
          <button className="add-btn" onClick={addReel}><Plus size={13} /> Добавить Reels</button>
          {reels.length === 0 && <div className="panel-empty">Добавь идеи для Reels — получишь сценарий и раскадровку по кадрам</div>}
          {reels.map((item) => (
            <div key={item.id} className="item-card">
              <button className="item-remove" onClick={() => removeReel(item.id)}><X size={15} /></button>
              <div className="row-grid">
                <div>
                  <div className="field-label">Формат</div>
                  <select value={item.format} onChange={(e) => updateReel(item.id, { format: e.target.value })}>
                    {REELS_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <div className="field-label">Материал</div>
                  <MaterialPicker materials={materials} value={item.materialId} onChange={(v) => updateReel(item.id, { materialId: v })} />
                </div>
              </div>
              <div className="field-label">Тема / идея</div>
              <textarea value={item.topic} onChange={(e) => updateReel(item.id, { topic: e.target.value })} />
              <button className="gen-btn-small" onClick={() => generateReelOne(item)} disabled={item.loading}>
                {item.loading ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />} {item.loading ? "Пишу..." : "Сгенерировать"}
              </button>
              {item.error && <div className="error-text">{item.error}</div>}
              {item.result && (
                <div style={{ marginTop: 10 }}>
                  <div className="field-label">Хук</div>
                  <div className="result-box" style={{ marginTop: 4 }}>{item.result.hook}</div>

                  <div className="field-label" style={{ marginTop: 10 }}>Раскадровка</div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="storyboard-table">
                      <thead><tr><th>Тайминг</th><th>Кадр</th><th>Действие</th><th>Текст на экране</th></tr></thead>
                      <tbody>
                        {item.result.storyboard?.map((s, i) => (
                          <tr key={i}><td>{s.time}</td><td>{s.shot}</td><td>{s.action}</td><td>{s.overlay_text}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="field-label" style={{ marginTop: 10 }}>Озвучка</div>
                  <div className="result-box" style={{ marginTop: 4 }}>{item.result.voiceover}</div>

                  <div className="field-label" style={{ marginTop: 10 }}>CTA</div>
                  <div className="result-box" style={{ marginTop: 4 }}>{item.result.cta}</div>

                  <div className="field-label" style={{ marginTop: 10 }}>Варианты подписи</div>
                  {item.result.captions?.map((c, i) => <div key={i} className="result-box" style={{ marginTop: 4 }}>{c}</div>)}

                  <div className="hashtag-row">
                    {item.result.hashtags?.map((h, i) => <span key={i} className="hashtag-chip">{h}</span>)}
                  </div>
                  <CopyButton text={`${item.result.hook}\n\n${item.result.voiceover}\n\n${item.result.cta}\n\n${(item.result.hashtags || []).join(" ")}`} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {totalSlots > 0 && (
        <button className="master-btn" onClick={generateWeek} disabled={generatingAll}>
          {generatingAll ? <Loader2 size={16} className="spin" /> : <CalendarRange size={16} />}
          {generatingAll ? "Генерирую всю неделю..." : `Сгенерировать всю неделю (${totalSlots})`}
        </button>
      )}

      {history.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div className="field-label" style={{ marginBottom: 8 }}><Clock size={11} style={{ verticalAlign: "-2px", marginRight: 4 }} />История генераций недели</div>
          {history.map((h) => (
            <div key={h.id} className="history-item">
              {new Date(h.date).toLocaleDateString("ru-RU")} — ТГ: {h.tgCount}, Сторис: {h.storyCount}, Reels: {h.reelCount}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
