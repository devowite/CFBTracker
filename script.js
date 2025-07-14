// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, addDoc, getDocs, getDoc, collection, onSnapshot, serverTimestamp, updateDoc, query, limit, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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

// --- Constants ---
const WEEK_LABELS = ["Week 0", "Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6", "Week 7", "Week 8", "Week 9", "Week 10", "Week 11", "Week 12", "Week 13", "Week 14", "Conf. Champ", "Army-Navy", "Bowl Week 1", "Bowl Week 2", "Bowl Week 3", "Bowl Week 4", "Off Season"];
const POSITIONS = ["QB", "RB", "FB", "WR", "TE", "T", "G", "C", "DE", "DT", "MLB", "OLB", "CB", "FS", "SS", "K", "P"];
const YEARS = ["FR", "SO", "JR", "SR", "FR (RS)", "SO (RS)", "JR (RS)", "SR (RS)"];
const CLASSES = ["FR", "SO", "JR", "SR"];
const HEIGHTS = ["5'7\"", "5'8\"", "5'9\"", "5'10\"", "5'11\"", "6'0\"", "6'1\"", "6'2\"", "6'3\"", "6'4\"", "6'5\"", "6'6\"", "6'7\"", "6'8\"", "6'9\"", "6'10\"", "6'11\"", "7'0\""];
const RANKS = ["NR", ...Array.from({length: 25}, (_, i) => i + 1)];
const US_STATES = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"];
const DEPTH_CHART_STRUCTURE = {
    "Offense": {
        "Skill Players": ["QB", "RB", "FB", "WR", "TE"],
        "O-Line": ["T", "G", "C"]
    },
    "Defense": {
        "D-Line": ["DE", "DT"],
        "Linebackers": ["MLB", "OLB"],
        "Defensive Backs": ["CB", "FS", "SS"]
    },
    "Special Teams": {
        "Specialists": ["K", "P"]
    }
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
const dynastyNavTitle = document.getElementById('dynasty-nav-title');
const backToDynastiesBtn = document.getElementById('back-to-dynasties-btn');
const coachAlmaMaterSelect = document.getElementById('coach-alma-mater');
const coachSchoolSelect = document.getElementById('coach-school');
const dynastyInfoBox = document.getElementById('dynasty-info-box');

// --- Global State ---
let dynastiesUnsubscribe = null;
let currentDynastyId = null;
let schoolsDataCache = null;
let conferencesDataCache = null;
let scheduleSaveTimer = null;
let topRecruitsSaveTimer = null;
let topTransfersSaveTimer = null;
let currentUserConferenceTeams = [];
let currentDynastyData = {};
let rosterUnsubscribe = null;
let recruitsUnsubscribe = null;
let transfersInUnsubscribe = null;
let transfersOutUnsubscribe = null;
let currentRoster = [];
let currentRecruitingClass = [];
let currentTransfersIn = [];
let currentTransfersOut = [];
let rosterSort = { column: 'rating', order: 'desc' };
let rosterFilter = { position: 'All', class: 'All' };
let recruitSort = { column: 'nationalRank', order: 'asc' };

// --- UI Navigation & Helpers ---
function showView(viewId) {
    views.forEach(v => v.classList.toggle('active', v.id === viewId));
    dynastyInfoBox.classList.toggle('hidden', viewId !== 'dynasty-view');
}
function showModal(modalId) { modals.forEach(m => m.classList.toggle('active', m.id === modalId)); }
function showDynastyPage(pageId) {
    document.querySelectorAll('.dynasty-page').forEach(p => p.classList.toggle('active', p.id === pageId));
    document.querySelectorAll('#dynasty-nav .nav-link').forEach(l => l.classList.toggle('active', l.dataset.page === pageId));
}
const standardizeConfKey = (name) => (name || 'independent').trim().toLowerCase().replace(/\s+/g, '-');

// --- Event Listeners ---
document.getElementById('show-register-link').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('login-form-container').classList.add('hidden'); document.getElementById('register-form-container').classList.remove('hidden'); });
document.getElementById('show-login-link').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('register-form-container').classList.add('hidden'); document.getElementById('login-form-container').classList.remove('hidden'); });
document.getElementById('create-dynasty-btn').addEventListener('click', () => showModal('create-dynasty-modal'));
document.getElementById('cancel-dynasty-creation').addEventListener('click', () => showModal(null));
document.getElementById('cancel-coach-creation').addEventListener('click', () => showModal(null));
document.getElementById('cancel-advance-season').addEventListener('click', () => showModal(null));
document.getElementById('confirm-advance-season-btn').addEventListener('click', executeNewSeason);
backToDynastiesBtn.addEventListener('click', () => {
    if(rosterUnsubscribe) rosterUnsubscribe();
    if(recruitsUnsubscribe) recruitsUnsubscribe();
    if(transfersInUnsubscribe) transfersInUnsubscribe();
    if(transfersOutUnsubscribe) transfersOutUnsubscribe();
    if(dynastiesUnsubscribe) dynastiesUnsubscribe();
    showView('app-view');
});
document.querySelectorAll('#dynasty-nav .nav-link').forEach(link => link.addEventListener('click', (e) => { e.preventDefault(); showDynastyPage(link.dataset.page); }));
logoutButton.addEventListener('click', () => signOut(auth));
document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-select-container') && !e.target.closest('.modal-content-lg')) {
        document.querySelectorAll('.custom-select-options.active').forEach(el => el.classList.remove('active'));
    }
    if (e.target.classList.contains('modal')) {
        showModal(null);
    }
});
document.querySelectorAll('.modal-content, .modal-content-lg').forEach(el => el.addEventListener('click', e => e.stopPropagation()));

// --- Auth Logic ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        userEmailDisplay.textContent = `Logged in as: ${user.email}`;
        showView('app-view');
        fetchSchoolsData();
        fetchConferencesData();
        listenForDynasties(user.uid);
    } else {
        showView('auth-view');
        if (dynastiesUnsubscribe) dynastiesUnsubscribe();
        if (recruitsUnsubscribe) recruitsUnsubscribe();
        if (transfersInUnsubscribe) transfersInUnsubscribe();
        if (transfersOutUnsubscribe) transfersOutUnsubscribe();
    }
});

// --- Data Fetching & Caching ---
async function fetchSchoolsData() { if (schoolsDataCache) return schoolsDataCache; const snapshot = await getDocs(collection(db, 'schools')); schoolsDataCache = {}; snapshot.forEach(doc => { schoolsDataCache[doc.id] = { id: doc.id, ...doc.data() }; }); return schoolsDataCache; }
async function fetchConferencesData() { if (conferencesDataCache) return conferencesDataCache; const snapshot = await getDocs(collection(db, 'conferences')); conferencesDataCache = {}; snapshot.forEach(doc => { conferencesDataCache[doc.id] = { id: doc.id, ...doc.data() }; }); return conferencesDataCache; }

// --- Dynasty List & Dashboard Loading ---
// --- Dynasty List & Dashboard Loading ---
// --- Dynasty List & Dashboard Loading ---
function listenForDynasties(userId) {
    const ref = collection(db, `artifacts/cfb-tracker/users/${userId}/dynasties`);
    dynastiesUnsubscribe = onSnapshot(ref, (snapshot) => {
        if (snapshot.empty) {
            dynastiesList.innerHTML = '<p class="text-gray-500">No dynasties yet.</p>';
            return;
        }

        dynastiesList.innerHTML = ''; // Clear the list to re-render

        snapshot.docs.forEach(async (doc) => {
            const dynasty = doc.data();
            const dynastyId = doc.id;

            // Fetch the coach for this dynasty
            const coachRef = collection(db, `artifacts/cfb-tracker/users/${userId}/dynasties/${dynastyId}/coaches`);
            const coachSnap = await getDocs(query(coachRef, limit(1)));
            const coachData = coachSnap.empty ? null : coachSnap.docs[0].data();

            // Get team data from cache
            const teamData = coachData && schoolsDataCache ? schoolsDataCache[coachData.teamId] : null;

            // Calculate record from the schedule
            const schedule = dynasty.schedule || [];
            const records = calculateRecords(schedule); // This function already exists in your code

            // Create the list item element
            let div = document.createElement('div');
            div.className = "bg-gray-700 p-4 rounded-md hover:bg-gray-600 cursor-pointer";
            div.dataset.id = dynastyId;

            // Construct the new inner HTML for the dynasty card
            const coachName = coachData ? `${coachData.firstName} ${coachData.lastName}` : 'No coach';
            const coachRole = coachData ? coachData.job : 'N/A';
            const teamName = teamData ? teamData.name : 'No Team';
            const teamLogoUrl = teamData ? teamData.logoUrl : '';
            const record = `${records.overall.wins}-${records.overall.losses}`;

            div.innerHTML = `
                <div class="flex items-center gap-4">
                    <img src="${teamLogoUrl}" alt="Team Logo" class="h-12 w-12 object-contain flex-shrink-0">
                    <div class="flex-grow">
                        <h5 class="font-bold text-lg">${dynasty.name}</h5>
                        <div class="mt-1 text-sm text-gray-300 grid grid-cols-2 gap-x-4 gap-y-1">
                            <div><strong>Team:</strong> ${teamName}</div>
                            <div><strong>Record:</strong> ${record}</div>
                            <div><strong>Coach:</strong> ${coachName}</div>
                            <div><strong>Role:</strong> ${coachRole}</div>
                        </div>
                    </div>
                </div>
            `;

            div.onclick = () => loadDynastyDashboard(dynastyId);
            dynastiesList.appendChild(div);
        });
    });
}

