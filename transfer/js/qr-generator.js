/* qr-generator.js - thin adapter over libs/qrcodegen-lite.js (global QRGen). Only place that touches the generator lib. */
(function (g) {
  "use strict";
  var AQR = g.AQR = g.AQR || {};

  var QRGenerator = {
    isAvailable: function () { return !!(g.QRGen && typeof g.QRGen.encodeText === "function"); },

    requireLibrary: function () {
      if (!QRGenerator.isAvailable()) {
        throw new Error("QR generator library not loaded. Check that libs/qrcodegen-lite.js exists and is served next to this page.");
      }
    },

    // Builds QR symbols for every frame, all forced to the SAME version/size so the animation never "jumps".
    // Returns { qrs:[...], version, size }
    pregenerate: function (frames, ecl) {
      QRGenerator.requireLibrary();
      var maxVer = 1, i;
      for (i = 0; i < frames.length; i++) {
        var probe = g.QRGen.encodeText(frames[i], ecl);
        if (probe.version > maxVer) maxVer = probe.version;
      }
      var qrs = frames.map(function (f) { return g.QRGen.encodeText(f, ecl, { minVersion: maxVer }); });
      return { qrs: qrs, version: maxVer, size: qrs[0].size };
    },

    // Draw with an integer module scale (crisp edges) and a 4-module quiet zone.
    draw: function (canvas, qr, targetPx) {
      var border = 4, scale = Math.max(3, Math.floor((targetPx || 720) / (qr.size + border * 2)));
      g.QRGen.drawToCanvas(qr, canvas, scale, border);
    }
  };

  AQR.QRGenerator = QRGenerator;
})(typeof window !== "undefined" ? window : this);
