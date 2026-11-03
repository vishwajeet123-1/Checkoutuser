
import { db } from "../../firebase.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";


/* =========================================
   CHECKOUT — CUSTOMER APPLICATION
========================================= */


/* -----------------------------------------
   ELEMENTS
----------------------------------------- */

// Shop scanner
const placeholder = document.getElementById("cameraPlaceholder");
const scanFrame = document.getElementById("scanFrame");

const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");
const statusText = document.getElementById("status");

const scannerCard = document.getElementById("shopConnectionCard");
const connectedCard = document.getElementById("connectedCard");
const connectedShopId = document.getElementById("connectedShopId");
const changeShopButton = document.getElementById("changeShopButton");

// Connection animation
const connectionOverlay = document.getElementById("connectionOverlay");
const connectionIcon = document.getElementById("connectionIcon");
const connectionEyebrow = document.getElementById("connectionEyebrow");
const connectionTitle = document.getElementById("connectionTitle");
const connectionMessage = document.getElementById("connectionMessage");
const connectionFootnote = document.getElementById("connectionFootnote");
const connectionProgress = document.getElementById("connectionProgress");

// Toast
const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toastMessage");

// Shopping
const shoppingCard = document.getElementById("shoppingCard");

let checkoutWorkspaceReady = false;
let activeCheckoutScreen = "scan";
let checkoutScreens = {};
let checkoutNavButtons = [];

// Product scanner
const productCameraPlaceholder =
  document.getElementById("productCameraPlaceholder");

const productScanStatus =
  document.getElementById("productScanStatus");

const startProductScanner =
  document.getElementById("startProductScanner");

const stopProductScanner =
  document.getElementById("stopProductScanner");

const productDetailsCard =
  document.getElementById("productDetailsCard");

const productName =
  document.getElementById("productName");

const productBarcode =
  document.getElementById("productBarcode");

const productCategory =
  document.getElementById("productCategory");

const productPrice =
  document.getElementById("productPrice");

const addToCartButton =
  document.getElementById("addToCartButton");

// Cart
const cartItemsContainer =
  document.getElementById("cartItems");

const cartCount =
  document.getElementById("cartCount");

const cartTotal =
  document.getElementById("cartTotal");

// Checkout
const checkoutButton =
  document.getElementById("checkoutButton");

const billReviewCard =
  document.getElementById("billReviewCard");

const billReviewItems =
  document.getElementById("billReviewItems");

const billReviewTotal =
  document.getElementById("billReviewTotal");

const backToCartButton =
  document.getElementById("backToCartButton");

const generateBillQRButton =
  document.getElementById("generateBillQRButton");

// Bill QR
const billQRDisplay =
  document.getElementById("billQRDisplay");

const billQRCanvas =
  document.getElementById("billQRCanvas");

const billQRFrame =
  document.getElementById("billQRFrame");

const billQRStatus =
  document.getElementById("billQRStatus");

const pauseBillQRButton =
  document.getElementById("pauseBillQRButton");


/* -----------------------------------------
   APPLICATION STATE
----------------------------------------- */

let scanner = null;
let productScanner = null;

let isConnected = false;
let isConnecting = false;

let isStarting = false;
let isStopping = false;

let isProductStarting = false;
let isProductStopping = false;
let isLookingUpProduct = false;

let currentShopId = null;
let currentProduct = null;

let cart = [];

let toastTimer = null;
let connectionTimer = null;


/* -----------------------------------------
   BILL QR STATE
----------------------------------------- */

let billQRFrames = [];
let billQRImages = [];

let billQRIndex = 0;
let billQRAnimation = null;

let billQRPlaying = false;
let billQRLastTime = 0;

const BILL_QR_FPS = 5;


/* =========================================
   GENERAL UTILITIES
========================================= */

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setStatus(message, color) {
  statusText.textContent = message;
  statusText.style.color = color || "";
}

function setProductStatus(message, color) {
  productScanStatus.textContent = message;
  productScanStatus.style.color = color || "";
}

function isValidShopId(value) {
  return /^\d{12}$/.test(String(value).trim());
}