async function loadDynastyDashboard(dynastyId) {
    currentDynastyId = dynastyId;
    if(rosterUnsubscribe) rosterUnsubscribe();
    if(recruitsUnsubscribe) recruitsUnsubscribe();
    if(transfersInUnsubscribe) transfersInUnsubscribe();
    if(transfersOutUnsubscribe) transfersOutUnsubscribe();
    if(dynastiesUnsubscribe) dynastiesUnsubscribe(); // Stop listening to the list of dynasties
    
    showView('dynasty-view');
    document.querySelectorAll('.dynasty-page').forEach(p => p.innerHTML = '<p class="text-gray-400">Loading...</p>');
    try {
        const dynastyRef = doc(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${dynastyId}`);
        dynastiesUnsubscribe = onSnapshot(dynastyRef, async (dynastySnap) => {
            if (!dynastySnap.exists()) throw new Error("Dynasty data not found.");
            currentDynastyData = dynastySnap.data();

            const [coachSnap, schools, conferences] = await Promise.all([ getDocs(query(collection(dynastyRef, 'coaches'), limit(1))), fetchSchoolsData(), fetchConferencesData() ]);
            if (coachSnap.empty) throw new Error("Coach data is missing for this dynasty. Please re-create the dynasty.");
            const coachData = coachSnap.docs[0].data();

            dynastyNavTitle.textContent = currentDynastyData.name;
            populateInfoBox(currentDynastyData, coachData, schools);
            renderHomePage(currentDynastyData, coachData, schools);
            renderSchedulePage(currentDynastyData, coachData, schools, conferences);
            renderRecruitingPage();
            renderTransferPortalPage();
        });

        listenForRosterChanges();
        listenForRecruits();
        listenForTransfers();
        showDynastyPage('home-page');
    } catch (error) {
        console.error("Error loading dynasty dashboard:", error);
        document.querySelectorAll('.dynasty-page').forEach(p => p.innerHTML = `<p class="text-red-500">Error: ${error.message}</p>`);
        showDynastyPage('home-page');
    }
}

// --- Roster & Recruiting Listeners ---
function listenForRosterChanges() {
    const rosterRef = collection(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}/roster`);
    rosterUnsubscribe = onSnapshot(rosterRef, (snapshot) => {
        currentRoster = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderRosterPage();
        renderDepthChartPage();
    });
}
function listenForRecruits() {
    const recruitsRef = collection(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}/recruits`);
    recruitsUnsubscribe = onSnapshot(recruitsRef, (snapshot) => {
        currentRecruitingClass = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderRecruitingPage();
    });
}
function listenForTransfers() {
    const transfersInRef = collection(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}/transfersIn`);
    transfersInUnsubscribe = onSnapshot(transfersInRef, (snapshot) => {
        currentTransfersIn = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTransferPortalPage();
    });
    const transfersOutRef = collection(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}/transfersOut`);
    transfersOutUnsubscribe = onSnapshot(transfersOutRef, (snapshot) => {
        currentTransfersOut = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTransferPortalPage();
    });
}

// --- Roster Page ---
async function renderRosterPage() {
    const page = document.getElementById('roster-page');
    if (!page) return;
    page.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <div>
                <h2 id="roster-page-title" class="text-3xl font-bold">Team Roster</h2>
                <p id="roster-count" class="text-gray-400"></p>
            </div>
            <div class="flex items-center gap-4">
                <select id="roster-season-filter" class="input-field"></select>
                <select id="roster-class-filter" class="input-field"></select>
                <select id="roster-position-filter" class="input-field"></select>
                <button id="add-player-btn" class="btn-primary">Add Player</button>
            </div>
        </div>
        <div class="overflow-x-auto">
            <table class="roster-table">
                <thead>
                    <tr>
                        <th class="sortable" data-sort="jersey">#</th>
                        <th class="sortable" data-sort="lastName">Name</th>
                        <th class="sortable" data-sort="position">Pos</th>
                        <th class="sortable" data-sort="year">Yr</th>
                        <th class="sortable" data-sort="rating">Ovr</th>
                        <th>RS</th>
                    </tr>
                </thead>
                <tbody id="roster-table-body"></tbody>
            </table>
        </div>
        <div id="class-distribution-container" class="class-dist-container">
            <div class="class-dist-header">
                <h3>Class Distribution</h3>
                <i class="fa-solid fa-chevron-down"></i>
            </div>
            <div class="class-dist-content">
                <table id="class-distribution-table" class="class-dist-table"></table>
            </div>
        </div>`;

    const positionFilter = document.getElementById('roster-position-filter');
    positionFilter.innerHTML = `<option value="All">All Positions</option>` + POSITIONS.map(p => `<option value="${p}">${p}</option>`).join('');
    positionFilter.value = rosterFilter.position;
    positionFilter.addEventListener('change', (e) => { rosterFilter.position = e.target.value; displayRosterTable(currentRoster, false); });

    const classFilter = document.getElementById('roster-class-filter');
    classFilter.innerHTML = `<option value="All">All Classes</option>` + CLASSES.map(c => `<option value="${c}">${c}</option>`).join('');
    classFilter.value = rosterFilter.class;
    classFilter.addEventListener('change', (e) => { rosterFilter.class = e.target.value; displayRosterTable(currentRoster, false); });

    document.getElementById('add-player-btn').addEventListener('click', () => openPlayerModal());
    document.querySelectorAll('#roster-page .roster-table th.sortable').forEach(th => { th.addEventListener('click', (e) => { const column = e.currentTarget.dataset.sort; if (rosterSort.column === column) { rosterSort.order = rosterSort.order === 'asc' ? 'desc' : 'asc'; } else { rosterSort.column = column; rosterSort.order = 'asc'; } displayRosterTable(currentRoster, false); }); });
    
    const seasonFilter = document.getElementById('roster-season-filter');
    const historyRef = collection(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}/seasonHistory`);
    const historySnap = await getDocs(historyRef);
    const pastSeasons = historySnap.docs.map(d => d.id).sort((a,b) => b-a);
    seasonFilter.innerHTML = `<option value="${currentDynastyData.currentYear}">${currentDynastyData.currentYear} (Current)</option>`;
    pastSeasons.forEach(year => { seasonFilter.innerHTML += `<option value="${year}">${year}</option>`; });
    seasonFilter.addEventListener('change', async (e) => {
        const selectedYear = e.target.value;
        const isCurrentSeason = selectedYear == currentDynastyData.currentYear;
        document.getElementById('add-player-btn').classList.toggle('hidden', !isCurrentSeason);
        document.getElementById('roster-class-filter').classList.toggle('hidden', !isCurrentSeason);
        document.getElementById('roster-position-filter').classList.toggle('hidden', !isCurrentSeason);
        document.getElementById('class-distribution-container').classList.toggle('hidden', !isCurrentSeason);
        
        if (isCurrentSeason) {
            document.getElementById('roster-page-title').textContent = "Team Roster";
            displayRosterTable(currentRoster, false);
        } else {
            const pastSeasonRef = doc(historyRef, selectedYear);
            const pastSeasonSnap = await getDoc(pastSeasonRef);
            if(pastSeasonSnap.exists()) {
                const pastData = pastSeasonSnap.data();
                const teamName = schoolsDataCache[pastData.teamId]?.name || 'Unknown Team';
                document.getElementById('roster-page-title').textContent = `${selectedYear} ${teamName} Roster`;
                displayRosterTable(pastData.roster || [], true);
            }
        }
    });

    document.querySelector('.class-dist-header').addEventListener('click', (e) => {
        const content = e.currentTarget.nextElementSibling;
        content.classList.toggle('expanded');
    });

    displayRosterTable(currentRoster, false);
}

function getBaseClass(year) {
    if (!year) return '';
    return year.split(' ')[0];
}

function displayRosterTable(rosterData, isReadOnly) {
    const rosterCount = document.getElementById('roster-count');
    if(rosterCount) rosterCount.textContent = `${rosterData.length} / 85 Players`;
    
    let filteredRoster = rosterData;
    if (rosterFilter.position !== 'All') {
        filteredRoster = filteredRoster.filter(p => p.position === rosterFilter.position);
    }
    if (rosterFilter.class !== 'All') {
        filteredRoster = filteredRoster.filter(p => getBaseClass(p.year) === rosterFilter.class);
    }

    filteredRoster.sort((a, b) => { const valA = a[rosterSort.column]; const valB = b[rosterSort.column]; let comparison = 0; if (valA > valB) comparison = 1; else if (valA < valB) comparison = -1; return rosterSort.order === 'asc' ? comparison : comparison * -1; });
    
    const tableBody = document.getElementById('roster-table-body');
    if(tableBody) {
        tableBody.innerHTML = filteredRoster.map(player => `
            <tr data-player-id="${player.id}" class="${!isReadOnly ? 'cursor-pointer' : ''} ${player.isRedshirted ? 'player-redshirted' : ''}">
                <td>${player.jersey}</td><td>${player.firstName} ${player.lastName}</td><td>${player.position}</td><td>${player.year}</td><td>${player.rating}</td>
                <td>${!isReadOnly && !player.year.includes('(RS)') ? `<i class="fa-solid fa-shirt redshirt-icon ${player.isRedshirted ? 'active' : ''}" data-player-id="${player.id}"></i>` : ''}</td>
            </tr>`).join('');
        tableBody.querySelectorAll('tr').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.tagName.toLowerCase() === 'i') return;
                const playerId = row.dataset.playerId;
                const player = isReadOnly ? filteredRoster.find(p => p.id === playerId) : currentRoster.find(p => p.id === playerId);
                openPlayerCardModal(playerId, isReadOnly ? player : null);
            });
        });
        if (!isReadOnly) {
            tableBody.querySelectorAll('.redshirt-icon').forEach(icon => { icon.addEventListener('click', async (e) => { e.stopPropagation(); const playerId = e.currentTarget.dataset.playerId; const player = currentRoster.find(p => p.id === playerId); const playerRef = doc(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}/roster`, playerId); await updateDoc(playerRef, { isRedshirted: !player.isRedshirted }); }); });
        }
    }
    renderClassDistributionTable(rosterData);
}

