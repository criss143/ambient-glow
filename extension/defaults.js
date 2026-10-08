// Ajustes por defecto (compartidos entre content.js y popup.js)
var AG_DEFAULTS = {
  enabled: true,
  skipYouTube: true,   // YouTube ya tiene "Ambient light for YouTube"
  intensity: 100,       // % opacidad del brillo
  blur: 70,            // px de desenfoque
  spread: 60,          // % que el brillo sale alrededor del video
  saturation: 130,     // % saturación del color
  brightness: 120,     // % brillo
  fps: 30,             // cuadros por segundo del efecto
  pageGlow: 55,        // % brillo que tiñe toda la página (estilo YouTube)
  syncGlow: 85,        // % brillo con los colores del video de otra pestaña
  idleGlow: 60,        // % brillo RGB en páginas sin video
  dim: 0,              // % oscurecer el resto de la página (modo cine)
  blend: "screen",     // "screen" = luz (ideal páginas oscuras) | "normal" = sólido
  minSize: 200,        // ancho mínimo del video (px) para activar el efecto
  disabledSites: []    // dominios donde está apagado
};
