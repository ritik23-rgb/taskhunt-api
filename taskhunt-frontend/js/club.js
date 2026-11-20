const API = window.API_ROOT;
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user'));

if (!token || !user || user.role !== 'club') window.location.href = 'index.html';

document.getElementById('clubName').textContent = user.name;
document.getElementById('clubPosition').textContent = user.club_position || 'Club Authority';

let allEvents = [];
let allTasks = [];
let lastAttendeeData = { eventTitle: '', attendees: [] };
let selectedStars = 5;

const attendeesModal = new bootstrap.Modal(document.getElementById('attendeesModal'));
const reviewModal = new bootstrap.Modal(document.getElementById('reviewModal'));

window.setClubDeadline = function(hours) {
    const dt = new Date(Date.now() + hours * 3600000);
    document.getElementById('taskDeadline').value = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

window.switchStudio = function(mode) {
    document.getElementById('createEventForm').classList.toggle('d-none', mode !== 'event');
    document.getElementById('createTaskForm').classList.toggle('d-none', mode !== 'task');
    document.getElementById('modeEventBtn').className = mode === 'event' ? 'tab-btn active-pink justify-content-center' : 'tab-btn justify-content-center';
    document.getElementById('modeWorkBtn').className = mode === 'task' ? 'tab-btn active-emerald justify-content-center' : 'tab-btn justify-content-center';
};

window.switchWorkspace = function(ws) {
    ['events', 'tasks', 'leaderboard'].forEach(k => document.getElementById(`ws-${k}`).classList.toggle('d-none', k !== ws));
    document.getElementById('tab-events').className = ws === 'events' ? 'tab-btn active-pink' : 'tab-btn';
    document.getElementById('tab-tasks').className = ws === 'tasks' ? 'tab-btn active-emerald' : 'tab-btn';
    document.getElementById('tab-leaderboard').className = ws === 'leaderboard' ? 'tab-btn active-gold' : 'tab-btn';
    if (ws === 'leaderboard') window.loadCampusLeaderboard('clubLeaderboard', token, user.id);
};

async function loadEvents() {
    const res = await fetch(`${API}/clubs/events`, { headers: { Authorization: `Bearer ${token}` } });
    allEvents = res.ok ? await res.json() : [];
    const mine = allEvents.filter(e => Number(e.created_by) === Number(user.id));
    document.getElementById('kpiMyEvents').textContent = mine.length;
    document.getElementById('kpiTicketsSold').textContent = mine.reduce((s, e) => s + (Number(e.tickets_sold) || 0), 0);

    const el = document.getElementById('eventsContainer');
    if (!allEvents.length) {
        el.innerHTML = `<div class="col-12"><div class="empty-state"><h5 class="fw-bold">No events published yet</h5></div></div>`;
        return;
    }

    el.innerHTML = allEvents.map((ev, idx) => {
        const isMine = Number(ev.created_by) === Number(user.id);
        const sold = Number(ev.tickets_sold) || 0;
        return `
            <div class="col-md-6 anim-card" style="animation-delay:${idx * 0.05}s;">
                <div class="glass-panel glass-panel-hover p-4 h-100 d-flex flex-column ${isMine ? 'border-danger border-opacity-50' : ''}">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge rounded-pill px-3 py-1 ${isMine ? 'bg-danger bg-opacity-25 text-light' : 'bg-secondary bg-opacity-25'}">${isMine ? 'Hosted by You' : window.escapeHtml(ev.host_name || 'Club')}</span>
                        <span class="badge rounded-pill px-3 py-1 mono-font" style="background:linear-gradient(135deg,#9333ea,#ec4899);">${ev.xp_cost} XP</span>
                    </div>
                    <h5 class="fw-bold text-white mb-1">${window.escapeHtml(ev.title)}</h5>
                    <p class="small text-secondary flex-grow-1 mb-3">${window.escapeHtml(ev.description || '')}</p>
                    <div class="d-flex justify-content-between align-items-center p-2 px-3 rounded-3 bg-dark bg-opacity-50 mb-3">
                        <span class="small text-secondary">Allotted Passes</span>
                        <span class="mono-font fw-bold text-info">${sold}</span>
                    </div>
                    ${isMine ? `
                        <div class="d-flex gap-2">
                            <button class="btn btn-sm btn-neon-cyan flex-grow-1" onclick="viewAttendees(${ev.id})"><i class="bi bi-people-fill me-1"></i>Attendees & IDs (${sold})</button>
                            ${sold === 0 ? `<button class="btn btn-sm btn-outline-danger rounded-3 px-3" onclick="deleteEvent(${ev.id})"><i class="bi bi-trash3-fill"></i></button>` : ''}
                        </div>` : '<small class="text-secondary">Hosted by another GLA club</small>'}
                </div>
            </div>`;
    }).join('');
}

window.viewAttendees = async function(eventId) {
    document.getElementById('attendeesListBody').innerHTML = `<div class="text-center py-4 text-secondary">Loading allotted Ticket IDs...</div>`;
    attendeesModal.show();

    const res = await fetch(`${API}/clubs/events/${eventId}/attendees`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) {
        document.getElementById('attendeesListBody').innerHTML = `<div class="alert alert-danger mb-0">${window.escapeHtml(data.error)}</div>`;
        return;
    }

    lastAttendeeData = data;
    document.getElementById('attendeesModalTitle').textContent = `${data.eventTitle} — ${data.attendees.length} Allotted Pass${data.attendees.length === 1 ? '' : 'es'}`;

    if (!data.attendees.length) {
        document.getElementById('attendeesListBody').innerHTML = `<div class="text-center py-4 text-secondary">No students have redeemed a ticket for this event yet.</div>`;
        return;
    }

    document.getElementById('attendeesListBody').innerHTML = `
        <div class="table-responsive">
            <table class="table table-dark table-hover align-middle mb-0" style="--bs-table-bg:transparent;">
                <thead>
                    <tr class="text-secondary small">
                        <th>Allotted Ticket ID</th>
                        <th>Student Name</th>
                        <th>Roll Number</th>
                        <th>GLA Email</th>
                        <th>Redeemed At</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.attendees.map(a => `
                        <tr>
                            <td><span class="badge bg-warning bg-opacity-20 text-warning border border-warning border-opacity-50 mono-font px-3 py-2">${window.escapeHtml(a.ticket_code)}</span></td>
                            <td class="fw-bold text-white">${window.escapeHtml(a.name)}</td>
                            <td class="mono-font text-info">${window.escapeHtml(a.roll_number || '—')}</td>
                            <td class="small text-light">${window.escapeHtml(a.email)}</td>
                            <td class="small text-secondary">${new Date(a.purchased_at).toLocaleString()}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
};

window.exportAttendeesCsv = function() {
    if (!lastAttendeeData.attendees.length) return window.showAlert('No attendees to export.', 'warning');
    const header = 'Ticket ID,Student Name,Roll Number,Email,Redeemed At\n';
    const rows = lastAttendeeData.attendees.map(a =>
        `"${a.ticket_code}","${a.name}","${a.roll_number || ''}","${a.email}","${new Date(a.purchased_at).toLocaleString()}"`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${lastAttendeeData.eventTitle.replace(/\s+/g, '_')}_attendees.csv`;
    a.click();
};

window.deleteEvent = async function(id) {
    if (!confirm('Delete this event?')) return;
    const res = await fetch(`${API}/clubs/events/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) return window.showAlert(data.error, 'danger');
    window.showAlert('Event deleted.', 'info');
    loadEvents();
};

document.getElementById('createEventForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await fetch(`${API}/clubs/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
            title: document.getElementById('eventTitle').value.trim(),
            description: document.getElementById('eventDesc').value.trim(),
            xp_cost: Number(document.getElementById('eventXp').value)
        })
    });
    const data = await res.json();
    if (!res.ok) return window.showAlert(data.error, 'danger');
    window.showAlert(`🎟️ ${data.message}`, 'success');
    document.getElementById('createEventForm').reset();
    loadEvents();
    switchWorkspace('events');
});