function renderClassDistributionTable(rosterData) {
    const table = document.getElementById('class-distribution-table');
    if (!table) return;

    // Initialize a data structure to hold the counts, with classes as the primary key.
    const distribution = {
        FR: { Total: 0 },
        SO: { Total: 0 },
        JR: { Total: 0 },
        SR: { Total: 0 },
        Total: { Total: 0 }
    };

    // Initialize counts for each position to 0.
    POSITIONS.forEach(pos => {
        distribution.FR[pos] = 0;
        distribution.SO[pos] = 0;
        distribution.JR[pos] = 0;
        distribution.SR[pos] = 0;
        distribution.Total[pos] = 0;
    });

    // Populate the distribution object with counts from the roster data.
    rosterData.forEach(player => {
        const baseClass = getBaseClass(player.year);
        if (distribution[baseClass] && POSITIONS.includes(player.position)) {
            distribution[baseClass][player.position]++;
            distribution[baseClass].Total++;
            distribution.Total[player.position]++;
            distribution.Total.Total++;
        }
    });

    // Generate the table header with all positions.
    const headerHtml = `
        <thead>
            <tr>
                <th>Class</th>
                ${POSITIONS.map(pos => `<th>${pos}</th>`).join('')}
                <th>Total</th>
            </tr>
        </thead>
    `;

    // Generate the table body, with one row for each class.
    const bodyHtml = `
        <tbody>
            ${CLASSES.map(cls => `
                <tr>
                    <td class="pos-header">${cls}</td>
                    ${POSITIONS.map(pos => `<td>${distribution[cls][pos]}</td>`).join('')}
                    <td class="font-bold">${distribution[cls].Total}</td>
                </tr>
            `).join('')}
            <tr class="font-bold">
                <td class="pos-header">Total</td>
                ${POSITIONS.map(pos => `<td>${distribution.Total[pos]}</td>`).join('')}
                <td>${distribution.Total.Total}</td>
            </tr>
        </tbody>
    `;

    table.innerHTML = headerHtml + bodyHtml;
}

function openPlayerModal(player = null) {
    const form = document.getElementById('player-form'); form.reset();
    document.getElementById('player-modal-title').textContent = player ? 'Edit Player' : 'Add New Player';
    document.getElementById('player-id').value = player ? player.id : '';
    const posSelect = document.getElementById('player-position'); posSelect.innerHTML = POSITIONS.map(p => `<option value="${p}">${p}</option>`).join('');
    const yearSelect = document.getElementById('player-year'); yearSelect.innerHTML = YEARS.map(y => `<option value="${y}">${y}</option>`).join('');
    const heightSelect = document.getElementById('player-height'); heightSelect.innerHTML = HEIGHTS.map(h => `<option value="${h}">${h}</option>`).join('');
    if (player) {
        document.getElementById('player-first-name').value = player.firstName; document.getElementById('player-last-name').value = player.lastName; document.getElementById('player-jersey').value = player.jersey;
        posSelect.value = player.position; yearSelect.value = player.year; document.getElementById('player-rating').value = player.rating;
        heightSelect.value = player.height || ''; document.getElementById('player-weight').value = player.weight || ''; document.getElementById('player-hometown').value = player.hometown || '';
    }
    showModal('player-modal');
    document.getElementById('player-form').onsubmit = savePlayer;
    document.getElementById('cancel-player-form').onclick = () => showModal(null);
}

async function savePlayer(e) {
    e.preventDefault(); const playerId = document.getElementById('player-id').value;
    const playerData = { firstName: document.getElementById('player-first-name').value, lastName: document.getElementById('player-last-name').value, jersey: parseInt(document.getElementById('player-jersey').value), position: document.getElementById('player-position').value, year: document.getElementById('player-year').value, rating: parseInt(document.getElementById('player-rating').value), height: document.getElementById('player-height').value, weight: parseInt(document.getElementById('player-weight').value), hometown: document.getElementById('player-hometown').value };
    if (playerId) {
        const playerRef = doc(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}/roster`, playerId);
        await updateDoc(playerRef, playerData);
    } else {
        playerData.isRedshirted = false;
        const rosterRef = collection(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}/roster`);
        const newPlayer = await addDoc(rosterRef, playerData);
        const careerRef = doc(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}/roster/${newPlayer.id}/careerStats`, String(currentDynastyData.currentYear));
        const coachSnap = await getDocs(query(collection(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}`, 'coaches'), limit(1)));
        const teamId = coachSnap.docs[0].data().teamId;
        await setDoc(careerRef, { year: currentDynastyData.currentYear, teamId });
    }
    showModal(null);
}

function generateRecruitInfoHtml(recruitInfo, transferInfo) {
    if (recruitInfo) {
        let starsHtml = '';
        for (let i = 1; i <= recruitInfo.starRating; i++) {
            starsHtml += `<i class="fa-solid fa-star"></i>`;
        }
        return `
            <div class="recruit-info-grid">
                <div class="font-semibold text-gray-400">Type:</div>
                <div>High School Recruit</div>
                <div class="font-semibold text-gray-400">Star Rating:</div>
                <div class="star-rating">${starsHtml}</div>
                <div class="font-semibold text-gray-400">National Rank:</div>
                <div>${recruitInfo.nationalRank || 'N/A'}</div>
                <div class="font-semibold text-gray-400">Position Rank:</div>
                <div>${recruitInfo.positionRank || 'N/A'}</div>
                <div class="font-semibold text-gray-400">Prospect Type:</div>
                <div>
                    ${recruitInfo.isGem ? '<span class="recruit-tag recruit-tag-gem">GEM</span>' : ''}
                    ${recruitInfo.isBust ? '<span class="recruit-tag recruit-tag-bust">BUST</span>' : ''}
                    ${!recruitInfo.isGem && !recruitInfo.isBust ? 'Standard' : ''}
                </div>
            </div>`;
    }
    if (transferInfo) {
         let starsHtml = '';
        for (let i = 1; i <= transferInfo.starRating; i++) {
            starsHtml += `<i class="fa-solid fa-star"></i>`;
        }
        return `
            <div class="recruit-info-grid">
                <div class="font-semibold text-gray-400">Type:</div>
                <div>Transfer</div>
                <div class="font-semibold text-gray-400">Previous School:</div>
                <div>${schoolsDataCache[transferInfo.previousSchoolId]?.name || 'N/A'}</div>
                <div class="font-semibold text-gray-400">Star Rating:</div>
                <div class="star-rating">${starsHtml}</div>
                 <div class="font-semibold text-gray-400">National Rank:</div>
                <div>${transferInfo.nationalRank || 'N/A'}</div>
                <div class="font-semibold text-gray-400">Position Rank:</div>
                <div>${transferInfo.positionRank || 'N/A'}</div>
            </div>`;
    }
    return '<p>No recruiting or transfer information available for this player.</p>';
}

