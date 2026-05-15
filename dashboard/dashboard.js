const SUPABASE_URL = "https://azdhqelzwptdyjypjkcb.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6ZGhxZWx6d3B0ZHlqeXBqa2NiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwNjQwODEsImV4cCI6MjA5MTY0MDA4MX0.g6YLwLhe_pG_27FQlKgwlrDDlsqeory5s5HWSTe3nKA";
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);

let deviceSortOrder = "none";

window.toggleDeviceSort = () => {
  deviceSortOrder = deviceSortOrder === "desc" ? "asc" : "desc";
  loadTableData();
};

let currentTab = "home";
let currentStudentsList = [];

window.toggleSidebar = () => {
  document.getElementById("sidebar").classList.toggle("open");
};
// --- NEW: Sorting & Date Filter State ---
let currentSortCol = 'created_at';
let currentSortOrder = 'desc';
let dateFilterStart = null;
let dateFilterEnd = null;

window.toggleSort = (col) => {
  if (currentSortCol === col) {
    currentSortOrder = currentSortOrder === 'desc' ? 'asc' : 'desc';
  } else {
    currentSortCol = col;
    currentSortOrder = 'asc';
  }
  loadTableData(); // Reload and apply sort
};

window.applyDateFilter = () => {
    const start = document.getElementById("filterStartDate").value;
    const end = document.getElementById("filterEndDate").value;
    if (start && end) {
        dateFilterStart = new Date(start).toISOString();
        let endDateObj = new Date(end);
        endDateObj.setHours(23, 59, 59, 999); // Include full end day
        dateFilterEnd = endDateObj.toISOString();
        loadTableData();
    } else {
        alert("Please select both start and end dates.");
    }
};

window.clearDateFilter = () => {
    document.getElementById("filterStartDate").value = "";
    document.getElementById("filterEndDate").value = "";
    dateFilterStart = null;
    dateFilterEnd = null;
    loadTableData();
};



window.scrollTableBy = (amount) => {
  const el = document.querySelector('.table-responsive');
  if (el) el.scrollLeft += amount;
};


function initScrollSync() {
  const tr = document.querySelector('.table-responsive');
  const track = document.getElementById('hScrollTrack');
  const inner = document.getElementById('hScrollInner');
  if (!tr || !track || !inner) return;

  inner.style.width = tr.scrollWidth + 'px';

  track.onscroll = () => { tr.scrollLeft = track.scrollLeft; };
  tr.onscroll = () => { track.scrollLeft = tr.scrollLeft; };
}



async function verifyAdminAccess() {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (!session) {
    window.location.href = "/";
    return;
  }

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    await supabaseClient.auth.signOut();
    window.location.href = "/";
    return;
  }

  switchTab("home");
}

async function loadMetrics() {
  const { count: pendingCount } = await supabaseClient
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending")
    .eq("role", "student");

  const { count: activeCount } = await supabaseClient
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("status", "approved")
    .eq("role", "student");

  const { data: deviceData } = await supabaseClient
    .from("profiles")
    .select("device_id")
    .eq("role", "student");
    
  let totalDevices = 0;
  if (deviceData) {
    deviceData.forEach((p) => {
      let arr = p.device_id || [];
      if (typeof arr === "string") {
        try { arr = JSON.parse(arr); } catch (e) { arr = [arr]; }
      }
      totalDevices += arr.length;
    });
  }
  document.getElementById("metricDevices").innerText = totalDevices;
  document.getElementById("metricPending").innerText = pendingCount || 0;
  document.getElementById("metricActive").innerText = activeCount || 0;
}

