/* protocol.js - wire format only. No camera, no QR, no UI.
 *
 * One QR frame (ASCII text):
 *     AQR1|<transferId>|<seq>|<total>|<dataCrc32>|<payload>|<frameCrc32>
 *
 *   AQR1        protocol version / magic
 *   transferId  bill ID, [A-Za-z0-9_-]{4,32}  (frames of different IDs are never mixed)
 *   seq         1-based frame number
 *   total       number of frames in the transfer
 *   dataCrc32   CRC-32 (8 hex) of the COMPLETE decoded cart bytes (checked after reassembly)
 *   payload     slice of the base64url text of the cart bytes
 *   frameCrc32  CRC-32 (8 hex) over everything before the last '|' (header + payload)
 *
 * Cart bytes = UTF-8 of canonical JSON (see serializeCart).
 */
(function (g) {
  "use strict";
  var AQR = g.AQR = g.AQR || {};
  var U = AQR.Utils;

  var PROTOCOL = {
    VERSION: "AQR1",
    SEP: "|",
    DEFAULT_CHUNK: 100,      // payload characters per frame
    MIN_CHUNK: 20,
    MAX_CHUNK: 400,
    MAX_FRAMES: 999,
    TIMEOUT_MS: 20000,       // receiver: no NEW frame for this long => timeout
    ID_RE: /^[A-Za-z0-9_-]{4,32}$/
  };

  function fail(code, message) { return { ok: false, code: code, message: message }; }

  function frameBody(f) {
    return [PROTOCOL.VERSION, f.id, f.seq, f.total, U.hex8(f.dataCrc), f.payload].join(PROTOCOL.SEP);
  }

  // Throws on programmer errors (bad arguments).
  function buildFrame(f) {
    if (!PROTOCOL.ID_RE.test(f.id)) throw new Error("buildFrame: invalid transfer id");
    if (!(f.total >= 1 && f.total <= PROTOCOL.MAX_FRAMES)) throw new Error("buildFrame: invalid total");
    if (!(f.seq >= 1 && f.seq <= f.total)) throw new Error("buildFrame: invalid seq");
    if (!/^[A-Za-z0-9_-]+$/.test(f.payload)) throw new Error("buildFrame: payload must be base64url text");
    var body = frameBody(f);
    return body + PROTOCOL.SEP + U.hex8(U.crc32(U.utf8Encode(body)));
  }

  function parseFrame(text) {
    if (typeof text !== "string") return fail("NOT_TEXT", "Frame is not text");
    if (text.indexOf("AQR") !== 0) return fail("NOT_AQR", "Not an Animated-QR frame");
    if (text.indexOf(PROTOCOL.VERSION + PROTOCOL.SEP) !== 0) return fail("BAD_VERSION", "Unsupported protocol version");
    if (text.length > 2000) return fail("BAD_FORMAT", "Frame too long");
    var cut = text.lastIndexOf(PROTOCOL.SEP);
    var body = text.slice(0, cut), crcText = text.slice(cut + 1);
    var parts = body.split(PROTOCOL.SEP);
    if (parts.length !== 6) return fail("BAD_FORMAT", "Wrong number of fields");
    if (!/^[0-9a-f]{8}$/.test(crcText)) return fail("BAD_FORMAT", "Bad checksum field");
    if (U.hex8(U.crc32(U.utf8Encode(body))) !== crcText) return fail("BAD_CRC", "Frame checksum mismatch (corrupted scan)");
    var id = parts[1];
    if (!PROTOCOL.ID_RE.test(id)) return fail("BAD_ID", "Invalid transfer id");
    if (!/^\d{1,3}$/.test(parts[2]) || !/^\d{1,3}$/.test(parts[3])) return fail("BAD_SEQ", "Bad frame numbers");
    var seq = parseInt(parts[2], 10), total = parseInt(parts[3], 10);
    if (total < 1 || total > PROTOCOL.MAX_FRAMES) return fail("BAD_TOTAL", "Invalid total frame count");
    if (seq < 1 || seq > total) return fail("BAD_SEQ", "Frame number out of range");
    if (!/^[0-9a-f]{8}$/.test(parts[4])) return fail("BAD_FORMAT", "Bad data checksum field");
    if (!/^[A-Za-z0-9_-]+$/.test(parts[5])) return fail("BAD_PAYLOAD", "Invalid payload characters");
    return { ok: true, frame: { version: PROTOCOL.VERSION, id: id, seq: seq, total: total, dataCrc: parseInt(parts[4], 16) >>> 0, dataCrcHex: parts[4], payload: parts[5] } };
  }

  function splitPayload(payload, chunkSize) {
    var n = Math.max(PROTOCOL.MIN_CHUNK, Math.min(PROTOCOL.MAX_CHUNK, chunkSize | 0));
    var out = [];
    for (var i = 0; i < payload.length; i += n) out.push(payload.slice(i, i + n));
    if (!out.length) out.push("A"); // never produce zero frames
    return out;
  }

  // ---- Canonical cart serialisation (field order is fixed => deterministic bytes) ----
  function serializeCart(c) {
    return JSON.stringify({
      v: c.v, id: c.id, ts: c.ts, cur: c.cur,
      items: c.items.map(function (it) { return [it.name, it.barcode, it.qty, it.price]; }),
      total: c.total
    });
  }
  // Throws Error with a readable message on malformed structure.
  function deserializeCart(json) {
    var o = JSON.parse(json);
    if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error("Cart JSON is not an object");
    if (!Array.isArray(o.items)) throw new Error("Cart JSON has no items array");
    return {
      v: o.v, id: o.id, ts: o.ts, cur: o.cur,
      items: o.items.map(function (r, i) {
        if (!Array.isArray(r) || r.length !== 4) throw new Error("Item " + (i + 1) + " has wrong shape");
        return { name: r[0], barcode: r[1], qty: r[2], price: r[3] };
      }),
      total: o.total
    };
  }

  AQR.Protocol = {
    PROTOCOL: PROTOCOL, buildFrame: buildFrame, parseFrame: parseFrame, splitPayload: splitPayload,
    serializeCart: serializeCart, deserializeCart: deserializeCart
  };
})(typeof window !== "undefined" ? window : this);
