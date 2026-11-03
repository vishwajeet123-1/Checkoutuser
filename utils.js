/* utils.js - generic helpers only: CRC-32, UTF-8, base64url, money (integer paise), ids, deepEqual. */
(function (g) {
  "use strict";
  var AQR = g.AQR = g.AQR || {};

  // ---- CRC-32 (IEEE 802.3, polynomial 0xEDB88320) ----
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function hex8(n) { return ("00000000" + (n >>> 0).toString(16)).slice(-8); }

  // ---- UTF-8 ----
  function utf8Encode(str) { return new TextEncoder().encode(str); }
  function utf8Decode(bytes) { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } // throws on invalid UTF-8

  // ---- base64url (RFC 4648 section 5, no padding) ----
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  var B64_LOOKUP = {};
  for (var q = 0; q < 64; q++) B64_LOOKUP[B64.charAt(q)] = q;
  function b64urlEncode(bytes) {
    var out = "", i, n;
    for (i = 0; i + 2 < bytes.length; i += 3) {
      n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
    }
    var rem = bytes.length - i;
    if (rem === 1) { n = bytes[i] << 16; out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]; }
    else if (rem === 2) { n = (bytes[i] << 16) | (bytes[i + 1] << 8); out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63]; }
    return out;
  }
  function b64urlDecode(str) {
    if (typeof str !== "string" || !/^[A-Za-z0-9_-]*$/.test(str) || str.length % 4 === 1) throw new Error("Invalid base64url data");
    var bytes = [], buf = 0, bits = 0;
    for (var i = 0; i < str.length; i++) {
      buf = (buf << 6) | B64_LOOKUP[str.charAt(i)];
      bits += 6;
      if (bits >= 8) { bits -= 8; bytes.push((buf >> bits) & 0xFF); buf &= (1 << bits) - 1; }
    }
    return Uint8Array.from(bytes);
  }

  // ---- Money: integer paise only, never floats ----
  // "49.5" -> 4950, "100" -> 10000, "1.234" -> null (invalid)
  function parseMoneyToPaise(input) {
    var s = String(input).trim();
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
    var parts = s.split(".");
    return parseInt(parts[0], 10) * 100 + (parts[1] ? parseInt((parts[1] + "0").slice(0, 2), 10) : 0);
  }
  function formatPaise(p) {
    var neg = p < 0; p = Math.abs(p);
    var rupees = Math.floor(p / 100), paise = p % 100;
    return (neg ? "-" : "") + "\u20B9" + String(rupees).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + ("0" + paise).slice(-2);
  }
  function parseIntStrict(input, min, max) {
    var s = String(input).trim();
    if (!/^\d{1,9}$/.test(s)) return null;
    var n = parseInt(s, 10);
    return (n >= min && n <= max) ? n : null;
  }

  // ---- ids ----
  function randomString(len) {
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", out = "";
    var arr = new Uint8Array(len);
    if (g.crypto && g.crypto.getRandomValues) g.crypto.getRandomValues(arr);
    else for (var i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 256);
    for (var j = 0; j < len; j++) out += chars.charAt(arr[j] % chars.length);
    return out;
  }
  function newBillId() { return "B" + Date.now().toString(36).toUpperCase() + randomString(3); }

  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var i = 0; i < ka.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(b, ka[i]) || !deepEqual(a[ka[i]], b[ka[i]])) return false;
    }
    return true;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  AQR.Utils = {
    crc32: crc32, hex8: hex8, utf8Encode: utf8Encode, utf8Decode: utf8Decode,
    b64urlEncode: b64urlEncode, b64urlDecode: b64urlDecode,
    parseMoneyToPaise: parseMoneyToPaise, formatPaise: formatPaise, parseIntStrict: parseIntStrict,
    randomString: randomString, newBillId: newBillId, deepEqual: deepEqual, escapeHtml: escapeHtml
  };
})(typeof window !== "undefined" ? window : this);
