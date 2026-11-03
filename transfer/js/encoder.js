/* encoder.js - sender-side logic: rows -> validated cart -> list of frame strings. */
(function (g) {
  "use strict";
  var AQR = g.AQR = g.AQR || {};
  var U = AQR.Utils, V = AQR.Validator, P = AQR.Protocol;

  // items: [{name, barcode, qty (int), price (int paise)}]
  function buildCart(items, opts) {
    opts = opts || {};
    var cart = {
      v: 1,
      id: opts.id || U.newBillId(),
      ts: opts.ts !== undefined ? opts.ts : Date.now(),
      cur: opts.currency || "INR",
      items: items.map(function (it) { return { name: it.name, barcode: it.barcode, qty: it.qty, price: it.price }; }),
      total: V.computeTotal(items)
    };
    var res = V.validateCart(cart);
    if (!res.ok) throw new Error("Cart is invalid: " + res.errors.join("; "));
    return cart;
  }

  // Returns { transferId, frames:[string], frameCount, dataBytes, dataCrc, payloadChars }
  function encodeCart(cart, opts) {
    opts = opts || {};
    var res = V.validateCart(cart);
    if (!res.ok) throw new Error("Cannot encode invalid cart: " + res.errors.join("; "));
    var bytes = U.utf8Encode(P.serializeCart(cart));
    var dataCrc = U.crc32(bytes);
    var payload = U.b64urlEncode(bytes);
    var chunks = P.splitPayload(payload, opts.chunkSize || P.PROTOCOL.DEFAULT_CHUNK);
    if (chunks.length > P.PROTOCOL.MAX_FRAMES) throw new Error("Cart too large: needs " + chunks.length + " frames (max " + P.PROTOCOL.MAX_FRAMES + ")");
    var frames = chunks.map(function (chunk, i) {
      return P.buildFrame({ id: cart.id, seq: i + 1, total: chunks.length, dataCrc: dataCrc, payload: chunk });
    });
    return { transferId: cart.id, frames: frames, frameCount: frames.length, dataBytes: bytes.length, dataCrc: dataCrc, payloadChars: payload.length };
  }

  AQR.Encoder = { buildCart: buildCart, encodeCart: encodeCart };
})(typeof window !== "undefined" ? window : this);
