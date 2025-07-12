// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Configuration ---
// This is the one and only configuration used for the app, taken directly from your Firebase project.
const firebaseConfig = {
  apiKey: "AIzaSyBiPO53KX8YRgDzH7yi62kfkhNNjL8r8Sc",
  authDomain: "cfb-tracker.firebaseapp.com",
  projectId: "cfb-tracker",
  storageBucket: "cfb-tracker.appspot.com",
  messagingSenderId: "941451486290",
  appId: "1:941451486290:web:2b90e9c73c56cf1d992b8b",
  measurementId: "G-MGZ78ZM0Q6"
};

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- DOM Elements ---
const authView = document.getElementById('auth-view');
const appView = document.getElementById('app-view');
const loginFormContainer = document.getElementById('login-form-container');
const registerFormContainer = document.getElementById('register-form-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const showRegisterLink = document.getElementById('show-register-link');
const showLoginLink = document.getElementById('show-login-link');
const logoutButton = document.getElementById('logout-button');
const userEmailDisplay = document.getElementById('user-email-display');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');

// --- UI Logic ---
// Function to switch between the main app view and the authentication view
const toggleViews = (showApp) => {
    if (showApp) {
        authView.classList.add('hidden-view');
        appView.classList.remove('hidden-view');
    } else {
        authView.classList.remove('hidden-view');
        appView.classList.add('hidden-view');
    }
};

// Event listener to show the registration form
showRegisterLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginFormContainer.classList.add('hidden');
    registerFormContainer.classList.remove('hidden');
    loginError.textContent = '';
    registerError.textContent = '';
});

// Event listener to show the login form
showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    registerFormContainer.classList.add('hidden');
    loginFormContainer.classList.remove('hidden');
    loginError.textContent = '';
    registerError.textContent = '';
});

// --- Firebase Auth Logic ---

// Listener that triggers whenever the user's sign-in state changes.
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in.
        console.log('User is signed in:', user);
        userEmailDisplay.textContent = `Logged in as: ${user.email}`;
        toggleViews(true); // Show the main application view
    } else {
        // User is signed out.
        console.log('User is signed out.');
        userEmailDisplay.textContent = '';
        toggleViews(false); // Show the authentication view
    }
});

// Handle new user registration
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    registerError.textContent = ''; // Clear previous errors

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Create a user profile document in Firestore to store user-specific data
        // The path now uses your actual project ID for the artifact collection.
        const userDocRef = doc(db, `artifacts/cfb-tracker/users/${user.uid}/profile`, 'info');
        await setDoc(userDocRef, {
            email: user.email,
            createdAt: serverTimestamp(),
            userId: user.uid
        });

        console.log('User registered and profile created:', user.uid);
        // onAuthStateChanged will automatically handle the UI switch.
    } catch (error) {
        console.error('Registration Error:', error);
        registerError.textContent = error.message; // Display error to the user
    }
});

// Handle existing user login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    loginError.textContent = ''; // Clear previous errors

    try {
        await signInWithEmailAndPassword(auth, email, password);
        console.log('User logged in successfully.');
        // onAuthStateChanged will automatically handle the UI switch.
    } catch (error) {
        console.error('Login Error:', error);
        loginError.textContent = error.message; // Display error to the user
    }
});

// Handle user logout
logoutButton.addEventListener('click', async () => {
    try {
        await signOut(auth);
        // onAuthStateChanged will automatically handle hiding the app view.
    } catch (error) {
        console.error('Logout Error:', error);
    }
});
