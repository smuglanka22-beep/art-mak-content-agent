// Общий помощник для обращения к Claude API прямо из браузера.
// Ключ хранится только в localStorage пользователя — никуда, кроме
// api.anthropic.com, не отправляется.
export const CLAUDE_MODEL = "claude-opus-4-8";

const STORAGE_KEY = "artmak_anthropic_api_key";

export function getApiKey() {
  return localStorage.getItem(STORAGE_KEY) || "";
}

export function setApiKey(key) {
  localStorage.setItem(STORAGE_KEY, key);
}

export async function callClaude(promptText, imagePayload, maxTokens = 1600) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Не указан API-ключ Anthropic. Нажмите «Настройки» вверху страницы и вставьте ключ.");
  }

  const content = imagePayload
    ? [
        { type: "image", source: { type: "base64", media_type: imagePayload.mime, data: imagePayload.base64 } },
        { type: "text", text: promptText },
      ]
    : promptText;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Ошибка Claude API (${res.status}): ${errText || res.statusText}`);
  }

  const data = await res.json();
  return (data.content || []).map((b) => b.text || "").join("");
}