async function openPlayerCardModal(playerId, historicalPlayer = null) {
    const player = historicalPlayer || currentRoster.find(p => p.id === playerId);
    if (!player) return;
    const contentEl = document.getElementById('player-card-content');
    contentEl.innerHTML = `<p>Loading player card...</p>`;
    showModal('player-card-modal');

    let careerStats = [];
    if (historicalPlayer) {
        careerStats = historicalPlayer.careerStatsHistory || [];
    } else {
        const careerStatsRef = collection(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}/roster/${playerId}/careerStats`);
        const careerStatsSnap = await getDocs(careerStatsRef);
        careerStats = careerStatsSnap.docs.map(d => d.data()).sort((a,b) => a.year - b.year);
    }

    const recruitInfoHtml = generateRecruitInfoHtml(player.recruitInfo, player.transferInfo);
    const starInfo = player.recruitInfo || player.transferInfo;
    const starsHtml = starInfo ? '<span class="star-rating text-lg ml-2">' + '★'.repeat(starInfo.starRating) + '</span>' : '';

    contentEl.innerHTML = `
        <div class="player-card-header">
            <div class="player-card-jersey"><i class="fa-solid fa-shirt"></i><span class="player-card-jersey-number">${player.jersey}</span></div>
            <div class="player-card-info">
                <h3 class="text-3xl font-bold">${player.firstName} ${player.lastName}</h3>
                <p class="text-gray-400 flex items-center">${player.year} | ${player.position} | ${player.rating} OVR ${starsHtml}</p>
                <p class="text-gray-400">${player.height || ''} | ${player.weight ? `${player.weight} lbs` : ''} | ${player.hometown || ''}</p>
            </div>
            <button id="edit-player-from-card" class="btn-secondary ml-auto self-start ${historicalPlayer ? 'hidden' : ''}">Edit</button>
        </div>
        <div class="player-card-tabs">
            <a href="#" class="player-card-tab active" data-tab="career">Career Stats</a>
            <a href="#" class="player-card-tab" data-tab="recruit">Recruit Info</a>
            <a href="#" class="player-card-tab" data-tab="awards">Awards</a>
            <a href="#" class="player-card-tab" data-tab="bio">Bio</a>
        </div>
        <div id="tab-career" class="player-card-tab-content active">
            <table class="roster-table">
                <thead><tr><th>Year</th><th>Team</th><th>Stats...</th></tr></thead>
                <tbody>${careerStats.map(s => `<tr><td>${s.year}</td><td><img src="${schoolsDataCache[s.teamId]?.logoUrl || ''}" class="h-6 inline-block mr-2">${schoolsDataCache[s.teamId]?.name || ''}</td><td>...</td></tr>`).join('')}</tbody>
            </table>
        </div>
        <div id="tab-recruit" class="player-card-tab-content">${recruitInfoHtml}</div>
        <div id="tab-awards" class="player-card-tab-content"><p>Awards coming soon.</p></div>
        <div id="tab-bio" class="player-card-tab-content"><p>Bio coming soon.</p></div>
    `;

    const editButton = document.getElementById('edit-player-from-card');
    if (editButton) {
        editButton.addEventListener('click', () => {
            showModal(null);
            openPlayerModal(player);
        });
    }

    contentEl.querySelectorAll('.player-card-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            contentEl.querySelectorAll('.player-card-tab').forEach(t => t.classList.remove('active'));
            contentEl.querySelectorAll('.player-card-tab-content').forEach(c => c.classList.remove('active'));
            e.currentTarget.classList.add('active');
            document.getElementById(`tab-${e.currentTarget.dataset.tab}`).classList.add('active');
        });
    });
}

// --- Depth Chart Page ---
// --- Depth Chart Page ---
function renderDepthChartPage() {
    const page = document.getElementById('depth-chart-page');
    if (!page) return;

    const positionGroups = currentRoster.reduce((acc, player) => {
        (acc[player.position] = acc[player.position] || []).push(player);
        return acc;
    }, {});

    let html = `<h2 class="text-3xl font-bold mb-6">Depth Chart</h2>`;

    for (const [section, subsections] of Object.entries(DEPTH_CHART_STRUCTURE)) {
        html += `<h3 class="depth-chart-section-title">${section}</h3>`;
        for (const [subsection, positions] of Object.entries(subsections)) {
            html += `<h4 class="depth-chart-subsection-title">${subsection}</h4>`;
            html += `<div class="depth-chart-grid">`;
            
            positions.forEach(pos => {
                if (positionGroups[pos] && positionGroups[pos].length > 0) {
                    const players = positionGroups[pos].sort((a, b) => b.rating - a.rating);
                    html += `
                        <div class="depth-chart-card">
                            <h5 class="depth-chart-card-title">${pos}</h5>
                            <ol class="depth-chart-list">
                                ${players.map((player, index) => `
                                    <li class="depth-chart-list-item ${player.isRedshirted ? 'player-redshirted' : ''}">
                                        <span class="depth-chart-player-rank">${index + 1}.</span>
                                        <div class="depth-chart-player-info">
                                            <span class="depth-chart-player-name"><span class="depth-chart-player-jersey">#${player.jersey}</span>${player.firstName} ${player.lastName}</span>
                                            <span class="depth-chart-player-details">${player.year} | ${player.rating} OVR</span>
                                        </div>
                                    </li>
                                `).join('')}
                            </ol>
                        </div>
                    `;
                }
            });
            html += `</div>`;
        }
    }

    page.innerHTML = html;
}

// --- Recruiting Page ---
function renderRecruitingPage() {
    const page = document.getElementById('recruiting-page');
    if(!page) return;
    page.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <div><h2 class="text-3xl font-bold">Recruiting Class</h2><p id="recruiting-class-size" class="text-gray-400"></p></div>
            <button id="add-commit-btn" class="btn-primary">Add Commit</button>
        </div>
        <div class="overflow-x-auto">
            <table class="roster-table">
                <thead><tr><th class="sortable" data-sort="starRating">Stars</th><th class="sortable" data-sort="lastName">Name</th><th class="sortable" data-sort="position">Pos</th><th class="sortable" data-sort="nationalRank">Natl. Rank</th><th class="sortable" data-sort="positionRank">Pos. Rank</th><th>Hometown</th><th>Type</th></tr></thead>
                <tbody id="recruiting-table-body"></tbody>
            </table>
        </div>
        <div class="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
                <h3 class="text-2xl font-bold mb-4">Top 10 National Recruits</h3>
                <table id="top-recruits-table" class="top-recruit-table"></table>
            </div>
            <div>
                <h3 class="text-2xl font-bold mb-4">Top 10 Recruiting Classes</h3>
                <table id="top-classes-table" class="top-recruit-table"></table>
            </div>
        </div>
    `;
    
    document.getElementById('add-commit-btn').addEventListener('click', () => openRecruitModal());
    
    const tableBody = document.getElementById('recruiting-table-body');
    const classSizeEl = document.getElementById('recruiting-class-size');
    
    if(classSizeEl) classSizeEl.textContent = `${currentRecruitingClass.length} Commits`;
    
    currentRecruitingClass.sort((a,b) => {
        const valA = a[recruitSort.column];
        const valB = b[recruitSort.column];
        let comparison = 0;
        if (valA > valB) comparison = 1;
        else if (valA < valB) comparison = -1;
        return recruitSort.order === 'asc' ? comparison : comparison * -1;
    });

    if(tableBody) {
        tableBody.innerHTML = currentRecruitingClass.map(recruit => {
            const starsHtml = '<i class="fa-solid fa-star"></i>'.repeat(recruit.starRating);
            return `
                <tr data-recruit-id="${recruit.id}" class="cursor-pointer">
                    <td class="star-rating">${starsHtml}</td>
                    <td>${recruit.firstName} ${recruit.lastName}</td>
                    <td>${recruit.position}</td>
                    <td>${recruit.nationalRank || 'N/A'}</td>
                    <td>${recruit.positionRank || 'N/A'}</td>
                    <td>${recruit.hometown || ''}</td>
                    <td>
                        ${recruit.isGem ? '<span class="recruit-tag recruit-tag-gem">GEM</span>' : ''}
                        ${recruit.isBust ? '<span class="recruit-tag recruit-tag-bust">BUST</span>' : ''}
                    </td>
                </tr>
            `;
        }).join('');

        tableBody.querySelectorAll('tr').forEach(row => {
            row.addEventListener('click', () => {
                const recruitId = row.dataset.recruitId;
                const recruit = currentRecruitingClass.find(r => r.id === recruitId);
                openRecruitModal(recruit);
            });
        });
    }
    
    document.querySelectorAll('#recruiting-page .roster-table th.sortable').forEach(th => {
        th.addEventListener('click', (e) => {
            const column = e.currentTarget.dataset.sort;
            if (recruitSort.column === column) {
                recruitSort.order = recruitSort.order === 'asc' ? 'desc' : 'asc';
            } else {
                recruitSort.column = column;
                recruitSort.order = column === 'lastName' ? 'asc' : 'desc';
            }
            renderRecruitingPage();
        });
    });

    renderTopRecruitingTables();
}

function renderTopRecruitingTables() {
    const topRecruitsTable = document.getElementById('top-recruits-table');
    const topClassesTable = document.getElementById('top-classes-table');
    if (!topRecruitsTable || !topClassesTable || !schoolsDataCache) return;

    const schoolOptions = `<option value=""></option>` + Object.values(schoolsDataCache).sort((a,b) => a.name.localeCompare(b.name)).map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    const positionOptions = `<option value=""></option>` + POSITIONS.map(p => `<option value="${p}">${p}</option>`).join('');
    const stateOptions = `<option value=""></option>` + US_STATES.map(s => `<option value="${s}">${s}</option>`).join('');
    
    const topRecruitsData = currentDynastyData.topRecruits || Array(10).fill({});
    const topClassesData = currentDynastyData.topClasses || Array(10).fill({});

    let recruitsHtml = `<thead><tr><th>Rank</th><th>Name</th><th>Pos</th><th>State</th><th>Committed To</th></tr></thead><tbody>`;
    for (let i = 0; i < 10; i++) {
        const recruit = topRecruitsData[i] || {};
        recruitsHtml += `
            <tr>
                <td class="rank-cell">${i + 1}.</td>
                <td><input type="text" class="input-field top-recruit-input" data-index="${i}" data-field="name" value="${recruit.name || ''}"></td>
                <td><select class="input-field top-recruit-input" data-index="${i}" data-field="pos">${positionOptions.replace(`value="${recruit.pos || ''}"`, `value="${recruit.pos || ''}" selected`)}</select></td>
                <td><select class="input-field top-recruit-input" data-index="${i}" data-field="state">${stateOptions.replace(`value="${recruit.state || ''}"`, `value="${recruit.state || ''}" selected`)}</select></td>
                <td><select class="input-field top-recruit-input" data-index="${i}" data-field="schoolId">${schoolOptions.replace(`value="${recruit.schoolId || ''}"`, `value="${recruit.schoolId || ''}" selected`)}</select></td>
            </tr>
        `;
    }
    topRecruitsTable.innerHTML = recruitsHtml + `</tbody>`;

    let classesHtml = `<thead><tr><th>Rank</th><th>School</th></tr></thead><tbody>`;
    for (let i = 0; i < 10; i++) {
        const school = topClassesData[i] || {};
        classesHtml += `
            <tr>
                <td class="rank-cell">${i + 1}.</td>
                <td><select class="input-field top-class-input" data-index="${i}">${schoolOptions.replace(`value="${school.schoolId || ''}"`, `value="${school.schoolId || ''}" selected`)}</select></td>
            </tr>
        `;
    }
    topClassesTable.innerHTML = classesHtml + `</tbody>`;

    document.querySelectorAll('.top-recruit-input, .top-class-input').forEach(input => {
        input.addEventListener('change', handleTopRecruitsChange);
    });
}

function handleTopRecruitsChange() {
    clearTimeout(topRecruitsSaveTimer);
    topRecruitsSaveTimer = setTimeout(saveTopRecruitingData, 1500);
}

async function saveTopRecruitingData() {
    const topRecruitsData = [];
    document.querySelectorAll('#top-recruits-table tbody tr').forEach((row, i) => {
        const name = row.querySelector(`[data-field="name"]`).value;
        const pos = row.querySelector(`[data-field="pos"]`).value;
        const state = row.querySelector(`[data-field="state"]`).value;
        const schoolId = row.querySelector(`[data-field="schoolId"]`).value;
        topRecruitsData[i] = { name, pos, state, schoolId };
    });

    const topClassesData = [];
    document.querySelectorAll('#top-classes-table tbody tr').forEach((row, i) => {
        const schoolId = row.querySelector('.top-class-input').value;
        topClassesData[i] = { schoolId };
    });

    const dynastyRef = doc(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}`);
    try {
        await updateDoc(dynastyRef, {
            topRecruits: topRecruitsData,
            topClasses: topClassesData
        });
    } catch (error) {
        console.error("Error saving top recruiting data:", error);
    }
}

function openRecruitModal(recruit = null) {
    const form = document.getElementById('recruit-form');
    form.reset();
    document.getElementById('recruit-modal-title').textContent = recruit ? 'Edit Commit' : 'Add New Commit';
    document.getElementById('recruit-id').value = recruit ? recruit.id : '';
    
    const posSelect = document.getElementById('recruit-position');
    posSelect.innerHTML = POSITIONS.map(p => `<option value="${p}">${p}</option>`).join('');
    
    const heightSelect = document.getElementById('recruit-height');
    heightSelect.innerHTML = HEIGHTS.map(h => `<option value="${h}">${h}</option>`).join('');
    
    if (recruit) {
        document.getElementById('recruit-first-name').value = recruit.firstName;
        document.getElementById('recruit-last-name').value = recruit.lastName;
        posSelect.value = recruit.position;
        document.getElementById('recruit-natl-rank').value = recruit.nationalRank || '';
        document.getElementById('recruit-pos-rank').value = recruit.positionRank || '';
        document.getElementById('recruit-hometown').value = recruit.hometown || '';
        heightSelect.value = recruit.height || '';
        document.getElementById('recruit-weight').value = recruit.weight || '';
        document.getElementById('recruit-is-gem').checked = recruit.isGem || false;
        document.getElementById('recruit-is-bust').checked = recruit.isBust || false;
        updateStarRating('recruit-star-rating', recruit.starRating);
    } else {
        updateStarRating('recruit-star-rating', 0);
    }
    
    showModal('recruiting-modal');
    document.getElementById('recruit-form').onsubmit = saveRecruit;
    document.getElementById('cancel-recruit-form').onclick = () => showModal(null);
}

let currentStarRating = 0;
document.getElementById('recruit-star-rating').addEventListener('click', e => {
    if (e.target.classList.contains('star-icon')) {
        currentStarRating = parseInt(e.target.dataset.value);
        updateStarRating('recruit-star-rating', currentStarRating);
    }
});
document.getElementById('transfer-in-star-rating').addEventListener('click', e => {
    if (e.target.classList.contains('star-icon')) {
        currentStarRating = parseInt(e.target.dataset.value);
        updateStarRating('transfer-in-star-rating', currentStarRating);
    }
});

function updateStarRating(containerId, rating) {
    currentStarRating = rating;
    const stars = document.querySelectorAll(`#${containerId} .star-icon`);
    stars.forEach(star => {
        const starValue = parseInt(star.dataset.value);
        if (starValue <= rating) {
            star.classList.replace('fa-regular', 'fas');
        } else {
            star.classList.replace('fas', 'fa-regular');
        }
    });
}

async function saveRecruit(e) {
    e.preventDefault();
    const recruitId = document.getElementById('recruit-id').value;
    const recruitData = {
        firstName: document.getElementById('recruit-first-name').value,
        lastName: document.getElementById('recruit-last-name').value,
        position: document.getElementById('recruit-position').value,
        nationalRank: parseInt(document.getElementById('recruit-natl-rank').value) || null,
        positionRank: parseInt(document.getElementById('recruit-pos-rank').value) || null,
        hometown: document.getElementById('recruit-hometown').value,
        height: document.getElementById('recruit-height').value,
        weight: parseInt(document.getElementById('recruit-weight').value) || null,
        starRating: currentStarRating,
        isGem: document.getElementById('recruit-is-gem').checked,
        isBust: document.getElementById('recruit-is-bust').checked,
    };

    if (recruitId) {
        const recruitRef = doc(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}/recruits`, recruitId);
        await updateDoc(recruitRef, recruitData);
    } else {
        const recruitsRef = collection(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}/recruits`);
        await addDoc(recruitsRef, recruitData);
    }
    showModal(null);
}

