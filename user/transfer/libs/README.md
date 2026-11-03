# libs/ - local QR libraries

Both libraries are plain browser scripts, **already present in this folder**. Nothing needs to be downloaded, there is no CDN and nothing is fetched at runtime.

| File | Purpose | Version | Origin / licence | Global |
|------|---------|---------|------------------|--------|
| `qrcodegen-lite.js` | QR **generation** (byte mode, versions 1-40, ECC L/M/Q/H, mask selection) | 1.0.0 | Written for this project, MIT. Implements ISO/IEC 18004. | `QRGen` |
| `qrdecoder-lite.js` | QR **scanning/decoding** from camera frames (finder search, perspective sampling, Reed-Solomon correction) | 1.0.0 | Written for this project, MIT. Implements ISO/IEC 18004. | `QRDec` |

## Honest provenance note

These two files are **not** copies of well-known third-party libraries (such as Nayuki's QR Code generator, `qrcode-generator`, `jsQR` or ZXing). Those were not obtainable in the environment this project was written in (no shell, no network downloads, and the large upstream files cannot be reproduced reliably by hand). Instead, small dependency-free implementations were written directly from the QR specification.

Consequences you should know about:

* They are covered by the automated tests (`tests/test.html`): known-answer checks for format bits, version bits and a Reed-Solomon vector, plus generate -> image -> decode round trips.
* They have **not** been verified against third-party scanners/generators or on physical phones by the author. The first real-device run is the real verification (see `README.md`, section "Real-device camera test").
* Camera scanning uses the browser's native `BarcodeDetector` first when it exists (Chrome/Edge/Android/Safari 17+ depending on platform), and falls back to / is complemented by `qrdecoder-lite.js` on the same frame. In **Auto** mode both are used, so a browser with a native detector will scan reliably even if the fallback has weaknesses. Firefox and other browsers without `BarcodeDetector` rely entirely on `qrdecoder-lite.js`.

## Optional: swapping in a battle-tested library

If you prefer an established library, these are the official sources (do this only if you want to; the project works without it):

* Generator: Nayuki QR Code generator, `qrcodegen.js` - https://github.com/nayuki/QR-Code-generator/blob/master/javascript/qrcodegen.js (MIT)
* Scanner: jsQR 1.4.0, `dist/jsQR.js` - https://unpkg.com/jsqr@1.4.0/dist/jsQR.js (Apache-2.0), repo https://github.com/cozmo/jsQR

Save them as `libs/qrcodegen.js` / `libs/jsQR.js`, then adapt only the two adapter files: `js/qr-generator.js` (generation) and the `QRDec.decode(...)` call in `js/qr-scanner.js` (scanning). Nothing else in the project touches the libraries.
