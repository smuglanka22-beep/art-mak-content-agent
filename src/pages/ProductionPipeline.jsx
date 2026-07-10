import { useState, useEffect } from "react";
import { Sparkles, Copy, Check, Loader2, MessageSquare, Image as ImageIcon, Video, Clock, Paperclip, X, Film, CalendarDays, Music } from "lucide-react";
import { callClaude } from "../lib/anthropic.js";

// ============================================================
// БРЕНД-КОНТЕКСТ
// ============================================================
const BRAND_CONTEXT = `Ты пишешь контент для Art Mak — школы объёмной живописи (техника: лепка объёмных цветов из декоративной пасты мастихином). Основатель — Алёна Макушева. Аудитория: женщины 25-45. Флагманский курс — «Цветы мира». Помимо панно Алёна иногда делает скульптурные аксессуары (например часы).

ГОЛОС БРЕНДА: мягкий, вдохновляющий, тёплый, рефлексивный — не продаёт агрессивно, а приглашает попробовать.`;

const TG_RUBRICS = [
  { id: "pano_interior", label: "🖼 Панно в интерьере", cat: "product", hint: "коллаж референсов" },
  { id: "pano_clock", label: "🕰 Панно + часы вместе", cat: "product", hint: "единая композиция дома" },
  { id: "process", label: "🎨 Процесс из мастерской", cat: "product", hint: "закулисье техники" },
  { id: "book", label: "📖 Книга", cat: "personal", hint: "что читает Алёна" },
  { id: "film", label: "🎬 Фильм", cat: "personal", hint: "личная рефлексия" },
  { id: "tools", label: "🧰 Инструменты", cat: "personal", hint: "вещи, что вдохновляют" },
  { id: "navigator", label: "📋 Навигатор недели", cat: "digest", hint: "дайджест недели" },
];
const STORY_RUBRICS = [
  { id: "morning", label: "Утро художника" }, { id: "process", label: "Процесс работы" },
  { id: "advice", label: "Советы" }, { id: "questions", label: "Вопросы" },
  { id: "path", label: "Путь и жизнь" }, { id: "materials", label: "Материалы" },
];
const STORY_STYLES = [
  { id: "cursive", label: "Тёмный курсивный" }, { id: "redtag", label: "Красный тэг" },
];
const REELS_FORMATS = [
  { id: "mistake", label: "Разбор ошибки" }, { id: "insight", label: "Инсайт" },
  { id: "transform", label: "Трансформация" }, { id: "opinion", label: "Провокац. мнение" },
  { id: "tip", label: "Совет" }, { id: "faq", label: "Частый вопрос" }, { id: "story", label: "Личная история" },
];
const TYPE_META = {
  tg: { label: "Telegram/MAX", icon: MessageSquare, rubrics: TG_RUBRICS },
  story: { label: "Сторис/Карусель", icon: ImageIcon, rubrics: STORY_RUBRICS },
  reel: { label: "Reels", icon: Video, rubrics: REELS_FORMATS },
};
const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const STATUSES = ["Идея", "Снято", "Готово", "Опубликовано"];
const STATUS_COLOR = { "Идея": "#8A7360", "Снято": "#C4A35A", "Готово": "#6B2D3E", "Опубликовано": "#3D7A4E" };

function uid() { return Date.now() + "-" + Math.random().toString(36).slice(2, 8); }

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ mime: file.type, base64: reader.result.split(",")[1], dataUrl: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function materialContext(material) {
  if (!material) return "";
  if (material.type === "video") return `\n\nК посту прикреплён видео-материал: ${material.description || "(без описания)"}`;
  return `\n\nК посту прикреплено фото — опирайся на реальные детали, которые видишь.`;
}

