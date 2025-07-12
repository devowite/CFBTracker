// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, addDoc, getDocs, getDoc, collection, onSnapshot, serverTimestamp, updateDoc, query, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
const views = document.querySelectorAll('.view');
const modals = document.querySelectorAll('.modal');
// Auth
const authView = document.getElementById('auth-view');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const showRegisterLink = document.getElementById('show-register-link');
const showLoginLink = document.getElementById('show-login-link');
const logoutButton = document.getElementById('logout-button');
const userEmailDisplay = document.getElementById('user-email-display');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');
// App (All Dynasties)
const appView = document.getElementById('app-view');
const dynastiesList = document.getElementById('dynasties-list');
// Dynasty (Specific)
const dynastyView = document.getElementById('dynasty-view');
const dynastyNavTitle = document.getElementById('dynasty-nav-title');
const backToDynastiesBtn = document.getElementById('back-to-dynasties-btn');
// Schedule Page
const scheduleTable = document.getElementById('schedule-table');
const scheduleTeamLogo = document.getElementById('schedule-team-logo');
const scheduleTeamName = document.getElementById('schedule-team-name');
const scheduleYear = document.getElementById('schedule-year');
// Modals
const createDynastyModal = document.getElementById('create-dynasty-modal');
const createDynastyForm = document.getElementById('create-dynasty-form');
const cancelDynastyCreationBtn = document.getElementById('cancel-dynasty-creation');
const createCoachModal = document.getElementById('create-coach-modal');
const createCoachForm = document.getElementById('create-coach-form');
const cancelCoachCreationBtn = document.getElementById('cancel-coach-creation');
const coachAlmaMaterSelect = document.getElementById('coach-alma-mater');
const coachSchoolSelect = document.getElementById('coach-school');

// --- Global State ---
let dynastiesUnsubscribe = null;
let currentDynastyId = null;
let schoolsDataCache = null; // Cache for global school data
let scheduleSaveTimer = null; // For debouncing schedule saves

// --- UI Navigation ---
function showView(viewId) {
    views.forEach(view => {
        view.classList.toggle('active', view.id === viewId);
    });
}

function showModal(modalId) {
    modals.forEach(modal => {
        modal.classList.toggle('active', modal.id === modalId);
    });
}

// --- Event Listeners ---
showRegisterLink.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('login-form-container').classList.add('hidden'); document.getElementById('register-form-container').classList.remove('hidden'); });
showLoginLink.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('register-form-container').classList.add('hidden'); document.getElementById('login-form-container').classList.remove('hidden'); });
document.getElementById('create-dynasty-btn').addEventListener('click', () => showModal('create-dynasty-modal'));
cancelDynastyCreationBtn.addEventListener('click', () => showModal(null));
cancelCoachCreationBtn.addEventListener('click', () => showModal(null));
backToDynastiesBtn.addEventListener('click', () => showView('app-view'));

// --- Auth Logic ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        userEmailDisplay.textContent = `Logged in as: ${user.email}`;
        showView('app-view');
        fetchSchoolsData(); // Pre-fetch schools data on login
        listenForDynasties(user.uid);
    } else {
        showView('auth-view');
        if (dynastiesUnsubscribe) dynastiesUnsubscribe();
        dynastiesList.innerHTML = '';
    }
});

logoutButton.addEventListener('click', () => signOut(auth));

// --- Data Fetching ---
async function fetchSchoolsData() {
    if (schoolsDataCache) return schoolsDataCache;
    const schoolsRef = collection(db, 'schools');
    const snapshot = await getDocs(schoolsRef);
    schoolsDataCache = {};
    snapshot.forEach(doc => {
        schoolsDataCache[doc.id] = { id: doc.id, ...doc.data() };
    });
    return schoolsDataCache;
}

