const API = window.API_ROOT;
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user'));

if (!token || !user || user.role !== 'teacher') window.location.href = 'index.html';

document.getElementById('teacherName').textContent = user.name;
document.getElementById('teacherMeta').textContent = [user.faculty_id, user.department].filter(Boolean).join(' · ') || user.email;

let tasksCache = [];
let selectedStars = 5;
const reviewModal = new bootstrap.Modal(document.getElementById('reviewModal'));

window.setQuickDeadline = function(hours) {
    const dt = new Date(Date.now() + hours * 3600000);
    const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    document.getElementById('taskDeadline').value = local;
};

window.switchView = function(view) {
    document.getElementById('view-missions').classList.toggle('d-none', view !== 'missions');
    document.getElementById('view-leaderboard').classList.toggle('d-none', view !== 'leaderboard');
    document.getElementById('tab-missions').className = view === 'missions' ? 'tab-btn active-emerald' : 'tab-btn';
    document.getElementById('tab-leaderboard').className = view === 'leaderboard' ? 'tab-btn active-gold' : 'tab-btn';
    if (view === 'leaderboard') window.loadCampusLeaderboard('teacherLeaderboard', token, user.id);
};

window.loadMyTasks = async function(toast = false) {
    const res = await fetch(`${API}/tasks/my-tasks`, { headers: { Authorization: `Bearer ${token}` } });
    tasksCache = res.ok ? await res.json() : [];

    let pending = 0, active = 0, closed = 0, totalSubs = 0;
    tasksCache.forEach(t => {
        if (t.status === 'open') active++; else closed++;
        (t.submissions || []).forEach(s => {
            totalSubs++;
            if (t.status === 'open' && s.status === 'submitted') pending++;
        });
    });

    document.getElementById('kpiPending').textContent = pending;
    document.getElementById('kpiActive').textContent = active;
    document.getElementById('kpiClosed').textContent = closed;
    document.getElementById('kpiTotalSubs').textContent = totalSubs;

    renderTasks();
    if (toast) window.showAlert('Faculty queue synced!', 'info');
};

function renderTasks() {
    const el = document.getElementById('myTasksContainer');
    if (!tasksCache.length) {
        el.innerHTML = `<div class="col-12"><div class="empty-state"><i class="bi bi-inbox fs-1 text-secondary d-block mb-2"></i><h5 class="fw-bold">No active tasks</h5><p class="text-secondary small mb-0">Assign work with a deadline on the left. Completed tasks clear automatically after 2 days.</p></div></div>`;
        return;
    }

    el.innerHTML = tasksCache.map((t, idx) => {
        const subs = t.submissions || [];
        const submittedList = subs.filter(s => s.status === 'submitted');
        const winnerBadge = t.status === 'closed'
            ? `<div class="alert alert-success py-2 px-3 small rounded-3 mb-2"><i class="bi bi-trophy-fill me-1"></i>Winner: <strong>${window.escapeHtml(t.winner_name || 'Student')}</strong> (${window.escapeHtml(t.winner_roll || '')})</div>` : '';

        const subHtml = t.status === 'open'
            ? (submittedList.length
                ? `<div class="mt-2 d-flex flex-column gap-2">${submittedList.map((s, i) => `
                    <div class="p-2 px-3 rounded-3 d-flex justify-content-between align-items-center gap-2" style="background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.35);">
                        <div>
                            <span class="badge bg-warning text-dark me-1">#${i + 1} ${i === 0 ? 'First' : ''}</span>
                            <strong class="small text-white">${window.escapeHtml(s.student_name)}</strong>
                            <small class="mono-font text-info ms-1">${window.escapeHtml(s.student_roll || '')}</small>
                        </div>
                        <button class="btn btn-sm btn-warning fw-bold rounded-pill px-3" onclick="openReview(${t.id}, ${s.id})">Inspect</button>
                    </div>`).join('')}</div>`
                : `<div class="small text-secondary mt-auto pt-2"><i class="bi bi-people me-1"></i>${subs.length} student${subs.length === 1 ? '' : 's'} accepted · Waiting for proofs...</div>`)
            : '';

        return `
            <div class="col-md-6 anim-card" style="animation-delay:${idx * 0.05}s;">
                <div class="glass-panel p-4 h-100 d-flex flex-column ${submittedList.length && t.status === 'open' ? 'border-warning' : ''}">
                    <div class="d-flex justify-content-between align-items-center gap-2 mb-2">
                        ${t.status === 'open' ? window.formatDeadlinePill(t.deadline) : '<span class="badge bg-success rounded-pill px-3">Completed</span>'}
                        <span class="badge bg-warning bg-opacity-20 text-warning mono-font">+${t.xp_reward} XP</span>
                    </div>
                    <h5 class="fw-bold text-white mb-1">${window.escapeHtml(t.title)}</h5>
                    <p class="small text-secondary mb-2">${window.escapeHtml(t.description || '')}</p>
                    ${winnerBadge}
                    ${subHtml}
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
    window.showAlert(`🚀 ${data.message}`, 'success');
    document.getElementById('createTaskForm').reset();
    setQuickDeadline(24);
    loadMyTasks();
});

window.setStars = function(v) {
    selectedStars = v;
    document.querySelectorAll('#starPicker .star-btn').forEach(b => b.classList.toggle('lit', Number(b.dataset.v) <= v));
};

window.openReview = function(taskId, subId) {
    const task = tasksCache.find(t => Number(t.id) === Number(taskId));
    const sub = task && (task.submissions || []).find(s => Number(s.id) === Number(subId));
    if (!task || !sub) return;
    document.getElementById('revSubId').value = sub.id;
    document.getElementById('revTitle').textContent = task.title;
    document.getElementById('revMeta').textContent = `${sub.student_name} (${sub.student_roll || sub.student_email}) · Submitted ${new Date(sub.submitted_at).toLocaleString()}`;
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
    loadMyTasks();
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
    loadMyTasks();
};

window.logout = function() { localStorage.clear(); window.location.href = 'index.html'; };

setQuickDeadline(24);
loadMyTasks();