window.switchTab = (tabName) => {
  currentTab = tabName;

  document.getElementById("menuHome").classList.remove("active");
  document.getElementById("menuPending").classList.remove("active");
  document.getElementById("menuEnrolled").classList.remove("active");
  if (document.getElementById("menuSessions"))
    document.getElementById("menuSessions").classList.remove("active");
  document.getElementById("sidebar").classList.remove("open");

  const homeView = document.getElementById("homeView");
  const tableView = document.getElementById("tableView");
  const sessionsView = document.getElementById("sessionsView");

  homeView.style.display = "none";
  tableView.style.display = "none";
  if (sessionsView) sessionsView.style.display = "none";

  if (tabName === "home") {
    document.getElementById("menuHome").classList.add("active");
    homeView.style.display = "block";
    loadMetrics();
  } else if (tabName === "sessions") {
    document.getElementById("menuSessions").classList.add("active");
    sessionsView.style.display = "block";
    loadSessionsData();
  } else {
    tableView.style.display = "block";

    // Optional: Clear column searches when switching tabs
    document.querySelectorAll('.col-search').forEach(input => input.value = "");

    if (tabName === "pending") {
      document.getElementById("menuPending").classList.add("active");
      document.getElementById("tableTitle").innerText = "Pending Registrations";
    } else if (tabName === "enrolled") {
      document.getElementById("menuEnrolled").classList.add("active");
      document.getElementById("tableTitle").innerText = "Enrolled Students";
    }
    loadTableData();
  }
};

