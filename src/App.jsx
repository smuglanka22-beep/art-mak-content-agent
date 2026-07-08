import { useState } from "react";
import { Settings, X, MessageSquare, Radar } from "lucide-react";
import ContentAgent from "./pages/ContentAgent.jsx";
import ReelsDashboard from "./pages/ReelsDashboard.jsx";
import { getApiKey, setApiKey } from "./lib/anthropic.js";

export default function App() {
  const [tab, setTab] = useState("content");
  const [showSettings, setShowSettings] = useState(false);
  const [keyInput, setKeyInput] = useState(getApiKey());
  const [saved, setSaved] = useState(false);

  const saveKey = () => {
    setApiKey(keyInput.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div style={{ minHeight: "100vh", fontFamily: "-apple-system, 'Segoe UI', sans-serif" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 16px",
          background: "#1a1a2e",
          color: "#fff",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setTab("content")} style={tabStyle(tab === "content")}>
            <MessageSquare size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Контент-агент
          </button>
          <button onClick={() => setTab("reels")} style={tabStyle(tab === "reels")}>
            <Radar size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Анализ конкурентов
          </button>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          style={{
            background: "none",
            border: "1px solid #444",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 20,
            fontSize: 12,
          }}
        >
          <Settings size={14} /> Настройки
        </button>
      </div>

      {showSettings && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#000a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
          onClick={() => setShowSettings(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 8, padding: 24, maxWidth: 440, width: "100%" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Ключ Anthropic (Claude) API</h3>
              <button onClick={() => setShowSettings(false)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: 13, color: "#555", lineHeight: 1.5 }}>
              Этот ключ нужен, чтобы оба инструмента могли писать тексты и сценарии через Claude.
              Получить его можно в личном кабинете Anthropic (console.anthropic.com → Settings → API Keys).
              Ключ сохраняется только в памяти вашего браузера на этом телефоне/компьютере.
            </p>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="sk-ant-..."
              style={{ width: "100%", padding: 10, marginBottom: 12, border: "1px solid #ccc", borderRadius: 4, boxSizing: "border-box" }}
            />
            <button
              onClick={saveKey}
              style={{ width: "100%", padding: 10, background: "#6B2D3E", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 700 }}
            >
              {saved ? "Сохранено ✓" : "Сохранить"}
            </button>
          </div>
        </div>
      )}

      {tab === "content" ? <ContentAgent /> : <ReelsDashboard />}
    </div>
  );
}

function tabStyle(active) {
  return {
    padding: "8px 16px",
    borderRadius: 20,
    border: "none",
    background: active ? "#fff" : "transparent",
    color: active ? "#1a1a2e" : "#fff",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  };
}
