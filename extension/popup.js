const SLIDERS = { intensity: "%", blur: "px", spread: "%", pageGlow: "%", syncGlow: "%", idleGlow: "%", saturation: "%", brightness: "%", dim: "%", fps: "" };
const $ = (id) => document.getElementById(id);
let cfg = { ...AG_DEFAULTS };
let host = "";

// guardar agrupado (máx. ~30 veces/seg) para que arrastrar los controles sea fluido
let pending = {}, saveRaf = 0;
const save = (patch) => {
  Object.assign(cfg, patch); Object.assign(pending, patch);
  if (!saveRaf) saveRaf = requestAnimationFrame(() => { chrome.storage.local.set(pending); pending = {}; saveRaf = 0; });
  markPreset();
};

const PRESETS = {
  suave:   { intensity: 55, blur: 90,  saturation: 110, brightness: 100, syncGlow: 60,  pageGlow: 35, idleGlow: 35, dim: 0 },
  normal:  { intensity: 100, blur: 70, saturation: 130, brightness: 120, syncGlow: 85, pageGlow: 55, idleGlow: 60, dim: 0 },
  intenso: { intensity: 100, blur: 55, saturation: 170, brightness: 140, syncGlow: 100, pageGlow: 80, idleGlow: 80, dim: 20 },
  max:     { intensity: 100, blur: 40, saturation: 220, brightness: 170, syncGlow: 100, pageGlow: 100, idleGlow: 100, dim: 35 }
};
function markPreset() {
  document.querySelectorAll(".presets button").forEach((b) => {
    const p = PRESETS[b.dataset.preset];
    b.classList.toggle("on", Object.keys(p).every((k) => cfg[k] === p[k]));
  });
}
document.querySelectorAll(".presets button").forEach((b) => b.addEventListener("click", () => {
  save({ ...PRESETS[b.dataset.preset] });
  render();
}));
$("ver").textContent = chrome.runtime.getManifest().version;

// ---------- vista previa en vivo ----------
const pv = $("pv"), pctx = pv.getContext("2d"), pimg = pctx.createImageData(16, 9);
let frame = null, frameAt = -1e9;
chrome.runtime.onMessage.addListener((m) => {
  if (m?.type === "ag-frame-raw" && m.data?.length === 576) { frame = m.data; frameAt = performance.now(); }
});
(function drawPreview(now) {
  requestAnimationFrame(drawPreview);
  if (frame && now - frameAt < 2000) {
    for (let i = 0; i < 576; i++) pimg.data[i] = i % 4 === 3 ? 255 : frame[i];
  } else {
    // sin sincronizar: colores RGB animados como en las páginas sin video
    const t = now / 3000;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4, h = (x / 16 + t) % 1;
      const r = Math.sin(6.283 * h) * 127 + 128, g = Math.sin(6.283 * (h + 0.33)) * 127 + 128, b = Math.sin(6.283 * (h + 0.66)) * 127 + 128;
      pimg.data[i] = r; pimg.data[i + 1] = g; pimg.data[i + 2] = b; pimg.data[i + 3] = 255;
    }
  }
  pctx.putImageData(pimg, 0, 0);
  const strength = frame && now - frameAt < 2000 ? cfg.syncGlow : cfg.idleGlow;
  pv.style.opacity = String(cfg.enabled ? (strength / 100) * (cfg.intensity / 100) : 0);
  pv.style.filter = `blur(${Math.round(cfg.blur / 6) + 4}px) saturate(${cfg.saturation}%) brightness(${Math.round(cfg.brightness * 1.25)}%)`;
})(0);

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
  markPreset();
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
  const isYT = /(^|\.)youtube\.com$/.test(host);
  const updNote = () => { $("ytNote").hidden = !(isYT && cfg.skipYouTube); };
  $("skipYouTube").addEventListener("change", () => setTimeout(updNote));
  chrome.storage.local.get(AG_DEFAULTS, (s) => { cfg = { ...AG_DEFAULTS, ...s }; render(); markPreset(); updNote(); });
});