function formatPrice(pricePaise) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR"
  }).format(pricePaise / 100);
}

function showToast(message) {
  toastMessage.textContent = message;

  toast.classList.add("visible");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("visible");
  }, 2600);
}


/* =========================================
   SHOP CONNECTION ANIMATION
========================================= */

async function showConnectionAnimation(shopId) {

  connectionOverlay.classList.remove("success");

  connectionOverlay.classList.add("active");
  connectionOverlay.setAttribute("aria-hidden", "false");

  connectionEyebrow.textContent = "CHECKOUT CONNECTION";
  connectionTitle.textContent = "QR detected!";
  connectionMessage.textContent =
    "Preparing your shopping experience...";

  connectionFootnote.textContent =
    "Verifying shop ID: " + shopId;

  connectionProgress.style.width = "0%";

  // First phase: processing

  connectionTimer = setTimeout(() => {

    connectionProgress.style.width = "65%";

    connectionEyebrow.textContent = "SHOP IDENTIFIED";
    connectionTitle.textContent = "Almost there!";
    connectionMessage.textContent =
      "Your shop QR code has been recognised.";

  }, 350);

  await delay(1250);

  clearTimeout(connectionTimer);

  // Second phase: success

  connectionOverlay.classList.add("success");

  connectionEyebrow.textContent = "CONNECTION SUCCESSFUL";
  connectionTitle.textContent = "You're connected!";
  connectionMessage.textContent =
    "Your shopping experience is ready.";

  connectionFootnote.textContent =
    "Entering your store...";

  connectionProgress.style.width = "100%";

  await delay(1450);

  connectionOverlay.classList.remove("active");
  connectionOverlay.setAttribute("aria-hidden", "true");

  await delay(300);
}


/* =========================================
   SHOP CAMERA
========================================= */

async function stopCamera() {

  if (isStopping) return;

  isStopping = true;

  try {

    if (scanner && scanner.isScanning) {
      await scanner.stop();
    }

    if (scanner) {
      await scanner.clear();
    }

  } catch (error) {

    console.warn("Shop camera cleanup:", error);

  } finally {

    scanner = null;

    document.getElementById("reader").innerHTML = "";

    placeholder.style.display = "flex";

    scanFrame.style.display = "none";
    scanFrame.classList.remove("active");

    startButton.hidden = false;
    stopButton.hidden = true;

    isStopping = false;
  }
}

/* =========================================
   CHECKOUT — THREE SCREEN NAVIGATION
========================================= */

