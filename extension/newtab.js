const $ = (id) => document.getElementById(id);

// ---------- reloj, saludo, fecha ----------
const RING = 351.86;
function tick() {
  const d = new Date();
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  $("hh").textContent = String(h12).padStart(2, "0");
  $("mm").textContent = String(d.getMinutes()).padStart(2, "0");
  $("ampm").textContent = ampm;
  $("date").textContent = d.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
  const s = d.getSeconds() + d.getMilliseconds() / 1000;
  $("secRing").style.strokeDashoffset = String(RING - (RING * s) / 60);
  const g = h < 5 ? "Buenas noches" : h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  $("greet").innerHTML = `${g}, <b>Criss</b>`;
}
tick(); setInterval(tick, 250);

// ---------- buscador ----------
let engine = "google";
try { engine = localStorage.getItem("ag-engine") || "google"; } catch (e) {}
const ENGINES = {
  google: { url: "https://www.google.com/search?q=", ph: "Buscar en Google o escribir una URL" },
  youtube: { url: "https://www.youtube.com/results?search_query=", ph: "Buscar en YouTube" }
};
function setEngine(e) {
  engine = e;
  document.querySelectorAll(".engines button").forEach((b) => b.classList.toggle("on", b.dataset.engine === e));
  $("q").placeholder = ENGINES[e].ph;
  try { localStorage.setItem("ag-engine", e); } catch (err) {}
}
document.querySelectorAll(".engines button").forEach((b) => b.addEventListener("click", () => { setEngine(b.dataset.engine); $("q").focus(); }));
setEngine(engine);
// clic en cualquier parte de la barra = escribir
$("search").addEventListener("mousedown", (e) => { if (!e.target.closest("button")) { e.preventDefault(); $("q").focus(); } });
setTimeout(() => $("q").focus(), 50);
$("search").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("q").value.trim();
  if (!q) return;
  if (engine === "google" && !q.includes(" ") && /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(q)) {
    location.href = /^https?:\/\//i.test(q) ? q : "https://" + q;
  } else {
    location.href = ENGINES[engine].url + encodeURIComponent(q);
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== $("q") && !document.activeElement.matches("input")) { e.preventDefault(); $("q").focus(); }
  if (e.key === "Tab" && document.activeElement === $("q") && !e.shiftKey) { e.preventDefault(); setEngine(engine === "google" ? "youtube" : "google"); }
});

// ---------- accesos directos (editables) ----------
const DEFAULT_LINKS = [
  { name: "YouTube", url: "https://www.youtube.com", c: "#ff0033" },
  { name: "Instagram", url: "https://www.instagram.com", c: "#e1306c" },
  { name: "TikTok", url: "https://www.tiktok.com", c: "#25f4ee" },
  { name: "WhatsApp", url: "https://web.whatsapp.com", c: "#25d366" },
  { name: "Netflix", url: "https://www.netflix.com", c: "#e50914" },
  { name: "Twitch", url: "https://www.twitch.tv", c: "#9146ff" },
  { name: "Gmail", url: "https://mail.google.com", c: "#ea4335" },
  { name: "Binance", url: "https://www.binance.com", c: "#f0b90b" }
];
let links = DEFAULT_LINKS;
const favicon = (url) => {
  const u = new URL(chrome.runtime.getURL("/_favicon/"));
  u.searchParams.set("pageUrl", url); u.searchParams.set("size", "64");
  return u.toString();
};
function renderLinks() {
  const nav = $("links");
  nav.innerHTML = "";
  links.forEach((l, i) => {
    const a = document.createElement("a");
    a.className = "tile"; a.href = l.url;
    a.style.animationDelay = (0.2 + i * 0.04) + "s";
    a.style.setProperty("--c", l.c || "#a78bfa");
    const ico = document.createElement("span"); ico.className = "ico";
    const img = document.createElement("img"); img.alt = ""; img.src = favicon(l.url);
    img.onerror = () => { img.remove(); ico.textContent = l.name[0].toUpperCase(); };
    ico.append(img);
    const name = document.createElement("span"); name.className = "name"; name.textContent = l.name;
    const del = document.createElement("button"); del.className = "del"; del.type = "button"; del.textContent = "×"; del.title = "Quitar";
    del.addEventListener("click", (e) => { e.preventDefault(); links.splice(i, 1); saveLinks(); renderLinks(); });
    a.append(ico, name, del);
    a.addEventListener("click", (e) => { if (document.body.classList.contains("editing")) e.preventDefault(); });
    nav.append(a);
  });
  const add = document.createElement("button");
  add.type = "button"; add.className = "tile add";
  add.innerHTML = '<span class="ico">+</span><span class="name">Añadir</span>';
  add.addEventListener("click", () => { $("addForm").hidden = false; $("addName").focus(); });
  nav.append(add);
}
function saveLinks() { chrome.storage.local.set({ ntLinks: links }); }
chrome.storage.local.get({ ntLinks: null }, (s) => { if (Array.isArray(s.ntLinks)) links = s.ntLinks; renderLinks(); });
$("editBtn").addEventListener("click", () => {
  const on = document.body.classList.toggle("editing");
  $("editBtn").classList.toggle("on", on);
  if (!on) $("addForm").hidden = true;
});
$("addForm").addEventListener("submit", (e) => {
  e.preventDefault();
  let url = $("addUrl").value.trim();
  const name = $("addName").value.trim();
  if (!url || !name) return;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try { new URL(url); } catch (err) { return; }
  links.push({ name, url });
  saveLinks(); renderLinks();
  $("addName").value = ""; $("addUrl").value = "";
  $("addForm").hidden = true;
});

