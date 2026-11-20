const API = window.API_ROOT;
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user'));

if (!token || !user || user.role !== 'student') window.location.href = 'index.html';

let allTasks = [];
let myHistory = [];
let allEvents = [];
let myTickets = [];
let compressedProof = '';

const proofModal = new bootstrap.Modal(document.getElementById('proofModal'));
const imageViewerModal = new bootstrap.Modal(document.getElementById('imageViewerModal'));

function renderProfile() {
    const xp = Number(user.xp) || 0;
    const level = Math.floor(xp / 500) + 1;
    const prog = xp % 500;
    document.getElementById('studentName').textContent = user.name;
    document.getElementById('studentRollTop').textContent = user.roll_number || user.email;
    document.getElementById('heroStudentName').textContent = user.name.split(' ')[0];
    document.getElementById('xpWallet').textContent = xp;
    document.getElementById('playerLevel').textContent = level;
    document.getElementById('playerRank').textContent = window.getRankBadge(xp);
    document.getElementById('levelProgressText').textContent = `${prog} / 500 XP`;
    document.getElementById('levelProgressBar').style.width = `${(prog / 500) * 100}%`;
}

async function syncStats() {
    const res = await fetch(`${API}/tasks/student-stats`, { headers: { Authorization: `Bearer ${token}` } });
    const s = await res.json();
    if (!res.ok) return;
    user.xp = s.xp;
    if (s.roll_number) user.roll_number = s.roll_number;
    localStorage.setItem('user', JSON.stringify(user));
    renderProfile();
    document.getElementById('activeQuestsCount').textContent = s.active_count;
    document.getElementById('completedTasksLabel').textContent = `${s.completed_count} tasks won`;
    document.getElementById('campusRankNum').textContent = s.campus_rank || 1;
    document.getElementById('avgQualityRate').textContent = s.avg_quality ? `${s.avg_quality} / 5.0 ★` : 'No ratings yet';
}

window.switchSection = function(sec) {
    ['bounties', 'history', 'store', 'leaderboard'].forEach(k => {
        document.getElementById(`sec-${k}`).classList.toggle('d-none', k !== sec);
    });
    document.getElementById('tab-bounties').className = sec === 'bounties' ? 'tab-btn active-blue' : 'tab-btn';
    document.getElementById('tab-history').className = sec === 'history' ? 'tab-btn active-emerald' : 'tab-btn';
    document.getElementById('tab-store').className = sec === 'store' ? 'tab-btn active-pink' : 'tab-btn';
    document.getElementById('tab-leaderboard').className = sec === 'leaderboard' ? 'tab-btn active-gold' : 'tab-btn';
    if (sec === 'leaderboard') window.loadCampusLeaderboard('leaderboardContainer', token, user.id);
};

async function loadTasks() {
    const res = await fetch(`${API}/tasks`, { headers: { Authorization: `Bearer ${token}` } });
    allTasks = res.ok ? await res.json() : [];
    document.getElementById('badge-bounties').textContent = allTasks.length;
    renderTasks();
}

function renderTasks() {
    const q = document.getElementById('searchInput').value.trim().toLowerCase();
    const list = allTasks.filter(t => t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q));
    const el = document.getElementById('tasksContainer');

    if (!list.length) {
        el.innerHTML = `<div class="col-12"><div class="empty-state"><i class="bi bi-compass fs-1 text-info d-block mb-2"></i><h5 class="fw-bold">No active bounties right now</h5><p class="text-secondary small mb-0">Check back soon for new faculty or club work!</p></div></div>`;
        return;
    }

    el.innerHTML = list.map((t, idx) => {
        const joined = Number(t.already_accepted) > 0;
        const racers = Number(t.competitor_count) || 0;
        return `
            <div class="col-md-6 col-lg-4 anim-card" style="animation-delay:${idx * 0.05}s;">
                <div class="glass-panel glass-panel-hover p-4 h-100 d-flex flex-column">
                    <div class="d-flex justify-content-between align-items-center gap-2 mb-2">
                        ${window.formatDeadlinePill(t.deadline)}
                        <span class="badge rounded-pill px-3 py-1 mono-font text-dark fw-bold" style="background:linear-gradient(135deg,#f59e0b,#f97316);">+${t.xp_reward} XP</span>
                    </div>
                    <h5 class="fw-bold text-white mt-1 mb-1">${window.escapeHtml(t.title)}</h5>
                    <small class="text-info mb-2"><i class="bi bi-person-badge me-1"></i>By ${window.escapeHtml(t.creator_name || 'Faculty')}</small>
                    <p class="small text-secondary flex-grow-1 mb-3" style="color:#cbd5e1 !important;">${window.escapeHtml(t.description || '')}</p>
                    <div class="small text-warning mb-3"><i class="bi bi-fire me-1"></i>${racers} student${racers === 1 ? '' : 's'} racing · First approved wins!</div>
                    ${joined
                        ? `<button class="btn btn-neon-emerald w-100" onclick="switchSection('history')"><i class="bi bi-camera-fill me-1"></i>Already Accepted — Upload Proof</button>`
                        : `<button class="btn btn-neon-cyan w-100" onclick="claimTask(${t.id})"><i class="bi bi-hand-index-thumb-fill me-1"></i>Accept Task</button>`}
                </div>
            </div>`;
    }).join('');
}

