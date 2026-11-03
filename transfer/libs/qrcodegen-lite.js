/*!
 * qrcodegen-lite.js  -  QR Code (Model 2) generator, byte mode, versions 1-40, ECC L/M/Q/H
 * Version 1.0.0
 *
 * Written specifically for the Animated-QR-Transfer project (MIT licence).
 * Implements ISO/IEC 18004 encoding: Reed-Solomon over GF(256)/0x11D, block interleaving,
 * function patterns, 8 data masks with penalty-based mask selection, format + version info.
 * No dependencies, no network access. Exposes a single global: QRGen.
 *
 * API
 *   QRGen.encodeText(text, "L"|"M"|"Q"|"H", {minVersion, maxVersion, mask}) -> qr
 *   QRGen.encodeBytes(Uint8Array|Array, eccName, opts)                       -> qr
 *   qr = { version, size, ecl, mask, modules: Uint8Array(size*size) (1 = dark), get(x,y) }
 *   QRGen.renderToImageData(qr, scale, border) -> { data:Uint8ClampedArray(RGBA), width, height }
 *   QRGen.drawToCanvas(qr, canvas, scale, border)
 */
(function (global) {
  "use strict";

  // Index = version (1..40). Index 0 unused.
  var ECC_CODEWORDS_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // L
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], // M
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // Q
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]  // H
  ];
  var NUM_ERROR_CORRECTION_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25], // L
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49], // M
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68], // Q
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]  // H
  ];
  // ord = row in tables above, fmt = 2-bit value placed in the format information.
  var ECL = { L: { ord: 0, fmt: 1 }, M: { ord: 1, fmt: 0 }, Q: { ord: 2, fmt: 3 }, H: { ord: 3, fmt: 2 } };

  function getNumRawDataModules(ver) {
    var r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var n = Math.floor(ver / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  function getNumDataCodewords(ver, ecl) {
    return Math.floor(getNumRawDataModules(ver) / 8) -
      ECC_CODEWORDS_PER_BLOCK[ecl.ord][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl.ord][ver];
  }
  function alignmentPositions(ver) {
    if (ver === 1) return [];
    var n = Math.floor(ver / 7) + 2;
    var step = (ver === 32) ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
    var res = [6];
    for (var pos = ver * 4 + 10; res.length < n; pos -= step) res.splice(1, 0, pos);
    return res;
  }

  // ---- Reed-Solomon ----
  function rsMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function rsDivisor(degree) {
    var result = [], i, j;
    for (i = 0; i < degree; i++) result.push(0);
    result[degree - 1] = 1;
    var root = 1;
    for (i = 0; i < degree; i++) {
      for (j = 0; j < result.length; j++) {
        result[j] = rsMul(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = rsMul(root, 2);
    }
    return result;
  }
  function rsRemainder(data, divisor) {
    var result = divisor.map(function () { return 0; });
    for (var k = 0; k < data.length; k++) {
      var factor = data[k] ^ result.shift();
      result.push(0);
      for (var i = 0; i < divisor.length; i++) result[i] ^= rsMul(divisor[i], factor);
    }
    return result;
  }

  // ---- Format / version information ----
  function formatBits(eclName, mask) {
    var e = ECL[eclName];
    var data = (e.fmt << 3) | mask;
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
  }
  function versionBits(ver) {
    var rem = ver;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    return (ver << 12) | rem;
  }

  function appendBits(arr, val, len) {
    for (var i = len - 1; i >= 0; i--) arr.push((val >>> i) & 1);
  }

  function addEccAndInterleave(data, ver, ecl) {
    var numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl.ord][ver];
    var blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl.ord][ver];
    var rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
    var numShortBlocks = numBlocks - rawCodewords % numBlocks;
    var shortBlockLen = Math.floor(rawCodewords / numBlocks);
    var blocks = [], div = rsDivisor(blockEccLen), i, j, k = 0;
    for (i = 0; i < numBlocks; i++) {
      var dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
      k += dat.length;
      var ecc = rsRemainder(dat, div);
      if (i < numShortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var result = [];
    for (i = 0; i < blocks[0].length; i++) {
      for (j = 0; j < blocks.length; j++) {
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(blocks[j][i]);
      }
    }
    return result;
  }

  function buildSymbol(ver, eclName, dataCodewords, forcedMask) {
    var ecl = ECL[eclName];
    var size = ver * 4 + 17;
    var modules = new Uint8Array(size * size);
    var isFn = new Uint8Array(size * size);
    var i, j, x, y;

    function setFn(x, y, dark) {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      modules[y * size + x] = dark ? 1 : 0;
      isFn[y * size + x] = 1;
    }
    function drawFinder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy));
        setFn(cx + dx, cy + dy, dist !== 2 && dist !== 4);
      }
    }
    function drawAlign(cx, cy) {
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++)
        setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    function drawFormat(mask) {
      var bits = formatBits(eclName, mask), n;
      for (n = 0; n <= 5; n++) setFn(8, n, (bits >>> n) & 1);
      setFn(8, 7, (bits >>> 6) & 1);
      setFn(8, 8, (bits >>> 7) & 1);
      setFn(7, 8, (bits >>> 8) & 1);
      for (n = 9; n < 15; n++) setFn(14 - n, 8, (bits >>> n) & 1);
      for (n = 0; n < 8; n++) setFn(size - 1 - n, 8, (bits >>> n) & 1);
      for (n = 8; n < 15; n++) setFn(8, size - 15 + n, (bits >>> n) & 1);
      setFn(8, size - 8, 1); // always-dark module
    }
    function drawVersion() {
      if (ver < 7) return;
      var bits = versionBits(ver);
      for (var n = 0; n < 18; n++) {
        var bit = (bits >>> n) & 1, a = size - 11 + n % 3, b = Math.floor(n / 3);
        setFn(a, b, bit); setFn(b, a, bit);
      }
    }

    // function patterns
    for (i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    drawFinder(3, 3); drawFinder(size - 4, 3); drawFinder(3, size - 4);
    var ap = alignmentPositions(ver), na = ap.length;
    for (i = 0; i < na; i++) for (j = 0; j < na; j++) {
      if (!((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0))) drawAlign(ap[i], ap[j]);
    }
    drawFormat(0);
    drawVersion();

    // zig-zag codeword placement
    var bitIdx = 0, total = dataCodewords.length * 8;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (j = 0; j < 2; j++) {
          x = right - j;
          var upward = ((right + 1) & 2) === 0;
          y = upward ? size - 1 - vert : vert;
          if (!isFn[y * size + x] && bitIdx < total) {
            modules[y * size + x] = (dataCodewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1;
            bitIdx++;
          }
        }
      }
    }

    function maskInvert(mask, x, y) {
      switch (mask) {
        case 0: return (x + y) % 2 === 0;
        case 1: return y % 2 === 0;
        case 2: return x % 3 === 0;
        case 3: return (x + y) % 3 === 0;
        case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
        case 5: return x * y % 2 + x * y % 3 === 0;
        case 6: return (x * y % 2 + x * y % 3) % 2 === 0;
        default: return ((x + y) % 2 + x * y % 3) % 2 === 0;
      }
    }
    function applyMask(mask) {
      for (var yy = 0; yy < size; yy++) for (var xx = 0; xx < size; xx++) {
        if (!isFn[yy * size + xx] && maskInvert(mask, xx, yy)) modules[yy * size + xx] ^= 1;
      }
    }
    function g(xx, yy) { return (xx >= 0 && yy >= 0 && xx < size && yy < size) ? modules[yy * size + xx] : 0; }
    function penalty() {
      var result = 0, dir, a, b, run, prev, cur, s;
      for (dir = 0; dir < 2; dir++) {
        for (a = 0; a < size; a++) {
          prev = dir ? g(a, 0) : g(0, a); run = 1;
          for (b = 1; b < size; b++) {
            cur = dir ? g(a, b) : g(b, a);
            if (cur === prev) { run++; if (run === 5) result += 3; else if (run > 5) result++; }
            else { run = 1; prev = cur; }
          }
          // finder-like 1011101 with 4 light modules on a side
          for (s = 0; s + 6 < size; s++) {
            var m = true, pat = [1, 0, 1, 1, 1, 0, 1];
            for (b = 0; b < 7; b++) if ((dir ? g(a, s + b) : g(s + b, a)) !== pat[b]) { m = false; break; }
            if (!m) continue;
            var left = true, rightW = true;
            for (b = 1; b <= 4; b++) {
              if ((dir ? g(a, s - b) : g(s - b, a)) !== 0) left = false;
              if ((dir ? g(a, s + 6 + b) : g(s + 6 + b, a)) !== 0) rightW = false;
            }
            if (left || rightW) result += 40;
          }
        }
      }
      var dark = 0, xx, yy;
      for (yy = 0; yy < size; yy++) for (xx = 0; xx < size; xx++) {
        var c = g(xx, yy); dark += c;
        if (xx + 1 < size && yy + 1 < size && c === g(xx + 1, yy) && c === g(xx, yy + 1) && c === g(xx + 1, yy + 1)) result += 3;
      }
      var tot = size * size;
      result += (Math.ceil(Math.abs(dark * 20 - tot * 10) / tot) - 1) * 10;
      return result;
    }

    var mask = forcedMask;
    if (mask === undefined || mask === null || mask < 0) {
      var best = 0, bestPen = Infinity;
      for (var m = 0; m < 8; m++) {
        applyMask(m); drawFormat(m);
        var p = penalty();
        if (p < bestPen) { bestPen = p; best = m; }
        applyMask(m);
      }
      mask = best;
    }
    applyMask(mask);
    drawFormat(mask);

    return {
      version: ver, size: size, ecl: eclName, mask: mask, modules: modules,
      get: function (xx, yy) { return g(xx, yy) === 1; }
    };
  }

  function encodeBytes(bytes, eclName, opts) {
    opts = opts || {};
    var ecl = ECL[eclName];
    if (!ecl) throw new Error("QRGen: unknown error-correction level " + eclName);
    var minV = opts.minVersion || 1, maxV = opts.maxVersion || 40, ver, cap;
    for (ver = minV; ; ver++) {
      cap = getNumDataCodewords(ver, ecl) * 8;
      var used = 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8;
      if (used <= cap) break;
      if (ver >= maxV) throw new Error("QRGen: data too long (" + bytes.length + " bytes) for version <= " + maxV + " at ECC " + eclName);
    }
    var bb = [], i;
    appendBits(bb, 4, 4);
    appendBits(bb, bytes.length, ver <= 9 ? 8 : 16);
    for (i = 0; i < bytes.length; i++) appendBits(bb, bytes[i] & 255, 8);
    appendBits(bb, 0, Math.min(4, cap - bb.length));
    appendBits(bb, 0, (8 - bb.length % 8) % 8);
    for (var pad = 0xEC; bb.length < cap; pad ^= 0xEC ^ 0x11) appendBits(bb, pad, 8);
    var codewords = [];
    for (i = 0; i < bb.length; i += 8) {
      var v = 0;
      for (var k = 0; k < 8; k++) v = (v << 1) | bb[i + k];
      codewords.push(v);
    }
    var full = addEccAndInterleave(codewords, ver, ecl);
    return buildSymbol(ver, eclName, full, opts.mask);
  }

  function encodeText(text, eclName, opts) {
    return encodeBytes(new TextEncoder().encode(text), eclName, opts);
  }

  function renderToImageData(qr, scale, border) {
    scale = scale || 4; border = (border === undefined) ? 4 : border;
    var n = qr.size + border * 2, w = n * scale;
    var data = new Uint8ClampedArray(w * w * 4);
    data.fill(255);
    for (var my = 0; my < qr.size; my++) for (var mx = 0; mx < qr.size; mx++) {
      if (!qr.modules[my * qr.size + mx]) continue;
      for (var py = 0; py < scale; py++) {
        var row = ((my + border) * scale + py) * w + (mx + border) * scale;
        for (var px = 0; px < scale; px++) {
          var o = (row + px) * 4;
          data[o] = 0; data[o + 1] = 0; data[o + 2] = 0; // alpha stays 255
        }
      }
    }
    return { data: data, width: w, height: w };
  }

  function drawToCanvas(qr, canvas, scale, border) {
    scale = scale || 4; border = (border === undefined) ? 4 : border;
    var n = qr.size + border * 2, w = n * scale;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== w) canvas.height = w;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, w);
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    for (var y = 0; y < qr.size; y++) for (var x = 0; x < qr.size; x++) {
      if (qr.modules[y * qr.size + x]) ctx.rect((x + border) * scale, (y + border) * scale, scale, scale);
    }
    ctx.fill();
  }

  global.QRGen = {
    version: "1.0.0",
    encodeText: encodeText,
    encodeBytes: encodeBytes,
    renderToImageData: renderToImageData,
    drawToCanvas: drawToCanvas,
    // exposed for the automated tests (known-answer checks)
    _formatBits: formatBits,
    _versionBits: versionBits,
    _rsEcc: function (data, nEcc) { return rsRemainder(Array.prototype.slice.call(data), rsDivisor(nEcc)); },
    _capacityBytes: function (ver, eclName) {
      return Math.floor((getNumDataCodewords(ver, ECL[eclName]) * 8 - 4 - (ver <= 9 ? 8 : 16)) / 8);
    }
  };
})(typeof window !== "undefined" ? window : this);
