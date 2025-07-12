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
const logoutButton = document.getElementById('logout-button');
const userEmailDisplay = document.getElementById('user-email-display');
const dynastiesList = document.getElementById('dynasties-list');
const dynastyView = document.getElementById('dynasty-view');
const dynastyNavTitle = document.getElementById('dynasty-nav-title');
const backToDynastiesBtn = document.getElementById('back-to-dynasties-btn');
const scheduleTable = document.getElementById('schedule-table');
const scheduleTeamLogo = document.getElementById('schedule-team-logo');
const scheduleTeamName = document.getElementById('schedule-team-name');
const scheduleYear = document.getElementById('schedule-year');
const scheduleRecord = document.getElementById('schedule-record');
const createDynastyModal = document.getElementById('create-dynasty-modal');
const createCoachModal = document.getElementById('create-coach-modal');
const coachAlmaMaterSelect = document.getElementById('coach-alma-mater');
const coachSchoolSelect = document.getElementById('coach-school');

// --- Global State ---
let dynastiesUnsubscribe = null;
let currentDynastyId = null;
let schoolsDataCache = null;
let scheduleSaveTimer = null;

// --- UI Navigation & Helpers ---
function showView(viewId) { views.forEach(v => v.classList.toggle('active', v.id === viewId)); }
function showModal(modalId) { modals.forEach(m => m.classList.toggle('active', m.id === modalId)); }
function showDynastyPage(pageId) {
    document.querySelectorAll('.dynasty-page').forEach(p => p.classList.toggle('active', p.id === pageId));
    document.querySelectorAll('#dynasty-nav .nav-link').forEach(l => l.classList.toggle('active', l.dataset.page === pageId));
}

// --- Event Listeners ---
document.getElementById('show-register-link').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('login-form-container').classList.add('hidden'); document.getElementById('register-form-container').classList.remove('hidden'); });
document.getElementById('show-login-link').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('register-form-container').classList.add('hidden'); document.getElementById('login-form-container').classList.remove('hidden'); });
document.getElementById('create-dynasty-btn').addEventListener('click', () => showModal('create-dynasty-modal'));
document.getElementById('cancel-dynasty-creation').addEventListener('click', () => showModal(null));
document.getElementById('cancel-coach-creation').addEventListener('click', () => showModal(null));
backToDynastiesBtn.addEventListener('click', () => showView('app-view'));
document.querySelectorAll('#dynasty-nav .nav-link').forEach(link => link.addEventListener('click', (e) => { e.preventDefault(); showDynastyPage(link.dataset.page); }));
logoutButton.addEventListener('click', () => signOut(auth));

// Close custom dropdown if clicked outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-select-container')) {
        document.querySelectorAll('.custom-select-options.active').forEach(el => el.classList.remove('active'));
    }
});


// --- Auth Logic ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        userEmailDisplay.textContent = `Logged in as: ${user.email}`;
        showView('app-view');
        fetchSchoolsData();
        listenForDynasties(user.uid);
    } else {
        showView('auth-view');
        if (dynastiesUnsubscribe) dynastiesUnsubscribe();
    }
});

// --- Data Fetching & Caching ---
async function fetchSchoolsData() {
    if (schoolsDataCache) return schoolsDataCache;
    const snapshot = await getDocs(collection(db, 'schools'));
    schoolsDataCache = {};
    snapshot.forEach(doc => { schoolsDataCache[doc.id] = { id: doc.id, ...doc.data() }; });
    return schoolsDataCache;
}

// --- Dynasty List & Dashboard Loading ---
function listenForDynasties(userId) {
    const ref = collection(db, `artifacts/cfb-tracker/users/${userId}/dynasties`);
    dynastiesUnsubscribe = onSnapshot(ref, (snapshot) => {
        dynastiesList.innerHTML = snapshot.empty ? '<p class="text-gray-500">No dynasties yet.</p>' : '';
        snapshot.forEach(doc => {
            const dynasty = doc.data();
            const div = document.createElement('div');
            div.className = "bg-gray-700 p-4 rounded-md hover:bg-gray-600 cursor-pointer";
            div.dataset.id = doc.id;
            div.innerHTML = `<h5 class="font-bold text-lg">${dynasty.name}</h5><p class="text-sm text-gray-400">Created: ${dynasty.createdAt.toDate().toLocaleDateString()}</p>`;
            div.addEventListener('click', () => loadDynastyDashboard(doc.id));
            dynastiesList.appendChild(div);
        });
    });
}

