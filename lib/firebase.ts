
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBHEDKIkEoWgs2F4JsT3Z_-QAC8mE1DdXA",
  authDomain: "social-analyzer-24750033-dc53d.firebaseapp.com",
  projectId: "social-analyzer-24750033-dc53d",
  storageBucket: "social-analyzer-24750033-dc53d.firebasestorage.app",
  messagingSenderId: "322102735162",
  appId: "1:322102735162:web:276cdb5de2433c71b5e003"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

export { app, auth };
