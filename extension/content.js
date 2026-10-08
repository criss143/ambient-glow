// Ambient Glow Everywhere — Dev @Itzcrissxit
// Dibuja una luz ambiental detrás/alrededor del video principal de cualquier página.
(() => {
  if (window.__ambientGlowLoaded) return;
  window.__ambientGlowLoaded = true;

  const host = location.hostname.replace(/^www\./, "");
  let cfg = { ...AG_DEFAULTS };
  let layer, dimEl, canvas, ctx, pageCanvas, pctx;
  let current = null;      // video que se está iluminando
  let lastDraw = 0;
  let lastScan = 0;
  let videos = [];
  let rafId = 0;
  let lastMask = "";
  let idleEl = null;

  // ---------- colores sincronizados con el video de otra pestaña ----------
  let syncEl = null, sctx = null, syncImg = null, syncCur = null, syncTarget = null, lastFrameAt = -1e9;
  function ensureSync() {
    if (syncEl && syncEl.isConnected) return;
    syncEl = document.createElement("canvas");
    syncEl.id = "ambient-glow-sync";
    syncEl.width = 16; syncEl.height = 9;
    syncEl.setAttribute("aria-hidden", "true");
    const mask = "radial-gradient(ellipse at center, rgba(0,0,0,.7) 0%, #000 65%)";
    Object.assign(syncEl.style, {
      position: "fixed", left: "-10vw", top: "-10vh", width: "120vw", height: "120vh",
      pointerEvents: "none", zIndex: "2147483644", mixBlendMode: "screen", display: "none",
      maskImage: mask, webkitMaskImage: mask
    });
    sctx = syncEl.getContext("2d");
    syncImg = sctx.createImageData(16, 9);
    (document.body || document.documentElement).appendChild(syncEl);
  }
  // ---------- pestaña origen de la sincronización: pantalla completa real ----------
  const setSource = (on) => { if (on) document.documentElement.dataset.agSource = "1"; else delete document.documentElement.dataset.agSource; };
  chrome.runtime.sendMessage({ type: "ag-am-i-source" }, (r) => { if (!chrome.runtime.lastError && r) setSource(r.on); });
  addEventListener("message", (e) => {
    if (e.source !== window || !e.data || !e.data.agFsPause) return;
    const id = e.data.agFsPause;
    chrome.runtime.sendMessage({ type: "ag-pause" }, () => { void chrome.runtime.lastError; postMessage({ agFsReady: id }, "*"); });
  });
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && document.documentElement.dataset.agSource === "1") {
      chrome.runtime.sendMessage({ type: "ag-resume" }, () => void chrome.runtime.lastError);
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "ag-source") setSource(msg.on);
    if (msg && msg.type === "ag-frame" && msg.data && msg.data.length === 16 * 9 * 4) {
      syncTarget = msg.data;
      if (!syncCur) syncCur = Float32Array.from(msg.data);
      lastFrameAt = performance.now();
    }
  });
  function drawSync(on) {
    if (!on) { if (syncEl) syncEl.style.display = "none"; return; }
    ensureSync();
    // transición suave entre frames
    for (let i = 0; i < syncCur.length; i++) syncCur[i] += (syncTarget[i] - syncCur[i]) * 0.3;
    for (let i = 0; i < syncCur.length; i++) syncImg.data[i] = i % 4 === 3 ? 255 : syncCur[i];
    sctx.putImageData(syncImg, 0, 0);
    syncEl.style.filter = `blur(${cfg.blur + 20}px) saturate(${cfg.saturation}%) brightness(${Math.round(cfg.brightness * 1.25)}%)`;
    syncEl.style.opacity = String((cfg.syncGlow / 100) * (cfg.intensity / 100));
    syncEl.style.display = "block";
  }

  // ---------- brillo RGB para páginas sin video ----------
  function showIdle(on) {
    if (!on) { if (idleEl) idleEl.style.display = "none"; return; }
    if (!idleEl || !idleEl.isConnected) {
      idleEl = document.createElement("div");
      idleEl.id = "ambient-glow-rgb";
      idleEl.setAttribute("aria-hidden", "true");
      Object.assign(idleEl.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "2147483644", mixBlendMode: "screen" });
      (document.body || document.documentElement).appendChild(idleEl);
      idleEl.animate([{ filter: "hue-rotate(0deg)" }, { filter: "hue-rotate(360deg)" }], { duration: 9000, iterations: Infinity });
    }
    const a = (cfg.idleGlow / 100) * (cfg.intensity / 100);
    const sz = Math.round(Math.min(innerWidth, innerHeight) * 0.18);
    idleEl.style.boxShadow =
      `inset ${sz}px 0 ${sz * 1.6}px -${sz * 0.4}px rgba(124,58,237,${a}),` +
      `inset -${sz}px 0 ${sz * 1.6}px -${sz * 0.4}px rgba(6,182,212,${a}),` +
      `inset 0 ${sz}px ${sz * 1.6}px -${sz * 0.4}px rgba(244,63,94,${a * 0.8}),` +
      `inset 0 -${sz}px ${sz * 1.6}px -${sz * 0.4}px rgba(34,197,94,${a * 0.8})`;
    idleEl.style.display = "block";
  }

  // ---------- ajustes ----------
  const isActiveHere = () =>
    cfg.enabled &&
    !(cfg.disabledSites || []).includes(host) &&
    !(cfg.skipYouTube && /(^|\.)youtube\.com$/.test(host));

  chrome.storage.local.get(AG_DEFAULTS, (s) => { cfg = { ...AG_DEFAULTS, ...s }; applyStyle(); loop(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const k in changes) cfg[k] = changes[k].newValue;
    applyStyle();
    lastScan = 0;
  });

  // ---------- capa visual ----------
  function ensureLayer() {
    if (layer && layer.isConnected) return;
    layer = document.createElement("div");
    layer.id = "ambient-glow-layer";
    layer.setAttribute("aria-hidden", "true");
    Object.assign(layer.style, {
      position: "fixed", inset: "0", pointerEvents: "none",
      zIndex: "2147483646", contain: "strict", display: "none"
    });
    dimEl = document.createElement("div");
    dimEl.id = "ambient-glow-dim";
    Object.assign(dimEl.style, { position: "fixed", inset: "0", background: "#000", pointerEvents: "none", zIndex: "2147483645", display: "none" });
    // brillo de fondo que tiñe toda la página (como en YouTube)
    pageCanvas = document.createElement("canvas");
    pageCanvas.width = 32; pageCanvas.height = 18;
    Object.assign(pageCanvas.style, { position: "absolute", inset: "-10%", width: "120%", height: "120%" });
    pctx = pageCanvas.getContext("2d", { alpha: true });
    canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 36;
    Object.assign(canvas.style, { position: "absolute", left: "0", top: "0", willChange: "transform" });
    canvas.style.maskComposite = "intersect";
    canvas.style.webkitMaskComposite = "source-in";
    ctx = canvas.getContext("2d", { alpha: true });
    ctx.imageSmoothingEnabled = true;
    layer.append(pageCanvas, canvas);
    (document.body || document.documentElement).append(dimEl, layer);
    applyStyle();
  }

  function applyStyle() {
    if (!canvas) return;
    canvas.style.filter = `blur(${cfg.blur}px) saturate(${cfg.saturation}%) brightness(${cfg.brightness}%)`;
    canvas.style.opacity = String(cfg.intensity / 100);
    layer.style.mixBlendMode = cfg.blend === "normal" ? "normal" : "screen";
    pageCanvas.style.filter = `blur(${Math.max(cfg.blur * 2, 120)}px) saturate(${cfg.saturation}%) brightness(${cfg.brightness}%)`;
    pageCanvas.style.opacity = String(cfg.pageGlow / 100);
    pageCanvas.style.display = cfg.pageGlow > 0 ? "block" : "none";
    dimEl.style.opacity = String(cfg.dim / 100);
  }

  function hide() {
    if (layer) layer.style.display = "none";
    if (dimEl) dimEl.style.display = "none";
    current = null;
  }

  // ---------- buscar videos (incluye shadow DOM abierto, ej. Reddit) ----------
  function collectVideos(root, out) {
    root.querySelectorAll("video").forEach((v) => out.push(v));
    root.querySelectorAll("*").forEach((el) => { if (el.shadowRoot) collectVideos(el.shadowRoot, out); });
    return out;
  }

  // rectángulo real de la imagen (respeta barras negras de object-fit: contain)
  function contentRect(v) {
    const r = v.getBoundingClientRect();
    const vw = v.videoWidth, vh = v.videoHeight;
    const fit = getComputedStyle(v).objectFit;
    if (!vw || !vh || fit === "cover" || fit === "fill") return r;
    const scale = Math.min(r.width / vw, r.height / vh);
    const w = vw * scale, h = vh * scale;
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h };
  }

  function score(v) {
    if (v.readyState < 2 || v.ended) return 0;
    const st = getComputedStyle(v);
    if (st.visibility === "hidden" || st.display === "none" || +st.opacity === 0) return 0;
    const r = v.getBoundingClientRect();
    if (r.width < cfg.minSize || r.height < 80) return 0;
    const visW = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
    const visH = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
    if (visW <= 0 || visH <= 0) return 0;
    return visW * visH * (v.paused ? 0.5 : 1);
  }

  function pickVideo(now) {
    if (now - lastScan > 1000) {
      videos = collectVideos(document, []);
      lastScan = now;
    }
    let best = null, bestScore = 0;
    for (const v of videos) {
      if (!v.isConnected) continue;
      const s = score(v);
      if (s > bestScore) { best = v; bestScore = s; }
    }
    return best;
  }

  // ---------- render ----------
  function loop() {
    cancelAnimationFrame(rafId);
    const tick = (now) => {
      rafId = requestAnimationFrame(tick);
      if (!isActiveHere() || document.fullscreenElement) { showIdle(false); drawSync(false); return hide(); }

      const v = pickVideo(now);
      if (!v) {
        const synced = cfg.syncGlow > 0 && syncTarget && now - lastFrameAt < 2000;
        drawSync(synced);
        showIdle(!synced && cfg.idleGlow > 0);
        return hide();
      }
      drawSync(false);
      showIdle(false);
      ensureLayer();
      current = v;

      const r = contentRect(v);
      const s = cfg.spread / 100;
      const padX = Math.round(r.width * s), padY = Math.round(r.height * s);
      const W = Math.round(r.width) + padX * 2, H = Math.round(r.height) + padY * 2;

      // posición/tamaño (cada frame para que siga el scroll sin retraso)
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      canvas.style.transform = `translate(${Math.round(r.left) - padX}px, ${Math.round(r.top) - padY}px)`;
      // recorta el hueco del video para no taparlo
      const hole = `M0 0H${W}V${H}H0Z M${padX} ${padY}h${r.width}v${r.height}h${-r.width}Z`;
      canvas.style.clipPath = `path(evenodd, "${hole}")`;
      dimEl.style.clipPath = `path(evenodd, "M0 0H${innerWidth}V${innerHeight}H0Z M${r.left} ${r.top}h${r.width}v${r.height}h${-r.width}Z")`;
      // desvanecer los bordes exteriores del brillo hasta llegar al video
      const fx = (padX / W * 90).toFixed(1), fy = (padY / H * 90).toFixed(1);
      const mask = `linear-gradient(to right, transparent, #000 ${fx}%, #000 ${100 - fx}%, transparent), linear-gradient(to bottom, transparent, #000 ${fy}%, #000 ${100 - fy}%, transparent)`;
      if (mask !== lastMask) { canvas.style.maskImage = mask; canvas.style.webkitMaskImage = mask; lastMask = mask; }
      const ox = innerWidth * 0.1, oy = innerHeight * 0.1;
      pageCanvas.style.clipPath = `path(evenodd, "M0 0H${innerWidth * 1.2}V${innerHeight * 1.2}H0Z M${r.left + ox} ${r.top + oy}h${r.width}v${r.height}h${-r.width}Z")`;
      layer.style.display = "block";
      dimEl.style.display = cfg.dim > 0 ? "block" : "none";

      // dibujar el frame limitado a los FPS elegidos
      if (now - lastDraw < 1000 / cfg.fps) return;
      lastDraw = now;
      const cw = canvas.width, ch = canvas.height;
      const ix = Math.round(cw * padX / W), iy = Math.round(ch * padY / H);
      try {
        ctx.clearRect(0, 0, cw, ch);
        ctx.drawImage(v, 0, 0, cw, ch);                       // base estirada (bordes)
        ctx.drawImage(v, ix, iy, cw - ix * 2, ch - iy * 2);   // centro exacto
        if (cfg.pageGlow > 0) { pctx.clearRect(0, 0, 32, 18); pctx.drawImage(canvas, 0, 0, 32, 18); }
      } catch (e) { /* video aún sin datos */ }
    };
    rafId = requestAnimationFrame(tick);
  }
})();