async function loadDynastyDashboard(dynastyId) {
    currentDynastyId = dynastyId;
    showView('dynasty-view');
    scheduleTable.innerHTML = '<p class="text-gray-400">Loading schedule...</p>';
    try {
        const dynastyRef = doc(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${dynastyId}`);
        const [dynastySnap, coachSnap, schools] = await Promise.all([
            getDoc(dynastyRef),
            getDocs(query(collection(dynastyRef, 'coaches'), limit(1))),
            fetchSchoolsData()
        ]);
        const dynastyData = dynastySnap.data();
        const coachData = coachSnap.docs[0]?.data();
        const userTeam = schools[coachData.teamId];

        dynastyNavTitle.textContent = dynastyData.name;
        scheduleTeamLogo.src = userTeam.logoUrl || '';
        scheduleTeamName.textContent = userTeam.name;
        scheduleYear.textContent = `${dynastyData.currentYear || 2025} Schedule`;

        renderSchedulePage(dynastyData, schools);
        showDynastyPage('schedule-page');
    } catch (error) {
        console.error("Error loading dynasty dashboard:", error);
        scheduleTable.innerHTML = '<p class="text-red-500">Error loading data.</p>';
    }
}

// --- Schedule Page Logic ---
function renderSchedulePage(dynastyData, schools) {
    const weekLabels = ["Week 0", "Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6", "Week 7", "Week 8", "Week 9", "Week 10", "Week 11", "Week 12", "Week 13", "Week 14", "Conf. Champ", "Army-Navy", "Bowl Week 1", "Bowl Week 2", "Bowl Week 3", "Bowl Week 4"];
    const schedule = dynastyData.schedule || [];
    
    updateRecord(schedule);

    let headerHtml = `<div class="schedule-row schedule-row-header"><div>WEEK</div><div>LOCATION</div><div>OPPONENT</div><div>RESULT</div><div>SCORE</div></div>`;
    let rowsHtml = weekLabels.map((label, index) => {
        const game = schedule[index] || {};
        const resultColorClass = game.result === 'W' ? 'result-win' : game.result === 'L' ? 'result-loss' : '';
        return `
            <div class="schedule-row" data-week-index="${index}">
                <div class="schedule-week-label">${label}</div>
                <select class="input-field location-select"><option value="Away" ${game.location==='Away'?'selected':''}>Away</option><option value="Home" ${game.location==='Home'?'selected':''}>Home</option><option value="Neutral" ${game.location==='Neutral'?'selected':''}>Neutral</option></select>
                ${createCustomOpponentSelect(game.opponentId, schools)}
                <select class="input-field result-select ${resultColorClass}"><option value="" ${!game.result?'selected':''}>--</option><option value="W" ${game.result==='W'?'selected':''}>Win</option><option value="L" ${game.result==='L'?'selected':''}>Loss</option><option value="BYE" ${game.result==='BYE'?'selected':''}>Bye</option></select>
                <div class="flex items-center gap-2"><input type="number" class="input-field score-input user-score" value="${game.userScore||''}" placeholder="Us"><span>-</span><input type="number" class="input-field score-input opp-score" value="${game.oppScore||''}" placeholder="Them"></div>
            </div>`;
    }).join('');
    scheduleTable.innerHTML = headerHtml + rowsHtml;
    scheduleTable.addEventListener('change', handleScheduleChange);
    
    // Add listeners for custom dropdowns
    scheduleTable.querySelectorAll('.custom-select-display').forEach(el => el.addEventListener('click', (e) => {
        e.stopPropagation();
        const options = el.nextElementSibling;
        const wasActive = options.classList.contains('active');
        document.querySelectorAll('.custom-select-options.active').forEach(opt => opt.classList.remove('active'));
        if (!wasActive) options.classList.add('active');
    }));
}

function createCustomOpponentSelect(selectedId, schools) {
    const selectedSchool = schools[selectedId] || { id: 'BYE', name: 'BYE WEEK', logoUrl: '' };
    let optionsHtml = `<div class="custom-select-option" data-value="BYE">BYE WEEK</div>`;
    Object.values(schools).forEach(school => {
        optionsHtml += `<div class="custom-select-option" data-value="${school.id}"><img src="${school.logoUrl || ''}" alt=""><span>${school.name}</span></div>`;
    });

    return `
        <div class="custom-select-container">
            <input type="hidden" class="opponent-select-value" value="${selectedId || 'BYE'}">
            <div class="input-field custom-select-display">
                <img src="${selectedSchool.logoUrl || ''}" alt="">
                <span>${selectedSchool.name}</span>
            </div>
            <div class="custom-select-options">${optionsHtml}</div>
        </div>`;
}

function handleScheduleChange(e) {
    if (e.target.classList.contains('result-select')) {
        const select = e.target;
        select.classList.remove('result-win', 'result-loss');
        if (select.value === 'W') select.classList.add('result-win');
        if (select.value === 'L') select.classList.add('result-loss');
    }
    clearTimeout(scheduleSaveTimer);
    scheduleSaveTimer = setTimeout(saveSchedule, 1000);
}

async function saveSchedule() {
    if (!currentDynastyId) return;
    const scheduleRows = scheduleTable.querySelectorAll('.schedule-row:not(.schedule-row-header)');
    const scheduleData = Array.from(scheduleRows).map(row => ({
        location: row.querySelector('.location-select').value,
        opponentId: row.querySelector('.opponent-select-value').value,
        result: row.querySelector('.result-select').value,
        userScore: parseInt(row.querySelector('.user-score').value) || null,
        oppScore: parseInt(row.querySelector('.opp-score').value) || null,
    }));
    
    updateRecord(scheduleData);
    const dynastyRef = doc(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}`);
    try {
        await updateDoc(dynastyRef, { schedule: scheduleData });
    } catch (error) { console.error("Error saving schedule:", error); }
}

function updateRecord(schedule) {
    const wins = schedule.filter(g => g.result === 'W').length;
    const losses = schedule.filter(g => g.result === 'L').length;
    scheduleRecord.textContent = `Record: ${wins} - ${losses}`;
    scheduleRecord.style.color = wins >= losses ? '#22C55E' : '#EF4444'; // Green or Red
}

// Attach listeners to custom dropdown options after they are created
scheduleTable.addEventListener('click', (e) => {
    if (e.target.closest('.custom-select-option')) {
        const option = e.target.closest('.custom-select-option');
        const container = option.closest('.custom-select-container');
        const display = container.querySelector('.custom-select-display');
        const hiddenInput = container.querySelector('.opponent-select-value');

        hiddenInput.value = option.dataset.value;
        display.innerHTML = option.innerHTML; // Copy the content (logo + name)
        
        // Manually trigger a change event so the debounced save function runs
        hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Close the dropdown
        option.parentElement.classList.remove('active');
    }
});


// --- Creation Modals & Auth Forms (Simplified for brevity, no changes) ---
document.getElementById('create-dynasty-form').addEventListener('submit', async (e) => { e.preventDefault(); const name = document.getElementById('dynasty-name').value; if (!name) return; try { const schools = await fetchSchoolsData(); const confs = {}; Object.values(schools).forEach(s => { const c = s.defaultConference || 'Ind'; if (!confs[c]) confs[c] = []; confs[c].push(s.id); }); const ref = collection(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties`); const docRef = await addDoc(ref, { name, userId: auth.currentUser.uid, createdAt: serverTimestamp(), currentYear: 2025, conferences: confs }); showModal(null); currentDynastyId = docRef.id; showCoachCreationModal(Object.values(schools)); } catch (err) { console.error(err); } });
function showCoachCreationModal(schools) { let opts = '<option value="">Select...</option>'; schools.forEach(s => { opts += `<option value="${s.id}">${s.name}</option>`; }); coachAlmaMaterSelect.innerHTML = opts; coachSchoolSelect.innerHTML = opts; showModal('create-coach-modal'); }
document.getElementById('create-coach-form').addEventListener('submit', async (e) => { e.preventDefault(); const data = { firstName: document.getElementById('coach-first-name').value, lastName: document.getElementById('coach-last-name').value, hometown: document.getElementById('coach-hometown').value, almaMater: coachAlmaMaterSelect.value, age: parseInt(document.getElementById('coach-age').value), job: document.getElementById('coach-job').value, teamId: coachSchoolSelect.value, createdAt: serverTimestamp() }; if (!data.firstName || !data.teamId) return; try { const ref = collection(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}/coaches`); await addDoc(ref, data); showModal(null); loadDynastyDashboard(currentDynastyId); } catch (err) { console.error(err); } });
document.getElementById('register-form').addEventListener('submit', async (e) => { e.preventDefault(); const email = document.getElementById('register-email').value, pass = document.getElementById('register-password').value; try { const cred = await createUserWithEmailAndPassword(auth, email, pass); await setDoc(doc(db, `artifacts/cfb-tracker/users/${cred.user.uid}/profile`, 'info'), { email: cred.user.email, createdAt: serverTimestamp(), userId: cred.user.uid }); } catch (err) { document.getElementById('register-error').textContent = err.message; } });
document.getElementById('login-form').addEventListener('submit', async (e) => { e.preventDefault(); const email = document.getElementById('login-email').value, pass = document.getElementById('login-password').value; try { await signInWithEmailAndPassword(auth, email, pass); } catch (err) { document.getElementById('login-error').textContent = err.message; } });
