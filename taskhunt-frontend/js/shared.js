// Single API URL for the whole app (change only this line when deploying to Render!)
window.API_ROOT = 'https://taskhunt-api-1rq5.onrender.com/';

window.escapeHtml = function(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
};

window.escapeAttr = function(str) {
    return window.escapeHtml(str).replace(/'/g, '&#39;');
};

window.renderStars = function(rating) {
    const n = Number(rating) || 0;
    let html = '';
    for (let i = 1; i <= 5; i++) {
        html += i <= n
            ? '<i class="bi bi-star-fill text-warning"></i>'
            : '<i class="bi bi-star text-secondary"></i>';
    }
    return html;
};

window.getRankBadge = function(xp) {
    const val = Number(xp) || 0;
    if (val >= 2000) return 'Campus Legend';
    if (val >= 1000) return 'XP Warrior';
    if (val >= 500) return 'Quest Hunter';
    return 'Campus Explorer';
};

window.formatDeadlinePill = function(deadlineStr) {
    if (!deadlineStr) return '';
    const diffMs = new Date(deadlineStr) - new Date();
    if (diffMs <= 0) {
        return `<span class="deadline-pill deadline-urgent"><i class="bi bi-alarm-fill"></i>Expired</span>`;
    }
    const mins = Math.floor(diffMs / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    let label = days > 0 ? `${days}d ${hrs % 24}h left` : hrs > 0 ? `${hrs}h ${mins % 60}m left` : `${mins}m left`;
    const cls = hrs < 6 ? 'deadline-urgent' : 'deadline-ok';
    return `<span class="deadline-pill ${cls}"><i class="bi bi-clock-fill"></i>${label}</span>`;
};

window.triggerCelebration = function() {
    if (typeof confetti === 'function') {
        confetti({ particleCount: 75, spread: 70, origin: { y: 0.65 } });
    }
};

window.copyText = function(text) {
    navigator.clipboard.writeText(text).then(() => {
        window.showAlert(`Copied "${text}" to clipboard!`, 'info');
    });
};

let _alertTimer;
window.showAlert = function(message, type = 'info') {
    const box = document.getElementById('alertBox');
    if (!box) return;
    const styles = {
        success: 'background: rgba(16, 185, 129, 0.94); color: #fff; border: 1px solid #34d399;',
        danger: 'background: rgba(239, 68, 68, 0.94); color: #fff; border: 1px solid #f87171;',
        warning: 'background: rgba(245, 158, 11, 0.96); color: #111827; border: 1px solid #fbbf24;',
        info: 'background: rgba(59, 130, 246, 0.94); color: #fff; border: 1px solid #60a5fa;'
    };
    box.textContent = message;
    box.style.cssText = styles[type] || styles.info;
    box.className = 'alert anim-card';
    box.classList.remove('d-none');
    clearTimeout(_alertTimer);
    _alertTimer = setTimeout(() => box.classList.add('d-none'), 3800);
};

// Shared Compulsory Campus Rank Board Renderer (Used on Student, Teacher & Club Dashboards)
window.loadCampusLeaderboard = async function(containerId, token, currentUserId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
        const res = await fetch(`${window.API_ROOT}/auth/leaderboard`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const leaders = await res.json();
        if (!res.ok) throw new Error(leaders.error || 'Failed to load leaderboard');

        if (!leaders.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-trophy fs-1 text-warning d-block mb-2"></i>
                    <h5 class="fw-bold">Rank Board is Ready!</h5>
                    <p class="text-secondary small mb-0">Students who complete tasks and earn XP will climb here live.</p>
                </div>`;
            return;
        }

        const top3 = leaders.slice(0, 3);
        const medals = ['🥇 #1 Champion', '🥈 #2 Runner-Up', '🥉 #3 Top Hunter'];
        const podiumOrder = top3.length === 3 ? [1, 0, 2] : top3.map((_, i) => i);

        const podiumHtml = podiumOrder.map(idx => {
            const s = top3[idx];
            if (!s) return '';
            const isMe = Number(s.id) === Number(currentUserId);
            return `
                <div class="col-md-4 anim-card" style="animation-delay: ${idx * 0.08}s;">
                    <div class="podium-card podium-${idx + 1} h-100">
                        <div class="badge bg-dark bg-opacity-50 rounded-pill px-3 py-1 mb-2 fw-bold">${medals[idx]}</div>
                        <h5 class="fw-bold text-white mb-1">${window.escapeHtml(s.name)} ${isMe ? '<span class="badge bg-info text-dark ms-1">You</span>' : ''}</h5>
                        <div class="mono-font small text-info mb-2">${window.escapeHtml(s.roll_number || 'GLA Student')}</div>
                        <div class="fs-2 fw-bold mono-font text-warning">${Number(s.xp || 0).toLocaleString()} XP</div>
                        <div class="small text-secondary mt-1">
                            ${window.getRankBadge(s.xp)} · ${s.completed_tasks || 0} wins
                            ${s.avg_quality ? ` · <span class="text-warning">${s.avg_quality}★</span>` : ''}
                        </div>
                    </div>
                </div>`;
        }).join('');

        const rowsHtml = leaders.map((s, i) => {
            const isMe = Number(s.id) === Number(currentUserId);
            return `
                <tr class="${isMe ? 'rank-row-me' : ''}">
                    <td class="mono-font fw-bold ${i < 3 ? 'text-warning' : 'text-secondary'}">#${i + 1}</td>
                    <td>
                        <div class="fw-bold text-white">${window.escapeHtml(s.name)} ${isMe ? '<span class="badge bg-info text-dark ms-1">You</span>' : ''}</div>
                        <small class="text-secondary">${window.getRankBadge(s.xp)}</small>
                    </td>
                    <td class="mono-font text-info small">${window.escapeHtml(s.roll_number || '—')}</td>
                    <td class="text-light">${s.completed_tasks || 0}</td>
                    <td class="text-warning fw-semibold">${s.avg_quality ? `${s.avg_quality} ★` : '—'}</td>
                    <td class="text-end mono-font fw-bold text-warning fs-6">${Number(s.xp || 0).toLocaleString()} XP</td>
                </tr>`;
        }).join('');

        container.innerHTML = `
            <div class="row g-3 mb-4 align-items-end">${podiumHtml}</div>
            <div class="glass-panel p-3 p-md-4 anim-card">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h5 class="fw-bold mb-0"><i class="bi bi-bar-chart-steps text-warning me-2"></i>GLA Campus XP Standings</h5>
                    <span class="badge bg-warning bg-opacity-20 text-warning rounded-pill px-3 py-2">Top ${leaders.length} Students</span>
                </div>
                <div class="table-responsive">
                    <table class="table table-dark table-hover align-middle mb-0" style="--bs-table-bg: transparent;">
                        <thead>
                            <tr class="text-secondary small">
                                <th>Rank</th>
                                <th>Student</th>
                                <th>Roll No.</th>
                                <th>Tasks Won</th>
                                <th>Avg Quality</th>
                                <th class="text-end">Total XP</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            </div>`;
    } catch (err) {
        container.innerHTML = `<div class="alert alert-danger">${window.escapeHtml(err.message)}</div>`;
    }
};