// --- CLUB WORK & MULTI-STUDENT PROOFS ---
async function loadClubTasks() {
    const res = await fetch(`${API}/tasks/my-tasks`, { headers: { Authorization: `Bearer ${token}` } });
    allTasks = res.ok ? await res.json() : [];

    let pending = 0, closed = 0;
    allTasks.forEach(t => {
        if (t.status === 'closed') closed++;
        (t.submissions || []).forEach(s => { if (t.status === 'open' && s.status === 'submitted') pending++; });
    });
    document.getElementById('kpiPendingProofs').textContent = pending;
    document.getElementById('kpiClosedTasks').textContent = closed;

    const el = document.getElementById('clubTasksContainer');
    if (!allTasks.length) {
        el.innerHTML = `<div class="col-12"><div class="empty-state"><h5 class="fw-bold">No club work posted</h5><p class="text-secondary small mb-0">Click "Give Work" on the left to assign tasks to students.</p></div></div>`;
        return;
    }

    el.innerHTML = allTasks.map((t, idx) => {
        const subs = t.submissions || [];
        const submitted = subs.filter(s => s.status === 'submitted');
        const winnerBadge = t.status === 'closed'
            ? `<div class="alert alert-success py-2 px-3 small rounded-3 mb-2"><i class="bi bi-trophy-fill me-1"></i>Winner: <strong>${window.escapeHtml(t.winner_name || 'Student')}</strong></div>` : '';
        const listHtml = t.status === 'open'
            ? (submitted.length
                ? `<div class="d-flex flex-column gap-2 mt-2">${submitted.map((s, i) => `
                    <div class="p-2 px-3 rounded-3 d-flex justify-content-between align-items-center" style="background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.35);">
                        <div><span class="badge bg-warning text-dark me-1">#${i + 1}</span><strong class="small">${window.escapeHtml(s.student_name)}</strong> <small class="mono-font text-info">${window.escapeHtml(s.student_roll || '')}</small></div>
                        <button class="btn btn-sm btn-warning fw-bold rounded-pill px-3" onclick="openReview(${t.id}, ${s.id})">Inspect</button>
                    </div>`).join('')}</div>`
                : `<div class="small text-secondary mt-auto pt-2">${subs.length} student${subs.length === 1 ? '' : 's'} racing...</div>`)
            : '';

        return `
            <div class="col-md-6 anim-card" style="animation-delay:${idx * 0.05}s;">
                <div class="glass-panel p-4 h-100 d-flex flex-column">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        ${t.status === 'open' ? window.formatDeadlinePill(t.deadline) : '<span class="badge bg-success rounded-pill px-3">Closed</span>'}
                        <span class="badge bg-warning bg-opacity-20 text-warning mono-font">+${t.xp_reward} XP</span>
                    </div>
                    <h5 class="fw-bold text-white mb-1">${window.escapeHtml(t.title)}</h5>
                    <p class="small text-secondary mb-2">${window.escapeHtml(t.description || '')}</p>
                    ${winnerBadge}${listHtml}
                </div>
            </div>`;
    }).join('');
}