function setupCheckoutWorkspace() {

  if (checkoutWorkspaceReady) return;

  const welcome = shoppingCard.querySelector(".shopping-welcome");
  const grid = shoppingCard.querySelector(".shopping-grid");

  const productPanel = grid.querySelector(".product-panel");
  const cartPanel = grid.querySelector(".cart-panel");

  // Move the connected shop information into the app.
  shoppingCard.insertBefore(connectedCard, shoppingCard.firstChild);

  const workspace = document.createElement("div");
  workspace.className = "checkout-workspace";

  const scanScreen = document.createElement("section");
  scanScreen.id = "scanScreen";
  scanScreen.className = "checkout-screen";

  const cartScreen = document.createElement("section");
  cartScreen.id = "cartScreen";
  cartScreen.className = "checkout-screen";
  cartScreen.hidden = true;

  const checkoutScreen = document.createElement("section");
  checkoutScreen.id = "checkoutScreen";
  checkoutScreen.className = "checkout-screen";
  checkoutScreen.hidden = true;

  scanScreen.appendChild(productPanel);
  cartScreen.appendChild(cartPanel);
  checkoutScreen.appendChild(billReviewCard);

  workspace.append(
    scanScreen,
    cartScreen,
    checkoutScreen
  );

  // Remove the old two-column layout after moving its contents.
  grid.remove();

  shoppingCard.insertBefore(workspace, shoppingCard.firstChild.nextSibling);

  // Keep the existing welcome information.
  if (welcome) {
    welcome.classList.add("workspace-welcome");
    workspace.insertBefore(welcome, scanScreen);
  }

  checkoutScreens = {
    scan: scanScreen,
    cart: cartScreen,
    checkout: checkoutScreen
  };

  /* Add barcode scanning frame */

  const cameraArea = document.querySelector(".product-camera-area");

  if (cameraArea && !cameraArea.querySelector(".product-scan-frame")) {

    const frame = document.createElement("div");

    frame.className = "product-scan-frame";

    frame.innerHTML = `
      <span></span>
      <span></span>
      <span></span>
      <span></span>
      <div class="product-scan-line"></div>
    `;

    cameraArea.appendChild(frame);
  }

  /* Manual barcode entry */

  const manualArea = document.createElement("div");
  manualArea.className = "manual-barcode-area";

  manualArea.innerHTML = `
    <button type="button" class="manual-toggle" id="manualBarcodeToggle">
      Enter Manually
    </button>

    <form id="manualBarcodeForm" hidden>
      <input
        type="text"
        id="manualBarcodeInput"
        placeholder="Enter product barcode"
        inputmode="numeric"
        autocomplete="off"
      >

      <button type="submit" class="primary-button">
        Find Product
      </button>
    </form>
  `;

  productPanel.appendChild(manualArea);

  const manualToggle =
    manualArea.querySelector("#manualBarcodeToggle");

  const manualForm =
    manualArea.querySelector("#manualBarcodeForm");

  const manualInput =
    manualArea.querySelector("#manualBarcodeInput");

  manualToggle.addEventListener("click", () => {
    manualForm.hidden = !manualForm.hidden;

    if (!manualForm.hidden) {
      manualInput.focus();
    }
  });

  manualForm.addEventListener("submit", async event => {

    event.preventDefault();

    const barcode = manualInput.value.trim();

    if (!barcode) {
      showToast("Enter a barcode first.");
      return;
    }

    await stopProductCamera();

    await findProduct(barcode);

    manualInput.value = "";
  });

  /* Bottom navigation */

  const nav = document.createElement("nav");
  nav.className = "checkout-bottom-nav";
  nav.setAttribute("aria-label", "Shopping navigation");

  const navItems = [
    {
      screen: "scan",
      label: "Scan",
      icon: `<svg viewBox="0 0 24 24" fill="none">
        <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3"/>
        <path d="M8 12h8"/>
      </svg>`
    },
    {
      screen: "cart",
      label: "Cart",
      icon: `<svg viewBox="0 0 24 24" fill="none">
        <path d="M3 4h2l2.2 11h10.9l2-8H6"/>
        <circle cx="9" cy="19" r="1.5"/>
        <circle cx="17" cy="19" r="1.5"/>
      </svg>`
    },
    {
      screen: "checkout",
      label: "Checkout",
      icon: `<svg viewBox="0 0 24 24" fill="none">
        <path d="M4 4h5v5H4zM15 4h5v5h-5zM4 15h5v5H4z"/>
        <path d="M15 15h2v2h-2zM19 15v5M15 19h2"/>
      </svg>`
    }
  ];

  checkoutNavButtons = [];

  navItems.forEach(item => {

    const button = document.createElement("button");

    button.type = "button";
    button.className = "checkout-nav-button";
    button.dataset.screen = item.screen;

    button.innerHTML = `
      ${item.icon}
      <span>${item.label}</span>
    `;

    button.addEventListener("click", async () => {

      if (item.screen === "checkout" && cart.length === 0) {
        showToast("Your cart is empty.");
        setActiveCheckoutScreen("cart");
        return;
      }

      await setActiveCheckoutScreen(
        item.screen,
        item.screen === "scan"
      );

    });

    checkoutNavButtons.push(button);
    nav.appendChild(button);
  });

  shoppingCard.appendChild(nav);

  checkoutWorkspaceReady = true;

  document.body.classList.add("checkout-active");

  setActiveCheckoutScreen("scan", false);
}


/* =========================================
   CHANGE ACTIVE SCREEN
========================================= */