window.claimTask = async function(taskId) {
    const res = await fetch(`${API}/tasks/${taskId}/claim`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) return window.showAlert(data.error, 'danger');
    window.showAlert(`🎯 ${data.message}`, 'success');
    await Promise.all([loadTasks(), loadHistory(), syncStats()]);
    switchSection('history');
};

async function loadHistory() {
    const res = await fetch(`${API}/tasks/my-history`, { headers: { Authorization: `Bearer ${token}` } });
    myHistory = res.ok ? await res.json() : [];
    document.getElementById('badge-history').textContent = myHistory.length;
    renderHistory();
}

function renderHistory() {
    const q = document.getElementById('searchInput').value.trim().toLowerCase();
    const list = myHistory.filter(t => t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q));
    const el = document.getElementById('historyContainer');

    if (!list.length) {
        el.innerHTML = `<div class="col-12"><div class="empty-state"><i class="bi bi-clipboard2-check fs-1 text-success d-block mb-2"></i><h5 class="fw-bold">No active quests in your 2-day history</h5><button class="btn btn-neon-cyan rounded-pill px-4 mt-2" onclick="switchSection('bounties')">Browse Bounties</button></div></div>`;
        return;
    }

    el.innerHTML = list.map((t, idx) => {
        const st = t.submission_status;
        const expired = t.deadline && new Date(t.deadline) <= new Date();
        let badge = '', action = '';

        const proofHtml = t.proof_image && t.proof_image.startsWith('data:image/')
            ? `<div class="mb-3"><img src="${t.proof_image}" class="proof-thumb" onclick="openViewer('${window.escapeAttr(t.title)}', this.src)"></div>` : '';

        if (st === 'approved') {
            badge = `<span class="badge bg-success rounded-pill px-3 py-1"><i class="bi bi-trophy-fill me-1"></i>Winner · +${t.xp_reward} XP</span>`;
            action = `<div class="p-2 px-3 rounded-3 mt-auto" style="background:rgba(245,158,11,0.14); border:1px solid rgba(251,191,36,0.4);">
                <div class="d-flex justify-content-between small fw-bold"><span>Quality Rate</span><span class="text-warning">${window.renderStars(t.quality_rating)} (${t.quality_rating || 5}/5)</span></div>
                ${t.review_note ? `<small class="text-light d-block mt-1">"${window.escapeHtml(t.review_note)}"</small>` : ''}
            </div>`;
        } else if (st === 'closed_other_won') {
            badge = `<span class="badge bg-secondary rounded-pill px-3 py-1"><i class="bi bi-x-circle me-1"></i>Closed (Other Student Won)</span>`;
            action = `<div class="small text-secondary bg-dark bg-opacity-50 rounded-3 p-2 mt-auto">Winner: <strong class="text-light">${window.escapeHtml(t.winner_name || 'Another student')}</strong> got approved first.</div>`;
        } else if (st === 'submitted') {
            badge = `<span class="badge bg-warning text-dark rounded-pill px-3 py-1"><i class="bi bi-hourglass-split me-1"></i>Proof Under Review</span>`;
            action = `<div class="small text-warning bg-warning bg-opacity-10 rounded-3 p-2 text-center mt-auto">Waiting for ${window.escapeHtml(t.creator_name || 'Authority')} approval...</div>`;
        } else if (expired) {
            badge = `<span class="badge bg-danger rounded-pill px-3 py-1">Deadline Expired</span>`;
            action = `<div class="small text-danger bg-danger bg-opacity-10 rounded-3 p-2 text-center mt-auto">Missed deadline. Clears automatically after 2 days.</div>`;
        } else if (st === 'rejected') {
            badge = `<span class="badge bg-danger rounded-pill px-3 py-1">Resubmit Proof</span>`;
            action = `<div class="small text-danger bg-danger bg-opacity-10 rounded-3 p-2 mb-2"><strong>Note:</strong> ${window.escapeHtml(t.review_note || 'Upload clearer proof.')}</div>
                <button class="btn btn-neon-emerald w-100 mt-auto" onclick="openProofModal(${t.task_id}, '${window.escapeAttr(t.title)}')"><i class="bi bi-arrow-repeat me-1"></i>Re-upload Image Proof</button>`;
        } else {
            badge = `<span class="badge bg-info text-dark rounded-pill px-3 py-1">In Progress</span>`;
            action = `<button class="btn btn-neon-emerald w-100 mt-auto" onclick="openProofModal(${t.task_id}, '${window.escapeAttr(t.title)}')"><i class="bi bi-camera-fill me-1"></i>Upload Image Proof</button>`;
        }

        return `
            <div class="col-md-6 col-lg-4 anim-card" style="animation-delay:${idx * 0.05}s;">
                <div class="glass-panel p-4 h-100 d-flex flex-column">
                    <div class="d-flex justify-content-between align-items-center gap-2 mb-2">${badge}${window.formatDeadlinePill(t.deadline)}</div>
                    <h5 class="fw-bold text-white mt-1 mb-2">${window.escapeHtml(t.title)}</h5>
                    <p class="small text-secondary mb-3">${window.escapeHtml(t.description || '')}</p>
                    ${proofHtml}
                    ${action}
                </div>
            </div>`;
    }).join('');
}

