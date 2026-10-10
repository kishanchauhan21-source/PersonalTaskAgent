const $ = (selector) => document.querySelector(selector);
const taskList = $("#task-list");
const toast = $("#toast");
const STORAGE_KEY = "daymark.tasks.v1";
let tasks = [];
let latestPlan = null;
let toastTimer;

function makeId() {
  return globalThis.crypto?.randomUUID?.() || "task-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}
function localDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function dateLabel(value) {
  if (!value) return "";
  const parsed = localDate(value);
  const today = localDate($("#plan-date").value);
  if (parsed.toDateString() === today.toDateString()) return "Due today";
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (parsed.toDateString() === tomorrow.toDateString()) return "Due tomorrow";
  return "Due " + parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  renderTasks();
}
function renderTasks() {
  taskList.replaceChildren();
  $("#task-count").textContent = tasks.length;
  $("#nav-count").textContent = tasks.length;
  $("#task-empty").classList.toggle("show", tasks.length === 0);
  for (const task of tasks) {
    const card = document.createElement("div");
    card.className = "task-card";
    const check = document.createElement("input");
    check.className = "task-check";
    check.type = "checkbox";
    check.checked = Boolean(task.done);
    check.setAttribute("aria-label", "Mark " + task.title + " complete");
    check.addEventListener("change", () => {
      task.done = check.checked;
      persist();
    });
    const body = document.createElement("div");
    const title = document.createElement("div");
    title.className = "task-title";
    title.textContent = task.title;
    if (task.done) title.style.textDecoration = "line-through";
    const meta = document.createElement("div");
    meta.className = "task-meta";
    const priority = document.createElement("span");
    const level = task.priority || "medium";
    priority.className = "priority " + level;
    priority.textContent = level[0].toUpperCase() + level.slice(1) + " priority";
    meta.append(priority);
    if (task.due_label || task.due_date) {
      const due = document.createElement("span");
      due.textContent = task.due_label || dateLabel(task.due_date);
      meta.append(due);
    }
    if (task.is_fixed && task.fixed_start) {
      const fixed = document.createElement("span");
      fixed.textContent = "At " + formatTime(task.fixed_start);
      meta.append(fixed);
    }
    body.append(title, meta);
    const actions = document.createElement("div");
    actions.className = "task-actions";
    const duration = document.createElement("span");
    duration.className = "task-duration";
    duration.textContent = task.is_fixed ? "Fixed" : task.duration_minutes + "m";
    const remove = document.createElement("button");
    remove.className = "remove-task";
    remove.type = "button";
    remove.title = "Remove task";
    remove.setAttribute("aria-label", "Remove " + task.title);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      tasks = tasks.filter((item) => item.id !== task.id);
      persist();
      if (latestPlan) clearPlan("Task list changed. Build the plan again to refresh it.");
    });
    actions.append(duration, remove);
    card.append(check, body, actions);
    taskList.append(card);
  }
}
function formatTime(value) {
  const [hour, minute] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: minute ? "2-digit" : undefined });
}
function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? hours + "h" + (rest ? " " + rest + "m" : "") : rest + "m";
}
function clearPlan(message) {
  latestPlan = null;
  $("#plan-summary").innerHTML = '<div class="summary-icon">◷</div><div><strong>' + escapeHtml(message) + '</strong><span>Generate a fresh schedule whenever you’re ready.</span></div>';
  $("#timeline").innerHTML = '<div class="timeline-placeholder"><span class="placeholder-line"></span><span>Your schedule will appear here</span></div>';
  $("#unscheduled").replaceChildren();
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function addTask(task) {
  tasks.push({ id: task.id || makeId(), duration_minutes: 45, priority: "medium", ...task });
  persist();
  if (latestPlan) clearPlan("Task list changed. Build the plan again to refresh it.");
}
function renderPlan(plan) {
  latestPlan = plan;
  const focus = formatDuration(plan.focus_minutes);
  const breaks = formatDuration(plan.break_minutes);
  const events = plan.items.filter((item) => item.kind === "event").length;
  $("#plan-summary").innerHTML = '<div class="summary-icon">✦</div><div><strong>' + focus + " of focused work" + (events ? " · " + events + " fixed " + (events === 1 ? "plan" : "plans") : "") + '</strong><span>' + plan.items.length + " blocks mapped out" + (plan.break_minutes ? ", with " + breaks + " to recharge" : "") + ".</span></div>";
  const timeline = $("#timeline");
  timeline.replaceChildren();
  for (const item of plan.items) {
    const row = document.createElement("div");
    row.className = "timeline-row " + item.kind;
    const time = document.createElement("div");
    time.className = "timeline-time";
    time.textContent = formatTime(item.start);
    const node = document.createElement("div");
    node.className = "timeline-node";
    const body = document.createElement("div");
    body.className = "timeline-card";
    const title = document.createElement("div");
    title.className = "timeline-title";
    title.textContent = item.title;
    const note = document.createElement("div");
    note.className = "timeline-note";
    note.textContent = formatTime(item.start) + " – " + formatTime(item.end) + (item.note ? " · " + item.note : "");
    body.append(title, note);
    row.append(time, node, body);
    timeline.append(row);
  }
  const unscheduled = $("#unscheduled");
  unscheduled.replaceChildren();
  for (const task of plan.unscheduled) {
    const card = document.createElement("div");
    card.className = "unscheduled-card";
    card.innerHTML = "<strong>" + escapeHtml(task.title) + "</strong> didn’t fit in the available hours. Adjust your day or shorten another block.";
    unscheduled.append(card);
  }
}

async function postJson(path, body) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Something went wrong. Please try again.");
  return data;
}