async function setActiveCheckoutScreen(screen, startScanner = false) {

  if (!checkoutWorkspaceReady) return;

  if (!checkoutScreens[screen]) return;

  if (screen !== "scan") {
    await stopProductCamera();
  }

  activeCheckoutScreen = screen;

  Object.entries(checkoutScreens).forEach(([name, element]) => {
    element.hidden = name !== screen;
  });

  checkoutNavButtons.forEach(button => {

    const active = button.dataset.screen === screen;

    button.classList.toggle("active", active);

    button.setAttribute(
      "aria-current",
      active ? "page" : "false"
    );
  });

  if (screen === "cart") {
    renderCart();
  }

  if (screen === "checkout") {
    renderBillReview();
    billReviewCard.hidden = false;
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (screen === "scan" && startScanner) {
    await startProductCamera();
  }
}


/* =========================================
   SUCCESSFUL SHOP CONNECTION
========================================= */

function showConnectedShop(shopId) {

  currentShopId = shopId;

  sessionStorage.setItem("checkoutShopId", shopId);

  connectedShopId.textContent = shopId;

  isConnected = true;

  scannerCard.hidden = true;

  connectedCard.hidden = false;
  shoppingCard.hidden = false;

  setupCheckoutWorkspace();
  document.body.classList.add("checkout-active");

  connectedCard.style.animation = "none";
  shoppingCard.style.animation = "none";

  // Restart entrance animations
  requestAnimationFrame(() => {

    connectedCard.style.animation = "";
    shoppingCard.style.animation = "";

  });

  setStatus("Shop connected successfully.");

  renderCart();

  stopCamera();
}


/* =========================================
   CONNECT TO SHOP
========================================= */

async function connectToShop(rawValue) {

  if (isConnected || isConnecting) return;

  const shopId = String(rawValue).trim();

  if (!isValidShopId(shopId)) {

    setStatus(
      "Invalid shop QR. Please scan a valid 12-digit Shop ID.",
      "#d45a5a"
    );

    showToast("Invalid shop QR code");

    return;
  }

  isConnecting = true;

  startButton.disabled = true;

  try {

    setStatus("Shop QR detected. Connecting...");

    // Stop the camera before showing the transition.
    await stopCamera();

    // Display connection animation.
    await showConnectionAnimation(shopId);

    // Enter the store.
    showConnectedShop(shopId);

    showToast("Welcome! Shop connected.");

  } catch (error) {

    console.error("Shop connection error:", error);

    setStatus(
      "Unable to connect. Please try again.",
      "#d45a5a"
    );

  } finally {

    isConnecting = false;
    startButton.disabled = false;
  }
}


/* =========================================
   START SHOP CAMERA
========================================= */

async function startCamera() {

  if (isStarting || isConnected || isConnecting) return;

  if (typeof window.Html5Qrcode === "undefined") {

    setStatus(
      "QR scanner library failed to load. Refresh the page.",
      "#d45a5a"
    );

    return;
  }

  isStarting = true;

  startButton.disabled = true;

  try {

    setStatus("Preparing camera...");

    placeholder.style.display = "none";
    scanFrame.style.display = "block";

    scanner = new Html5Qrcode("reader", {
      verbose: false
    });

    const cameras = await Html5Qrcode.getCameras();

    if (!cameras || cameras.length === 0) {
      throw new Error("No camera was found.");
    }

    const selectedCamera =
      cameras.find(camera =>
        /back|rear|environment/i.test(camera.label)
      ) || cameras[0];

    await scanner.start(
      selectedCamera.id,

      {
        fps: 12,

        qrbox: {
          width: 230,
          height: 230
        },

        aspectRatio: 4 / 3,
        disableFlip: false
      },

      async decodedText => {

        if (isConnected || isConnecting) return;

        // Lock before processing another decoded frame.
        await connectToShop(decodedText);

      },

      () => {}
    );

    scanFrame.classList.add("active");

    startButton.hidden = true;
    stopButton.hidden = false;

    setStatus("Camera ready. Align the shop QR inside the frame.");

  } catch (error) {

    console.error("Shop scanner error:", error);

    setStatus(
      "Camera error: " + error.message,
      "#d45a5a"
    );

    await stopCamera();

  } finally {

    isStarting = false;
    startButton.disabled = false;
  }
}


/* =========================================
   SHOP BUTTON EVENTS
========================================= */

startButton.addEventListener("click", startCamera);

stopButton.addEventListener("click", async () => {

  await stopCamera();

  setStatus("Camera stopped.");

});


/* =========================================
   PRODUCT BARCODE FORMATS
========================================= */

function getSupportedBarcodeFormats() {

  const formats = window.Html5QrcodeSupportedFormats;

  if (!formats) {
    throw new Error("Barcode formats are unavailable.");
  }

  return [

    formats.EAN_13,
    formats.EAN_8,
    formats.UPC_A,
    formats.UPC_E,
    formats.CODE_128,
    formats.CODE_39,
    formats.ITF,
    formats.CODABAR,
    formats.UPC_EAN_EXTENSION

  ].filter(format => format !== undefined);
}


/* =========================================
   PRODUCT CAMERA CLEANUP
========================================= */

async function stopProductCamera() {

  if (isProductStopping) return;

  isProductStopping = true;

  try {

    if (productScanner && productScanner.isScanning) {
      await productScanner.stop();
    }

    if (productScanner) {
      await productScanner.clear();
    }

  } catch (error) {

    console.warn("Product camera cleanup:", error);

  } finally {

    productScanner = null;

    document.getElementById("productReader").innerHTML = "";

    productCameraPlaceholder.hidden = false;

    startProductScanner.hidden = false;
    stopProductScanner.hidden = true;

    isProductStopping = false;
  }
}


/* =========================================
   START PRODUCT SCANNER
========================================= */

async function startProductCamera() {

  if (
    isProductStarting ||
    !isConnected ||
    isLookingUpProduct
  ) {
    return;
  }

  if (typeof window.Html5Qrcode === "undefined") {

    setProductStatus(
      "Barcode scanner library failed to load.",
      "#d45a5a"
    );

    return;
  }

  isProductStarting = true;

  startProductScanner.disabled = true;

  try {

    setProductStatus("Preparing product scanner...");

    productCameraPlaceholder.hidden = true;

    productScanner = new Html5Qrcode(
      "productReader",
      {
        verbose: false,
        formatsToSupport: getSupportedBarcodeFormats()
      }
    );

    const cameras = await Html5Qrcode.getCameras();

    if (!cameras || cameras.length === 0) {
      throw new Error("No camera was found.");
    }

    const selectedCamera =
      cameras.find(camera =>
        /back|rear|environment/i.test(camera.label)
      ) || cameras[0];

    await productScanner.start(

      selectedCamera.id,

      {
        fps: 12,

        qrbox: {
          width: 300,
          height: 120
        },

        aspectRatio: 4 / 3,
        disableFlip: false
      },

      async decodedText => {

        if (isLookingUpProduct) return;

        isLookingUpProduct = true;

        await stopProductCamera();

        await findProduct(decodedText.trim());

      },

      () => {}

    );

    startProductScanner.hidden = true;
    stopProductScanner.hidden = false;

    setProductStatus(
      "Scanner ready. Position the barcode inside the frame."
    );

  } catch (error) {

    console.error("Product scanner error:", error);

    setProductStatus(
      "Camera error: " + error.message,
      "#d45a5a"
    );

    await stopProductCamera();

  } finally {

    isProductStarting = false;

    startProductScanner.disabled = false;
  }
}


/* =========================================
   FIRESTORE PRODUCT LOOKUP
========================================= */

async function findProduct(barcode) {

  currentProduct = null;

  productDetailsCard.hidden = true;

  setProductStatus("Searching for product...");

  try {

    if (!currentShopId) {
      throw new Error("No shop is connected.");
    }

    if (!barcode) {
      throw new Error("Invalid barcode.");
    }

    const productRef = doc(
      db,
      "shops",
      currentShopId,
      "products",
      barcode
    );

    const productSnapshot = await getDoc(productRef);

    if (!productSnapshot.exists()) {

      setProductStatus(
        "Product not found in this shop. Try another barcode.",
        "#d45a5a"
      );

      showToast("Product not found");

      return;
    }

    const data = productSnapshot.data();

    if (
      typeof data.name !== "string" ||
      !Number.isSafeInteger(data.pricePaise) ||
      data.pricePaise < 0
    ) {

      throw new Error("Invalid product record.");
    }

    currentProduct = {

      barcode: barcode,
      name: data.name,
      category: data.category || "Other",
      pricePaise: data.pricePaise

    };

    productName.textContent = currentProduct.name;

    productBarcode.textContent = currentProduct.barcode;

    productCategory.textContent = currentProduct.category;

    productPrice.textContent = formatPrice(
      currentProduct.pricePaise
    );

    productDetailsCard.hidden = false;

    productDetailsCard.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });

    setProductStatus(
      "Product found! Review its details below.",
      "#16805e"
    );

  } catch (error) {

    console.error("Product lookup error:", error);

    setProductStatus(
      "Unable to find product: " + error.message,
      "#d45a5a"
    );

  } finally {

    isLookingUpProduct = false;
  }
}


