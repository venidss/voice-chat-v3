// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyB_XjrcLAe0edyLqQF7VwlN7C6nCF8Md4M",
    authDomain: "voice-chat-d6275.firebaseapp.com",
    projectId: "voice-chat-d6275",
    storageBucket: "voice-chat-d6275.firebasestorage.app",
    messagingSenderId: "954135779220",
    appId: "1:954135779220:web:e059e25ab3850cd328e181",
    measurementId: "G-KYY2FH8WQH",
    databaseURL: "https://voice-chat-d6275-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
