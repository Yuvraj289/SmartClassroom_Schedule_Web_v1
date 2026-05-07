
"use strict";

// ──────────────────────────────────────────────
// ▌ DATA STORE  (simulated backend / DB)
// ──────────────────────────────────────────────
const DB = {
  teachers: [],
  rooms: [],
  classes: [], // scheduled classes
  notifications: [],

  // ── Persistence via localStorage ──
  save() {
    localStorage.setItem("edu_teachers", JSON.stringify(this.teachers));
    localStorage.setItem("edu_rooms", JSON.stringify(this.rooms));
    localStorage.setItem("edu_classes", JSON.stringify(this.classes));
    localStorage.setItem(
      "edu_notifications",
      JSON.stringify(this.notifications),
    );
  },
  load() {
    this.teachers = JSON.parse(localStorage.getItem("edu_teachers") || "[]");
    this.rooms = JSON.parse(localStorage.getItem("edu_rooms") || "[]");
    this.classes = JSON.parse(localStorage.getItem("edu_classes") || "[]");
    this.notifications = JSON.parse(
      localStorage.getItem("edu_notifications") || "[]",
    );
  },
};

// ──────────────────────────────────────────────
// ▌ BACKEND LOGIC (API layer simulation)
// ──────────────────────────────────────────────
const API = {
  // ── Teachers ──
  addTeacher({ name, subjects, email }) {
    if (!name.trim()) return { ok: false, msg: "Name is required." };
    const id = "T" + Date.now();
    DB.teachers.push({ id, name: name.trim(), subjects, email });
    DB.save();
    return { ok: true, id };
  },
  removeTeacher(id) {
    DB.teachers = DB.teachers.filter((t) => t.id !== id);
    DB.save();
  },

  // ── Rooms ──
  addRoom({ name, capacity, type }) {
    if (!name.trim()) return { ok: false, msg: "Room name is required." };
    const id = "R" + Date.now();
    DB.rooms.push({ id, name: name.trim(), capacity: +capacity || 0, type });
    DB.save();
    return { ok: true, id };
  },
  removeRoom(id) {
    DB.rooms = DB.rooms.filter((r) => r.id !== id);
    DB.save();
  },

  // ── CLASH DETECTION ──────────────────────────
  // Returns array of clash descriptions (empty = no clash)
  detectClash({
    teacherId,
    roomId,
    date,
    startTime,
    endTime,
    excludeId = null,
  }) {
    const clashes = [];
    const newStart = toMinutes(startTime);
    const newEnd = toMinutes(endTime);

    if (newStart >= newEnd) {
      clashes.push("End time must be after start time.");
      return clashes;
    }

    for (const cls of DB.classes) {
      if (cls.id === excludeId) continue;

      // Check same date (or recurring overlap)
      const sameDate =
        cls.date === date ||
        (cls.recurrence === "weekly" && sameWeekday(cls.date, date)) ||
        cls.recurrence === "daily";

      if (!sameDate) continue;

      const cStart = toMinutes(cls.startTime);
      const cEnd = toMinutes(cls.endTime);
      const overlap = newStart < cEnd && newEnd > cStart;

      if (!overlap) continue;

      if (cls.teacherId === teacherId) {
        const teacher = DB.teachers.find((t) => t.id === teacherId);
        clashes.push(
          `🔴 Teacher clash: ${teacher ? teacher.name : teacherId} is already teaching "${cls.subject}" at ${cls.startTime}–${cls.endTime}.`,
        );
      }
      if (cls.roomId === roomId) {
        const room = DB.rooms.find((r) => r.id === roomId);
        clashes.push(
          `🔴 Room clash: ${room ? room.name : roomId} is booked for "${cls.subject}" at ${cls.startTime}–${cls.endTime}.`,
        );
      }
    }
    return clashes;
  },

  // ── Schedule a Class ──
  scheduleClass(data) {
    const clashes = this.detectClash(data);
    if (clashes.length) return { ok: false, clashes };

    const id = "CLS" + Date.now();
    const cls = { id, ...data, createdAt: new Date().toISOString() };
    DB.classes.push(cls);

    // Auto notification
    const teacher = DB.teachers.find((t) => t.id === data.teacherId);
    const room = DB.rooms.find((r) => r.id === data.roomId);
    this.addNotification({
      type: "success",
      icon: "✅",
      title: "Class Scheduled",
      body: `${data.subject} on ${formatDate(data.date)} at ${data.startTime}–${data.endTime} | ${teacher?.name} | ${room?.name}`,
    });

    DB.save();
    return { ok: true, id };
  },

  // ── Delete Class ──
  deleteClass(id) {
    DB.classes = DB.classes.filter((c) => c.id !== id);
    DB.save();
  },

  // ── Get Today's Classes ──
  getTodayClasses() {
    const today = todayStr();
    return DB.classes
      .filter(
        (c) =>
          c.date === today ||
          (c.recurrence === "weekly" && sameWeekday(c.date, today)) ||
          c.recurrence === "daily",
      )
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  },

  // ── Get Classes for a Week ──
  getWeekClasses(weekStart) {
    const days = weekDays(weekStart);
    const result = {};
    days.forEach((d) => (result[d] = []));
    for (const cls of DB.classes) {
      for (const day of days) {
        const match =
          cls.date === day ||
          (cls.recurrence === "weekly" && sameWeekday(cls.date, day)) ||
          cls.recurrence === "daily";
        if (match) result[day].push(cls);
      }
    }
    return result;
  },

  // ── Notifications ──
  addNotification({ type, icon, title, body }) {
    const notif = {
      id: "N" + Date.now(),
      type,
      icon,
      title,
      body,
      ts: new Date().toISOString(),
      read: false,
    };
    DB.notifications.unshift(notif);
    DB.save();
    return notif;
  },
  clearNotifications() {
    DB.notifications = [];
    DB.save();
  },
};