// --- Transfer Portal Page ---
function renderTransferPortalPage() {
    const page = document.getElementById('transfer-portal-page');
    if(!page) return;
    
    const isOffSeason = (currentDynastyData.currentWeekIndex || 0) === WEEK_LABELS.length - 1;

    if (!isOffSeason) {
        page.innerHTML = `<h2 class="text-3xl font-bold">Transfer Portal</h2><p class="mt-4 text-gray-400">The Transfer Portal is only open during the Off Season.</p>`;
        return;
    }

    page.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-3xl font-bold">Transfer Portal</h2>
            <div class="flex gap-4">
                <button id="add-transfer-in-btn" class="btn-success font-bold py-2 px-4 rounded-md">Incoming Transfer</button>
                <button id="add-transfer-out-btn" class="btn-danger font-bold py-2 px-4 rounded-md">Outgoing Transfer</button>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
                <h3 class="text-2xl font-bold mb-4">Transfers In</h3>
                <div class="overflow-x-auto">
                    <table class="roster-table">
                        <thead><tr><th>Name</th><th>Pos</th><th>Yr</th><th>Stars</th><th>From</th></tr></thead>
                        <tbody id="transfers-in-table-body"></tbody>
                    </table>
                </div>
            </div>
            <div>
                <h3 class="text-2xl font-bold mb-4">Transfers Out</h3>
                 <div class="overflow-x-auto">
                    <table class="roster-table">
                        <thead><tr><th>Name</th><th>Pos</th><th>Yr</th><th>Ovr</th><th>To</th></tr></thead>
                        <tbody id="transfers-out-table-body"></tbody>
                    </table>
                </div>
            </div>
        </div>

        <div class="mt-12">
            <h3 class="text-2xl font-bold mb-4">Top 10 National Transfers</h3>
            <table id="top-transfers-table" class="top-recruit-table"></table>
        </div>
    `;

    document.getElementById('add-transfer-in-btn').addEventListener('click', openTransferInModal);
    document.getElementById('add-transfer-out-btn').addEventListener('click', openTransferOutModal);

    const transfersInBody = document.getElementById('transfers-in-table-body');
    transfersInBody.innerHTML = currentTransfersIn.map(p => {
        const starsHtml = '<i class="fa-solid fa-star"></i>'.repeat(p.starRating);
        return `<tr><td>${p.firstName} ${p.lastName}</td><td>${p.position}</td><td>${p.year}</td><td class="star-rating">${starsHtml}</td><td>${schoolsDataCache[p.previousSchoolId]?.name || 'N/A'}</td></tr>`
    }).join('');

    const transfersOutBody = document.getElementById('transfers-out-table-body');
    transfersOutBody.innerHTML = currentTransfersOut.map(p => `<tr><td>${p.firstName} ${p.lastName}</td><td>${p.position}</td><td>${p.year}</td><td>${p.rating}</td><td>${schoolsDataCache[p.newSchoolId]?.name || 'N/A'}</td></tr>`).join('');

    renderTopTransfersTable();
}

function renderTopTransfersTable() {
    const table = document.getElementById('top-transfers-table');
    if (!table || !schoolsDataCache) return;

    const schoolOptions = `<option value=""></option>` + Object.values(schoolsDataCache).sort((a,b) => a.name.localeCompare(b.name)).map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    const positionOptions = `<option value=""></option>` + POSITIONS.map(p => `<option value="${p}">${p}</option>`).join('');
    const topTransfersData = currentDynastyData.topTransfers || Array(10).fill({});

    let html = `<thead><tr><th>Rank</th><th>Name</th><th>Pos</th><th>Old School</th><th>New School</th></tr></thead><tbody>`;
    for (let i = 0; i < 10; i++) {
        const transfer = topTransfersData[i] || {};
        html += `
            <tr>
                <td class="rank-cell">${i + 1}.</td>
                <td><input type="text" class="input-field top-transfer-input" data-index="${i}" data-field="name" value="${transfer.name || ''}"></td>
                <td><select class="input-field top-transfer-input" data-index="${i}" data-field="pos">${positionOptions.replace(`value="${transfer.pos || ''}"`, `value="${transfer.pos || ''}" selected`)}</select></td>
                <td><select class="input-field top-transfer-input" data-index="${i}" data-field="oldSchoolId">${schoolOptions.replace(`value="${transfer.oldSchoolId || ''}"`, `value="${transfer.oldSchoolId || ''}" selected`)}</select></td>
                <td><select class="input-field top-transfer-input" data-index="${i}" data-field="newSchoolId">${schoolOptions.replace(`value="${transfer.newSchoolId || ''}"`, `value="${transfer.newSchoolId || ''}" selected`)}</select></td>
            </tr>
        `;
    }
    table.innerHTML = html + `</tbody>`;

    document.querySelectorAll('.top-transfer-input').forEach(input => {
        input.addEventListener('change', handleTopTransfersChange);
    });
}

function handleTopTransfersChange() {
    clearTimeout(topTransfersSaveTimer);
    topTransfersSaveTimer = setTimeout(saveTopTransfersData, 1500);
}

async function saveTopTransfersData() {
    const topTransfersData = [];
    document.querySelectorAll('#top-transfers-table tbody tr').forEach((row, i) => {
        const name = row.querySelector(`[data-field="name"]`).value;
        const pos = row.querySelector(`[data-field="pos"]`).value;
        const oldSchoolId = row.querySelector(`[data-field="oldSchoolId"]`).value;
        const newSchoolId = row.querySelector(`[data-field="newSchoolId"]`).value;
        topTransfersData[i] = { name, pos, oldSchoolId, newSchoolId };
    });

    const dynastyRef = doc(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}`);
    try {
        await updateDoc(dynastyRef, { topTransfers: topTransfersData });
    } catch (error) {
        console.error("Error saving top transfers data:", error);
    }
}

function openTransferInModal() {
    const form = document.getElementById('transfer-in-form');
    form.reset();
    
    document.getElementById('transfer-in-position').innerHTML = POSITIONS.map(p => `<option value="${p}">${p}</option>`).join('');
    document.getElementById('transfer-in-year').innerHTML = YEARS.map(y => `<option value="${y}">${y}</option>`).join('');
    document.getElementById('transfer-in-height').innerHTML = HEIGHTS.map(h => `<option value="${h}">${h}</option>`).join('');
    document.getElementById('transfer-in-prev-school').innerHTML = `<option value="">Select...</option>` + Object.values(schoolsDataCache).sort((a,b) => a.name.localeCompare(b.name)).map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    
    updateStarRating('transfer-in-star-rating', 0);
    showModal('transfer-in-modal');
    document.getElementById('transfer-in-form').onsubmit = saveTransferIn;
    document.getElementById('cancel-transfer-in-form').onclick = () => showModal(null);
}

