import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Estos valores NO son secretos: es normal y seguro dejarlos en el
// código/GitHub. La seguridad real la dan las reglas de Firestore
// (ver firestore.rules), no ocultar esta config.
// Reemplázalos por los de tu propio proyecto de Firebase:
// Firebase console -> ⚙️ Configuración del proyecto -> Tus apps -> Config del SDK.
const firebaseConfig = {
  apiKey: "AIzaSyBtjE0ihIno9geIJiXXNOfSIIau-zf5kVg",
  authDomain: "argyra-10d1a.firebaseapp.com",
  projectId: "argyra-10d1a",
  storageBucket: "argyra-10d1a.firebasestorage.app",
  messagingSenderId: "414090474873",
  appId: "1:414090474873:web:3030e1c943cb9171d3eba8",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
