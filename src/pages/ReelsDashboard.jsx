import { useState, useEffect, useCallback } from "react";
import { callClaude } from "../lib/anthropic.js";

// ─── Design tokens ─────────────────────────────────────────────────────────
const C = {
  bg: "#080810", surface: "#0f0f1a", card: "#14141f", border: "#1a1a2e",
  accent: "#ff3c6e", a2: "#7c3aff", a3: "#00d4aa", text: "#e8e8f0",
  muted: "#5a5a72", gold: "#f5a623", danger: "#ff4444", ok: "#22c55e",
};

// ─── Apify helpers ──────────────────────────────────────────────────────────
const APIFY_BASE = "https://api.apify.com/v2";
// Actor that scrapes Instagram posts/reels by username
const ACTOR_ID = "apify~instagram-scraper";

async function startApifyRun(token, usernames) {
  const res = await fetch(`${APIFY_BASE}/acts/${ACTOR_ID}/runs?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usernames,
      resultsType: "posts",   // includes reels
      resultsLimit: 30,
      addParentData: false,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Apify error ${res.status}`);
  }
  const data = await res.json();
  return data.data; // { id, defaultDatasetId, status, ... }
}

async function pollRunStatus(token, runId) {
  const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${token}`);
  const data = await res.json();
  return data.data; // { status, defaultDatasetId }
}

async function fetchDataset(token, datasetId) {
  const res = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&limit=200&clean=true`
  );
  const data = await res.json();
  return Array.isArray(data) ? data : data.items || [];
}

// ─── Viral-score math ───────────────────────────────────────────────────────
function calcViralScore(item) {
  const views = item.views || 1;
  const er = ((item.likes + item.comments * 3 + (item.shares || 0) * 5) / views) * 100;
  const hoursOld = Math.max(1,
    (Date.now() - new Date(item.timestamp).getTime()) / 3_600_000);
  const speed = views / hoursOld / 1000;
  return +(er * 0.4 + speed * 0.6).toFixed(2);
}

function detectHookType(caption = "") {
  const c = caption.toLowerCase();
  if (/\d+\s*(reason|sign|way|secret|step|mistake)/.test(c)) return "Список+Цифры";
  if (/stop|never|don't|wrong/.test(c)) return "Анти-совет";
  if (/\$|money|earn|rich|profit/.test(c)) return "Деньги/Цифры";
  if (/why you|why i|why we/.test(c)) return "Объяснение-причина";
  if (/days|challenge|tried|experiment/.test(c)) return "Эксперимент";
  if (/secret|nobody|they don|hidden/.test(c)) return "Секрет";
  return "Проблема-Решение";
}

function normalizeItem(raw, idx) {
  const isReel = raw.type === "Video" || raw.productType === "clips";
  return {
    id: raw.id || `r${idx}`,
    username: raw.ownerUsername || raw.username || "unknown",
    views: raw.videoPlayCount || raw.videoViewCount || 0,
    likes: raw.likesCount || 0,
    comments: raw.commentsCount || 0,
    shares: raw.sharesCount || raw.videoShareCount || 0,
    duration: Math.round(raw.videoDuration || 0),
    caption: raw.caption || raw.alt || "(без подписи)",
    timestamp: raw.timestamp || new Date().toISOString(),
    url: raw.url || raw.displayUrl || "",
    isReel,
    niche: "видео",
    hook_type: detectHookType(raw.caption || ""),
  };
}

// ─── Utility UI ─────────────────────────────────────────────────────────────
const fmt = n => n >= 1e6 ? (n/1e6).toFixed(1)+"M" : n >= 1e3 ? (n/1e3).toFixed(0)+"K" : String(n||0);

function Chip({ children, color = C.a2, size = 11 }) {
  return (
    <span style={{ background: color+"20", color, border:`1px solid ${color}40`,
      borderRadius:20, padding:"2px 10px", fontSize:size, fontWeight:700, letterSpacing:.4 }}>
      {children}
    </span>
  );
}

function ScoreBar({ value, max=40 }) {
  const pct = Math.min(100, (value/max)*100);
  const col = value>28?C.accent:value>15?C.gold:C.a3;
  return (
    <div style={{ background:C.border, borderRadius:4, height:5, overflow:"hidden" }}>
      <div style={{ width:`${pct}%`, height:"100%", background:col, borderRadius:4, transition:"width 1.2s ease" }}/>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type="text", monospace }) {
  return (
    <div style={{ marginBottom:14 }}>
      {label && <div style={{ fontSize:11, color:C.muted, fontWeight:700, letterSpacing:1.2, marginBottom:6 }}>{label}</div>}
      <input
        type={type} value={value} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width:"100%", background:C.surface, border:`1px solid ${C.border}`,
          borderRadius:10, padding:"10px 14px", color:C.text, fontSize:13,
          fontFamily: monospace ? "'Space Mono', monospace" : "inherit",
          outline:"none", boxSizing:"border-box",
        }}
      />
    </div>
  );
}