async function loadTableData() {
  const tableHeadRow = document.getElementById("tableHeadRow");
  const tableBody = document.getElementById("tableBody");

  // Helper to prevent clicking the search bar from triggering the column sort
  const colSearch = (colName, placeholder) => `
    <input type="text" class="col-search" data-col="${colName}" placeholder="${placeholder}" onkeyup="filterTable()" onclick="event.stopPropagation()">
  `;

  // Helper to generate sortable headers
  const thSort = (colName, displayName, searchHtml = "") => {
      let icon = "fa-sort";
      let color = "#9ca3af";
      if (currentSortCol === colName) {
          icon = currentSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
          color = "#111827";
      }
      return `<th style="cursor:pointer; white-space:nowrap;" onclick="toggleSort('${colName}')">${displayName} <i class="fa-solid ${icon}" style="color:${color}; margin-left:5px;"></i>${searchHtml ? '<br>'+searchHtml : ''}</th>`;
  };

  // Generate Headers (Now including Email)
  if (currentTab === "pending") {
    tableHeadRow.innerHTML = `
      <th><input type="checkbox" id="selectAll" onclick="toggleSelectAll(this)"></th>
      ${thSort('student_name', 'Student Name', colSearch('student_name', 'Search Name'))}
      ${thSort('email', 'Email Address', colSearch('email', 'Search Email'))}
      ${thSort('age', 'Age', colSearch('age', 'Search Age'))}
      ${thSort('father_name', 'Father Name', colSearch('father_name', 'Search Father'))}
      ${thSort('academy_name', 'Academy', colSearch('academy_name', 'Search Academy'))}
      ${thSort('coach_name', 'Coach', colSearch('coach_name', 'Search Coach'))}
      ${thSort('phone', 'Contact', colSearch('phone', 'Search Phone'))}
      ${thSort('device_id', 'Devices')}
      <th>Dashboard</th><th>Arena</th><th>Groove</th><th>Actions</th>`;
  } else {
    tableHeadRow.innerHTML = `
      ${thSort('created_at', 'Enrolled')}
      ${thSort('student_name', 'Student Name', colSearch('student_name', 'Search Name'))}
      ${thSort('email', 'Email Address', colSearch('email', 'Search Email'))}
      ${thSort('age', 'Age', colSearch('age', 'Search Age'))}
      ${thSort('father_name', 'Father Name', colSearch('father_name', 'Search Father'))}
      ${thSort('academy_name', 'Academy', colSearch('academy_name', 'Search Academy'))}
      ${thSort('coach_name', 'Coach', colSearch('coach_name', 'Search Coach'))}
      ${thSort('phone', 'Contact', colSearch('phone', 'Search Phone'))}
      ${thSort('device_id', 'Devices')}
      <th>Dashboard</th><th>Arena</th><th>Groove</th><th>Actions</th>`;
  }

  tableBody.innerHTML = `<tr><td colspan="13" style="text-align:center; padding:30px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>`;
  
  const dbStatus = currentTab === "pending" ? "pending" : "approved";
  
  // Base Query
  let query = supabaseClient.from("profiles").select("*").eq("status", dbStatus).eq("role", "student");
  
  // Apply Date Filter if selected
  if (dateFilterStart && dateFilterEnd) {
      query = query.gte("created_at", dateFilterStart).lte("created_at", dateFilterEnd);
  }

  const { data: students, error } = await query;

  if (error || !students || students.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="13" style="text-align:center; padding:30px; color:#6b7280;">No records found.</td></tr>`;
    return;
  }

  currentStudentsList = students;

  // Execute Universal Sorting
  currentStudentsList.sort((a, b) => {
      let valA = a[currentSortCol];
      let valB = b[currentSortCol];

      if (currentSortCol === 'device_id') {
          try { valA = (typeof a.device_id === "string" ? JSON.parse(a.device_id) : a.device_id || []).length; } catch (e) { valA = 0; }
          try { valB = (typeof b.device_id === "string" ? JSON.parse(b.device_id) : b.device_id || []).length; } catch (e) { valB = 0; }
      } else if (currentSortCol === 'age') {
          valA = parseInt(valA) || 0;
          valB = parseInt(valB) || 0;
      } else if (currentSortCol === 'created_at') {
          valA = new Date(valA).getTime();
          valB = new Date(valB).getTime();
      } else {
          valA = (valA || "").toString().toLowerCase();
          valB = (valB || "").toString().toLowerCase();
      }

      if (valA < valB) return currentSortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return currentSortOrder === 'asc' ? 1 : -1;
      return 0;
  });

  let html = "";
  const safeLower = (str) => (str || "").toString().toLowerCase();

  currentStudentsList.forEach((student) => {
    const d = new Date(student.created_at).toLocaleDateString();
    const l1Check = currentTab === "pending" || student.level_1_access ? "checked" : "";
    const l2Check = student.level_2_access ? "checked" : "";
    const l3Check = student.level_3_access ? "checked" : "";

    let deviceArray = student.device_id || [];
    if (typeof deviceArray === "string") {
      try { deviceArray = JSON.parse(deviceArray); } catch (e) { deviceArray = [deviceArray]; }
    }
    const deviceCount = deviceArray.length;
    const deviceCell = `<td style="font-weight:bold; color:${deviceCount >= 9999 ? "#ef4444" : "#111827"};">${deviceCount} / 9999</td>`;

    const viewBtn = `<button class="btn-icon" style="background:#3b82f6;" onclick="viewStudent('${student.id}')" title="View Profile"><i class="fa-solid fa-eye"></i></button>`;
    const editBtn = `<button class="btn-icon" style="background:#f58220;" onclick="openEditModal('${student.id}')" title="Edit Profile"><i class="fa-solid fa-pen"></i></button>`;

    // Add Email to searchable attributes
    const rowAttributes = `
      data-student_name="${safeLower(student.student_name)}"
      data-email="${safeLower(student.email)}"
      data-age="${safeLower(student.age)}"
      data-father_name="${safeLower(student.father_name)}"
      data-academy_name="${safeLower(student.academy_name)}"
      data-coach_name="${safeLower(student.coach_name)}"
      data-phone="${safeLower(student.phone)}"
    `;

    if (currentTab === "pending") {
      html += `
           <tr class="data-row" ${rowAttributes}>
                <td><input type="checkbox" class="student-cb" value="${student.id}" onchange="toggleBulkButton()"></td>
                <td><strong>${student.student_name}</strong></td>
                <td>${student.email || "—"}</td>
                <td>${student.age}</td>
                <td>${student.father_name}</td>
                <td><strong>${student.academy_name}</strong></td>
                <td>${student.coach_name || "N/A"}</td>
                <td>${student.phone}</td>
                ${deviceCell}
                <td><label class="toggle-switch"><input type="checkbox" id="lvl1_${student.id}" ${l1Check}><span class="slider"></span></label></td>
                <td><label class="toggle-switch"><input type="checkbox" id="lvl2_${student.id}" ${l2Check}><span class="slider"></span></label></td>
                <td><label class="toggle-switch"><input type="checkbox" id="lvl3_${student.id}" ${l3Check}><span class="slider"></span></label></td> 
                <td><div class="action-btns">${viewBtn}${editBtn}<button class="btn-icon btn-approve" onclick="approveStudent('${student.id}')" title="Approve"><i class="fa-solid fa-check"></i></button><button class="btn-icon btn-reject" onclick="deleteStudent('${student.id}')" title="Delete"><i class="fa-solid fa-xmark"></i></button></div></td>
            </tr>`;
    } else {
      html += `
            <tr class="data-row" ${rowAttributes}>
                <td class="secondary-text">${d}</td>
                <td><strong>${student.student_name}</strong></td>
                <td>${student.email || "—"}</td>
                <td>${student.age}</td>
                <td>${student.father_name}</td>
                <td><strong>${student.academy_name}</strong></td>
                <td>${student.coach_name || "N/A"}</td>
                <td>${student.phone}</td>
                ${deviceCell}
                <td><label class="toggle-switch"><input type="checkbox" onchange="liveUpdateAccess('${student.id}', 'level_1_access', this.checked)" ${l1Check}><span class="slider"></span></label></td>
                <td><label class="toggle-switch"><input type="checkbox" onchange="liveUpdateAccess('${student.id}', 'level_2_access', this.checked)" ${l2Check}><span class="slider"></span></label></td>
                <td><label class="toggle-switch"><input type="checkbox" onchange="liveUpdateAccess('${student.id}', 'level_3_access', this.checked)" ${l3Check}><span class="slider"></span></label></td> 
                <td><div class="action-btns">${viewBtn}${editBtn}<button class="btn-icon btn-reject" onclick="revokeStudent('${student.id}')" title="Revoke"><i class="fa-solid fa-ban"></i></button></div></td>
            </tr>`;
    }
  });
  tableBody.innerHTML = html;
  initScrollSync(); 
}