$("#extract-button").addEventListener("click", async () => {
  const message = $("#task-input").value.trim();
  if (!message) return showToast("Tell us what’s on your plate first.");
  const button = $("#extract-button");
  button.disabled = true;
  button.innerHTML = "Sorting your thoughts <span>…</span>";
  try {
    const result = await postJson("/api/parse", { message });
    if (!result.tasks.length) return showToast("We couldn’t find a task in that note. Try rephrasing it.");
    const existing = new Set(tasks.map((task) => task.title.toLowerCase()));
    const newTasks = result.tasks.filter((task) => !existing.has(task.title.toLowerCase()));
    tasks.push(...newTasks);
    persist();
    $("#task-input").value = "";
    if (latestPlan) clearPlan("Task list changed. Build the plan again to refresh it.");
    showToast(newTasks.length + " " + (newTasks.length === 1 ? "item" : "items") + " added to your list.");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = 'Organize my tasks <span>→</span>';
  }
});

$("#add-task-button").addEventListener("click", () => $("#task-dialog").showModal());
$("#task-form").addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const title = $("#new-title").value.trim();
  if (!title) return;
  const dueDate = $("#new-due").value || null;
  addTask({
    title,
    duration_minutes: Number($("#new-duration").value),
    priority: $("#new-priority").value,
    due_date: dueDate,
    due_label: dueDate ? dateLabel(dueDate) : null,
  });
  $("#task-dialog").close();
  $("#task-form").reset();
  $("#new-duration").value = "45";
  $("#new-priority").value = "medium";
  showToast("Task added to your list.");
});

$("#plan-button").addEventListener("click", async () => {
  if (!tasks.length) return showToast("Add a task before building your plan.");
  const button = $("#plan-button");
  button.disabled = true;
  button.innerHTML = "<span>◌</span> Finding your flow";
  try {
    const plan = await postJson("/api/plan", {
      tasks: tasks.filter((task) => !task.done),
      start_time: $("#start-time").value,
      end_time: $("#end-time").value,
      plan_date: $("#plan-date").value,
    });
    renderPlan(plan);
    showToast(plan.unscheduled.length ? "Plan ready. A few items need more room." : "Your plan is ready.");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = "<span>✧</span> Build my plan";
  }
});

function init() {
  const now = new Date();
  $("#plan-date").value = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  $("#plan-date").addEventListener("change", () => {
    $("#date-hint").textContent = "Planning for " + localDate($("#plan-date").value).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) + ".";
    if (latestPlan) clearPlan("Plan date changed.");
  });
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(stored)) tasks = stored;
  } catch { tasks = []; }
  renderTasks();
}
init();