/* =========================================
   ADD PRODUCT TO CART
========================================= */

addToCartButton.addEventListener("click", async () => {

  if (!currentProduct) return;

  const existingItem = cart.find(
    item => item.barcode === currentProduct.barcode
  );

  if (existingItem) {

    existingItem.quantity++;

  } else {

    cart.push({

      ...currentProduct,
      quantity: 1

    });
  }

  const addedName = currentProduct.name;

  currentProduct = null;

  productDetailsCard.hidden = true;

  invalidateBillQR();

  billReviewCard.hidden = true;

  renderCart();

  showToast(addedName + " added to cart");

  setProductStatus(
    "Product added. Ready for the next scan."
  );

  await startProductCamera();

});


/* =========================================
   RENDER CART
========================================= */

function renderCart() {

  cartItemsContainer.innerHTML = "";

  if (cart.length === 0) {

    const empty = document.createElement("div");

    empty.className = "empty-cart";

    const icon = document.createElement("div");
    icon.className = "empty-cart-icon";
    icon.textContent = "🛍";

    const heading = document.createElement("strong");
    heading.textContent = "Your cart is empty";

    const description = document.createElement("p");
    description.textContent =
      "Products you scan will appear here.";

    empty.append(icon, heading, description);

    cartItemsContainer.appendChild(empty);
  }

  let totalPaise = 0;
  let totalQuantity = 0;

  cart.forEach((item, index) => {

    totalPaise += item.pricePaise * item.quantity;
    totalQuantity += item.quantity;

    const row = document.createElement("div");
    row.className = "cart-item";

    const info = document.createElement("div");
    info.className = "cart-item-info";

    const name = document.createElement("h3");
    name.textContent = item.name;

    const price = document.createElement("p");
    price.textContent =
      `${formatPrice(item.pricePaise)} each`;

    info.append(name, price);

    const controls = document.createElement("div");
    controls.className = "cart-controls";

    const decrease = document.createElement("button");
    decrease.textContent = "−";
    decrease.setAttribute("aria-label", "Decrease quantity");

    decrease.addEventListener("click", () => {

      item.quantity--;

      if (item.quantity <= 0) {
        cart.splice(index, 1);
      }

      invalidateBillQR();
      billReviewCard.hidden = true;

      renderCart();

    });

    const quantity = document.createElement("span");
    quantity.textContent = item.quantity;

    const increase = document.createElement("button");
    increase.textContent = "+";
    increase.setAttribute("aria-label", "Increase quantity");

    increase.addEventListener("click", () => {

      item.quantity++;

      invalidateBillQR();
      billReviewCard.hidden = true;

      renderCart();

    });

    const remove = document.createElement("button");
    remove.textContent = "×";
    remove.className = "remove-item";
    remove.setAttribute("aria-label", "Remove product");

    remove.addEventListener("click", () => {

      cart.splice(index, 1);

      invalidateBillQR();
      billReviewCard.hidden = true;

      renderCart();

      showToast("Product removed");

    });

    controls.append(
      decrease,
      quantity,
      increase,
      remove
    );

    row.append(info, controls);

    cartItemsContainer.appendChild(row);

  });

  cartCount.textContent =
    `${totalQuantity} item${totalQuantity === 1 ? "" : "s"}`;

  cartTotal.textContent = formatPrice(totalPaise);

  checkoutButton.disabled = cart.length === 0;
}