window.openProofModal = function(taskId, title) {
    compressedProof = '';
    document.getElementById('proofTaskId').value = taskId;
    document.getElementById('proofModalTaskTitle').textContent = title;
    document.getElementById('proofUploadForm').reset();
    document.getElementById('proofPreviewImg').classList.add('d-none');
    document.getElementById('uploadPlaceholder').classList.remove('d-none');
    proofModal.show();
};

document.getElementById('proofFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, 900 / img.width);
            const canvas = document.createElement('canvas');
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            compressedProof = canvas.toDataURL('image/jpeg', 0.75);
            const preview = document.getElementById('proofPreviewImg');
            preview.src = compressedProof;
            preview.classList.remove('d-none');
            document.getElementById('uploadPlaceholder').classList.add('d-none');
        };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
});

document.getElementById('proofUploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!compressedProof) return window.showAlert('Select an image proof first.', 'danger');
    const taskId = document.getElementById('proofTaskId').value;
    const proof_note = document.getElementById('proofNoteInput').value.trim();
    const btn = document.getElementById('submitProofBtn');
    btn.disabled = true; btn.textContent = 'Uploading...';

    try {
        const res = await fetch(`${API}/tasks/${taskId}/submit-proof`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ proof_image: compressedProof, proof_note })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        proofModal.hide();
        window.showAlert(`📸 ${data.message}`, 'success');
        await Promise.all([loadHistory(), syncStats()]);
    } catch (err) {
        window.showAlert(err.message, 'danger');
    } finally {
        btn.disabled = false; btn.textContent = 'Send Proof Now';
    }
});

window.openViewer = function(title, src) {
    document.getElementById('viewerTitle').textContent = title;
    document.getElementById('viewerImg').src = src;
    imageViewerModal.show();
};