function Tag({ children, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: active ? C.a2+"25" : C.surface,
      border: `1px solid ${active ? C.a2 : C.border}`,
      color: active ? C.a2 : C.muted,
      borderRadius:8, padding:"5px 12px", fontSize:12, fontWeight:700,
      cursor:"pointer", transition:"all .15s",
    }}>
      {children}
    </button>
  );
}

function LogLine({ icon, text, dim }) {
  return (
    <div style={{ display:"flex", gap:10, alignItems:"flex-start", opacity: dim?.7:1, animation:"fadeIn .3s ease" }}>
      <span style={{ fontSize:14, flexShrink:0 }}>{icon}</span>
      <span style={{ fontSize:12, color:C.text, lineHeight:1.6 }}>{text}</span>
    </div>
  );
}

// ─── Scenario modal ─────────────────────────────────────────────────────────
function ScenarioModal({ scenario, onClose }) {
  if (!scenario) return null;
  const { reel, data, loading, error } = scenario;
  const colors = [C.accent, C.a2, C.a3, C.gold];

  return (
    <div onClick={onClose} style={{
      position:"fixed", inset:0, background:"#000c", zIndex:200,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:C.surface, border:`1px solid ${C.border}`, borderRadius:24,
        width:"100%", maxWidth:740, maxHeight:"90vh", overflow:"auto", padding:32,
      }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:24 }}>
          <div>
            <div style={{ fontSize:10, color:C.accent, fontWeight:800, letterSpacing:2, marginBottom:6 }}>AI СЦЕНАРИЙ · АДАПТАЦИЯ ПОД РУ</div>
            <div style={{ fontSize:18, fontWeight:800 }}>@{reel.username}</div>
            <div style={{ fontSize:12, color:C.muted, marginTop:3 }}>{fmt(reel.views)} просмотров · ER {reel.er}% · {reel.duration}с</div>
          </div>
          <button onClick={onClose} style={{
            background:C.border, border:"none", color:C.muted,
            borderRadius:8, width:36, height:36, cursor:"pointer", fontSize:18, flexShrink:0
          }}>×</button>
        </div>

        {loading && (
          <div style={{ textAlign:"center", padding:"60px 0" }}>
            <div style={{ fontSize:44, marginBottom:14 }}>🤖</div>
            <div style={{ color:C.muted, fontSize:13 }}>Claude анализирует и адаптирует ролик...</div>
            <div style={{ marginTop:16, display:"flex", justifyContent:"center", gap:6 }}>
              {[0,1,2].map(i=>(
                <div key={i} style={{ width:8, height:8, borderRadius:"50%", background:C.accent,
                  animation:"pulse 1.2s ease infinite", animationDelay:`${i*.2}s` }}/>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{ background:C.danger+"18", border:`1px solid ${C.danger}40`,
            borderRadius:12, padding:18, color:C.danger, fontSize:13 }}>
            ⚠️ {error}
          </div>
        )}

        {data && !loading && (
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>

            {/* Hook analysis */}
            <Section title="🎯 Почему залетело" color={C.a2}>
              <div style={{ fontSize:13, color:C.text, lineHeight:1.8 }}>{data.hook_analysis}</div>
            </Section>

            {/* Script */}
            <Section title="🎬 Сценарий для русской аудитории" color={C.accent}>
              {(data.script||[]).map((b,i)=>(
                <div key={i} style={{ display:"flex", gap:14, marginBottom:14 }}>
                  <div style={{
                    flexShrink:0, width:64, height:64, borderRadius:12,
                    background:colors[i%4]+"18", border:`1px solid ${colors[i%4]}35`,
                    display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2
                  }}>
                    <div style={{ fontSize:9, color:C.muted, fontFamily:"monospace" }}>{b.timing}</div>
                    <div style={{ fontSize:10, color:colors[i%4], fontWeight:800 }}>{b.label}</div>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:5 }}>{b.label}</div>
                    <div style={{ fontSize:13, color:C.text, lineHeight:1.7 }}>{b.content}</div>
                  </div>
                </div>
              ))}
            </Section>

            {/* Captions */}
            <Section title="✍️ Варианты подписи" color={C.gold}>
              {(data.captions||[]).map((cap,i)=>(
                <div key={i} style={{
                  background:C.card, borderRadius:10, padding:"10px 14px", marginBottom:8,
                  fontSize:13, color:C.text, borderLeft:`3px solid ${colors[i]}`
                }}>{cap}</div>
              ))}
            </Section>

            {/* Forecast */}
            {data.forecast && (
              <div style={{
                background:`linear-gradient(135deg, ${C.a2}18, ${C.accent}0a)`,
                border:`1px solid ${C.a2}40`, borderRadius:16, padding:20,
              }}>
                <div style={{ fontSize:10, color:C.a3, fontWeight:800, letterSpacing:1.5, marginBottom:16 }}>📊 ПРОГНОЗ ДЛЯ ВАШЕГО АККАУНТА</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:14 }}>
                  {[
                    { v:data.forecast.reach, l:"охват", col:C.a3 },
                    { v:"+"+data.forecast.new_followers, l:"новых подписчиков", col:C.gold },
                    { v:data.forecast.scenario, l:"сценарий", col:C.accent },
                  ].map((s,i)=>(
                    <div key={i} style={{ textAlign:"center" }}>
                      <div style={{ fontSize:20, fontWeight:900, color:s.col, fontFamily:"monospace" }}>{s.v}</div>
                      <div style={{ fontSize:10, color:C.muted, marginTop:4 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize:12, color:C.muted, lineHeight:1.7 }}>{data.forecast.note}</div>
              </div>
            )}

            {/* Hashtags */}
            {data.hashtags?.length>0 && (
              <Section title="#️⃣ Хештеги" color={C.muted}>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {data.hashtags.map((h,i)=>(
                    <Chip key={i} color={C.a2}>{h}</Chip>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, color, children }) {
  return (
    <div style={{ background:C.card, borderRadius:16, padding:20, border:`1px solid ${C.border}` }}>
      <div style={{ fontSize:10, color, fontWeight:800, letterSpacing:1.5, marginBottom:14 }}>{title}</div>
      {children}
    </div>
  );
}

// ─── Reel card ──────────────────────────────────────────────────────────────
function ReelCard({ reel, onAnalyze, selected }) {
  const sc = reel.viral_score;
  const col = sc>28?C.accent:sc>15?C.gold:C.a3;
  return (
    <div onClick={()=>onAnalyze(reel)} style={{
      background: selected?C.accent+"0e":C.card,
      border:`1px solid ${selected?C.accent:C.border}`,
      borderRadius:16, padding:"18px 20px", cursor:"pointer",
      transition:"all .2s", position:"relative", overflow:"hidden",
    }}>
      {reel.isReel && sc>28 && (
        <div style={{ position:"absolute", top:12, right:12,
          background:C.accent, color:"#fff", fontSize:9, fontWeight:800,
          padding:"2px 8px", borderRadius:20, letterSpacing:1 }}>🔥 VIRAL</div>
      )}
      {!reel.isReel && (
        <div style={{ position:"absolute", top:12, right:12,
          background:C.border, color:C.muted, fontSize:9, fontWeight:700,
          padding:"2px 8px", borderRadius:20 }}>фото/карусель</div>
      )}

      <div style={{ display:"flex", gap:10, marginBottom:12, alignItems:"center" }}>
        <div style={{ width:36, height:36, borderRadius:"50%",
          background:`linear-gradient(135deg,${C.a2},${C.accent})`,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:14, fontWeight:800, color:"#fff", flexShrink:0 }}>
          {(reel.username||"?")[0].toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize:13, fontWeight:700 }}>@{reel.username}</div>
          <div style={{ fontSize:11, color:C.muted }}>{reel.duration}с · {reel.hook_type}</div>
        </div>
      </div>

      <div style={{ fontSize:12, color:C.muted, fontStyle:"italic", marginBottom:14, lineHeight:1.5 }}>
        "{(reel.caption||"").substring(0,80)}{(reel.caption||"").length>80?"…":""}"
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:14 }}>
        {[
          { l:"Просмотры", v:fmt(reel.views), col:C.a3 },
          { l:"Лайки",    v:fmt(reel.likes) },
          { l:"Коммент.", v:fmt(reel.comments) },
          { l:"ER%",      v:reel.er+"%", col:C.gold },
        ].map((s,i)=>(
          <div key={i} style={{ textAlign:"center" }}>
            <div style={{ fontSize:16, fontWeight:800, color:s.col||C.text, fontFamily:"monospace" }}>{s.v}</div>
            <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{s.l}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <span style={{ fontSize:11, color:C.muted }}>Viral Score</span>
        <span style={{ fontSize:13, fontWeight:900, color:col, fontFamily:"monospace" }}>{sc}</span>
      </div>
      <ScoreBar value={sc}/>

      <div style={{ marginTop:10, display:"flex", gap:6, flexWrap:"wrap" }}>
        <Chip color={C.a2}>{reel.hook_type}</Chip>
        {reel.shares>0&&<Chip color={C.a3}>{fmt(reel.shares)} шеров</Chip>}
        {reel.url&&(
          <a href={reel.url} target="_blank" rel="noreferrer"
            onClick={e=>e.stopPropagation()}
            style={{ background:C.border, color:C.muted, border:`1px solid ${C.border}`,
              borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:700,
              textDecoration:"none" }}>
            ↗ открыть
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Main app ────────────────────────────────────────────────────────────────
export default function ReelsDashboard() {
  const [apifyToken, setApifyToken] = useState(() => localStorage.getItem("artmak_apify_token") || "");
  const [showToken, setShowToken] = useState(false);
  const [customUsernames, setCustomUsernames] = useState("hubermanlab, alexhormozi, garyvee");
  const [followers, setFollowers] = useState(5000);
  const [minViews, setMinViews] = useState(50000);
  const [onlyReels, setOnlyReels] = useState(true);

  const [scanning, setScanning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [reels, setReels] = useState([]);
  const [scenario, setScenario] = useState(null);
  const [activeTab, setActiveTab] = useState("setup");
  const [history, setHistory] = useState([]);

  useEffect(() => {
    localStorage.setItem("artmak_apify_token", apifyToken);
  }, [apifyToken]);

  const addLog = useCallback((icon, text, dim=false) => {
    setLogs(prev => [...prev.slice(-30), { icon, text, dim, id:Date.now()+Math.random() }]);
  }, []);

  // ── Real Apify scan ──────────────────────────────────────────────────────
  const runRealScan = async () => {
    const usernames = customUsernames.split(",").map(u=>u.trim().replace("@","")).filter(Boolean);
    if (!apifyToken) { addLog("❌","Введите Apify API-токен"); return; }
    if (!usernames.length) { addLog("❌","Добавьте хотя бы одного конкурента"); return; }

    setScanning(true); setReels([]); setLogs([]);
    setActiveTab("scan");

    try {
      addLog("🚀", `Запуск актора ${ACTOR_ID}...`);
      addLog("👤", `Аккаунты: ${usernames.join(", ")}`);

      let run;
      try {
        run = await startApifyRun(apifyToken, usernames);
      } catch(e) {
        addLog("❌", `Ошибка запуска: ${e.message}`);
        addLog("💡", "Проверьте токен на console.apify.com → Settings → Integrations");
        setScanning(false); return;
      }

      addLog("✅", `Задача запущена. ID: ${run.id}`);
      addLog("⏳", "Ждём завершения (Instagram-парсинг занимает 1-5 мин)...");

      // Poll for completion
      let status = run.status;
      let attempts = 0;
      while (!["SUCCEEDED","FAILED","ABORTED","TIMED-OUT"].includes(status) && attempts < 60) {
        await new Promise(r=>setTimeout(r, 5000));
        attempts++;
        try {
          const updated = await pollRunStatus(apifyToken, run.id);
          status = updated.status;
          if (attempts % 3 === 0) addLog("🔄", `Статус: ${status} (попытка ${attempts})`);
          if (status === "SUCCEEDED") {
            run = updated;
            break;
          }
        } catch(e) {
          addLog("⚠️", "Ошибка опроса, повторяем...");
        }
      }

      if (status !== "SUCCEEDED") {
        addLog("❌", `Задача завершилась со статусом: ${status}`);
        addLog("💡", "Попробуйте снова — Instagram иногда блокирует запросы");
        setScanning(false); return;
      }

      addLog("✅", "Парсинг завершён! Загружаем данные...");
      const rawItems = await fetchDataset(apifyToken, run.defaultDatasetId);
      addLog("📦", `Получено записей: ${rawItems.length}`);

      // Normalize + score
      const normalized = rawItems.map((r, i) => {
        const item = normalizeItem(r, i);
        const er = item.views > 0
          ? +((item.likes + item.comments*3 + item.shares*5) / item.views * 100).toFixed(2)
          : 0;
        return { ...item, er, viral_score: calcViralScore(item) };
      });

      // Filter
      let filtered = normalized.filter(r => r.views >= minViews);
      if (onlyReels) filtered = filtered.filter(r => r.isReel);
      const sorted = filtered.sort((a,b)=>b.viral_score-a.viral_score);

      addLog("🔥", `Вирусных роликов (score>15): ${sorted.filter(r=>r.viral_score>15).length}`);
      addLog("📊", `После фильтра (≥${fmt(minViews)} просмотров): ${sorted.length} роликов`);

      if (sorted.length === 0) {
        addLog("⚠️", "Нет роликов с таким порогом просмотров. Снизьте минимальный порог в настройках.");
      } else {
        addLog("✅", `Топ-1: @${sorted[0].username} — ${fmt(sorted[0].views)} просмотров, score ${sorted[0].viral_score}`);
      }

      setReels(sorted);

    } catch(e) {
      addLog("❌", `Критическая ошибка: ${e.message}`);
    } finally {
      setScanning(false);
    }
  };

  // ── AI scenario generation ─────────────────────────────────────────────
  const analyzeReel = async (reel) => {
    setScenario({ reel, data:null, loading:true, error:null });

    const prompt = `Ты — топовый контент-стратег для русскоязычных Instagram Reels.

Данные о вирусном англоязычном ролике:
- Автор: @${reel.username}
- Подпись: "${reel.caption}"
- Просмотры: ${reel.views.toLocaleString()}
- ER: ${reel.er}%
- Шеры: ${(reel.shares||0).toLocaleString()}
- Тип крючка: ${reel.hook_type}
- Viral Score: ${reel.viral_score}
- Длительность: ${reel.duration} секунд
- Подписчиков у пользователя: ${followers.toLocaleString()}

Отвечай ТОЛЬКО валидным JSON без markdown-оберток:
{
  "hook_analysis": "Почему этот ролик залетел (2-4 предложения с конкретикой)",
  "script": [
    {"timing":"0-3с","label":"HOOK","content":"точный текст/действие для первых 3 секунд на русском"},
    {"timing":"3-15с","label":"РАЗВИТИЕ","content":"основная ценность и детали"},
    {"timing":"15-25с","label":"КУЛЬМИНАЦИЯ","content":"самый сильный момент/инсайт"},
    {"timing":"25-${reel.duration||30}с","label":"CTA","content":"призыв к действию и подписке"}
  ],
  "captions":[
    "подпись 1 — провокационная с вопросом",
    "подпись 2 — образовательная с инсайтом",
    "подпись 3 — эмоциональная с историей"
  ],
  "hashtags":["#тег1","#тег2","#тег3","#тег4","#тег5","#тег6","#тег7","#тег8","#тег9","#тег10"],
  "forecast":{
    "reach":"прогноз охвата (например 30K-90K)",
    "new_followers":"прогноз новых подп. (например 200-600)",
    "scenario":"${reel.viral_score>28?"🔥 Вирусный":reel.viral_score>15?"⚡ Хороший":"✅ Базовый"}",
    "note":"объяснение прогноза с учётом ${followers.toLocaleString()} подписчиков"
  }
}`;

    try {
      const text = await callClaude(prompt, null, 1800);
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      setHistory(prev=>[{ reel, data:parsed, time:new Date() }, ...prev.slice(0,9)]);
      setScenario({ reel, data:parsed, loading:false, error:null });
    } catch(e) {
      setScenario(prev=>({ ...prev, loading:false, error:"Ошибка AI: "+e.message }));
    }
  };

  // ── Stats ─────────────────────────────────────────────────────────────
  const viral = reels.filter(r=>r.viral_score>15);
  const avgScore = reels.length ? (reels.reduce((s,r)=>s+r.viral_score,0)/reels.length).toFixed(1) : "—";
  const totalViews = reels.reduce((s,r)=>s+r.views,0);

  const TAB = (id, label) => (
    <button key={id} onClick={()=>setActiveTab(id)} style={{
      background:activeTab===id?C.a2+"22":"transparent",
      border:`1px solid ${activeTab===id?C.a2:C.border}`,
      color:activeTab===id?C.a2:C.muted,
      borderRadius:8, padding:"6px 18px", fontSize:12, fontWeight:700,
      cursor:"pointer", letterSpacing:.8, transition:"all .15s",
    }}>{label}</button>
  );

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"'IBM Plex Sans',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700;800&family=Space+Mono:wght@700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:${C.bg}}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
        @keyframes pulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        input::placeholder{color:${C.muted}}
        input[type=range]{-webkit-appearance:none;height:4px;border-radius:2px;background:${C.border};outline:none;width:100%}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:${C.accent};cursor:pointer}
      `}</style>

      {/* ── Header ── */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"0 24px" }}>
        <div style={{ maxWidth:1100, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", height:60, flexWrap:"wrap" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:34, height:34, borderRadius:10,
              background:`linear-gradient(135deg,${C.accent},${C.a2})`,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:17 }}>⚡</div>
            <div>
              <div style={{ fontSize:15, fontWeight:800, letterSpacing:-.5 }}>ReelsSpy <span style={{ color:C.accent }}>AI</span></div>
              <div style={{ fontSize:9, color:C.muted, letterSpacing:1.2 }}>REAL APIFY · AI СЦЕНАРИИ</div>
            </div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {TAB("setup","⚙️ Настройки")}
            {TAB("scan","🔍 Скан")}
            {TAB("history","📋 История")}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"24px" }}>

        {/* ════════════ SETUP TAB ════════════ */}
        {activeTab==="setup" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24 }} className="setup-grid">
            <style>{`@media (max-width: 860px) { .setup-grid { grid-template-columns: 1fr !important; } }`}</style>

            {/* Left: Apify settings */}
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div style={{ background:C.card, borderRadius:18, padding:24, border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:11, color:C.accent, fontWeight:800, letterSpacing:1.5, marginBottom:18 }}>🔑 APIFY ПОДКЛЮЧЕНИЕ</div>

                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:11, color:C.muted, fontWeight:700, letterSpacing:1.2, marginBottom:6 }}>API ТОКЕН</div>
                  <div style={{ position:"relative" }}>
                    <input
                      type={showToken?"text":"password"}
                      value={apifyToken}
                      onChange={e=>setApifyToken(e.target.value)}
                      placeholder="apify_api_xxxxxxxxxxxxxxxx"
                      style={{
                        width:"100%", background:C.surface, border:`1px solid ${apifyToken?C.ok:C.border}`,
                        borderRadius:10, padding:"10px 44px 10px 14px", color:C.text, fontSize:13,
                        fontFamily:"monospace", outline:"none", boxSizing:"border-box",
                      }}
                    />
                    <button onClick={()=>setShowToken(!showToken)} style={{
                      position:"absolute", right:10, top:"50%", transform:"translateY(-50%)",
                      background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:16
                    }}>{showToken?"🙈":"👁"}</button>
                  </div>
                  {apifyToken && (
                    <div style={{ fontSize:11, color:C.ok, marginTop:6 }}>✓ Токен введён (сохраняется в этом браузере)</div>
                  )}
                </div>

                <div style={{ background:C.surface, borderRadius:12, padding:16, border:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:12, fontWeight:700, marginBottom:10 }}>Как получить токен:</div>
                  {[
                    "1. Зайдите на console.apify.com",
                    "2. Зарегистрируйтесь (есть $5 бесплатно)",
                    "3. Settings → Integrations → API token",
                    "4. Скопируйте и вставьте выше",
                  ].map((s,i)=>(
                    <div key={i} style={{ fontSize:12, color:C.muted, marginBottom:6, lineHeight:1.5 }}>{s}</div>
                  ))}
                  <a href="https://console.apify.com" target="_blank" rel="noreferrer"
                    style={{ display:"inline-block", marginTop:8, background:C.a2+"20",
                      border:`1px solid ${C.a2}40`, color:C.a2, borderRadius:8,
                      padding:"6px 14px", fontSize:12, fontWeight:700, textDecoration:"none" }}>
                    → Перейти в Apify ↗
                  </a>
                </div>
              </div>

              {/* Actor info */}
              <div style={{ background:C.card, borderRadius:18, padding:24, border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:11, color:C.a3, fontWeight:800, letterSpacing:1.5, marginBottom:14 }}>🤖 ИСПОЛЬЗУЕМЫЙ АКТОР</div>
                <div style={{ background:C.surface, borderRadius:12, padding:14, border:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:13, fontWeight:700, fontFamily:"monospace", color:C.a3, marginBottom:6 }}>apify/instagram-scraper</div>
                  <div style={{ fontSize:12, color:C.muted, lineHeight:1.6 }}>
                    Официальный Apify актор. Собирает посты и Reels по username.
                    Стоимость: ~$0.50 за 1000 результатов.
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Scan settings */}
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div style={{ background:C.card, borderRadius:18, padding:24, border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:11, color:C.a2, fontWeight:800, letterSpacing:1.5, marginBottom:18 }}>🎯 АККАУНТЫ ДЛЯ АНАЛИЗА</div>

                <Input
                  label="USERNAME КОНКУРЕНТОВ (через запятую)"
                  value={customUsernames}
                  onChange={setCustomUsernames}
                  placeholder="hubermanlab, alexhormozi, garyvee"
                />

                <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
                  {["hubermanlab","alexhormozi","garyvee","markmanson","timferriss","lewishowes"].map(u=>(
                    <Tag key={u} active={customUsernames.includes(u)}
                      onClick={()=>{
                        const list = customUsernames.split(",").map(x=>x.trim()).filter(Boolean);
                        setCustomUsernames(
                          list.includes(u) ? list.filter(x=>x!==u).join(", ") : [...list,u].join(", ")
                        );
                      }}>
                      @{u}
                    </Tag>
                  ))}
                </div>

                <div style={{ marginBottom:16 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                    <span style={{ fontSize:11, color:C.muted, fontWeight:700 }}>МИН. ПРОСМОТРЫ ДЛЯ ФИЛЬТРА</span>
                    <span style={{ fontSize:13, fontWeight:800, color:C.a3, fontFamily:"monospace" }}>{fmt(minViews)}</span>
                  </div>
                  <input type="range" min={1000} max={500000} step={1000} value={minViews} onChange={e=>setMinViews(+e.target.value)}/>
                </div>

                <div style={{ marginBottom:16 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                    <span style={{ fontSize:11, color:C.muted, fontWeight:700 }}>ВАШИХ ПОДПИСЧИКОВ</span>
                    <span style={{ fontSize:13, fontWeight:800, color:C.gold, fontFamily:"monospace" }}>{followers.toLocaleString()}</span>
                  </div>
                  <input type="range" min={100} max={500000} step={100} value={followers} onChange={e=>setFollowers(+e.target.value)}/>
                </div>

                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20,
                  background:C.surface, borderRadius:10, padding:"10px 14px", border:`1px solid ${C.border}` }}>
                  <div onClick={()=>setOnlyReels(!onlyReels)} style={{
                    width:36, height:20, borderRadius:10,
                    background:onlyReels?C.a2:C.border,
                    cursor:"pointer", position:"relative", transition:"background .2s", flexShrink:0,
                  }}>
                    <div style={{
                      width:14, height:14, borderRadius:7, background:"#fff",
                      position:"absolute", top:3, left:onlyReels?18:3, transition:"left .2s",
                    }}/>
                  </div>
                  <div>
                    <div style={{ fontSize:12, fontWeight:700 }}>Только Reels</div>
                    <div style={{ fontSize:11, color:C.muted }}>Фильтровать видео (type=Video)</div>
                  </div>
                </div>

                <button onClick={runRealScan} disabled={scanning} style={{
                  width:"100%", padding:"14px",
                  background: scanning?C.border:`linear-gradient(135deg,${C.accent},${C.a2})`,
                  border:"none", borderRadius:12, color:"#fff", fontSize:14, fontWeight:800,
                  cursor:scanning?"not-allowed":"pointer", letterSpacing:.5,
                  boxShadow:scanning?"none":`0 8px 32px ${C.accent}40`, transition:"all .2s",
                }}>
                  {scanning
                    ? <span style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
                        <span style={{ width:16, height:16, border:"2px solid #fff4", borderTop:"2px solid #fff",
                          borderRadius:"50%", display:"inline-block", animation:"spin .8s linear infinite" }}/>
                        Сканирую...
                      </span>
                    : "🔍 Запустить реальный скан"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════ SCAN TAB ════════════ */}
        {activeTab==="scan" && (
          <div style={{ display:"grid", gridTemplateColumns:"320px 1fr", gap:24 }} className="scan-grid">
            <style>{`@media (max-width: 860px) { .scan-grid { grid-template-columns: 1fr !important; } }`}</style>

            {/* Log panel */}
            <div>
              <div style={{ background:C.card, borderRadius:18, padding:20, border:`1px solid ${C.border}`, marginBottom:16 }}>
                <div style={{ fontSize:11, color:C.a3, fontWeight:800, letterSpacing:1.5, marginBottom:14 }}>📡 ЛОГ СКАНИРОВАНИЯ</div>
                <div style={{ display:"flex", flexDirection:"column", gap:10, minHeight:100 }}>
                  {logs.length===0 && (
                    <div style={{ color:C.muted, fontSize:12 }}>Нажмите "Запустить" в настройках</div>
                  )}
                  {logs.map(l=><LogLine key={l.id} icon={l.icon} text={l.text} dim={l.dim}/>)}
                  {scanning && (
                    <div style={{ display:"flex", gap:6, marginTop:4 }}>
                      {[0,1,2].map(i=>(
                        <div key={i} style={{ width:7, height:7, borderRadius:"50%", background:C.a3,
                          animation:"pulse 1.2s ease infinite", animationDelay:`${i*.2}s` }}/>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {reels.length>0 && (
                <div style={{ background:C.card, borderRadius:18, padding:20, border:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:11, color:C.gold, fontWeight:800, letterSpacing:1.5, marginBottom:16 }}>📊 ИТОГИ</div>
                  {[
                    { l:"Всего роликов", v:reels.length, col:C.text },
                    { l:"Вирусных (>15)", v:viral.length, col:C.accent },
                    { l:"Суммарно просмотров", v:fmt(totalViews), col:C.a3 },
                    { l:"Средний Viral Score", v:avgScore, col:C.gold },
                  ].map((s,i)=>(
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0",
                      borderBottom:`1px solid ${C.border}` }}>
                      <span style={{ fontSize:12, color:C.muted }}>{s.l}</span>
                      <span style={{ fontSize:14, fontWeight:800, color:s.col, fontFamily:"monospace" }}>{s.v}</span>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={()=>setActiveTab("setup")} style={{
                width:"100%", marginTop:12, padding:"10px",
                background:"transparent", border:`1px solid ${C.border}`,
                borderRadius:10, color:C.muted, fontSize:12, fontWeight:700, cursor:"pointer",
              }}>
                ← Изменить настройки
              </button>
            </div>

            {/* Results */}
            <div>
              {reels.length===0 && !scanning && (
                <div style={{ textAlign:"center", padding:"80px 40px", color:C.muted }}>
                  <div style={{ fontSize:52, marginBottom:14 }}>📡</div>
                  <div style={{ fontSize:17, fontWeight:700, color:C.text, marginBottom:8 }}>Результаты появятся здесь</div>
                  <div style={{ fontSize:13, lineHeight:1.7 }}>Настройте параметры и запустите скан</div>
                </div>
              )}

              {reels.length>0 && (
                <>
                  <div style={{ fontSize:11, color:C.muted, marginBottom:14, fontWeight:700, letterSpacing:1 }}>
                    КЛИК НА КАРТОЧКУ → AI СГЕНЕРИРУЕТ СЦЕНАРИЙ
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))", gap:14 }}>
                    {reels.map(r=>(
                      <div key={r.id} style={{ animation:"fadeIn .4s ease" }}>
                        <ReelCard reel={r} onAnalyze={analyzeReel} selected={scenario?.reel?.id===r.id}/>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ════════════ HISTORY TAB ════════════ */}
        {activeTab==="history" && (
          <div>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:20 }}>📋 История AI-сценариев</div>
            {history.length===0 ? (
              <div style={{ textAlign:"center", padding:"60px", color:C.muted }}>
                <div style={{ fontSize:40, marginBottom:12 }}>📭</div>
                <div>История пуста. Запустите скан и нажмите на любую карточку.</div>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {history.map((item,i)=>(
                  <div key={i} style={{ background:C.card, borderRadius:16, padding:20, border:`1px solid ${C.border}`, animation:"fadeIn .4s ease" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                      <div>
                        <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>@{item.reel.username} → Русская аудитория</div>
                        <div style={{ fontSize:11, color:C.muted }}>{item.time.toLocaleString("ru-RU")}</div>
                      </div>
                      <div style={{ display:"flex", gap:6 }}>
                        <Chip color={C.a3}>{fmt(item.reel.views)} views</Chip>
                        <Chip color={C.gold}>Score {item.reel.viral_score}</Chip>
                      </div>
                    </div>
                    <div style={{ fontSize:12, color:C.muted, marginBottom:14, lineHeight:1.6 }}>
                      {item.data.hook_analysis?.substring(0,180)}...
                    </div>
                    <button onClick={()=>setScenario({ reel:item.reel, data:item.data, loading:false, error:null })}
                      style={{ background:C.a2+"20", border:`1px solid ${C.a2}40`, color:C.a2,
                        borderRadius:8, padding:"8px 16px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                      Открыть сценарий →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ScenarioModal scenario={scenario} onClose={()=>setScenario(null)}/>
    </div>
  );
}