// ── ПРОМПТЫ ──────────────────────────────────────────────
function buildTGPrompt(item, weekHeadlines) {
  const rubric = TG_RUBRICS.find((r) => r.id === item.rubric);
  if (rubric.id === "navigator") {
    return `${BRAND_CONTEXT}\n\nНапиши пост-навигатор недели — дайджест того, что обсуждали.\n\nСТРУКТУРА: заголовок без точки; вступление 1-2 предложения; "❔❔❔"; список "🔴 " по теме; "❔❔❔"; CTA 📌 со словом «КУРС».\n\nТемы недели:\n${weekHeadlines.length ? weekHeadlines.map((h) => `- ${h}`).join("\n") : "- (обобщённо про объёмную живопись)"}\n\nОтветь только текстом поста.`;
  }
  const note = rubric.cat === "product"
    ? `Тон тёплый, атмосферный. Мягкий CTA 📌 со словом «УРОК», не обязательно.`
    : `Тон личный, рефлексивный, без CTA на курс.`;
  return `${BRAND_CONTEXT}\n\nНапиши пост в рубрике "${rubric.label}" (${rubric.hint}).\n\nСТРУКТУРА: заголовок без точки; 2-3 абзаца с отступом; ключевая мысль курсивом *так*; ☝️ для акцента. ${note}\n\nТема: ${item.topic || "(придумай сама)"}${materialContext(item.material)}\n\nОтветь только текстом поста.`;
}
function buildStoryPrompt(item) {
  const rubric = STORY_RUBRICS.find((r) => r.id === item.rubric);
  const style = STORY_STYLES.find((s) => s.id === item.styleId);
  return `${BRAND_CONTEXT}\n\nНапиши текст для Stories/карусели, рубрика "${rubric.label}", стиль "${style.label}".\n\n${item.styleId === "cursive" ? `Короткий рукописный заголовок 2 слова, нижний регистр; 1-2 коротких абзаца; 2-3 фразы как **важно**; тон обучающий.` : `Тэг-рубрика заглавными (2-4 слова); крупный заголовок до 8 слов, ключевое слово как **акцент**; опционально короткая подпись.`}\n\nТема: ${item.topic || "(придумай)"}${materialContext(item.material)}${item.music ? `\n\nМузыка для оформления: ${item.music}` : ""}\n\nОтветь только текстом, раздели части "---".`;
}
function buildReelsPrompt(item) {
  const format = REELS_FORMATS.find((f) => f.id === item.format);
  return `${BRAND_CONTEXT}\n\nПридумай Reels в формате "${format.label}".\n\nТема: ${item.topic || "(придумай)"}${materialContext(item.material)}${item.music ? `\n\nЖелаемая музыка для наложения: ${item.music} — учти ритм при таймингах кадров.` : ""}\n\nОтветь ТОЛЬКО валидным JSON:\n{\n  "hook": "хук 2-3с",\n  "storyboard": [\n    {"time":"0-3с","shot":"кадр","action":"действие","overlay_text":"текст"},\n    {"time":"3-12с","shot":"...","action":"...","overlay_text":"..."},\n    {"time":"12-20с","shot":"...","action":"...","overlay_text":"..."},\n    {"time":"20-27с","shot":"...","action":"...","overlay_text":"..."}\n  ],\n  "voiceover":"текст озвучки",\n  "cta":"призыв на «УРОК»",\n  "editing_notes":"короткие заметки для монтажа: переходы, темп, где ускорить/акцентировать под музыку",\n  "captions": ["подпись 1","подпись 2","подпись 3"],\n  "hashtags": ["#мастихин","#декоративнаяштукатурка","#тег3","#тег4","#тег5"]\n}`;
}

// ── UI ПРИМИТИВЫ ──────────────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button className="copy-btn" onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
      {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Скопировано" : "Копировать"}
    </button>
  );
}
function MaterialPicker({ materials, value, onChange }) {
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Без материала</option>
      {materials.map((m) => <option key={m.id} value={m.id}>{m.type === "photo" ? "📷" : "🎬"} {m.label}</option>)}
    </select>
  );
}
function resultText(item) {
  if (!item.result) return "";
  if (item.type === "reel") {
    const r = item.result;
    return `${r.hook}\n\n${r.voiceover}\n\n${r.cta}\n\n${(r.hashtags || []).join(" ")}`;
  }
  return item.result;
}

