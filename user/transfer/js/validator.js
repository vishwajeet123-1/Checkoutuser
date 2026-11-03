/* validator.js - semantic validation of cart data (independent of transport). */
(function (g) {
  "use strict";
  var AQR = g.AQR = g.AQR || {};

  var LIMITS = {
    MAX_ITEMS: 200, MAX_NAME: 80, MAX_QTY: 9999, MAX_PRICE_PAISE: 100000000, // 10,00,000.00
    ID_RE: /^[A-Za-z0-9_-]{4,32}$/, BARCODE_RE: /^[A-Za-z0-9-]{1,32}$/, CURRENCY_RE: /^[A-Z]{3}$/
  };

  function isInt(n) { return typeof n === "number" && isFinite(n) && Math.floor(n) === n; }

  // cart = { v:1, id, ts, cur, items:[{name, barcode, qty, price}], total }   (price/total in integer paise)
  function validateCart(cart) {
    var errors = [];
    if (!cart || typeof cart !== "object" || Array.isArray(cart)) return { ok: false, errors: ["Cart is not an object"] };
    if (cart.v !== 1) errors.push("Unsupported cart version: " + cart.v);
    if (typeof cart.id !== "string" || !LIMITS.ID_RE.test(cart.id)) errors.push("Invalid bill ID");
    if (!isInt(cart.ts) || cart.ts < 0 || cart.ts > 8.64e15) errors.push("Invalid timestamp");
    if (typeof cart.cur !== "string" || !LIMITS.CURRENCY_RE.test(cart.cur)) errors.push("Invalid currency");
    if (!Array.isArray(cart.items)) errors.push("Items missing");
    else if (cart.items.length < 1) errors.push("Cart has no items");
    else if (cart.items.length > LIMITS.MAX_ITEMS) errors.push("Too many items (max " + LIMITS.MAX_ITEMS + ")");

    var sum = 0;
    if (Array.isArray(cart.items)) {
      cart.items.forEach(function (it, i) {
        var tag = "Item " + (i + 1) + ": ";
        if (!it || typeof it !== "object") { errors.push(tag + "not an object"); return; }
        if (typeof it.name !== "string" || it.name.trim() === "" || it.name.length > LIMITS.MAX_NAME) errors.push(tag + "invalid name");
        if (typeof it.barcode !== "string" || !LIMITS.BARCODE_RE.test(it.barcode)) errors.push(tag + "invalid barcode");
        if (!isInt(it.qty) || it.qty < 1 || it.qty > LIMITS.MAX_QTY) errors.push(tag + "invalid quantity");
        if (!isInt(it.price) || it.price < 0 || it.price > LIMITS.MAX_PRICE_PAISE) errors.push(tag + "invalid price");
        if (isInt(it.qty) && isInt(it.price)) sum += it.qty * it.price;
      });
    }
    if (!isInt(cart.total) || cart.total < 0 || !Number.isSafeInteger(cart.total)) errors.push("Invalid total");
    else if (errors.length === 0 && cart.total !== sum) errors.push("Total mismatch: stated " + cart.total + " paise, computed " + sum + " paise");
    return { ok: errors.length === 0, errors: errors };
  }

  // Validates & normalises raw UI rows. Returns {ok, errors, items}. price is a string like "49.50".
  function validateItemInputs(rows) {
    var errors = [], items = [], U = AQR.Utils;
    if (!rows.length) errors.push("Add at least one item.");
    rows.forEach(function (r, i) {
      var tag = "Row " + (i + 1) + ": ";
      var name = String(r.name || "").trim();
      var barcode = String(r.barcode || "").trim();
      var qty = U.parseIntStrict(r.qty, 1, LIMITS.MAX_QTY);
      var price = U.parseMoneyToPaise(r.price);
      if (!name) errors.push(tag + "product name is required.");
      else if (name.length > LIMITS.MAX_NAME) errors.push(tag + "name is longer than " + LIMITS.MAX_NAME + " characters.");
      if (!LIMITS.BARCODE_RE.test(barcode)) errors.push(tag + "barcode must be 1-32 letters, digits or dashes.");
      if (qty === null) errors.push(tag + "quantity must be a whole number from 1 to " + LIMITS.MAX_QTY + ".");
      if (price === null || price > LIMITS.MAX_PRICE_PAISE) errors.push(tag + "price must look like 49 or 49.50 (max 2 decimals).");
      if (name && qty !== null && price !== null) items.push({ name: name, barcode: barcode, qty: qty, price: price });
    });
    return { ok: errors.length === 0, errors: errors, items: items };
  }

  function computeTotal(items) {
    var t = 0;
    items.forEach(function (it) { t += it.qty * it.price; });
    return t;
  }

  AQR.Validator = { LIMITS: LIMITS, validateCart: validateCart, validateItemInputs: validateItemInputs, computeTotal: computeTotal };
})(typeof window !== "undefined" ? window : this);
