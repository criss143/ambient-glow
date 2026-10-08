// Recibe la captura de la pestaña elegida y manda una miniatura 16x9 de colores ~15 veces por segundo.
const video = document.getElementById("v");
const ctx = document.getElementById("c").getContext("2d", { willReadFrequently: true });
let stream = null, timer = 0;

function stop() {
  clearInterval(timer); timer = 0;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
}

async function start(streamId) {
  stop();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.round(Math.max(screen.width * dpr, 1280)), H = Math.round(Math.max(screen.height * dpr, 720));
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    // resolución de pantalla completa: si la pestaña entra en pantalla completa mientras se captura,
    // Chrome la dibuja al tamaño de la captura, así que debe ser grande para que no se vea pixelado
    video: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId,
      minWidth: W, maxWidth: W, minHeight: H, maxHeight: H, maxFrameRate: 30 } }
  });
  stream.getVideoTracks()[0].addEventListener("ended", () => { stop(); chrome.runtime.sendMessage({ type: "ag-capture-ended" }); });
  video.srcObject = stream;
  await video.play();
  timer = setInterval(() => {
    if (video.readyState < 2) return;
    ctx.drawImage(video, 0, 0, 16, 9);
    const d = ctx.getImageData(0, 0, 16, 9).data;
    chrome.runtime.sendMessage({ type: "ag-frame-raw", data: Array.from(d) }).catch(() => {});
  }, 66);
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === "ag-offscreen-start") {
    start(msg.streamId).then(() => reply({ ok: true }), (e) => { reply({ ok: false }); chrome.runtime.sendMessage({ type: "ag-capture-ended", error: String(e) }); });
    return true;
  }
  if (msg?.type === "ag-offscreen-stop") { stop(); reply({ ok: true }); }
});