// 1. Create global variables to hold data and the chart instance
let currentSessionsData = {};
let sessionChartInstance = null;

async function loadSessionsData() {
  const tbody = document.getElementById("sessionsTableBody");
  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading data...</td></tr>`;

  const { data: sessions, error } = await supabaseClient
    .from("practice_sessions")
    .select(`
      created_at,
      levels,
      duration_seconds,
      profiles ( student_name )
    `)
    .order("created_at", { ascending: false });

  if (error || !sessions || sessions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:#6b7280;">No practice sessions logged yet.</td></tr>`;
    return;
  }

  // Reset the global data object
  currentSessionsData = {};

  sessions.forEach((session) => {
    const studentName = session.profiles ? session.profiles.student_name : "Unknown Student";
    const level = session.levels;

    if (!currentSessionsData[studentName]) {
      currentSessionsData[studentName] = {
        studentName: studentName,
        level1Total: 0,
        level2Total: 0,
        level3Total: 0,
        lastActive: session.created_at,
        allSessions: [],
      };
    }

    if (level === 1) currentSessionsData[studentName].level1Total += session.duration_seconds;
    if (level === 2) currentSessionsData[studentName].level2Total += session.duration_seconds;
    if (level === 3) currentSessionsData[studentName].level3Total += session.duration_seconds;

    if (new Date(session.created_at) > new Date(currentSessionsData[studentName].lastActive)) {
      currentSessionsData[studentName].lastActive = session.created_at;
    }

    currentSessionsData[studentName].allSessions.push({
      date: session.created_at,
      level: level,
      duration: session.duration_seconds,
    });
  });

  const formatTime = (totalSeconds) => {
    if (totalSeconds === 0) return `<span style="color:#9ca3af;">-</span>`;
    const hours = Math.floor(totalSeconds / 3600);
    const min = Math.floor((totalSeconds % 3600) / 60);
    const sec = totalSeconds % 60;
    let timeString = "";
    if (hours > 0) timeString += `${hours}h `;
    if (min > 0 || hours > 0) timeString += `${min}m `;
    timeString += `${sec}s`;
    return `<span style="background:#e0f2fe; color:#0369a1; padding:4px 8px; border-radius:4px; font-weight:bold; font-size:0.8rem;">${timeString}</span>`;
  };

  let html = "";
  Object.values(currentSessionsData).forEach((student) => {
    const d = new Date(student.lastActive).toLocaleString();

    html += `
      <tr class="data-row">
          <td class="secondary-text">${d} <br><span style="font-size:0.7rem; color:#9ca3af;">(Last Active)</span></td>
          <td>
            <strong style="cursor: pointer; color: #3b82f6; transition: 0.2s;" 
                    onmouseover="this.style.color='#2563eb'" 
                    onmouseout="this.style.color='#3b82f6'"
                    onclick="openSessionModal('${student.studentName}')">
              ${student.studentName} <i class="fa-solid fa-chart-simple" style="font-size: 0.75rem; margin-left: 5px;"></i>
            </strong>
          </td>
          <td>${formatTime(student.level1Total)}</td>
          <td>${formatTime(student.level2Total)}</td>
          <td>${formatTime(student.level3Total)}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

// 2. Add the Modal Open & Render logic
window.openSessionModal = (studentName) => {
  const student = currentSessionsData[studentName];
  if (!student) return;

  document.getElementById("sessionModalTitle").innerText = `${student.studentName}'s Analytics`;

  const tbody = document.getElementById("sessionModalTableBody");
  let tableHtml = "";
  
  // Prepare data for Chart.js
  const chartLabels = [];
  const chartData = [];

  // Reverse so oldest is on the left, newest on the right of the graph
  const chronologicalSessions = [...student.allSessions].reverse();

  chronologicalSessions.forEach((sess) => {
    // Format Table Data
    let levelColor = sess.level === 1 ? "#10b981" : sess.level === 2 ? "#3b82f6" : "#8b5cf6";
    const dateObj = new Date(sess.date);
    
    // Quick format for graph labels (MM/DD)
    chartLabels.push(dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' }));
    // Convert duration to minutes for the graph to make it easier to read
    chartData.push((sess.duration / 60).toFixed(1)); 

    const hours = Math.floor(sess.duration / 3600);
    const min = Math.floor((sess.duration % 3600) / 60);
    const sec = sess.duration % 60;
    const timeString = `${hours > 0 ? hours + 'h ' : ''}${min > 0 ? min + 'm ' : ''}${sec}s`;

    tableHtml += `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 10px 15px; font-size: 0.85rem; color: #4b5563;">
          ${dateObj.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
        </td>
        <td style="padding: 10px 15px;">
          <span style="background: ${levelColor}20; color: ${levelColor}; padding: 4px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 700;">
            Level ${sess.level}
          </span>
        </td>
        <td style="padding: 10px 15px; font-size: 0.85rem; font-weight: 500;">${timeString}</td>
      </tr>
    `;
  });

  tbody.innerHTML = tableHtml;

  // Render the Graph
  const ctx = document.getElementById("sessionChart").getContext("2d");
  
  // Destroy existing chart if it exists to prevent overlap glitches
  if (sessionChartInstance) {
    sessionChartInstance.destroy();
  }

  sessionChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: chartLabels,
      datasets: [{
        label: "Practice Duration (Minutes)",
        data: chartData,
        backgroundColor: "#3b82f6",
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Minutes' } }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });

  document.getElementById("sessionGraphModal").style.display = "flex";
};

// 3. Add Modal Close logic
window.closeSessionModal = () => {
  document.getElementById("sessionGraphModal").style.display = "none";
};

window.viewStudent = (studentId) => {
  const student = currentStudentsList.find((s) => s.id === studentId);
  if (!student) return;

  const d = new Date(student.created_at).toLocaleDateString();
  const statusColor = student.status === "approved" ? "#10b981" : "#f58220";

  let deviceArray = student.device_id || [];
  if (typeof deviceArray === "string") {
    try { deviceArray = JSON.parse(deviceArray); } catch (e) { deviceArray = [deviceArray]; }
  }
  const deviceCount = deviceArray.length;

  document.getElementById("studentProfileContent").innerHTML = `
        <div class="profile-item full">
            <label>Full Name</label>
            <span>${student.student_name} (Age: ${student.age})</span>
        </div>
        <div class="profile-item">
            <label>Active Devices</label>
            <span style="color: ${deviceCount >= 9999 ? "#ef4444" : "#111827"}; font-weight:bold;">
                ${deviceCount} / 9999 
            </span>
        </div>
        <div class="profile-item">
            <label>Academy</label>
            <span>${student.academy_name}</span>
        </div>
        <div class="profile-item">
            <label>Coach</label>
            <span>${student.coach_name || "N/A"}</span>
        </div>
        <div class="profile-item">
            <label>Father's Name</label>
            <span>${student.father_name}</span>
        </div>
        <div class="profile-item">
            <label>Phone Number</label>
            <span>${student.phone}</span>
        </div>
        <div class="profile-item">
            <label>Registration Date</label>
            <span>${d}</span>
        </div>
        <div class="profile-item">
            <label>Account Status</label>
            <span style="color: ${statusColor}; font-weight:bold; text-transform:uppercase;">${student.status}</span>
        </div>
    `;
  document.getElementById("viewStudentModal").style.display = "flex";
};

window.closeViewModal = () =>
  (document.getElementById("viewStudentModal").style.display = "none");

window.liveUpdateAccess = async (studentId, column, isGranted) => {
  const updatePayload = {};
  updatePayload[column] = isGranted;
  const { error } = await supabaseClient
    .from("profiles")
    .update(updatePayload)
    .eq("id", studentId);
  if (error) alert("Failed to update access: " + error.message);
};

window.approveStudent = async (studentId) => {
  const l2 = document.getElementById(`lvl2_${studentId}`).checked;
  const l3 = document.getElementById(`lvl3_${studentId}`).checked;

  const { error } = await supabaseClient
    .from("profiles")
    .update({
      status: "approved",
      level_1_access: true,
      level_2_access: l2,
      level_3_access: l3,
    })
    .eq("id", studentId);

  if (error) {
    alert("Failed to approve student: " + error.message);
    return;
  }

  const { data: studentData } = await supabaseClient
    .from("profiles")
    .select("student_name, created_at")
    .eq("id", studentId)
    .single();
  const { data: { session } } = await supabaseClient.auth.getSession();

  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-approval-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        type: "UPDATE",
        old_record: { status: "pending" },
        record: {
          id: studentId,
          student_name: studentData.student_name,
          status: "approved",
          created_at: studentData.created_at,
        },
      }),
    });
  } catch (err) {
    console.error("Student approved, but email failed to send:", err);
  }
  loadTableData();
};