async function saveTransferIn(e) {
    e.preventDefault();
    const transferData = {
        firstName: document.getElementById('transfer-in-first-name').value,
        lastName: document.getElementById('transfer-in-last-name').value,
        position: document.getElementById('transfer-in-position').value,
        year: document.getElementById('transfer-in-year').value,
        nationalRank: parseInt(document.getElementById('transfer-in-natl-rank').value) || null,
        positionRank: parseInt(document.getElementById('transfer-in-pos-rank').value) || null,
        previousSchoolId: document.getElementById('transfer-in-prev-school').value,
        hometown: document.getElementById('transfer-in-hometown').value,
        height: document.getElementById('transfer-in-height').value,
        weight: parseInt(document.getElementById('transfer-in-weight').value),
        starRating: currentStarRating,
    };
    const transfersInRef = collection(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}/transfersIn`);
    await addDoc(transfersInRef, transferData);
    showModal(null);
}

function openTransferOutModal() {
    const playerSelect = document.getElementById('transfer-out-player');
    playerSelect.innerHTML = `<option value="">Select player...</option>` + currentRoster.map(p => `<option value="${p.id}">${p.firstName} ${p.lastName} (${p.position}, ${p.year})</option>`).join('');
    
    const schoolSelect = document.getElementById('transfer-out-new-school');
    schoolSelect.innerHTML = `<option value="">Select new school...</option>` + Object.values(schoolsDataCache).sort((a,b) => a.name.localeCompare(b.name)).map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    showModal('transfer-out-modal');
    document.getElementById('transfer-out-form').onsubmit = saveTransferOut;
    document.getElementById('cancel-transfer-out-form').onclick = () => showModal(null);
}

async function saveTransferOut(e) {
    e.preventDefault();
    const playerId = document.getElementById('transfer-out-player').value;
    const newSchoolId = document.getElementById('transfer-out-new-school').value;
    if (!playerId || !newSchoolId) return;

    const player = currentRoster.find(p => p.id === playerId);
    if (!player) return;
    
    const playerRef = doc(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}/roster`, playerId);
    const transferOutRef = doc(collection(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}/transfersOut`), playerId);
    
    const batch = writeBatch(db);
    batch.set(transferOutRef, { ...player, newSchoolId });
    batch.delete(playerRef);
    await batch.commit();

    showModal(null);
}

// --- Home Page Logic ---
function renderHomePage(dynastyData, coachData, schools) {
    document.getElementById('home-page').innerHTML = `<div class="flex items-center gap-4 mb-6"><img id="home-team-logo" src="" alt="Team Logo" class="h-16 w-16 object-contain"><h2 id="home-team-header" class="text-3xl font-bold"></h2></div><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"><div class="dashboard-card"><h4 class="dashboard-card-title">Team Record</h4><div id="home-record-panel" class="space-y-2"></div></div><div class="dashboard-card"><h4 class="dashboard-card-title">Team Stats</h4><div id="home-stats-panel" class="space-y-2"></div></div><div class="dashboard-card"><h4 class="dashboard-card-title">Season Progression</h4><div id="home-progression-panel" class="flex flex-col justify-between h-full"></div></div><div class="dashboard-card md:col-span-2 lg:col-span-2"><h4 class="dashboard-card-title">Upcoming Games</h4><div id="home-upcoming-panel" class="space-y-3"></div></div><div class="dashboard-card md:col-span-2 lg:col-span-2"><h4 class="dashboard-card-title">Recent Results</h4><div id="home-recent-panel" class="space-y-3"></div></div></div>`;
    const userTeam = schools[coachData.teamId]; const schedule = dynastyData.schedule || []; const currentWeekIndex = dynastyData.currentWeekIndex || 0;
    document.getElementById('home-team-logo').src = userTeam.logoUrl || ''; document.getElementById('home-team-header').textContent = `${dynastyData.currentYear || 2025} ${userTeam.name} Football`;
    const records = calculateRecords(schedule); document.getElementById('home-record-panel').innerHTML = `<div class="record-item"><span class="record-label">Overall</span><span class="record-value">${records.overall.wins}-${records.overall.losses}</span></div><div class="text-right text-gray-400 text-sm">${records.overall.pct}</div><div class="record-item mt-2"><span class="record-label">Conference</span><span class="record-value">${records.conference.wins}-${records.conference.losses}</span></div><div class="record-item"><span class="record-label">vs Top 25</span><span class="record-value">${records.vsTop25.wins}-${records.vsTop25.losses}</span></div><div class="record-item"><span class="record-label">vs Top 10</span><span class="record-value">${records.vsTop10.wins}-${records.vsTop10.losses}</span></div><div class="record-item mt-2"><span class="record-label">Home</span><span class="record-value">${records.home.wins}-${records.home.losses}</span></div><div class="record-item"><span class="record-label">Away</span><span class="record-value">${records.away.wins}-${records.away.losses}</span></div><div class="record-item"><span class="record-label">Neutral</span><span class="record-value">${records.neutral.wins}-${records.neutral.losses}</span></div>`;
    const stats = calculateTeamStats(schedule); document.getElementById('home-stats-panel').innerHTML = `<div class="stat-item"><span class="stat-label">Points Per Game</span><span class="stat-value">${stats.ppg}</span></div><div class="stat-item"><span class="stat-label">Points Allowed</span><span class="stat-value">${stats.papg}</span></div><div class="stat-item"><span class="stat-label">Point Differential</span><span class="stat-value ${stats.diff >= 0 ? 'text-green-400' : 'text-red-400'}">${stats.diff >= 0 ? '+' : ''}${stats.diff}</span></div>`;
    const { upcoming, recent } = getUpcomingAndRecentGames(schedule, schools, currentWeekIndex, userTeam.name);
    const upcomingPanel = document.getElementById('home-upcoming-panel'); upcomingPanel.innerHTML = upcoming.length > 0 ? upcoming.map(game => `<div class="game-item"><img src="${schools[game.opponentId]?.logoUrl || ''}" alt=""> <div class="game-info"><div class="game-matchup">${game.matchup}</div><div class="game-details">${game.location} - ${game.weekLabel}</div></div></div>`).join('') : '<p class="text-gray-400">No upcoming games.</p>';
    const recentPanel = document.getElementById('home-recent-panel'); recentPanel.innerHTML = recent.length > 0 ? recent.map(game => `<div class="game-item"><img src="${schools[game.opponentId]?.logoUrl || ''}" alt=""><div class="game-info"><div class="game-matchup">${game.matchup}</div></div><div class="game-result"><div class="game-result-status ${game.result === 'W' ? 'game-result-w' : 'game-result-l'}">${game.result}</div><div class="game-result-score">${game.userScore} - ${game.oppScore}</div></div></div>`).join('') : '<p class="text-gray-400">No recent results.</p>';
    const isOffSeason = currentWeekIndex >= WEEK_LABELS.length - 1;
    const progressionPanel = document.getElementById('home-progression-panel');
    progressionPanel.innerHTML = `<div class="text-center"><p class="text-gray-400">Current Week</p><p class="text-2xl font-bold">${WEEK_LABELS[currentWeekIndex]}</p></div><button id="advance-week-btn" class="${isOffSeason ? 'btn-warning' : 'btn-primary'} w-full">${isOffSeason ? 'Start New Season' : 'Advance Week'}</button>`;
    document.getElementById('advance-week-btn').addEventListener('click', advanceWeek);
}

