// Ambient Glow — sincroniza los colores del video de una pestaña con todas las demás.
let sourceTabId = null;
let sourceTitle = "";
let paused = false;   // captura pausada mientras la pestaña origen está en pantalla completa

// avisar a la pestaña origen para que pause la captura antes de entrar en pantalla completa
// (si no, Chrome la pone en "pantalla completa dentro de la pestaña" y se ven las pestañas/barra)
function markSource(tabId, on) {
  if (tabId != null) chrome.tabs.sendMessage(tabId, { type: "ag-source", on }).catch(() => {});
}

const ready = new Promise((r) => chrome.storage.session.get({ sourceTabId: null, sourceTitle: "", paused: false }, (s) => {
  sourceTabId = s.sourceTabId; sourceTitle = s.sourceTitle; paused = s.paused; r();
}));
const setPaused = (v) => { paused = v; chrome.storage.session.set({ paused: v }); };

async function ensureOffscreen() {
  const has = await chrome.offscreen.hasDocument();
  if (!has) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["USER_MEDIA"],
      justification: "Leer los colores del video de la pestaña elegida para el brillo ambiental"
    });
  }
}

async function stopSync() {
  markSource(sourceTabId, false);
  sourceTabId = null; sourceTitle = ""; setPaused(false);
  chrome.storage.session.set({ sourceTabId: null, sourceTitle: "" });
  if (await chrome.offscreen.hasDocument()) {
    try { await chrome.runtime.sendMessage({ type: "ag-offscreen-stop" }); } catch (e) {}
    await chrome.offscreen.closeDocument();
  }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg) return;
  if (msg.type === "ag-start") {
    (async () => {
      await ready;
      await stopSync();
      await ensureOffscreen();
      sourceTabId = msg.tabId; sourceTitle = msg.title || "";
      chrome.storage.session.set({ sourceTabId, sourceTitle });
      await chrome.runtime.sendMessage({ type: "ag-offscreen-start", streamId: msg.streamId });
      markSource(sourceTabId, true);
      reply({ ok: true });
    })().catch((e) => reply({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.type === "ag-pause") {
    (async () => {
      await ready;
      if (sender.tab && sender.tab.id === sourceTabId && !paused && await chrome.offscreen.hasDocument()) {
        setPaused(true);
        try { await chrome.runtime.sendMessage({ type: "ag-offscreen-stop" }); } catch (e) {}
      }
      reply({ ok: true });
    })();
    return true;
  }
  if (msg.type === "ag-resume") {
    ready.then(() => {
    if (sender.tab && sender.tab.id === sourceTabId && paused) {
      setPaused(false);
      chrome.tabCapture.getMediaStreamId({ targetTabId: sourceTabId }, async (streamId) => {
        if (chrome.runtime.lastError || !streamId) return stopSync();
        await ensureOffscreen();
        chrome.runtime.sendMessage({ type: "ag-offscreen-start", streamId }).catch(() => stopSync());
      });
    }
    });
    return;
  }
  if (msg.type === "ag-am-i-source") { ready.then(() => reply({ on: !!(sender.tab && sender.tab.id === sourceTabId) })); return true; }
  if (msg.type === "ag-stop") { stopSync().then(() => reply({ ok: true })); return true; }
  if (msg.type === "ag-status") { ready.then(() => reply({ sourceTabId, sourceTitle })); return true; }
  if (msg.type === "ag-capture-ended") { stopSync(); return; }
  if (msg.type === "ag-frame-raw") {
    // reenviar el frame solo a las pestañas visibles (una por ventana)
    chrome.tabs.query({ active: true }, (tabs) => {
      for (const t of tabs) {
        if (t.id === sourceTabId) continue;
        chrome.tabs.sendMessage(t.id, { type: "ag-frame", data: msg.data }).catch(() => {});
      }
    });
  }
});

chrome.tabs.onRemoved.addListener((id) => { if (id === sourceTabId) stopSync(); });