window.revokeStudent = async (studentId) => {
  if (confirm("Revoke access? They will go back to pending.")) {
    await supabaseClient
      .from("profiles")
      .update({ status: "pending" })
      .eq("id", studentId);
    loadTableData();
  }
};

window.deleteStudent = async (studentId) => {
  if (confirm("Permanently delete this registration? This action cannot be undone.")) {
    
    // Get the current session to pass the auth token
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (!session) {
      alert("Session expired. Please log in again.");
      return;
    }

    try {
      // Temporarily change button visual to show it's loading (optional, but good UX)
      const row = document.querySelector(`[onclick="deleteStudent('${studentId}')"]`);
      if (row) {
        row.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
        row.disabled = true;
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/delete-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ target_user_id: studentId }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to delete user");
      }

      // Reload the table data to remove the row from the UI
      loadTableData();
      
    } catch (error) {
      alert("Error deleting student: " + error.message);
      loadTableData(); // Reload to reset the UI if it failed
    }
  }
};
window.toggleSelectAll = (source) => {
  document
    .querySelectorAll(".student-cb")
    .forEach((cb) => (cb.checked = source.checked));
  toggleBulkButton();
};

window.toggleBulkButton = () => {
  const btn = document.getElementById("bulkApproveBtn");
  const count = document.querySelectorAll(".student-cb:checked").length;
  btn.style.display = count > 0 ? "block" : "none";
  btn.innerHTML = `Approve Selected (${count})`;
};

