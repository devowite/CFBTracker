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
    addDoc,
    getDocs,
    collection,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Configuration ---
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

// --- NEW: Dynasty Elements ---
const createDynastyBtn = document.getElementById('create-dynasty-btn');
const createDynastyModal = document.getElementById('create-dynasty-modal');
const createDynastyForm = document.getElementById('create-dynasty-form');
const cancelDynastyCreationBtn = document.getElementById('cancel-dynasty-creation');
const dynastiesList = document.getElementById('dynasties-list');
const dynastyCreateError = document.getElementById('dynasty-create-error');


// --- Global State ---
let dynastiesUnsubscribe = null; // To hold the listener cleanup function

// --- UI Logic ---
const toggleViews = (showApp) => {
    if (showApp) {
        authView.classList.add('hidden-view');
        appView.classList.remove('hidden-view');
    } else {
        authView.classList.remove('hidden-view');
        appView.classList.add('hidden-view');
    }
};

showRegisterLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginFormContainer.classList.add('hidden');
    registerFormContainer.classList.remove('hidden');
    loginError.textContent = '';
    registerError.textContent = '';
});

showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    registerFormContainer.classList.add('hidden');
    loginFormContainer.classList.remove('hidden');
    loginError.textContent = '';
    registerError.textContent = '';
});

// --- NEW: Modal UI Logic ---
createDynastyBtn.addEventListener('click', () => {
    createDynastyModal.classList.remove('hidden');
    createDynastyModal.classList.add('flex');
});

cancelDynastyCreationBtn.addEventListener('click', () => {
    createDynastyModal.classList.add('hidden');
    createDynastyModal.classList.remove('flex');
    createDynastyForm.reset();
    dynastyCreateError.textContent = '';
});


// --- Firebase Auth Logic ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in.
        userEmailDisplay.textContent = `Logged in as: ${user.email}`;
        toggleViews(true);
        // Start listening for this user's dynasties
        listenForDynasties(user.uid);
    } else {
        // User is signed out.
        userEmailDisplay.textContent = '';
        toggleViews(false);
        // Stop listening for dynasties if there's an active listener
        if (dynastiesUnsubscribe) {
            dynastiesUnsubscribe();
        }
        dynastiesList.innerHTML = ''; // Clear the list on logout
    }
});

// --- NEW: Dynasty Logic ---

// Listen for real-time updates to the user's dynasties
function listenForDynasties(userId) {
    const dynastiesRef = collection(db, `artifacts/cfb-tracker/users/${userId}/dynasties`);
    
    dynastiesUnsubscribe = onSnapshot(dynastiesRef, (snapshot) => {
        if (snapshot.empty) {
            dynastiesList.innerHTML = '<p class="text-gray-500">No dynasties created yet. Click the button above to start one!</p>';
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const dynasty = doc.data();
            html += `
                <div class="bg-gray-700 p-4 rounded-md shadow-md hover:bg-gray-600 transition duration-200">
                    <h5 class="font-bold text-lg">${dynasty.name}</h5>
                    <p class="text-sm text-gray-400">Created: ${dynasty.createdAt.toDate().toLocaleDateString()}</p>
                </div>
            `;
        });
        dynastiesList.innerHTML = html;
    });
}

// Handle the creation of a new dynasty
createDynastyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dynastyName = document.getElementById('dynasty-name').value;
    const user = auth.currentUser;

    if (!dynastyName || !user) {
        dynastyCreateError.textContent = 'Something went wrong. Please try again.';
        return;
    }

    try {
        // 1. Fetch all schools from the global 'schools' collection
        const schoolsRef = collection(db, 'schools');
        const schoolSnapshot = await getDocs(schoolsRef);
        
        if (schoolSnapshot.empty) {
            dynastyCreateError.textContent = 'Error: No schools found in the database. Please contact support.';
            return;
        }

        // 2. Create the initial conference structure based on the 'defaultConference' field
        const initialConferences = {};
        schoolSnapshot.forEach(schoolDoc => {
            const schoolData = schoolDoc.data();
            const conference = schoolData.defaultConference || 'Independent';
            if (!initialConferences[conference]) {
                initialConferences[conference] = [];
            }
            initialConferences[conference].push(schoolDoc.id); // Store the school's ID
        });
        
        // 3. Create the new dynasty document in the user's sub-collection
        const userDynastiesRef = collection(db, `artifacts/cfb-tracker/users/${user.uid}/dynasties`);
        await addDoc(userDynastiesRef, {
            name: dynastyName,
            userId: user.uid,
            createdAt: serverTimestamp(),
            conferences: initialConferences // This is the snapshot for realignment
        });

        // 4. Close the modal and reset the form
        cancelDynastyCreationBtn.click();

    } catch (error) {
        console.error("Error creating dynasty: ", error);
        dynastyCreateError.textContent = 'Failed to create dynasty. Please try again.';
    }
});


// --- Existing Auth Functions ---
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    registerError.textContent = '';

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        const userDocRef = doc(db, `artifacts/cfb-tracker/users/${user.uid}/profile`, 'info');
        await setDoc(userDocRef, {
            email: user.email,
            createdAt: serverTimestamp(),
            userId: user.uid
        });

    } catch (error) {
        console.error('Registration Error:', error);
        registerError.textContent = error.message;
    }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    loginError.textContent = '';

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error('Login Error:', error);
        loginError.textContent = error.message;
    }
});

logoutButton.addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error('Logout Error:', error);
    }
});