// ---------- estrellas / partículas ----------
const st = $("stars"), sx = st.getContext("2d");
let stars = [];
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  st.width = innerWidth * dpr; st.height = innerHeight * dpr;
  sx.setTransform(dpr, 0, 0, dpr, 0, 0);
  stars = Array.from({ length: Math.round((innerWidth * innerHeight) / 9000) }, () => ({
    x: Math.random() * innerWidth, y: Math.random() * innerHeight,
    r: Math.random() * 1.2 + 0.2, s: Math.random() * 0.25 + 0.05, p: Math.random() * Math.PI * 2
  }));
}
resize(); addEventListener("resize", resize);

// ---------- brillo sincronizado con el video ----------
const sync = $("sync"), sctx = sync.getContext("2d"), img = sctx.createImageData(16, 9);
let cfg = { ...AG_DEFAULTS }, cur = null, target = null, lastAt = -1e9;
chrome.storage.local.get(AG_DEFAULTS, (s) => { cfg = { ...AG_DEFAULTS, ...s }; });
chrome.storage.onChanged.addListener((c, a) => { if (a === "local") for (const k in c) cfg[k] = c[k].newValue; });
chrome.runtime.onMessage.addListener((m) => {
  if (m?.type === "ag-frame-raw" && m.data?.length === 576) {
    target = m.data; if (!cur) cur = Float32Array.from(m.data); lastAt = performance.now();
  }
});
function refreshNowPlaying() {
  chrome.runtime.sendMessage({ type: "ag-status" }, (st) => {
    if (chrome.runtime.lastError) return;
    const on = !!(st && st.sourceTabId);
    $("nowPlaying").hidden = !on;
    if (on) $("npTitle").textContent = (st.sourceTitle || "").replace(/^\(\d+\)\s*/, "").replace(/\s*-\s*YouTube$/, "");
  });
}
refreshNowPlaying(); setInterval(refreshNowPlaying, 3000);

(function frame(now) {
  requestAnimationFrame(frame);
  const synced = cfg.enabled && cfg.syncGlow > 0 && target && now - lastAt < 2000;
  if (synced) {
    for (let i = 0; i < 576; i++) { cur[i] += (target[i] - cur[i]) * 0.25; img.data[i] = i % 4 === 3 ? 255 : cur[i]; }
    sctx.putImageData(img, 0, 0);
  }
  document.body.classList.toggle("synced", !!synced);
  sync.style.opacity = synced ? String((cfg.syncGlow / 100) * (cfg.intensity / 100)) : "0";
  sync.style.filter = `blur(${cfg.blur + 30}px) saturate(${cfg.saturation}%) brightness(${Math.round(cfg.brightness * 1.25)}%)`;

  // estrellas
  sx.clearRect(0, 0, innerWidth, innerHeight);
  for (const p of stars) {
    p.y -= p.s; if (p.y < -2) { p.y = innerHeight + 2; p.x = Math.random() * innerWidth; }
    const a = 0.35 + 0.35 * Math.sin(now / 900 + p.p);
    sx.globalAlpha = a; sx.fillStyle = "#fff";
    sx.beginPath(); sx.arc(p.x, p.y, p.r, 0, 6.283); sx.fill();
  }
})(0);