document
  .getElementById("bulkApproveBtn")
  ?.addEventListener("click", async () => {
    const checkedBoxes = document.querySelectorAll(".student-cb:checked");
    if (!confirm(`Approve ${checkedBoxes.length} students?`)) return;

    document.getElementById("bulkApproveBtn").disabled = true;
    for (let checkbox of checkedBoxes) {
      await window.approveStudent(checkbox.value);
    }
    document.getElementById("bulkApproveBtn").disabled = false;
    document.getElementById("selectAll").checked = false;
  });

window.filterTable = () => {
  // Gather Individual Column Filters (Table Headers)
  const colInputs = Array.from(document.querySelectorAll('.col-search'));
  const colFilters = colInputs.map(input => ({
      col: input.getAttribute('data-col'),
      val: input.value.toLowerCase()
  }));

  document.querySelectorAll(".data-row").forEach((row) => {
    let matchesColumns = true;
    
    // Check Individual Column Matches
    for (let filter of colFilters) {
        if (filter.val) {
            // Read the specific data attribute we injected in loadTableData
            const rowVal = row.getAttribute(`data-${filter.col}`) || "";
            if (!rowVal.includes(filter.val)) {
                matchesColumns = false;
                break; // If one column fails, hide the row entirely
            }
        }
    }

    // Only display the row if it passes ALL column filters
    row.style.display = matchesColumns ? "" : "none";
  });
};