/* =========================================
   PRODUCT SCANNER BUTTONS
========================================= */

startProductScanner.addEventListener(
  "click",
  startProductCamera
);

stopProductScanner.addEventListener(
  "click",
  async () => {

    await stopProductCamera();

    setProductStatus("Product scanner stopped.");

  }
);


/* =========================================
   CHECKOUT BUTTON
========================================= */

checkoutButton.addEventListener("click", async () => {

  if (cart.length === 0) {
    showToast("Your cart is empty.");
    return;
  }

  await setActiveCheckoutScreen("checkout");

});


/* =========================================
   BILL REVIEW
========================================= */

function renderBillReview() {

  billReviewItems.innerHTML = "";

  let totalPaise = 0;

  cart.forEach(item => {

    const subtotal = item.pricePaise * item.quantity;

    totalPaise += subtotal;

    const row = document.createElement("div");
    row.className = "bill-review-item";

    const details = document.createElement("div");

    const name = document.createElement("h3");
    name.textContent = item.name;

    const quantity = document.createElement("p");

    quantity.textContent =
      `${item.quantity} × ${formatPrice(item.pricePaise)}`;

    const subtotalText = document.createElement("strong");
    subtotalText.textContent = formatPrice(subtotal);

    details.append(name, quantity);

    row.append(details, subtotalText);

    billReviewItems.appendChild(row);

  });

  billReviewTotal.textContent = formatPrice(totalPaise);
}