// ============================================================
export default function ProductionPipeline({ pendingSeed, onSeedConsumed }) {
  const [section, setSection] = useState("materials");
  const [materials, setMaterials] = useState([]);
  const [items, setItems] = useState([]);
  const [typeFilter, setTypeFilter] = useState("all");
  const [generatingAll, setGeneratingAll] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("artmak-pipeline-history");
      if (raw) setHistory(JSON.parse(raw));
    } catch (e) {}
    setHistoryLoaded(true);
  }, []);
  useEffect(() => {
    if (!historyLoaded) return;
    try {
      localStorage.setItem("artmak-pipeline-history", JSON.stringify(history));
    } catch (e) {}
  }, [history, historyLoaded]);

  // ── Материалы ──
  const addMaterial = (type) => setMaterials((p) => [...p, { id: uid(), type, label: type === "photo" ? "Новое фото" : "Новое видео", description: "", dataUrl: null, mime: null, base64: null }]);
  const updateMaterial = (id, patch) => setMaterials((p) => p.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const removeMaterial = (id) => setMaterials((p) => p.filter((m) => m.id !== id));
  const handlePhotoUpload = async (id, file) => { if (!file) return; const { mime, base64, dataUrl } = await fileToBase64(file); updateMaterial(id, { mime, base64, dataUrl, label: file.name }); };

  // ── Единый список контента ──
  const addItem = (type, overrides = {}) => {
    const base = { id: uid(), type, day: DAYS[0], time: "10:00", topic: "", materialId: null, music: "", status: "Идея", result: null, loading: false, error: "" };
    if (type === "tg") base.rubric = "pano_interior";
    if (type === "story") { base.rubric = "morning"; base.styleId = "cursive"; }
    if (type === "reel") base.format = "mistake";
    setItems((p) => [...p, { ...base, ...overrides }]);
  };
  const updateItem = (id, patch) => setItems((p) => p.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removeItem = (id) => setItems((p) => p.filter((it) => it.id !== id));
  const getMaterial = (materialId) => materials.find((m) => m.id === materialId) || null;
  const imagePayloadFor = (material) => (material?.type === "photo" && material.base64 ? { mime: material.mime, base64: material.base64 } : null);

  // ── Приём идеи из дашборда конкурентов ──
  useEffect(() => {
    if (!pendingSeed) return;
    setSection("plan");
    setTypeFilter("all");
    addItem("reel", { topic: pendingSeed });
    onSeedConsumed?.();
  }, [pendingSeed]);

  const generateOne = async (item, weekHeadlines = []) => {
    updateItem(item.id, { loading: true, error: "" });
    try {
      const material = getMaterial(item.materialId);
      const full = { ...item, material };
      let text, resultValue;
      if (item.type === "tg") { text = await callClaude(buildTGPrompt(full, weekHeadlines), imagePayloadFor(material)); resultValue = text; }
      else if (item.type === "story") { text = await callClaude(buildStoryPrompt(full), imagePayloadFor(material)); resultValue = text; }
      else { text = await callClaude(buildReelsPrompt(full), imagePayloadFor(material), 1800); resultValue = JSON.parse(text.replace(/```json|```/g, "").trim()); }
      updateItem(item.id, { result: resultValue, loading: false, status: item.status === "Идея" ? "Готово" : item.status });
      return typeof resultValue === "string" ? resultValue : resultValue.hook;
    } catch (e) {
      updateItem(item.id, { error: e.message || "Ошибка генерации", loading: false });
      return "";
    }
  };

  const generateWeek = async () => {
    setGeneratingAll(true);
    const tgItems = items.filter((i) => i.type === "tg");
    const nonNav = tgItems.filter((i) => i.rubric !== "navigator");
    const nav = tgItems.filter((i) => i.rubric === "navigator");
    const headlines = [];
    for (const it of nonNav) { const t = await generateOne(it); const first = (t.split("\n").find((l) => l.trim()) || "").trim(); if (first) headlines.push(first); }
    for (const it of nav) await generateOne(it, headlines);
    for (const it of items.filter((i) => i.type !== "tg")) await generateOne(it);
    setHistory((p) => [{ id: uid(), date: new Date().toISOString(), count: items.length }, ...p.slice(0, 19)]);
    setGeneratingAll(false);
  };

  const filteredItems = typeFilter === "all" ? items : items.filter((i) => i.type === typeFilter);
  const dayOrder = (d) => DAYS.indexOf(d);
  const sortedForCalendar = [...items].sort((a, b) => dayOrder(a.day) - dayOrder(b.day) || (a.time || "").localeCompare(b.time || ""));
  const shootList = items.filter((i) => i.type === "reel" || i.type === "story" || (i.type === "tg" && TG_RUBRICS.find(r=>r.id===i.rubric)?.cat === "product"));

  const copyCalendarAsText = () => {
    const lines = sortedForCalendar.map((i) => {
      const meta = TYPE_META[i.type];
      const label = i.type === "tg" ? TG_RUBRICS.find(r=>r.id===i.rubric)?.label : i.type === "story" ? STORY_RUBRICS.find(r=>r.id===i.rubric)?.label : REELS_FORMATS.find(r=>r.id===i.format)?.label;
      return `${i.day} ${i.time} — [${meta.label}] ${label} — ${i.topic || "(без темы)"} — статус: ${i.status}`;
    });
    navigator.clipboard.writeText(lines.join("\n"));
  };

  return (
    <div className="pipe-root">
      <style>{`
        .pipe-root { --burgundy:#6B2D3E; --burgundy-dark:#5C1E2E; --cream:#F5EDE6; --gold:#C9A96E; --gold-dark:#C4A35A; --terracotta:#C0392B; --text-dark:#3D2229; --text-muted:#8A7360;
          font-family:-apple-system,"Segoe UI",sans-serif; background:var(--cream); color:var(--text-dark); padding:30px 26px; border-radius:4px; max-width:1020px; margin:0 auto; }
        .pipe-header { border-bottom:2px solid var(--burgundy); padding-bottom:16px; margin-bottom:20px; }
        .pipe-title { font-family:Georgia,serif; font-weight:700; text-transform:uppercase; letter-spacing:.5px; font-size:23px; color:var(--burgundy-dark); margin:0 0 4px 0; }
        .pipe-subtitle { font-size:13px; color:var(--text-muted); font-style:italic; }
        .nav-row { display:flex; gap:8px; margin-bottom:18px; flex-wrap:wrap; }
        .nav-btn { display:flex; align-items:center; gap:6px; padding:9px 16px; border-radius:20px; border:1px solid #E0D4C8; background:#fff; color:var(--text-muted); font-size:13px; font-weight:600; cursor:pointer; }
        .nav-btn.active { background:var(--burgundy-dark); color:var(--cream); border-color:var(--burgundy-dark); }
        .nav-btn .count { background:var(--gold-dark); color:#fff; border-radius:10px; font-size:10px; padding:1px 6px; margin-left:2px; }
        .panel { background:#fff; border-radius:4px; padding:18px 20px; box-shadow:0 1px 3px rgba(107,45,62,.1); margin-bottom:14px; }
        .panel-empty { text-align:center; padding:30px; color:var(--text-muted); font-size:13px; font-style:italic; }
        .field-label { font-size:10px; text-transform:uppercase; letter-spacing:.6px; color:var(--text-muted); font-weight:700; margin-bottom:5px; }
        select, textarea, input[type=text] { width:100%; font-size:13px; padding:8px 10px; border-radius:3px; border:1px solid #E0D4C8; background:#FBF7F2; color:var(--text-dark); font-family:inherit; box-sizing:border-box; }
        textarea { resize:vertical; min-height:56px; }
        .row-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:10px; }
        .row-grid.four { grid-template-columns:1fr 1fr 1fr 1fr; }
        @media (max-width: 640px) {
          .row-grid, .row-grid.four { grid-template-columns:1fr 1fr; }
        }
        @media (max-width: 420px) {
          .row-grid, .row-grid.four { grid-template-columns:1fr; }
        }
        .add-row { display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
        .add-btn { display:flex; align-items:center; gap:6px; background:transparent; border:1px dashed var(--gold-dark); color:var(--burgundy-dark); padding:9px 16px; border-radius:20px; font-size:12px; font-weight:700; cursor:pointer; }
        .add-btn:hover { background:#FBF7F2; }
        .filter-chip { padding:6px 14px; border-radius:16px; border:1px solid #E0D4C8; background:#fff; font-size:11px; font-weight:700; color:var(--text-muted); cursor:pointer; }
        .filter-chip.active { background:var(--gold-dark); color:#fff; border-color:var(--gold-dark); }
        .item-card { border:1px solid #EFE3D8; border-radius:4px; padding:14px 16px; margin-bottom:12px; position:relative; }
        .item-remove { position:absolute; top:10px; right:10px; background:none; border:none; color:var(--text-muted); cursor:pointer; }
        .item-remove:hover { color:var(--terracotta); }
        .type-badge { display:inline-flex; align-items:center; gap:4px; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.5px; color:var(--burgundy-dark); background:#FBF7F2; padding:3px 8px; border-radius:12px; margin-bottom:8px; }
        .gen-btn-small { display:flex; align-items:center; gap:6px; background:var(--gold-dark); color:var(--burgundy-dark); border:none; padding:7px 14px; border-radius:20px; font-size:12px; font-weight:700; cursor:pointer; margin-top:8px; }
        .gen-btn-small:disabled { opacity:.6; cursor:default; }
        .spin { animation:spin 1s linear infinite; } @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
        .result-box { background:#FBF7F2; border-left:3px solid var(--gold-dark); border-radius:3px; padding:14px 16px; white-space:pre-wrap; font-size:13px; line-height:1.6; color:var(--text-dark); margin-top:10px; }
        .copy-btn { display:flex; align-items:center; gap:6px; background:transparent; border:1px solid var(--gold-dark); color:var(--burgundy-dark); padding:6px 12px; border-radius:20px; font-size:11px; font-weight:600; cursor:pointer; margin-top:6px; }
        .copy-btn:hover { background:var(--gold); color:#fff; }
        .error-text { color:var(--terracotta); font-size:12px; margin-top:6px; }
        .master-btn { display:flex; align-items:center; justify-content:center; gap:8px; width:100%; background:var(--burgundy-dark); color:var(--cream); border:none; padding:15px; border-radius:3px; font-size:15px; font-weight:700; cursor:pointer; margin:18px 0; }
        .master-btn:disabled { opacity:.6; cursor:default; }
        .material-thumb { width:100%; height:100px; object-fit:cover; border-radius:3px; margin-top:8px; }
        .material-upload-btn { display:inline-flex; align-items:center; gap:6px; background:#FBF7F2; border:1px solid #E0D4C8; padding:7px 12px; border-radius:3px; font-size:12px; cursor:pointer; color:var(--text-dark); }
        .storyboard-table { width:100%; border-collapse:collapse; margin-top:10px; font-size:12px; }
        .storyboard-table th { text-align:left; background:var(--burgundy-dark); color:var(--cream); padding:6px 8px; font-size:10px; text-transform:uppercase; letter-spacing:.4px; }
        .storyboard-table td { padding:7px 8px; border-bottom:1px solid #EFE3D8; vertical-align:top; }
        .cal-table { width:100%; border-collapse:collapse; font-size:12px; }
        .cal-table th { text-align:left; background:var(--burgundy-dark); color:var(--cream); padding:8px 10px; font-size:10px; text-transform:uppercase; letter-spacing:.4px; }
        .cal-table td { padding:8px 10px; border-bottom:1px solid #EFE3D8; }
        .status-pill { font-size:10px; font-weight:700; padding:3px 10px; border-radius:12px; color:#fff; white-space:nowrap; }
        .day-group-title { font-size:12px; font-weight:800; color:var(--burgundy-dark); text-transform:uppercase; letter-spacing:.6px; margin:16px 0 8px 0; padding-bottom:4px; border-bottom:1px solid var(--gold-dark); }
        .shoot-row { display:flex; gap:12px; background:#fff; border-radius:3px; padding:12px 14px; margin-bottom:8px; box-shadow:0 1px 2px rgba(107,45,62,.06); align-items:flex-start; }
        .table-scroll { overflow-x:auto; }
      `}</style>

      <div className="pipe-header">
        <h1 className="pipe-title">Продакшн Art Mak</h1>
        <div className="pipe-subtitle">Сценарий → Съёмка → Материалы → Календарь публикаций</div>
      </div>

      <div className="nav-row">
        <button className={`nav-btn ${section==="materials"?"active":""}`} onClick={()=>setSection("materials")}><Paperclip size={14}/> Материалы <span className="count">{materials.length}</span></button>
        <button className={`nav-btn ${section==="plan"?"active":""}`} onClick={()=>setSection("plan")}><Sparkles size={14}/> Планирование <span className="count">{items.length}</span></button>
        <button className={`nav-btn ${section==="shoot"?"active":""}`} onClick={()=>setSection("shoot")}><Film size={14}/> Съёмочный сценарий</button>
        <button className={`nav-btn ${section==="calendar"?"active":""}`} onClick={()=>setSection("calendar")}><CalendarDays size={14}/> Календарь публикаций</button>
      </div>

      {/* МАТЕРИАЛЫ */}
      {section === "materials" && (
        <div className="panel">
          <div className="field-label" style={{ marginBottom:12 }}>Фото и видео на неделю</div>
          <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
            <button className="add-btn" onClick={()=>addMaterial("photo")}><Paperclip size={13}/> Добавить фото</button>
            <button className="add-btn" onClick={()=>addMaterial("video")}><Paperclip size={13}/> Добавить видео</button>
          </div>
          {materials.length===0 && <div className="panel-empty">Загрузи фото/видео — прикрепишь их к постам, сторис и reels ниже</div>}
          {materials.map((m)=>(
            <div key={m.id} className="item-card">
              <button className="item-remove" onClick={()=>removeMaterial(m.id)}><X size={15}/></button>
              <div className="field-label">{m.type==="photo"?"📷 Фото":"🎬 Видео"} · {m.label}</div>
              {m.type==="photo" ? (
                <>
                  <label className="material-upload-btn"><Paperclip size={12}/> Загрузить файл
                    <input type="file" accept="image/*" style={{display:"none"}} onChange={(e)=>handlePhotoUpload(m.id, e.target.files[0])}/>
                  </label>
                  {m.dataUrl && <img src={m.dataUrl} className="material-thumb" alt=""/>}
                </>
              ) : (
                <textarea placeholder="Опиши, что происходит на видео (файл прикреплять не нужно)" value={m.description} onChange={(e)=>updateMaterial(m.id,{description:e.target.value})}/>
              )}
            </div>
          ))}
          <div style={{ fontSize:11, color:"var(--text-muted)", fontStyle:"italic", marginTop:8 }}>Фото/видео живут только в текущей сессии. Тексты и история — сохраняются в этом браузере.</div>
        </div>
      )}

      {/* ПЛАНИРОВАНИЕ */}
      {section === "plan" && (
        <div className="panel">
          <div className="add-row">
            <button className="add-btn" onClick={()=>addItem("tg")}><MessageSquare size={13}/> Telegram/MAX</button>
            <button className="add-btn" onClick={()=>addItem("story")}><ImageIcon size={13}/> Сторис/Карусель</button>
            <button className="add-btn" onClick={()=>addItem("reel")}><Video size={13}/> Reels</button>
          </div>
          <div className="add-row">
            {["all","tg","story","reel"].map(t=>(
              <div key={t} className={`filter-chip ${typeFilter===t?"active":""}`} onClick={()=>setTypeFilter(t)}>
                {t==="all"?"Все":TYPE_META[t].label}
              </div>
            ))}
          </div>
          {filteredItems.length===0 && <div className="panel-empty">Добавь контент на неделю кнопками выше</div>}
          {filteredItems.map((item)=>{
            const meta = TYPE_META[item.type];
            const rubricList = item.type==="tg"?TG_RUBRICS:item.type==="story"?STORY_RUBRICS:REELS_FORMATS;
            const rubricField = item.type==="reel"?"format":"rubric";
            return (
              <div key={item.id} className="item-card">
                <button className="item-remove" onClick={()=>removeItem(item.id)}><X size={15}/></button>
                <div className="type-badge"><meta.icon size={11}/> {meta.label}</div>
                <div className="row-grid four">
                  <div>
                    <div className="field-label">День</div>
                    <select value={item.day} onChange={(e)=>updateItem(item.id,{day:e.target.value})}>{DAYS.map(d=><option key={d}>{d}</option>)}</select>
                  </div>
                  <div>
                    <div className="field-label">Время</div>
                    <input type="text" value={item.time} onChange={(e)=>updateItem(item.id,{time:e.target.value})} placeholder="10:00"/>
                  </div>
                  <div>
                    <div className="field-label">{item.type==="reel"?"Формат":"Рубрика"}</div>
                    <select value={item[rubricField]} onChange={(e)=>updateItem(item.id,{[rubricField]:e.target.value})}>
                      {rubricList.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="field-label">Статус</div>
                    <select value={item.status} onChange={(e)=>updateItem(item.id,{status:e.target.value})}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select>
                  </div>
                </div>
                {item.type==="story" && (
                  <div style={{ marginBottom:10 }}>
                    <div className="field-label">Стиль карточки</div>
                    <select value={item.styleId} onChange={(e)=>updateItem(item.id,{styleId:e.target.value})}>{STORY_STYLES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select>
                  </div>
                )}
                <div className="row-grid">
                  <div>
                    <div className="field-label">Материал</div>
                    <MaterialPicker materials={materials} value={item.materialId} onChange={(v)=>updateItem(item.id,{materialId:v})}/>
                  </div>
                  {(item.type==="reel"||item.type==="story") && (
                    <div>
                      <div className="field-label"><Music size={10} style={{verticalAlign:"-1px"}}/> Музыка для наложения</div>
                      <input type="text" value={item.music} onChange={(e)=>updateItem(item.id,{music:e.target.value})} placeholder="название трека / настроение"/>
                    </div>
                  )}
                </div>
                <div className="field-label">Тема / идея</div>
                <textarea value={item.topic} onChange={(e)=>updateItem(item.id,{topic:e.target.value})}/>
                <button className="gen-btn-small" onClick={()=>generateOne(item)} disabled={item.loading}>
                  {item.loading?<Loader2 size={13} className="spin"/>:<Sparkles size={13}/>} {item.loading?"Пишу...":"Сгенерировать"}
                </button>
                {item.error && <div className="error-text">{item.error}</div>}
                {item.result && item.type!=="reel" && (<><div className="result-box">{item.result}</div><CopyButton text={item.result}/></>)}
                {item.result && item.type==="reel" && (
                  <div style={{ marginTop:10 }}>
                    <div className="field-label">Хук</div>
                    <div className="result-box" style={{marginTop:4}}>{item.result.hook}</div>
                    <div className="field-label" style={{marginTop:10}}>Раскадровка</div>
                    <div className="table-scroll">
                      <table className="storyboard-table">
                        <thead><tr><th>Тайминг</th><th>Кадр</th><th>Действие</th><th>Текст на экране</th></tr></thead>
                        <tbody>{item.result.storyboard?.map((s,i)=>(<tr key={i}><td>{s.time}</td><td>{s.shot}</td><td>{s.action}</td><td>{s.overlay_text}</td></tr>))}</tbody>
                      </table>
                    </div>
                    <div className="field-label" style={{marginTop:10}}>Заметки для монтажа</div>
                    <div className="result-box" style={{marginTop:4}}>{item.result.editing_notes}</div>
                    <div className="field-label" style={{marginTop:10}}>Озвучка</div>
                    <div className="result-box" style={{marginTop:4}}>{item.result.voiceover}</div>
                    <CopyButton text={resultText(item)}/>
                  </div>
                )}
              </div>
            );
          })}
          {items.length>0 && (
            <button className="master-btn" onClick={generateWeek} disabled={generatingAll}>
              {generatingAll?<Loader2 size={16} className="spin"/>:<Sparkles size={16}/>} {generatingAll?"Генерирую всю неделю...":`Сгенерировать всю неделю (${items.length})`}
            </button>
          )}
        </div>
      )}

      {/* СЪЁМОЧНЫЙ СЦЕНАРИЙ */}
      {section === "shoot" && (
        <div className="panel">
          <div className="field-label" style={{ marginBottom:12 }}>Единый список кадров на съёмочный день — собран автоматически из всех Reels, Сторис и продуктовых постов недели</div>
          {shootList.length===0 && <div className="panel-empty">Добавь Reels/Сторис/продуктовые посты во вкладке «Планирование» — здесь появится съёмочный список</div>}
          {DAYS.map(day=>{
            const dayItems = shootList.filter(i=>i.day===day);
            if (!dayItems.length) return null;
            return (
              <div key={day}>
                <div className="day-group-title">{day}</div>
                {dayItems.map(item=>{
                  const meta = TYPE_META[item.type];
                  const label = item.type==="tg"?TG_RUBRICS.find(r=>r.id===item.rubric)?.label:item.type==="story"?STORY_RUBRICS.find(r=>r.id===item.rubric)?.label:REELS_FORMATS.find(r=>r.id===item.format)?.label;
                  return (
                    <div key={item.id} className="shoot-row">
                      <input type="checkbox" style={{marginTop:3}}/>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:11, fontWeight:800, color:"var(--burgundy-dark)" }}>{item.time} · {meta.label} · {label}</div>
                        <div style={{ fontSize:13, color:"var(--text-dark)", marginTop:4 }}>{item.topic || "(тема не заполнена)"}</div>
                        {item.music && <div style={{ fontSize:11, color:"var(--gold-dark)", marginTop:4 }}><Music size={10} style={{verticalAlign:"-1px"}}/> {item.music}</div>}
                        {item.type==="reel" && item.result?.storyboard && (
                          <div className="table-scroll">
                            <table className="storyboard-table">
                              <tbody>{item.result.storyboard.map((s,i)=>(<tr key={i}><td style={{width:70}}>{s.time}</td><td>{s.shot}</td></tr>))}</tbody>
                            </table>
                          </div>
                        )}
                        {item.type==="reel" && item.result?.editing_notes && (
                          <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:6, fontStyle:"italic" }}>Монтаж: {item.result.editing_notes}</div>
                        )}
                      </div>
                      <span className="status-pill" style={{ background:STATUS_COLOR[item.status] }}>{item.status}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* КАЛЕНДАРЬ ПУБЛИКАЦИЙ */}
      {section === "calendar" && (
        <div className="panel">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:8 }}>
            <div className="field-label" style={{ marginBottom:0 }}>Готово для передачи СММ — кто, что и когда публикует</div>
            <button className="copy-btn" onClick={copyCalendarAsText}><Copy size={13}/> Скопировать календарь</button>
          </div>
          {items.length===0 ? <div className="panel-empty">Заполни план во вкладке «Планирование» — здесь появится календарь</div> : (
            <div className="table-scroll">
              <table className="cal-table">
                <thead><tr><th>День</th><th>Время</th><th>Тип</th><th>Рубрика/формат</th><th>Тема</th><th>Статус</th></tr></thead>
                <tbody>
                  {sortedForCalendar.map(item=>{
                    const meta = TYPE_META[item.type];
                    const label = item.type==="tg"?TG_RUBRICS.find(r=>r.id===item.rubric)?.label:item.type==="story"?STORY_RUBRICS.find(r=>r.id===item.rubric)?.label:REELS_FORMATS.find(r=>r.id===item.format)?.label;
                    return (
                      <tr key={item.id}>
                        <td>{item.day}</td><td>{item.time}</td><td>{meta.label}</td><td>{label}</td>
                        <td style={{maxWidth:220}}>{item.topic||"—"}</td>
                        <td><span className="status-pill" style={{ background:STATUS_COLOR[item.status] }}>{item.status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {history.length>0 && (
        <div style={{ marginTop:20 }}>
          <div className="field-label" style={{ marginBottom:8 }}><Clock size={11} style={{verticalAlign:"-2px",marginRight:4}}/>История генераций</div>
          {history.map(h=>(<div key={h.id} style={{ background:"#fff", borderRadius:3, padding:"10px 14px", marginBottom:6, fontSize:12, color:"var(--text-muted)" }}>{new Date(h.date).toLocaleDateString("ru-RU")} — сгенерировано элементов: {h.count}</div>))}
        </div>
      )}
    </div>
  );
}