window.openModal = () =>
  (document.getElementById("addStudentModal").style.display = "flex");
window.closeModal = () =>
  (document.getElementById("addStudentModal").style.display = "none");

document
  .getElementById("adminAddStudentForm")
  ?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("submitNewStudentBtn");
    btn.innerText = "Creating...";
    btn.disabled = true;

    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    const payload = {
      email: document.getElementById("newEmail").value,
      password: document.getElementById("newPassword").value,
      student_name: document.getElementById("newName").value,
      age: document.getElementById("newAge").value,
      academy_name: document.getElementById("newAcademy").value,
      coach_name: document.getElementById("newCoach").value,
      father_name: document.getElementById("newFather").value,
      phone: document.getElementById("newPhone").value,
    };

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/admin-create-user`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      },
    );

    if (response.ok) {
      closeModal();
      document.getElementById("adminAddStudentForm").reset();
      switchTab("enrolled");
    } else {
      const err = await response.json();
      alert("Error creating student: " + err.error);
    }
    btn.innerText = "Create & Approve Student";
    btn.disabled = false;
  });

// Edit Student Modal Logic
window.openEditModal = (studentId) => {
  const student = currentStudentsList.find((s) => s.id === studentId);
  if (!student) return;

  document.getElementById("editStudentId").value = student.id;
  document.getElementById("editName").value = student.student_name;
  document.getElementById("editAge").value = student.age;
  document.getElementById("editAcademy").value = student.academy_name;
  document.getElementById("editCoach").value = student.coach_name || "";
  document.getElementById("editFather").value = student.father_name;
  document.getElementById("editPhone").value = student.phone;

  document.getElementById("editStudentModal").style.display = "flex";
};

window.closeEditModal = () => {
  document.getElementById("editStudentModal").style.display = "none";
};

document
  .getElementById("adminEditStudentForm")
  ?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("submitEditStudentBtn");
    btn.innerText = "Saving...";
    btn.disabled = true;

    const studentId = document.getElementById("editStudentId").value;
    const updates = {
      student_name: document.getElementById("editName").value,
      age: document.getElementById("editAge").value,
      academy_name: document.getElementById("editAcademy").value,
      coach_name: document.getElementById("editCoach").value,
      father_name: document.getElementById("editFather").value,
      phone: document.getElementById("editPhone").value,
    };

    const { error } = await supabaseClient
      .from("profiles")
      .update(updates)
      .eq("id", studentId);

    if (error) {
      alert("Error updating student: " + error.message);
    } else {
      closeEditModal();
      loadTableData();
    }

    btn.innerText = "Save Changes";
    btn.disabled = false;
  });
window.handleCSVImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        // Basic CSV split by line and comma
        const rows = text.split('\n').map(row => row.split(','));
        const headers = rows[0].map(h => h.trim().toLowerCase());
        
        const { data: { session } } = await supabaseClient.auth.getSession();
        let successCount = 0;
        let errorCount = 0;

        // Visual feedback
        const btn = document.querySelector('[onclick="document.getElementById(\'csvFileInput\').click()"]');
        const originalBtnHtml = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Importing...`;
        btn.disabled = true;

        // Loop through rows (skip header row 0)
        for (let i = 1; i < rows.length; i++) {
            if (rows[i].length < headers.length || !rows[i][0]) continue; 
            
            let payload = {};
            headers.forEach((header, index) => {
                payload[header] = rows[i][index]?.trim().replace(/^"|"$/g, ''); // Remove quotes if present
            });

            // Ensure required fields exist
            if (!payload.email || !payload.student_name) continue;
            
            // Assign default password if left blank in CSV
            if (!payload.password) payload.password = "Abacus@123";

            try {
                const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-create-user`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
                    body: JSON.stringify(payload)
                });
                if (response.ok) successCount++;
                else errorCount++;
            } catch(err) {
                errorCount++;
            }
        }
        
        alert(`CSV Import Complete!\nSuccessfully Added: ${successCount}\nErrors/Skipped: ${errorCount}`);
        
        // Reset UI
        btn.innerHTML = originalBtnHtml;
        btn.disabled = false;
        event.target.value = ''; // Reset file input
        
        loadTableData(); // Refresh table
        switchTab("enrolled");
    };
    
    reader.readAsText(file);
};

// NEW: Generate and download the CSV template instantly
window.downloadCSVTemplate = () => {
    // 1. Define the exact template content
    const templateContent = "email,password,student_name,age,academy_name,coach_name,father_name,phone\nrahul@example.com,Secure@123,Rahul Kumar,12,Larab O Brain,Azhar Kaazmi,Raj Kumar,9876543210\npriya@example.com,,Priya Singh,10,Larab O Brain,,Amit Singh,9123456789";
    
    // 2. Create a virtual file (Blob)
    const blob = new Blob([templateContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    // 3. Create a temporary hidden link and click it to trigger download
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "students_template.csv");
    document.body.appendChild(link);
    link.click();
    
    // 4. Clean up
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

// Scroll to Top Logic
const dashboardContainer = document.querySelector(".dashboard-container");
const scrollTopBtn = document.getElementById("scrollTopBtn");

dashboardContainer.addEventListener("scroll", () => {
  if (dashboardContainer.scrollTop > 300) {
    scrollTopBtn.style.display = "flex";
  } else {
    scrollTopBtn.style.display = "none";
  }
});

window.scrollToTop = () => {
  dashboardContainer.scrollTo({ top: 0, behavior: "smooth" });
};

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  window.location.href = "/";
});

verifyAdminAccess();