// --- Schedule Page Logic ---
async function renderSchedulePage(dynastyData, coachData, schools, conferences) {
    document.getElementById('schedule-page').innerHTML = `<div class="flex justify-between items-center mb-6"><div class="flex items-center gap-4"><img id="schedule-team-logo" src="" alt="Team Logo" class="h-16 w-16 object-contain"><div><h2 id="schedule-team-name" class="text-3xl font-bold"></h2><div id="schedule-header-records" class="text-lg"></div></div></div><div><label for="season-history-select" class="text-sm text-gray-400">View Past Season:</label><select id="season-history-select" class="input-field mt-1"></select></div></div><div id="schedule-table" class="space-y-2"></div>`;
    
    const seasonHistorySelect = document.getElementById('season-history-select');
    const historyRef = collection(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}/seasonHistory`);
    const historySnap = await getDocs(historyRef);
    const pastSeasons = historySnap.docs.map(d => d.id).sort((a,b) => b-a);
    seasonHistorySelect.innerHTML = `<option value="${dynastyData.currentYear}">${dynastyData.currentYear} (Current)</option>`;
    pastSeasons.forEach(year => { seasonHistorySelect.innerHTML += `<option value="${year}">${year}</option>`; });
    seasonHistorySelect.addEventListener('change', async (e) => {
        const selectedYear = e.target.value;
        if (selectedYear == dynastyData.currentYear) {
            updateScheduleView(dynastyData, coachData, schools, conferences);
        } else {
            const pastSeasonRef = doc(historyRef, selectedYear);
            const pastSeasonSnap = await getDoc(pastSeasonRef);
            if(pastSeasonSnap.exists()) {
                const pastData = pastSeasonSnap.data();
                const pastCoachData = { teamId: pastData.teamId };
                updateScheduleView(pastData, pastCoachData, schools, conferences, true, selectedYear);
            }
        }
    });

    updateScheduleView(dynastyData, coachData, schools, conferences, false, dynastyData.currentYear);
}

function updateScheduleView(seasonData, coachData, schools, conferences, isReadOnly, year) {
    const scheduleTeamLogoEl = document.getElementById('schedule-team-logo');
    const scheduleTeamNameEl = document.getElementById('schedule-team-name');
    const scheduleHeaderRecordsEl = document.getElementById('schedule-header-records');
    const scheduleTableEl = document.getElementById('schedule-table');

    const userTeam = schools[coachData.teamId];
    scheduleTeamLogoEl.src = userTeam.logoUrl || '';
    scheduleTeamNameEl.textContent = `${year} ${userTeam.name} Schedule`;
    
    const records = calculateRecords(seasonData.schedule || []);
    scheduleHeaderRecordsEl.innerHTML = `<span class="font-bold">Overall: ${records.overall.wins}-${records.overall.losses}</span> <span class="text-gray-400 ml-4">Conf: ${records.conference.wins}-${records.conference.losses}</span>`;
    
    displaySchedule(scheduleTableEl, seasonData.schedule || [], schools, conferences, isReadOnly);
}

function displaySchedule(scheduleTableEl, scheduleData, schools, conferences, isReadOnly) {
    if (!scheduleTableEl) return; const disabledAttr = isReadOnly ? 'disabled' : '';
    const rankOptions = RANKS.map(r => `<option value="${r}">${r}</option>`).join('');
    let headerHtml = `<div class="schedule-row schedule-row-header"><div>WEEK</div><div>RANK</div><div>LOCATION</div><div>OPPONENT</div><div>OPP RANK</div><div>RESULT</div><div>SCORE</div></div>`;
    let rowsHtml = WEEK_LABELS.filter(w => w !== "Off Season").map((label, index) => { const game = scheduleData[index] || {}; const resultColorClass = game.result === 'W' ? 'result-win' : game.result === 'L' ? 'result-loss' : ''; return `<div class="schedule-row" data-week-index="${index}"><div class="schedule-week-label">${label}</div><select class="input-field rank-select user-rank" ${disabledAttr}>${rankOptions.replace(`value="${game.userRank||'NR'}"`, `value="${game.userRank||'NR'}" selected`)}</select><select class="input-field location-select" ${disabledAttr}><option value="Away" ${game.location==='Away'?'selected':''}>Away</option><option value="Home" ${game.location==='Home'?'selected':''}>Home</option><option value="Neutral" ${game.location==='Neutral'?'selected':''}>Neutral</option></select>${createCustomOpponentSelect(game.opponentId, schools, conferences, isReadOnly)}<select class="input-field rank-select opp-rank" ${disabledAttr}>${rankOptions.replace(`value="${game.oppRank||'NR'}"`, `value="${game.oppRank||'NR'}" selected`)}</select><select class="input-field result-select ${resultColorClass}" ${disabledAttr}><option value="" ${!game.result?'selected':''}>--</option><option value="W" ${game.result==='W'?'selected':''}>Win</option><option value="L" ${game.result==='L'?'selected':''}>Loss</option><option value="BYE" ${game.result==='BYE'?'selected':''}>Bye</option></select><div class="flex items-center gap-2"><input type="number" class="input-field score-input user-score" value="${game.userScore||''}" placeholder="Us" ${disabledAttr}><span>-</span><input type="number" class="input-field score-input opp-score" value="${game.oppScore||''}" placeholder="Them" ${disabledAttr}></div></div>`; }).join('');
    scheduleTableEl.innerHTML = headerHtml + rowsHtml;
    if (!isReadOnly) { scheduleTableEl.addEventListener('change', handleScheduleChange); scheduleTableEl.querySelectorAll('.custom-select-display').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); const options = el.nextElementSibling; const wasActive = options.classList.contains('active'); document.querySelectorAll('.custom-select-options.active').forEach(opt => opt.classList.remove('active')); if (!wasActive) options.classList.add('active'); })); }
}

function createCustomOpponentSelect(selectedId, schools, conferences, isReadOnly) {
    const selectedSchool = schools[selectedId] || { id: 'BYE', name: 'BYE WEEK', logoUrl: '', defaultConference: '' }; const disabledClass = isReadOnly ? 'pointer-events-none bg-gray-600' : ''; let optionsHtml = `<div class="custom-select-option" data-value="BYE">BYE WEEK</div>`;
    Object.values(schools).forEach(school => { const confKey = standardizeConfKey(school.defaultConference); const confData = conferences[confKey]; const confIndicator = confData ? `<img src="${confData.logoUrl}" alt="${confData.name}" class="h-4 w-4 ml-auto object-contain">` : ''; optionsHtml += `<div class="custom-select-option" data-value="${school.id}"><img src="${school.logoUrl || ''}" alt=""><span>${school.name}</span>${confIndicator}</div>`; });
    const selectedConfKey = standardizeConfKey(selectedSchool.defaultConference); const selectedConfData = conferences[selectedConfKey];
    const selectedConfIndicator = selectedSchool.id !== 'BYE' && selectedConfData ? `<img src="${selectedConfData.logoUrl}" alt="${selectedConfData.name}" class="h-5 w-5 ml-2 object-contain">` : '';
    const displayHtml = selectedSchool.id === 'BYE' ? `<span>BYE WEEK</span>` : `<img src="${selectedSchool.logoUrl || ''}" alt=""><span>${selectedSchool.name}</span>`;
    return `<div class="custom-select-container"><input type="hidden" class="opponent-select-value" value="${selectedId || 'BYE'}"><div class="input-field custom-select-display ${disabledClass}">${displayHtml}${selectedConfIndicator}</div><div class="custom-select-options">${optionsHtml}</div></div>`;
}

function handleScheduleChange(e) { if (e.target.classList.contains('result-select')) { const select = e.target; select.classList.remove('result-win', 'result-loss'); if (select.value === 'W') select.classList.add('result-win'); if (select.value === 'L') select.classList.add('result-loss'); } clearTimeout(scheduleSaveTimer); scheduleSaveTimer = setTimeout(saveSchedule, 1000); }
async function saveSchedule() { if (!currentDynastyId) return; const scheduleRows = document.getElementById('schedule-table').querySelectorAll('.schedule-row:not(.schedule-row-header)'); const scheduleData = Array.from(scheduleRows).map(row => ({ location: row.querySelector('.location-select').value, opponentId: row.querySelector('.opponent-select-value').value, result: row.querySelector('.result-select').value, userScore: parseInt(row.querySelector('.user-score').value) || null, oppScore: parseInt(row.querySelector('.opp-score').value) || null, userRank: row.querySelector('.user-rank').value, oppRank: row.querySelector('.opp-rank').value }));
    const dynastyRef = doc(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}`); try { await updateDoc(dynastyRef, { schedule: scheduleData }); } catch (error) { console.error("Error saving schedule:", error); }
}

// --- Calculation Functions ---
function calculateRecords(schedule) { const records = { overall: { wins: 0, losses: 0, pct: '.000' }, conference: { wins: 0, losses: 0 }, home: { wins: 0, losses: 0 }, away: { wins: 0, losses: 0 }, neutral: { wins: 0, losses: 0 }, vsTop25: { wins: 0, losses: 0 }, vsTop10: { wins: 0, losses: 0 } }; schedule.forEach(game => { const oppRank = parseInt(game.oppRank); if (game.result === 'W') { records.overall.wins++; if (currentUserConferenceTeams.includes(game.opponentId)) records.conference.wins++; if (game.location === 'Home') records.home.wins++; else if (game.location === 'Away') records.away.wins++; else if (game.location === 'Neutral') records.neutral.wins++; if (oppRank && oppRank <= 25) records.vsTop25.wins++; if (oppRank && oppRank <= 10) records.vsTop10.wins++; } else if (game.result === 'L') { records.overall.losses++; if (currentUserConferenceTeams.includes(game.opponentId)) records.conference.losses++; if (game.location === 'Home') records.home.losses++; else if (game.location === 'Away') records.away.losses++; else if (game.location === 'Neutral') records.neutral.losses++; if (oppRank && oppRank <= 25) records.vsTop25.losses++; if (oppRank && oppRank <= 10) records.vsTop10.losses++; } }); const totalGames = records.overall.wins + records.overall.losses; if (totalGames > 0) records.overall.pct = (records.overall.wins / totalGames).toFixed(3).substring(1); return records; }
function calculateTeamStats(schedule) { let pointsFor = 0, pointsAgainst = 0, gameCount = 0; schedule.forEach(game => { if (game.result === 'W' || game.result === 'L') { gameCount++; pointsFor += game.userScore || 0; pointsAgainst += game.oppScore || 0; } }); if (gameCount === 0) return { ppg: '0.0', papg: '0.0', diff: '0.0' }; const ppg = (pointsFor / gameCount).toFixed(1); const papg = (pointsAgainst / gameCount).toFixed(1); const diff = (ppg - papg).toFixed(1); return { ppg, papg, diff }; }
function getUpcomingAndRecentGames(schedule, schools, currentWeekIndex, userTeamName) {
    const playedGames = [], upcomingGames = [];
    schedule.forEach((game, index) => {
        if (game.opponentId && game.opponentId !== 'BYE') {
            const opponentName = schools[game.opponentId]?.name || 'BYE';
            const userRank = game.userRank && game.userRank !== 'NR' ? `#${game.userRank} ` : '';
            const oppRank = game.oppRank && game.oppRank !== 'NR' ? `#${game.oppRank} ` : '';
            const locationSymbol = game.location === 'Away' ? '@ ' : game.location === 'Neutral' ? 'vs ' : 'vs ';
            const matchup = game.location === 'Home' ? `${userRank}${userTeamName} vs ${oppRank}${opponentName}` : `${userRank}${userTeamName} ${locationSymbol}${oppRank}${opponentName}`;
            
            const gameData = { ...game, matchup, weekLabel: WEEK_LABELS[index], weekIndex: index };
            if (index < currentWeekIndex) {
                if(game.result === 'W' || game.result === 'L') playedGames.push(gameData);
            } else {
                upcomingGames.push(gameData);
            }
        }
    });
    return { upcoming: upcomingGames.slice(0, 3), recent: playedGames.slice(-3).reverse() };
}

