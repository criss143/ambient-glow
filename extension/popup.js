const SLIDERS = { intensity: "%", blur: "px", spread: "%", pageGlow: "%", syncGlow: "%", idleGlow: "%", saturation: "%", brightness: "%", dim: "%", fps: "" };
const $ = (id) => document.getElementById(id);
let cfg = { ...AG_DEFAULTS };
let host = "";

const save = (patch) => { Object.assign(cfg, patch); chrome.storage.local.set(patch); };

function render() {
  $("enabled").checked = cfg.enabled;
  $("skipYouTube").checked = cfg.skipYouTube;
  $("blendScreen").checked = cfg.blend !== "normal";
  $("siteOn").checked = !cfg.disabledSites.includes(host);
  $("siteOn").disabled = !host;
  for (const [k, unit] of Object.entries(SLIDERS)) {
    const el = $(k);
    el.value = cfg[k];
    el.previousElementSibling.textContent = cfg[k] + unit;
  }
}

for (const [k, unit] of Object.entries(SLIDERS)) {
  $(k).addEventListener("input", (e) => {
    const v = +e.target.value;
    e.target.previousElementSibling.textContent = v + unit;
    save({ [k]: v });
  });
}
$("enabled").addEventListener("change", (e) => save({ enabled: e.target.checked }));
$("skipYouTube").addEventListener("change", (e) => save({ skipYouTube: e.target.checked }));
$("blendScreen").addEventListener("change", (e) => save({ blend: e.target.checked ? "screen" : "normal" }));
$("siteOn").addEventListener("change", (e) => {
  const list = cfg.disabledSites.filter((h) => h !== host);
  if (!e.target.checked) list.push(host);
  save({ disabledSites: list });
});
$("reset").addEventListener("click", () => {
  const keep = { disabledSites: cfg.disabledSites };
  cfg = { ...AG_DEFAULTS, ...keep };
  chrome.storage.local.set(cfg);
  render();
});

let activeTab = null;
function showSync(st) {
  const btn = $("syncBtn"), txt = $("syncStatus");
  if (st && st.sourceTabId) {
    btn.textContent = "⏹ Detener sincronización";
    btn.classList.add("on");
    txt.textContent = "Usando los colores de: " + (st.sourceTitle || "otra pestaña");
  } else {
    btn.textContent = "🎵 Usar los colores de esta pestaña en todas";
    btn.classList.remove("on");
  }
}
chrome.runtime.sendMessage({ type: "ag-status" }, showSync);
$("syncBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "ag-status" }, (st) => {
    if (st && st.sourceTabId) {
      chrome.runtime.sendMessage({ type: "ag-stop" }, () => showSync(null));
      return;
    }
    if (!activeTab) return;
    chrome.tabCapture.getMediaStreamId({ targetTabId: activeTab.id }, (streamId) => {
      if (chrome.runtime.lastError || !streamId) {
        $("syncStatus").textContent = "No se pudo capturar esta pestaña: " + (chrome.runtime.lastError?.message || "");
        return;
      }
      const title = activeTab.title || host;
      chrome.runtime.sendMessage({ type: "ag-start", streamId, tabId: activeTab.id, title }, (r) => {
        if (r && r.ok) showSync({ sourceTabId: activeTab.id, sourceTitle: title });
        else $("syncStatus").textContent = "Error: " + (r?.error || "desconocido");
      });
    });
  });
});

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  activeTab = tab;
  try { host = new URL(tab.url).hostname.replace(/^www\./, ""); } catch { host = ""; }
  $("host").textContent = host ? "Activo en " + host : "Página no compatible";
  chrome.storage.local.get(AG_DEFAULTS, (s) => { cfg = { ...AG_DEFAULTS, ...s }; render(); });
});