document.getElementById('createTaskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await fetch(`${API}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
            title: document.getElementById('taskTitle').value.trim(),
            description: document.getElementById('taskDesc').value.trim(),
            xp_reward: Number(document.getElementById('taskXp').value),
            deadline: document.getElementById('taskDeadline').value
        })
    });
    const data = await res.json();
    if (!res.ok) return window.showAlert(data.error, 'danger');
    window.showAlert(`⚡ ${data.message}`, 'success');
    document.getElementById('createTaskForm').reset();
    setClubDeadline(24);
    await loadClubTasks();
    switchWorkspace('tasks');
});

window.setStars = function(v) {
    selectedStars = v;
    document.querySelectorAll('#starPicker .star-btn').forEach(b => b.classList.toggle('lit', Number(b.dataset.v) <= v));
};

window.openReview = function(taskId, subId) {
    const task = allTasks.find(t => Number(t.id) === Number(taskId));
    const sub = task && (task.submissions || []).find(s => Number(s.id) === Number(subId));
    if (!task || !sub) return;
    document.getElementById('revSubId').value = sub.id;
    document.getElementById('revTitle').textContent = task.title;
    document.getElementById('revMeta').textContent = `${sub.student_name} (${sub.student_roll || sub.student_email})`;
    document.getElementById('revImg').src = sub.proof_image || '';
    document.getElementById('revNote').textContent = sub.proof_note || 'No note provided.';
    document.getElementById('revXp').textContent = `+${task.xp_reward} XP`;
    document.getElementById('revFeedback').value = '';
    setStars(5);
    reviewModal.show();
};

window.approveWinner = async function() {
    const subId = document.getElementById('revSubId').value;
    const res = await fetch(`${API}/tasks/submissions/${subId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ quality_rating: selectedStars, review_note: document.getElementById('revFeedback').value.trim() })
    });
    const data = await res.json();
    if (!res.ok) return window.showAlert(data.error, 'danger');
    reviewModal.hide();
    window.triggerCelebration();
    window.showAlert(`🏆 ${data.message}`, 'success');
    loadClubTasks();
};

window.rejectSubmission = async function() {
    const subId = document.getElementById('revSubId').value;
    const res = await fetch(`${API}/tasks/submissions/${subId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ review_note: document.getElementById('revFeedback').value.trim() })
    });
    const data = await res.json();
    if (!res.ok) return window.showAlert(data.error, 'danger');
    reviewModal.hide();
    window.showAlert(`↩️ ${data.message}`, 'warning');
    loadClubTasks();
};

window.syncAll = async function(toast = false) {
    await Promise.all([loadEvents(), loadClubTasks()]);
    if (toast) window.showAlert('Club Hub synced!', 'info');
};

window.logout = function() { localStorage.clear(); window.location.href = 'index.html'; };

setClubDeadline(24);
syncAll();