// --- Season Progression ---
async function advanceWeek() {
    const btn = document.getElementById('advance-week-btn'); if (!currentDynastyId || (btn && btn.disabled)) return; const currentWeekIndex = currentDynastyData.currentWeekIndex || 0;
    if (currentWeekIndex >= WEEK_LABELS.length - 1) { showModal('confirm-advance-season-modal'); } else { if(btn) btn.disabled = true; const newWeekIndex = currentWeekIndex + 1; const dynastyRef = doc(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}`); try { await updateDoc(dynastyRef, { currentWeekIndex: newWeekIndex }); } catch (error) { console.error("Error advancing week:", error); if(btn) btn.disabled = false; } }
}

async function executeNewSeason() {
    const btn = document.getElementById('confirm-advance-season-btn'); if (!currentDynastyId || (btn && btn.disabled)) return; if(btn) btn.disabled = true;
    
    const dynastyId = currentDynastyId;
    const coachSnap = await getDocs(query(collection(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${dynastyId}`, 'coaches'), limit(1)));
    const coachTeamId = coachSnap.docs[0].data().teamId;
    
    const historyRef = doc(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${dynastyId}/seasonHistory`, String(currentDynastyData.currentYear));
    const rosterRef = collection(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${dynastyId}/roster`);
    const rosterSnap = await getDocs(rosterRef);
    const transfersOutRef = collection(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${dynastyId}/transfersOut`);
    const transfersOutSnap = await getDocs(transfersOutRef);
    const outgoingPlayers = transfersOutSnap.docs.map(d => d.data());
    const finalRosterForHistory = [...rosterSnap.docs.map(d => ({id: d.id, ...d.data()})), ...outgoingPlayers];
    await setDoc(historyRef, { schedule: currentDynastyData.schedule || [], roster: finalRosterForHistory, teamId: coachTeamId });

    const batch = writeBatch(db);
    const starToRating = { 1: 55, 2: 62, 3: 70, 4: 76, 5: 82 };
    const yearMap = { 'FR': 'SO', 'SO': 'JR', 'JR': 'SR', 'SR': 'SR' };

    const transfersInRef = collection(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${dynastyId}/transfersIn`);
    const transfersInSnap = await getDocs(transfersInRef);
    for(const transferDoc of transfersInSnap.docs) {
        const transfer = transferDoc.data();
        let nextYear = yearMap[getBaseClass(transfer.year)] || 'SR';
        if (transfer.year.includes('(RS)')) {
            nextYear += ' (RS)';
        }
        const newPlayer = {
            firstName: transfer.firstName, lastName: transfer.lastName, position: transfer.position,
            year: nextYear,
            rating: starToRating[transfer.starRating] || 68,
            height: transfer.height, weight: transfer.weight, hometown: transfer.hometown || '',
            isRedshirted: false, jersey: Math.floor(Math.random() * 99) + 1,
            transferInfo: { previousSchoolId: transfer.previousSchoolId, starRating: transfer.starRating, nationalRank: transfer.nationalRank || null, positionRank: transfer.positionRank || null }
        };
        const newPlayerRef = doc(rosterRef);
        batch.set(newPlayerRef, newPlayer);
        batch.delete(transferDoc.ref);
    }

    const recruitsRef = collection(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${dynastyId}/recruits`);
    const recruitsSnap = await getDocs(recruitsRef);
    for(const recruitDoc of recruitsSnap.docs) {
        const recruit = recruitDoc.data();
        const newPlayer = {
            firstName: recruit.firstName, lastName: recruit.lastName, position: recruit.position,
            year: 'FR', rating: starToRating[recruit.starRating] || 68, height: recruit.height,
            weight: recruit.weight, hometown: recruit.hometown, isRedshirted: false,
            jersey: Math.floor(Math.random() * 99) + 1,
            recruitInfo: { nationalRank: recruit.nationalRank || null, positionRank: recruit.positionRank || null, starRating: recruit.starRating || 0, isGem: recruit.isGem || false, isBust: recruit.isBust || false }
        };
        const newPlayerRef = doc(rosterRef);
        batch.set(newPlayerRef, newPlayer);
        batch.delete(recruitDoc.ref);
    }
    
    for (const playerDoc of rosterSnap.docs) {
        const player = playerDoc.data();
        const playerRef = playerDoc.ref;
        if (getBaseClass(player.year) === 'SR') {
            batch.delete(playerRef);
        } else {
            let nextYear = player.isRedshirted ? player.year.replace('(RS)', '').trim() + ' (RS)' : yearMap[getBaseClass(player.year)];
            batch.update(playerRef, { year: nextYear, isRedshirted: false });
        }
    }

    transfersOutSnap.forEach(doc => batch.delete(doc.ref));
    
    await batch.commit();

    const updates = { 
        currentYear: (currentDynastyData.currentYear || 2025) + 1, 
        currentWeekIndex: 0, 
        schedule: [],
        topRecruits: Array(10).fill({}),
        topClasses: Array(10).fill({}),
        topTransfers: Array(10).fill({})
    };
    const dynastyRef = doc(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${dynastyId}`);
    try {
        await updateDoc(dynastyRef, updates);
        showModal(null);
        await loadDynastyDashboard(dynastyId);
    } catch (error) {
        console.error("Error starting new season:", error);
        document.getElementById('advance-season-error').textContent = "Failed to start new season.";
        if(btn) btn.disabled = false;
    }
}

function populateInfoBox(dynastyData, coachData, schools) { const userTeam = schools[coachData.teamId]; const coachName = `${coachData.firstName.charAt(0)}. ${coachData.lastName}`; const currentWeekIndex = dynastyData.currentWeekIndex || 0; document.getElementById('info-box-coach').textContent = `${coachData.job} ${coachName}`; document.getElementById('info-box-logo').src = userTeam.logoUrl || ''; document.getElementById('info-box-team').textContent = userTeam.name; document.getElementById('info-box-year').textContent = dynastyData.currentYear || 2025; document.getElementById('info-box-week').textContent = WEEK_LABELS[currentWeekIndex]; }

// --- Event Handlers ---
document.getElementById('dynasty-view').addEventListener('click', (e) => {
    if (e.target.closest('.custom-select-option')) {
        const option = e.target.closest('.custom-select-option'); const container = option.closest('.custom-select-container'); const display = container.querySelector('.custom-select-display'); const hiddenInput = container.querySelector('.opponent-select-value');
        hiddenInput.value = option.dataset.value; const selectedSchool = schoolsDataCache[option.dataset.value] || { name: 'BYE WEEK', logoUrl: '' };
        const displayHtml = selectedSchool.id === 'BYE' ? `<span>BYE WEEK</span>` : `<img src="${selectedSchool.logoUrl || ''}" alt=""><span>${selectedSchool.name}</span>`;
        const confKey = standardizeConfKey(selectedSchool.defaultConference); const confData = conferencesDataCache[confKey]; const confIndicator = selectedSchool.id !== 'BYE' && confData ? `<img src="${confData.logoUrl}" alt="${confData.name}" class="h-5 w-5 ml-2 object-contain">` : '';
        display.innerHTML = displayHtml + confIndicator;
        hiddenInput.dispatchEvent(new Event('change', { bubbles: true })); option.parentElement.classList.remove('active');
    }
});

// --- Creation Modals & Auth Forms ---
document.getElementById('create-dynasty-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const name = document.getElementById('dynasty-name').value; if (!name) return;
    try { const schools = await fetchSchoolsData(); const confs = {}; Object.values(schools).forEach(s => { const confKey = standardizeConfKey(s.defaultConference); if (!confs[confKey]) confs[confKey] = []; confs[confKey].push(s.id); });
        const ref = collection(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties`); const docRef = await addDoc(ref, { name, userId: auth.currentUser.uid, createdAt: serverTimestamp(), currentYear: 2025, currentWeekIndex: 0, conferences: confs, topRecruits: Array(10).fill({}), topClasses: Array(10).fill({}), topTransfers: Array(10).fill({}) });
        showModal(null); currentDynastyId = docRef.id; showCoachCreationModal(Object.values(schools));
    } catch (err) { console.error("Error creating dynasty:", err); }
});

function showCoachCreationModal(schools) { let opts = '<option value="">Select...</option>'; schools.forEach(s => { opts += `<option value="${s.id}">${s.name}</option>`; }); coachAlmaMaterSelect.innerHTML = opts; coachSchoolSelect.innerHTML = opts; showModal('create-coach-modal'); }
document.getElementById('create-coach-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const data = { firstName: document.getElementById('coach-first-name').value, lastName: document.getElementById('coach-last-name').value, hometown: document.getElementById('coach-hometown').value, almaMater: coachAlmaMaterSelect.value, age: parseInt(document.getElementById('coach-age').value), job: document.getElementById('coach-job').value, teamId: coachSchoolSelect.value, createdAt: serverTimestamp() };
    if (!data.firstName || !data.teamId) return; try { const ref = collection(db, `artifacts/cfb-tracker/users/${auth.currentUser.uid}/dynasties/${currentDynastyId}/coaches`); await addDoc(ref, data); showModal(null); loadDynastyDashboard(currentDynastyId); } catch (err) { console.error("Error creating coach:", err); }
});

document.getElementById('register-form').addEventListener('submit', async (e) => { e.preventDefault(); const email = document.getElementById('register-email').value, pass = document.getElementById('register-password').value; const registerError = document.getElementById('register-error'); try { const cred = await createUserWithEmailAndPassword(auth, email, pass); await setDoc(doc(db, `artifacts/cfb-tracker/users/${cred.user.uid}/profile`, 'info'), { email: cred.user.email, createdAt: serverTimestamp(), userId: cred.user.uid }); } catch (err) { registerError.textContent = err.message; } });
document.getElementById('login-form').addEventListener('submit', async (e) => { e.preventDefault(); const email = document.getElementById('login-email').value, pass = document.getElementById('login-password').value; const loginError = document.getElementById('login-error'); try { await signInWithEmailAndPassword(auth, email, pass); } catch (err) { loginError.textContent = err.message; } });