// --- Dynasty List Logic ---
function listenForDynasties(userId) {
    const dynastiesRef = collection(db, `artifacts/cfb-tracker/users/${userId}/dynasties`);
    dynastiesUnsubscribe = onSnapshot(dynastiesRef, (snapshot) => {
        dynastiesList.innerHTML = snapshot.empty ? '<p class="text-gray-500">No dynasties yet.</p>' : '';
        snapshot.forEach(doc => {
            const dynasty = doc.data();
            const div = document.createElement('div');
            div.className = "bg-gray-700 p-4 rounded-md shadow-md hover:bg-gray-600 transition duration-200 cursor-pointer";
            div.dataset.id = doc.id;
            div.innerHTML = `<h5 class="font-bold text-lg">${dynasty.name}</h5><p class="text-sm text-gray-400">Created: ${dynasty.createdAt.toDate().toLocaleDateString()}</p>`;
            div.addEventListener('click', () => loadDynastyDashboard(doc.id));
            dynastiesList.appendChild(div);
        });
    });
}

// --- Dynasty Dashboard Logic ---
async function loadDynastyDashboard(dynastyId) {
    currentDynastyId = dynastyId;
    showView('dynasty-view');
    scheduleTable.innerHTML = '<p class="text-gray-400">Loading schedule...</p>';

    try {
        const dynastyRef = doc(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${dynastyId}`);
        const dynastySnap = await getDoc(dynastyRef);
        const dynastyData = dynastySnap.data();

        // Fetch the user's coach for this dynasty
        const coachesQuery = query(collection(dynastyRef, 'coaches'), limit(1));
        const coachSnap = await getDocs(coachesQuery);
        const coachData = coachSnap.docs[0]?.data();

        const schools = await fetchSchoolsData();
        const userTeam = schools[coachData.teamId];

        // Populate header and nav
        dynastyNavTitle.textContent = dynastyData.name;
        scheduleTeamLogo.src = userTeam.logoUrl || 'https://placehold.co/64x64/374151/FFFFFF?text=?';
        scheduleTeamName.textContent = userTeam.name;
        scheduleYear.textContent = `${dynastyData.currentYear || 2025} Schedule`;

        renderSchedulePage(dynastyData, schools);

    } catch (error) {
        console.error("Error loading dynasty dashboard:", error);
        scheduleTable.innerHTML = '<p class="text-red-500">Error loading dynasty data.</p>';
    }
}

// --- Schedule Page Logic ---
function renderSchedulePage(dynastyData, schools) {
    const weekLabels = ["Week 0", "Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6", "Week 7", "Week 8", "Week 9", "Week 10", "Week 11", "Week 12", "Week 13", "Week 14", "Conf. Champ", "Army-Navy", "Bowl Week 1", "Bowl Week 2", "Bowl Week 3", "Bowl Week 4"];
    const schedule = dynastyData.schedule || [];

    let opponentOptions = '<option value="BYE">BYE WEEK</option>';
    Object.values(schools).forEach(school => {
        opponentOptions += `<option value="${school.id}">${school.name}</option>`;
    });

    let headerHtml = `<div class="schedule-row schedule-row-header">
        <div>WEEK</div><div>LOCATION</div><div>OPPONENT</div><div>RESULT</div><div>SCORE</div>
    </div>`;

    let rowsHtml = weekLabels.map((label, index) => {
        const game = schedule[index] || {};
        return `
            <div class="schedule-row" data-week-index="${index}">
                <div class="schedule-week-label">${label}</div>
                <select class="input-field location-select">
                    <option value="Away" ${game.location === 'Away' ? 'selected' : ''}>Away</option>
                    <option value="Home" ${game.location === 'Home' ? 'selected' : ''}>Home</option>
                    <option value="Neutral" ${game.location === 'Neutral' ? 'selected' : ''}>Neutral</option>
                </select>
                <select class="input-field opponent-select">
                    ${opponentOptions.replace(`value="${game.opponentId}"`, `value="${game.opponentId}" selected`)}
                </select>
                <select class="input-field result-select">
                    <option value="" ${!game.result ? 'selected' : ''}>--</option>
                    <option value="W" ${game.result === 'W' ? 'selected' : ''}>Win</option>
                    <option value="L" ${game.result === 'L' ? 'selected' : ''}>Loss</option>
                    <option value="BYE" ${game.result === 'BYE' ? 'selected' : ''}>Bye</option>
                </select>
                <div class="flex items-center gap-2">
                    <input type="number" class="input-field score-input user-score" value="${game.userScore || ''}" placeholder="Us">
                    <span>-</span>
                    <input type="number" class="input-field score-input opp-score" value="${game.oppScore || ''}" placeholder="Them">
                </div>
            </div>
        `;
    }).join('');

    scheduleTable.innerHTML = headerHtml + rowsHtml;
    scheduleTable.addEventListener('change', handleScheduleChange);
}

function handleScheduleChange() {
    clearTimeout(scheduleSaveTimer);
    scheduleSaveTimer = setTimeout(saveSchedule, 1000); // Debounce save by 1 second
}

async function saveSchedule() {
    if (!currentDynastyId) return;

    const scheduleRows = scheduleTable.querySelectorAll('.schedule-row:not(.schedule-row-header)');
    const scheduleData = Array.from(scheduleRows).map(row => ({
        location: row.querySelector('.location-select').value,
        opponentId: row.querySelector('.opponent-select').value,
        result: row.querySelector('.result-select').value,
        userScore: parseInt(row.querySelector('.user-score').value) || null,
        oppScore: parseInt(row.querySelector('.opp-score').value) || null,
    }));
    
    const dynastyRef = doc(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}`);
    try {
        await updateDoc(dynastyRef, { schedule: scheduleData });
        console.log("Schedule saved successfully!");
    } catch (error) {
        console.error("Error saving schedule:", error);
    }
}


// --- Creation Modals Logic ---
createDynastyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dynastyName = document.getElementById('dynasty-name').value;
    if (!dynastyName) return;

    try {
        const schools = await fetchSchoolsData();
        const initialConferences = {};
        Object.values(schools).forEach(school => {
            const conf = school.defaultConference || 'Independent';
            if (!initialConferences[conf]) initialConferences[conf] = [];
            initialConferences[conf].push(school.id);
        });

        const userDynastiesRef = collection(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties`);
        const newDynastyDoc = await addDoc(userDynastiesRef, {
            name: dynastyName,
            userId: auth.currentUser.uid,
            createdAt: serverTimestamp(),
            currentYear: 2025,
            conferences: initialConferences
        });
        
        showModal(null);
        currentDynastyId = newDynastyDoc.id;
        showCoachCreationModal(Object.values(schools));
    } catch (error) { console.error("Error creating dynasty: ", error); }
});

function showCoachCreationModal(schools) {
    let optionsHtml = '<option value="">Select a school...</option>';
    schools.forEach(school => {
        optionsHtml += `<option value="${school.id}">${school.name}</option>`;
    });
    coachAlmaMaterSelect.innerHTML = optionsHtml;
    coachSchoolSelect.innerHTML = optionsHtml;
    showModal('create-coach-modal');
}

createCoachForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const coachData = {
        firstName: document.getElementById('coach-first-name').value,
        lastName: document.getElementById('coach-last-name').value,
        hometown: document.getElementById('coach-hometown').value,
        almaMater: coachAlmaMaterSelect.value,
        age: parseInt(document.getElementById('coach-age').value),
        job: document.getElementById('coach-job').value,
        teamId: coachSchoolSelect.value,
        createdAt: serverTimestamp()
    };
    if (!coachData.firstName || !coachData.lastName || !coachData.teamId) return;

    try {
        const coachesRef = collection(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}/coaches`);
        await addDoc(coachesRef, coachData);
        showModal(null);
        loadDynastyDashboard(currentDynastyId); // Load the dashboard after creating the coach
    } catch (error) { console.error("Error creating coach: ", error); }
});

// --- Auth Forms (unchanged) ---
registerForm.addEventListener('submit', async (e) => { e.preventDefault(); const email = document.getElementById('register-email').value; const password = document.getElementById('register-password').value; try { const userCredential = await createUserWithEmailAndPassword(auth, email, password); const user = userCredential.user; const userDocRef = doc(db, `artifacts/cfb-tracker/users/${user.uid}/profile`, 'info'); await setDoc(userDocRef, { email: user.email, createdAt: serverTimestamp(), userId: user.uid }); } catch (error) { registerError.textContent = error.message; } });
loginForm.addEventListener('submit', async (e) => { e.preventDefault(); const email = document.getElementById('login-email').value; const password = document.getElementById('login-password').value; try { await signInWithEmailAndPassword(auth, email, password); } catch (error) { loginError.textContent = error.message; } });