/* =========================================
   BACK TO CART
========================================= */

backToCartButton.addEventListener("click", async () => {

  billReviewCard.hidden = true;

  await setActiveCheckoutScreen("cart");

});;


/* =========================================
   BILL QR INVALIDATION
========================================= */

function invalidateBillQR() {

  stopBillQRAnimation();

  billQRDisplay.hidden = true;

  billQRImages = [];
  billQRFrames = [];
  billQRIndex = 0;

  pauseBillQRButton.textContent = "Pause animation";

  billQRStatus.textContent =
    "Your cart changed. Generate a new bill QR.";

  billQRStatus.style.color = "";

  generateBillQRButton.textContent =
    "Generate bill QR →";
}


/* =========================================
   STOP BILL QR ANIMATION
========================================= */

function stopBillQRAnimation() {

  billQRPlaying = false;

  if (billQRAnimation !== null) {

    cancelAnimationFrame(billQRAnimation);

    billQRAnimation = null;
  }
}


/* =========================================
   DRAW BILL QR FRAME
========================================= */

function drawBillQRFrame() {

  if (!billQRImages.length) return;

  window.AQR.QRGenerator.draw(
    billQRCanvas,
    billQRImages[billQRIndex],
    720
  );

  billQRFrame.textContent =
    `Frame ${billQRIndex + 1} / ${billQRImages.length}`;
}


/* =========================================
   BILL QR ANIMATION LOOP
========================================= */

function billQRAnimationLoop(timestamp) {

  if (!billQRPlaying) return;

  const interval = 1000 / BILL_QR_FPS;

  if (!billQRLastTime) {
    billQRLastTime = timestamp;
  }

  if (timestamp - billQRLastTime >= interval) {

    billQRLastTime = timestamp;

    billQRIndex++;

    if (billQRIndex >= billQRImages.length) {
      billQRIndex = 0;
    }

    drawBillQRFrame();
  }

  billQRAnimation =
    requestAnimationFrame(billQRAnimationLoop);
}


/* =========================================
   PLAY BILL QR
========================================= */

