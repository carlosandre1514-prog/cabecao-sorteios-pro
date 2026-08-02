// Importe os SDKs necessários do Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    sendPasswordResetEmail 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getDatabase, 
    ref, 
    set, 
    get, 
    child 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Suas credenciais do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCt4kqF8LcHkR7bn3gvF-1ZcpjVW3FH8YA",
  authDomain: "studio-7737408264-35a36.firebaseapp.com",
  projectId: "studio-7737408264-35a36",
  storageBucket: "studio-7737408264-35a36.firebasestorage.app",
  messagingSenderId: "35330544724",
  appId: "1:35330544724:web:d9e200c94f376a86ae09c1"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Disponibiliza globalmente para o script.js usar
window.firebaseAuth = auth;
window.firebaseDb = db;
window.firebaseFns = {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    ref,
    set,
    get,
    child
};
