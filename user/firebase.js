
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import { getAuth } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import { getFirestore } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// Your existing Checkout Firebase project
const firebaseConfig = {
  apiKey: "AIzaSyDaPjat_6FE4mxEaa-J1tW9haTgfHENMyA",
  authDomain: "scan2go-3e095.firebaseapp.com",
  projectId: "scan2go-3e095",
  storageBucket: "scan2go-3e095.firebasestorage.app",
  messagingSenderId: "350954145765",
  appId: "1:350954145765:web:833c0d51c6b7017c42510c",
  measurementId: "G-7M1NBPSZFC"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Authentication
export const auth = getAuth(app);

// Database
export const db = getFirestore(app);

console.log("Checkout Firebase connected successfully!");