function playBillQRAnimation() {

  if (!billQRImages.length || billQRPlaying) return;

  billQRPlaying = true;
  billQRLastTime = 0;

  pauseBillQRButton.textContent = "Pause animation";

  billQRAnimation =
    requestAnimationFrame(billQRAnimationLoop);
}


/* =========================================
   GENERATE BILL QR
========================================= */

function generateBillQR() {

  try {

    stopBillQRAnimation();

    if (!window.AQR) {

      throw new Error(
        "Transfer modules did not load. Check the transfer folder."
      );
    }

    if (
      !window.AQR.Encoder ||
      !window.AQR.QRGenerator ||
      !window.AQR.QRGenerator.isAvailable()
    ) {

      throw new Error(
        "QR generator library is unavailable."
      );
    }

    if (!cart.length) {
      throw new Error("Your cart is empty.");
    }

    const billItems = cart.map(item => ({

      name: item.name,
      barcode: String(item.barcode),
      qty: item.quantity,
      price: item.pricePaise

    }));

    const bill = window.AQR.Encoder.buildCart(
      billItems,
      {
        currency: "INR"
      }
    );

    const encoded = window.AQR.Encoder.encodeCart(
      bill,
      {
        chunkSize: 100
      }
    );

    const generated = window.AQR.QRGenerator.pregenerate(
      encoded.frames,
      "M"
    );

    billQRFrames = encoded.frames;
    billQRImages = generated.qrs;

    if (!billQRImages || billQRImages.length === 0) {
      throw new Error("No QR frames were generated.");
    }

    billQRIndex = 0;

    billQRDisplay.hidden = false;

    drawBillQRFrame();

    playBillQRAnimation();

    billQRStatus.textContent =
      `Bill QR generated successfully. ${encoded.frameCount} frames are being displayed.`;

    billQRStatus.style.color = "#16805e";

    generateBillQRButton.textContent =
      "Generate New Bill QR";

    billQRDisplay.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    console.log("Bill generated:", bill);
    console.log("QR frames generated:", encoded.frameCount);

  } catch (error) {

    console.error("Bill QR generation error:", error);

    stopBillQRAnimation();

    billQRStatus.textContent =
      "Unable to generate QR: " + error.message;

    billQRStatus.style.color = "#d45a5a";

  }
}


/* =========================================
   BILL QR BUTTONS
========================================= */

generateBillQRButton.addEventListener(
  "click",
  generateBillQR
);

pauseBillQRButton.addEventListener("click", () => {

  if (billQRPlaying) {

    stopBillQRAnimation();

    pauseBillQRButton.textContent =
      "Resume animation";

  } else {

    playBillQRAnimation();

  }

});



/* =========================================
   CHANGE SHOP
========================================= */

changeShopButton.addEventListener("click", async () => {

  if (isConnecting) return;

  await stopCamera();

  await stopProductCamera();

  stopBillQRAnimation();

  sessionStorage.removeItem("checkoutShopId");

  currentShopId = null;
  currentProduct = null;

  cart = [];

  isConnected = false;

  connectedCard.hidden = true;
  shoppingCard.hidden = true;

  // Reset the new three-screen navigation
  document.body.classList.remove("checkout-active");

  if (checkoutWorkspaceReady) {
    await setActiveCheckoutScreen("scan", false);
  }

  scannerCard.hidden = false;

  billReviewCard.hidden = true;
  billQRDisplay.hidden = true;

  billQRImages = [];
  billQRFrames = [];
  billQRIndex = 0;

  renderCart();

  setStatus("Scan the new shop QR code to connect.");

  setProductStatus("Press the button to start scanning.");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

});



/* =========================================
   RESTORE PREVIOUS SHOP
========================================= */

const savedShopId =
  sessionStorage.getItem("checkoutShopId");

if (isValidShopId(savedShopId || "")) {

  showConnectedShop(savedShopId);

} else {

  renderCart();

}


/* =========================================
   PAGE CLEANUP
========================================= */

window.addEventListener("pagehide", () => {

  clearTimeout(toastTimer);
  clearTimeout(connectionTimer);

  stopBillQRAnimation();

  stopCamera();
  stopProductCamera();

});
