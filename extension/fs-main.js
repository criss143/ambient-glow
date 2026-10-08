// Ambient Glow: antes de pantalla completa en la pestaña que se está capturando,
// pide pausar la captura para que Chrome use la pantalla completa real.
(() => {
  const wrap = (proto, name) => {
    const orig = proto[name];
    if (typeof orig !== "function") return;
    proto[name] = function (...args) {
      const el = this;
      if (document.documentElement.dataset.agSource !== "1") return orig.apply(el, args);
      return new Promise((resolve, reject) => {
        const id = Math.random().toString(36).slice(2);
        let done = false;
        const go = () => {
          if (done) return; done = true;
          removeEventListener("message", onMsg);
          try { const r = orig.apply(el, args); r && r.then ? r.then(resolve, reject) : resolve(); } catch (e) { reject(e); }
        };
        const onMsg = (e) => { if (e.source === window && e.data && e.data.agFsReady === id) go(); };
        addEventListener("message", onMsg);
        postMessage({ agFsPause: id }, "*");
        setTimeout(go, 900); // por si acaso, no bloquear nunca la pantalla completa
      });
    };
  };
  wrap(Element.prototype, "requestFullscreen");
  wrap(Element.prototype, "webkitRequestFullscreen");
})();
