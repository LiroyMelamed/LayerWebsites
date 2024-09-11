// src/services/firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getDatabase, ref, get } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDQN1UFuJ4-16ZzEGC3SnJeUNoJ9VlK_tQ",
  authDomain: "melamedlaw-271c4.firebaseapp.com",
  databaseURL: "https://melamedlaw-271c4-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "melamedlaw-271c4",
  storageBucket: "melamedlaw-271c4.appspot.com",
  messagingSenderId: "542851002989",
  appId: "1:542851002989:web:0bb430f5b140e84fde0564",
  measurementId: "G-CFHEXVKK0P"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Realtime Database
const database = getDatabase(app);

export { database, ref, get };
