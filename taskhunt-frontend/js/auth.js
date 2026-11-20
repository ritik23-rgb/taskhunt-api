const AUTH_API = `${window.API_ROOT}/auth`;

window.switchAuthTab = function(tab) {
    const loginForm = document.getElementById('loginForm');
    const regForm = document.getElementById('registerForm');
    const loginBtn = document.getElementById('loginTabBtn');
    const regBtn = document.getElementById('registerTabBtn');
    const heading = document.getElementById('authHeading');
    const subtext = document.getElementById('authSubtext');

    hideInlineAlert();

    if (tab === 'login') {
        loginForm.classList.remove('d-none');
        regForm.classList.add('d-none');
        loginBtn.classList.add('active');
        regBtn.classList.remove('active');
        heading.textContent = 'Welcome Back!';
        subtext.textContent = 'Sign in with your @gla.ac.in account';
    } else {
        loginForm.classList.add('d-none');
        regForm.classList.remove('d-none');
        loginBtn.classList.remove('active');
        regBtn.classList.add('active');
        heading.textContent = 'Create Your GLA Account';
        subtext.textContent = 'First choose how you want to join TaskHunt';
    }
};

window.selectJoinRole = function(role) {
    document.getElementById('regRole').value = role;
    document.querySelectorAll('.role-choice-card').forEach(c => c.classList.remove('selected'));
    document.getElementById(`roleCard-${role}`).classList.add('selected');

    document.getElementById('roleFieldsWrapper').classList.remove('d-none');

    const rollGroup = document.getElementById('studentRollGroup');
    const teacherGroup = document.getElementById('teacherFieldsGroup');
    const clubGroup = document.getElementById('clubFieldsGroup');
    const banner = document.getElementById('roleConditionBanner');
    const nameLabel = document.getElementById('regNameLabel');
    const nameInput = document.getElementById('regName');

    rollGroup.classList.add('d-none');
    teacherGroup.classList.add('d-none');
    clubGroup.classList.add('d-none');

    document.getElementById('regRollNumber').required = false;
    document.getElementById('regFacultyId').required = false;
    document.getElementById('regClubPosition').required = false;

    if (role === 'student') {
        rollGroup.classList.remove('d-none');
        document.getElementById('regRollNumber').required = true;
        nameLabel.textContent = 'Student Full Name *';
        nameInput.placeholder = 'e.g., Ritik Kumar';
        banner.innerHTML = '<strong>Student Condition:</strong> Requires your official <code>@gla.ac.in</code> email & University Roll Number.';
    } else if (role === 'teacher') {
        teacherGroup.classList.remove('d-none');
        document.getElementById('regFacultyId').required = true;
        nameLabel.textContent = 'Professor / Teacher Full Name *';
        nameInput.placeholder = 'e.g., Dr. Anil Kumar';
        banner.innerHTML = '<strong>Teacher Condition:</strong> Requires official <code>@gla.ac.in</code> faculty email & Faculty ID to assign/approve work.';
    } else if (role === 'club') {
        clubGroup.classList.remove('d-none');
        document.getElementById('regClubPosition').required = true;
        nameLabel.textContent = 'Campus Club Name *';
        nameInput.placeholder = 'e.g., Robotics & Tech Club GLA';
        banner.innerHTML = '<strong>Club Member Condition:</strong> Requires official <code>@gla.ac.in</code> email & Club Designation to host events & bounties.';
    }
};

document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const role = document.getElementById('regRole').value;
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim().toLowerCase();
    const password = document.getElementById('regPassword').value;
    const roll_number = document.getElementById('regRollNumber').value.trim();
    const faculty_id = document.getElementById('regFacultyId').value.trim();
    const department = document.getElementById('regDepartment').value.trim();
    const club_position = document.getElementById('regClubPosition').value.trim();

    if (!role) return showInlineAlert('Please select your role first.', 'danger');
    if (!email.endsWith('@gla.ac.in')) {
        return showInlineAlert('Email must be a valid GLA University address ending with @gla.ac.in', 'danger');
    }

    try {
        const response = await fetch(`${AUTH_API}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, role, roll_number, faculty_id, department, club_position })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Registration failed');

        showInlineAlert(data.message, 'success');
        document.getElementById('registerForm').reset();
        setTimeout(() => {
            switchAuthTab('login');
            document.getElementById('email').value = email;
        }, 1200);
    } catch (error) {
        showInlineAlert(error.message, 'danger');
    }
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim().toLowerCase();
    const password = document.getElementById('password').value;

    try {
        const response = await fetch(`${AUTH_API}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Login failed');

        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));

        if (data.user.role === 'student') window.location.href = 'student-dashboard.html';
        else if (data.user.role === 'teacher') window.location.href = 'teacher-dashboard.html';
        else if (data.user.role === 'club') window.location.href = 'club-dashboard.html';
    } catch (error) {
        showInlineAlert(error.message, 'danger');
    }
});

function showInlineAlert(msg, type) {
    const el = document.getElementById('inlineAlert');
    el.textContent = msg;
    el.className = `alert alert-${type} py-2 small rounded-3`;
    el.classList.remove('d-none');
}
function hideInlineAlert() {
    document.getElementById('inlineAlert').classList.add('d-none');
}