// --- TICKET STORE & MY VIP PASSES ---
async function loadStoreAndPasses() {
    const [evRes, tkRes] = await Promise.all([
        fetch(`${API}/clubs/events`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/clubs/my-tickets`, { headers: { Authorization: `Bearer ${token}` } })
    ]);
    allEvents = evRes.ok ? await evRes.json() : [];
    myTickets = tkRes.ok ? await tkRes.json() : [];
    document.getElementById('badge-passes').textContent = myTickets.length;
    renderMyPasses();
    renderEvents();
}

function renderMyPasses() {
    const el = document.getElementById('myPassesBlock');
    if (!myTickets.length) {
        el.innerHTML = '';
        return;
    }
    el.innerHTML = `
        <h4 class="fw-bold mb-3"><i class="bi bi-patch-check-fill text-warning me-2"></i>My Allotted VIP Passes</h4>
        <div class="row g-3">
            ${myTickets.map(tk => `
                <div class="col-md-6 col-lg-4 anim-card">
                    <div class="vip-pass-card h-100">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <span class="badge bg-warning text-dark rounded-pill px-3 fw-bold">CONFIRMED PASS</span>
                            <small class="text-light opacity-75">${window.escapeHtml(tk.host_name || 'Campus Club')}</small>
                        </div>
                        <h5 class="fw-bold text-white mb-1">${window.escapeHtml(tk.event_title)}</h5>
                        <p class="small text-light opacity-75 mb-3">${window.escapeHtml(user.name)} · ${window.escapeHtml(user.roll_number || '')}</p>
                        <div class="ticket-id-box">
                            <div>
                                <div class="text-secondary" style="font-size:0.68rem;">ALLOTTED TICKET ID</div>
                                <div class="mono-font fw-bold text-warning fs-6">${window.escapeHtml(tk.ticket_code)}</div>
                            </div>
                            <button class="btn btn-sm btn-outline-warning rounded-pill px-3" onclick="copyText('${window.escapeAttr(tk.ticket_code)}')">
                                <i class="bi bi-clipboard-check"></i> Copy
                            </button>
                        </div>
                    </div>
                </div>`).join('')}
        </div>`;
}

function renderEvents() {
    const q = document.getElementById('searchInput').value.trim().toLowerCase();
    const list = allEvents.filter(e => e.title.toLowerCase().includes(q) || (e.description || '').toLowerCase().includes(q));
    const el = document.getElementById('eventsContainer');

    if (!list.length) {
        el.innerHTML = `<div class="col-12"><div class="empty-state"><i class="bi bi-ticket-perforated fs-1 text-danger d-block mb-2"></i><h5 class="fw-bold">No campus events yet</h5></div></div>`;
        return;
    }

    const myXp = Number(user.xp) || 0;
    el.innerHTML = list.map((ev, idx) => {
        const redeemedCode = ev.my_ticket_code;
        const canAfford = myXp >= Number(ev.xp_cost);
        let btnHtml = '';
        if (redeemedCode) {
            btnHtml = `<button class="btn btn-outline-success w-100 fw-bold" disabled><i class="bi bi-check-circle-fill me-1"></i>Redeemed (${window.escapeHtml(redeemedCode)})</button>`;
        } else if (canAfford) {
            btnHtml = `<button class="btn btn-neon-primary w-100" onclick="buyTicket(${ev.id})"><i class="bi bi-ticket-perforated-fill me-1"></i>Redeem VIP Pass (${ev.xp_cost} XP)</button>`;
        } else {
            btnHtml = `<button class="btn btn-outline-secondary w-100" disabled><i class="bi bi-lock-fill me-1"></i>Need ${ev.xp_cost - myXp} More XP</button>`;
        }

        return `
            <div class="col-md-6 col-lg-4 anim-card" style="animation-delay:${idx * 0.05}s;">
                <div class="glass-panel glass-panel-hover p-4 h-100 d-flex flex-column">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-danger bg-opacity-25 text-light rounded-pill px-3 py-1">${window.escapeHtml(ev.host_name || 'Campus Club')}</span>
                        <span class="badge rounded-pill px-3 py-1 mono-font" style="background:linear-gradient(135deg,#9333ea,#ec4899);">${ev.xp_cost} XP</span>
                    </div>
                    <h5 class="fw-bold text-white mt-1 mb-2">${window.escapeHtml(ev.title)}</h5>
                    <p class="small text-secondary flex-grow-1 mb-3">${window.escapeHtml(ev.description || '')}</p>
                    <small class="text-info mb-3"><i class="bi bi-shield-lock me-1"></i>Limit: 1 unique Ticket ID per student</small>
                    ${btnHtml}
                </div>
            </div>`;
    }).join('');
}

window.buyTicket = async function(eventId) {
    const res = await fetch(`${API}/clubs/events/${eventId}/buy`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) return window.showAlert(data.error, 'danger');
    window.triggerCelebration();
    window.showAlert(`🎟️ ${data.message}`, 'success');
    user.xp = data.remainingXp;
    localStorage.setItem('user', JSON.stringify(user));
    renderProfile();
    await loadStoreAndPasses();
};

document.getElementById('searchInput').addEventListener('input', () => { renderTasks(); renderHistory(); renderEvents(); });

window.refreshAll = async function() {
    await Promise.all([syncStats(), loadTasks(), loadHistory(), loadStoreAndPasses()]);
    window.showAlert('Arena synced!', 'info');
};

window.logout = function() { localStorage.clear(); window.location.href = 'index.html'; };

renderProfile();
syncStats();
loadTasks();
loadHistory();
loadStoreAndPasses();