// ──────────────────────────────────────────────
// ▌ UTILITY FUNCTIONS
// ──────────────────────────────────────────────
function toMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function todayStr() {
  return new Date().toISOString().split("T")[0];
}
function formatDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function sameWeekday(d1, d2) {
  return (
    new Date(d1 + "T00:00:00").getDay() === new Date(d2 + "T00:00:00").getDay()
  );
}
function weekDays(startDate) {
  const days = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(startDate + "T00:00:00");
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().split("T")[0]);
  }
  return days;
}
function getMonday(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}
function initials(name) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// ──────────────────────────────────────────────
// ▌ UI CONTROLLER
// ──────────────────────────────────────────────
let currentWeekStart = getMonday(todayStr());
let openClassId = null;

const UI = {
  // ── Page Navigation ──
  initNav() {
    document.querySelectorAll(".nav-item").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const page = el.dataset.page;
        this.showPage(page);
        // close sidebar on mobile
        document.getElementById("sidebar").classList.remove("open");
      });
    });
    document.getElementById("menuBtn").addEventListener("click", () => {
      document.getElementById("sidebar").classList.toggle("open");
    });
  },

  showPage(name) {
    document
      .querySelectorAll(".page")
      .forEach((p) => p.classList.remove("active"));
    document
      .querySelectorAll(".nav-item")
      .forEach((n) => n.classList.remove("active"));
    document.getElementById("page-" + name)?.classList.add("active");
    document.querySelector(`[data-page="${name}"]`)?.classList.add("active");
    document.getElementById("pageTitle").textContent =
      name.charAt(0).toUpperCase() + name.slice(1);

    if (name === "dashboard") this.renderDashboard();
    if (name === "timetable") this.renderTimetable();
    if (name === "teachers") this.renderTeachers();
    if (name === "rooms") this.renderRooms();
    if (name === "schedule") this.populateFormDropdowns();
    if (name === "notifications") this.renderNotifications();
  },

  // ── Clock ──
  startClock() {
    const el = document.getElementById("clock");
    const tick = () => {
      el.textContent = new Date().toLocaleTimeString("en-IN", {
        hour12: false,
      });
    };
    tick();
    setInterval(tick, 1000);
  },

  // ── Toast ──
  toast(msg, type = "info") {
    const icons = { success: "✅", error: "❌", info: "ℹ️", warning: "⚠️" };
    const div = document.createElement("div");
    div.className = `toast ${type}`;
    div.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-text">${msg}</span>`;
    document.getElementById("toastContainer").appendChild(div);
    setTimeout(() => {
      div.classList.add("fade-out");
      setTimeout(() => div.remove(), 400);
    }, 3500);
  },

  // ── Dashboard ──
  renderDashboard() {
    document.getElementById("stat-classes").textContent = DB.classes.length;
    document.getElementById("stat-teachers").textContent = DB.teachers.length;
    document.getElementById("stat-rooms").textContent = DB.rooms.length;
    const todayClasses = API.getTodayClasses();
    document.getElementById("stat-today").textContent = todayClasses.length;
    document.getElementById("today-date").textContent = formatDate(todayStr());

    // Today timeline
    const tl = document.getElementById("todayTimeline");
    if (!todayClasses.length) {
      tl.innerHTML =
        '<div class="empty-state">No classes scheduled for today.</div>';
    } else {
      tl.innerHTML = todayClasses
        .map((c) => {
          const teacher = DB.teachers.find((t) => t.id === c.teacherId);
          const room = DB.rooms.find((r) => r.id === c.roomId);
          return `<div class="timeline-item" data-id="${c.id}">
          <div class="timeline-time">${c.startTime} – ${c.endTime}</div>
          <div>
            <div class="timeline-subject">${c.subject}</div>
            <div class="timeline-meta">${teacher?.name || "—"} &nbsp;·&nbsp; ${room?.name || "—"}</div>
          </div>
          <div class="timeline-badge">${c.dept || "General"}</div>
        </div>`;
        })
        .join("");
      tl.querySelectorAll(".timeline-item").forEach((el) => {
        el.addEventListener("click", () => this.openModal(el.dataset.id));
      });
    }

    // Reminders: classes in next 24h
    const now = new Date();
    const upcoming = DB.classes
      .filter((c) => {
        const dt = new Date(c.date + "T" + c.startTime);
        const diff = (dt - now) / 60000; // minutes
        return diff > 0 && diff <= 1440;
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    const rl = document.getElementById("reminderList");
    if (!upcoming.length) {
      rl.innerHTML =
        '<div class="empty-state">No upcoming reminders in the next 24 hours.</div>';
    } else {
      rl.innerHTML = upcoming
        .map((c) => {
          const dt = new Date(c.date + "T" + c.startTime);
          const diff = Math.round((dt - now) / 60000);
          const soon = diff <= 60;
          const teacher = DB.teachers.find((t) => t.id === c.teacherId);
          return `<div class="reminder-item">
          <div class="reminder-dot ${soon ? "soon" : ""}"></div>
          <div class="reminder-text">
            <strong>${c.subject}</strong> — ${c.startTime} on ${formatDate(c.date)}
            <span style="color:var(--muted)"> · ${teacher?.name || ""}</span>
          </div>
          <div class="reminder-time">in ${diff < 60 ? diff + " min" : Math.floor(diff / 60) + "h " + (diff % 60) + "m"}</div>
        </div>`;
        })
        .join("");
    }
  },

  // ── Populate Form Dropdowns ──
  populateFormDropdowns() {
    const tf = document.getElementById("f-teacher");
    const rf = document.getElementById("f-room");
    const selT = tf.value,
      selR = rf.value;

    tf.innerHTML =
      '<option value="">— Select Teacher —</option>' +
      DB.teachers
        .map(
          (t) =>
            `<option value="${t.id}" ${t.id === selT ? "selected" : ""}>${t.name}</option>`,
        )
        .join("");
    rf.innerHTML =
      '<option value="">— Select Room —</option>' +
      DB.rooms
        .map(
          (r) =>
            `<option value="${r.id}" ${r.id === selR ? "selected" : ""}>${r.name} (${r.type}, cap. ${r.capacity})</option>`,
        )
        .join("");
  },

  // ── Schedule Form ──
  initScheduleForm() {
    // Set default date to today
    document.getElementById("f-date").value = todayStr();

    document.getElementById("checkClashBtn").addEventListener("click", () => {
      this.runClashCheck();
    });

    document.getElementById("scheduleForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const data = this.getFormData();
      if (!data) return;

      const result = API.scheduleClass(data);
      if (!result.ok) {
        this.showClashBox(result.clashes, false);
        this.toast("Clashes detected! Class not scheduled.", "error");
        return;
      }
      this.toast("Class scheduled successfully! 🎉", "success");
      this.showClashBox(["✅ Class scheduled with no conflicts!"], true);
      document.getElementById("scheduleForm").reset();
      document.getElementById("f-date").value = todayStr();
      this.updateBadge();
      this.renderDashboard();

      // Add reminder notification for classes in future
      const dt = new Date(data.date + "T" + data.startTime);
      if (dt > new Date()) {
        API.addNotification({
          type: "reminder",
          icon: "🔔",
          title: "Reminder Set",
          body: `Reminder for "${data.subject}" on ${formatDate(data.date)} at ${data.startTime}.`,
        });
        this.updateBadge();
      }
    });
  },

  runClashCheck() {
    const data = this.getFormData();
    if (!data) return;
    const clashes = API.detectClash(data);
    if (clashes.length) {
      this.showClashBox(clashes, false);
      this.toast("Clashes found!", "warning");
    } else {
      this.showClashBox(
        ["✅ No clashes detected. Room and teacher are available."],
        true,
      );
      this.toast("All clear — no clashes!", "success");
    }
  },

  getFormData() {
    const subject = document.getElementById("f-subject").value.trim();
    const dept = document.getElementById("f-dept").value.trim();
    const teacherId = document.getElementById("f-teacher").value;
    const roomId = document.getElementById("f-room").value;
    const date = document.getElementById("f-date").value;
    const startTime = document.getElementById("f-start").value;
    const endTime = document.getElementById("f-end").value;
    const recurrence = document.getElementById("f-recur").value;

    if (!subject || !teacherId || !roomId || !date || !startTime || !endTime) {
      this.toast("Please fill all required fields.", "error");
      return null;
    }
    return {
      subject,
      dept,
      teacherId,
      roomId,
      date,
      startTime,
      endTime,
      recurrence,
    };
  },

  showClashBox(messages, isOk) {
    const box = document.getElementById("clashBox");
    box.style.display = "block";
    box.className = "clash-box " + (isOk ? "success" : "error");
    box.innerHTML = messages.map((m) => `<div>${m}</div>`).join("");
  },

  // ── Timetable ──
  renderTimetable() {
    const days = weekDays(currentWeekStart);
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const slots = [
      "08:00",
      "09:00",
      "10:00",
      "11:00",
      "12:00",
      "13:00",
      "14:00",
      "15:00",
      "16:00",
      "17:00",
    ];

    // Update week label
    const start = formatDate(days[0]);
    const end = formatDate(days[5]);
    document.getElementById("weekLabel").textContent = `${start} — ${end}`;

    // Populate filters
    const tf = document.getElementById("tt-teacher-filter");
    const rf = document.getElementById("tt-room-filter");
    const selT = tf.value,
      selR = rf.value;
    tf.innerHTML =
      '<option value="">All Teachers</option>' +
      DB.teachers
        .map(
          (t) =>
            `<option value="${t.id}" ${t.id === selT ? "selected" : ""}>${t.name}</option>`,
        )
        .join("");
    rf.innerHTML =
      '<option value="">All Rooms</option>' +
      DB.rooms
        .map(
          (r) =>
            `<option value="${r.id}" ${r.id === selR ? "selected" : ""}>${r.name}</option>`,
        )
        .join("");

    const filterT = tf.value;
    const filterR = rf.value;

    const weekData = API.getWeekClasses(currentWeekStart);

    // Build header
    const head = document.getElementById("ttHead");
    head.innerHTML = `<tr>
      <th>Time</th>
      ${days
        .map((d, i) => {
          const isToday = d === todayStr();
          return `<th style="${isToday ? "color:var(--accent2);" : ""}">${dayNames[i]}<br><span style="font-weight:400;font-size:10px;color:var(--muted)">${d.slice(5)}</span></th>`;
        })
        .join("")}
    </tr>`;

    // Build body
    const body = document.getElementById("ttBody");
    body.innerHTML = slots
      .map((slot) => {
        const slotMin = toMinutes(slot);
        return `<tr>
        <td class="time-col">${slot}</td>
        ${days
          .map((day) => {
            const cells = (weekData[day] || []).filter((c) => {
              const s = toMinutes(c.startTime),
                e = toMinutes(c.endTime);
              const inSlot = s <= slotMin && e > slotMin;
              const tMatch = !filterT || c.teacherId === filterT;
              const rMatch = !filterR || c.roomId === filterR;
              return inSlot && tMatch && rMatch;
            });
            if (!cells.length) return `<td></td>`;
            return `<td>${cells
              .map((c) => {
                const teacher = DB.teachers.find((t) => t.id === c.teacherId);
                const room = DB.rooms.find((r) => r.id === c.roomId);
                return `<div class="tt-cell" data-id="${c.id}">
              <div class="tt-cell-subject">${c.subject}</div>
              <div class="tt-cell-meta">${teacher?.name?.split(" ").pop() || "—"} · ${room?.name || "—"}</div>
            </div>`;
              })
              .join("")}</td>`;
          })
          .join("")}
      </tr>`;
      })
      .join("");

    // Attach click events
    body.querySelectorAll(".tt-cell").forEach((el) => {
      el.addEventListener("click", () => this.openModal(el.dataset.id));
    });
  },

  initTimetableControls() {
    document.getElementById("prevWeek").addEventListener("click", () => {
      const d = new Date(currentWeekStart + "T00:00:00");
      d.setDate(d.getDate() - 7);
      currentWeekStart = d.toISOString().split("T")[0];
      this.renderTimetable();
    });
    document.getElementById("nextWeek").addEventListener("click", () => {
      const d = new Date(currentWeekStart + "T00:00:00");
      d.setDate(d.getDate() + 7);
      currentWeekStart = d.toISOString().split("T")[0];
      this.renderTimetable();
    });
    document
      .getElementById("tt-teacher-filter")
      .addEventListener("change", () => this.renderTimetable());
    document
      .getElementById("tt-room-filter")
      .addEventListener("change", () => this.renderTimetable());
    document
      .getElementById("exportBtn")
      .addEventListener("click", () => this.exportCSV());
  },

  exportCSV() {
    const rows = [
      [
        "Subject",
        "Dept",
        "Teacher",
        "Room",
        "Date",
        "Start",
        "End",
        "Recurrence",
      ],
    ];
    DB.classes.forEach((c) => {
      const teacher = DB.teachers.find((t) => t.id === c.teacherId);
      const room = DB.rooms.find((r) => r.id === c.roomId);
      rows.push([
        c.subject,
        c.dept,
        teacher?.name,
        room?.name,
        c.date,
        c.startTime,
        c.endTime,
        c.recurrence,
      ]);
    });
    const csv = rows
      .map((r) => r.map((v) => `"${v || ""}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "timetable.csv";
    a.click();
    this.toast("Timetable exported as CSV!", "success");
  },

  // ── Teachers ──
  initTeacherForm() {
    document.getElementById("teacherForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const res = API.addTeacher({
        name: document.getElementById("t-name").value,
        subjects: document.getElementById("t-subject").value,
        email: document.getElementById("t-email").value,
      });
      if (!res.ok) {
        this.toast(res.msg, "error");
        return;
      }
      this.toast("Teacher added!", "success");
      document.getElementById("teacherForm").reset();
      this.renderTeachers();
    });
  },

  renderTeachers() {
    const list = document.getElementById("teacherList");
    if (!DB.teachers.length) {
      list.innerHTML = '<div class="empty-state">No teachers added yet.</div>';
      return;
    }
    list.innerHTML = DB.teachers
      .map(
        (t) => `
      <div class="entity-card">
        <div class="entity-avatar">${initials(t.name)}</div>
        <div>
          <div class="entity-name">${t.name}</div>
          <div class="entity-meta">${t.subjects || "—"} &nbsp;·&nbsp; ${t.email || "—"}</div>
        </div>
        <button class="entity-remove" data-id="${t.id}" title="Remove">🗑</button>
      </div>`,
      )
      .join("");

    list.querySelectorAll(".entity-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (confirm("Remove this teacher?")) {
          API.removeTeacher(btn.dataset.id);
          this.renderTeachers();
          this.toast("Teacher removed.", "info");
        }
      });
    });
  },

  // ── Rooms ──
  initRoomForm() {
    document.getElementById("roomForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const res = API.addRoom({
        name: document.getElementById("r-name").value,
        capacity: document.getElementById("r-capacity").value,
        type: document.getElementById("r-type").value,
      });
      if (!res.ok) {
        this.toast(res.msg, "error");
        return;
      }
      this.toast("Room added!", "success");
      document.getElementById("roomForm").reset();
      this.renderRooms();
    });
  },

  renderRooms() {
    const list = document.getElementById("roomList");
    if (!DB.rooms.length) {
      list.innerHTML = '<div class="empty-state">No rooms added yet.</div>';
      return;
    }
    const typeIcon = {
      Classroom: "🏫",
      Lab: "🔬",
      "Seminar Hall": "🏛",
      Auditorium: "🎭",
    };
    list.innerHTML = DB.rooms
      .map(
        (r) => `
      <div class="entity-card">
        <div class="entity-avatar room">${typeIcon[r.type] || "🏛"}</div>
        <div>
          <div class="entity-name">${r.name}</div>
          <div class="entity-meta">${r.type} &nbsp;·&nbsp; Capacity: ${r.capacity || "—"}</div>
        </div>
        <button class="entity-remove" data-id="${r.id}" title="Remove">🗑</button>
      </div>`,
      )
      .join("");

    list.querySelectorAll(".entity-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (confirm("Remove this room?")) {
          API.removeRoom(btn.dataset.id);
          this.renderRooms();
          this.toast("Room removed.", "info");
        }
      });
    });
  },

  // ── Notifications ──
  renderNotifications() {
    const list = document.getElementById("notifList");
    if (!DB.notifications.length) {
      list.innerHTML = '<div class="empty-state">No notifications yet.</div>';
      return;
    }
    list.innerHTML = DB.notifications
      .map(
        (n) => `
      <div class="notif-item notif-type-${n.type}">
        <div class="notif-icon">${n.icon}</div>
        <div>
          <div class="notif-title">${n.title}</div>
          <div class="notif-body">${n.body}</div>
          <div class="notif-ts">${new Date(n.ts).toLocaleString("en-IN")}</div>
        </div>
      </div>`,
      )
      .join("");
  },

  updateBadge() {
    const count = DB.notifications.length;
    const badge = document.getElementById("notif-badge");
    badge.textContent = count;
    if (count > 0) badge.classList.add("show");
    else badge.classList.remove("show");
  },

  // ── Modal ──
  openModal(classId) {
    const cls = DB.classes.find((c) => c.id === classId);
    if (!cls) return;
    openClassId = classId;
    const teacher = DB.teachers.find((t) => t.id === cls.teacherId);
    const room = DB.rooms.find((r) => r.id === cls.roomId);

    document.getElementById("modalBody").innerHTML = `
      <div class="modal-subject">📚 ${cls.subject}</div>
      <div class="modal-row"><span class="modal-label">Department</span><span class="modal-val">${cls.dept || "—"}</span></div>
      <div class="modal-row"><span class="modal-label">Teacher</span><span class="modal-val">${teacher?.name || "—"}</span></div>
      <div class="modal-row"><span class="modal-label">Room</span><span class="modal-val">${room?.name || "—"} (${room?.type || ""})</span></div>
      <div class="modal-row"><span class="modal-label">Date</span><span class="modal-val">${formatDate(cls.date)}</span></div>
      <div class="modal-row"><span class="modal-label">Time</span><span class="modal-val">${cls.startTime} – ${cls.endTime}</span></div>
      <div class="modal-row"><span class="modal-label">Recurrence</span><span class="modal-val">${cls.recurrence === "none" ? "Once" : cls.recurrence.charAt(0).toUpperCase() + cls.recurrence.slice(1)}</span></div>
      <button class="modal-del-btn" id="modalDelBtn">🗑 Delete This Class</button>
    `;
    document.getElementById("modalDelBtn").addEventListener("click", () => {
      if (confirm("Delete this class permanently?")) {
        API.deleteClass(openClassId);
        this.closeModal();
        this.toast("Class deleted.", "info");
        this.renderDashboard();
        const activePage = document.querySelector(".page.active")?.id;
        if (activePage === "page-timetable") this.renderTimetable();
        this.updateBadge();
      }
    });
    document.getElementById("modalOverlay").classList.add("open");
  },

  closeModal() {
    document.getElementById("modalOverlay").classList.remove("open");
    openClassId = null;
  },

  // ── Reminder Engine (checks every minute) ──
  startReminderEngine() {
    const check = () => {
      const now = new Date();
      DB.classes.forEach((cls) => {
        const dt = new Date(cls.date + "T" + cls.startTime);
        const diff = Math.round((dt - now) / 60000);

        // 15-min reminder
        if (diff === 15) {
          const teacher = DB.teachers.find((t) => t.id === cls.teacherId);
          const room = DB.rooms.find((r) => r.id === cls.roomId);
          const notif = API.addNotification({
            type: "reminder",
            icon: "🔔",
            title: `⏰ Class in 15 minutes!`,
            body: `${cls.subject} at ${cls.startTime} in ${room?.name || "—"} — ${teacher?.name || "—"}`,
          });
          this.toast(
            `⏰ Reminder: "${cls.subject}" starts in 15 min!`,
            "warning",
          );
          this.updateBadge();

          // Browser notification (if permission granted)
          if (Notification.permission === "granted") {
            new Notification(`📅 Class in 15 min: ${cls.subject}`, {
              body: `${cls.startTime} · ${room?.name || ""} · ${teacher?.name || ""}`,
              icon: "🎓",
            });
          }
        }

        // 5-min reminder
        if (diff === 5) {
          this.toast(`🚨 "${cls.subject}" starts in 5 min!`, "error");
        }
      });
    };
    setInterval(check, 60000);
    check(); // Run immediately
  },

  // ── Request browser notification permission ──
  requestNotifPermission() {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  },
};

// ──────────────────────────────────────────────
// ▌ SEED DEFAULT DATA (first run)
// ──────────────────────────────────────────────
function seedDefaults() {
  if (DB.teachers.length === 0) {
    API.addTeacher({
      name: "Dr. Priya Sharma",
      subjects: "Data Structures, Algorithms",
      email: "priya@college.edu",
    });
    API.addTeacher({
      name: "Prof. Arjun Mehta",
      subjects: "Mathematics, Statistics",
      email: "arjun@college.edu",
    });
    API.addTeacher({
      name: "Dr. Sunita Rao",
      subjects: "Physics, Electronics",
      email: "sunita@college.edu",
    });
    API.addTeacher({
      name: "Prof. Ramesh Kumar",
      subjects: "Database Systems, OS",
      email: "ramesh@college.edu",
    });
  }
  if (DB.rooms.length === 0) {
    API.addRoom({ name: "Room 101", capacity: 60, type: "Classroom" });
    API.addRoom({ name: "CS Lab A", capacity: 40, type: "Lab" });
    API.addRoom({ name: "Room 203", capacity: 80, type: "Seminar Hall" });
    API.addRoom({ name: "Auditorium", capacity: 300, type: "Auditorium" });
  }
  if (DB.classes.length === 0) {
    const today = todayStr();
    const t0 = DB.teachers[0]?.id,
      t1 = DB.teachers[1]?.id,
      t2 = DB.teachers[2]?.id;
    const r0 = DB.rooms[0]?.id,
      r1 = DB.rooms[1]?.id;
    if (t0 && r0) {
      API.scheduleClass({
        subject: "Data Structures",
        dept: "CS",
        teacherId: t0,
        roomId: r0,
        date: today,
        startTime: "09:00",
        endTime: "10:00",
        recurrence: "none",
      });
      API.scheduleClass({
        subject: "Linear Algebra",
        dept: "Math",
        teacherId: t1,
        roomId: r0,
        date: today,
        startTime: "10:00",
        endTime: "11:00",
        recurrence: "none",
      });
      API.scheduleClass({
        subject: "Physics Lab",
        dept: "Physics",
        teacherId: t2,
        roomId: r1,
        date: today,
        startTime: "11:00",
        endTime: "13:00",
        recurrence: "weekly",
      });
    }
  }
}

// ──────────────────────────────────────────────
// ▌ INIT
// ──────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  DB.load();
  seedDefaults();

  UI.initNav();
  UI.startClock();
  UI.initScheduleForm();
  UI.initTimetableControls();
  UI.initTeacherForm();
  UI.initRoomForm();
  UI.requestNotifPermission();
  UI.startReminderEngine();

  // Modal close
  document
    .getElementById("modalClose")
    .addEventListener("click", () => UI.closeModal());
  document.getElementById("modalOverlay").addEventListener("click", (e) => {
    if (e.target === document.getElementById("modalOverlay")) UI.closeModal();
  });

  // Clear notifications
  document.getElementById("clearNotifs").addEventListener("click", () => {
    API.clearNotifications();
    UI.renderNotifications();
    UI.updateBadge();
    UI.toast("All notifications cleared.", "info");
  });

  // Initial render
  UI.showPage("dashboard");
  UI.updateBadge();
});
