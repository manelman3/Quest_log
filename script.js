/* ==========================================================================
   QUESTLOG — Gerenciador de Tarefas Gamificado
   Aplicação 100% client-side. Nenhum backend é necessário: tudo é
   persistido no localStorage do navegador.

   Índice:
   1. Constantes e configuração
   2. Estado da aplicação
   3. Persistência (localStorage)
   4. Utilitários de data
   5. Motor de recorrência (quando uma tarefa está "devida" em uma data)
   6. Pontos / níveis / estatísticas
   7. Renderização (tarefas, sidebar, calendário, histórico)
   8. CRUD de tarefas (modal)
   9. Conclusão de tarefas
   10. Filtros, busca e ordenação
   11. Exportar / importar / reset diário
   12. Notificações e toasts
   13. Inicialização e listeners
   ========================================================================== */

/* --------------------------------------------------------------------------
   1. CONSTANTES
   -------------------------------------------------------------------------- */

const STORAGE_KEY = 'questlog_state_v1';

const WEEKDAY_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WEEKDAY_FULL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Simple line-icon paths (feather-style), keyed for reuse across the UI.
const ICONS = {
  geral: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  saude: '<path d="M20.8 4.9a5.4 5.4 0 0 0-7.6 0L12 6.1l-1.2-1.2a5.4 5.4 0 1 0-7.6 7.6l1.2 1.2L12 21l7.6-7.3 1.2-1.2a5.4 5.4 0 0 0 0-7.6z"/>',
  trabalho: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',
  estudos: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  casa: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  financas: '<circle cx="12" cy="12" r="9"/><path d="M9.5 15c0 1.1 1.1 2 2.5 2s2.5-.9 2.5-2-1.1-1.8-2.5-2-2.5-.9-2.5-2 1.1-2 2.5-2 2.5.9 2.5 2"/><path d="M12 7v1.2M12 15.8V17"/>',
  lazer: '<polygon points="12 2 15.1 8.6 22 9.3 16.8 13.9 18.3 21 12 17.3 5.7 21 7.2 13.9 2 9.3 8.9 8.6"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  points: '<circle cx="12" cy="12" r="9"/><path d="M9 12.8l2 2 4-4.6"/>',
};

// Fixed category taxonomy: label, CSS accent variable, icon key.
const CATEGORIES = {
  geral: { label: 'Geral', color: 'var(--cat-geral)', icon: 'geral' },
  saude: { label: 'Saúde', color: 'var(--cat-saude)', icon: 'saude' },
  trabalho: { label: 'Trabalho', color: 'var(--cat-trabalho)', icon: 'trabalho' },
  estudos: { label: 'Estudos', color: 'var(--cat-estudos)', icon: 'estudos' },
  casa: { label: 'Casa', color: 'var(--cat-casa)', icon: 'casa' },
  financas: { label: 'Finanças', color: 'var(--cat-financas)', icon: 'financas' },
  lazer: { label: 'Lazer', color: 'var(--cat-lazer)', icon: 'lazer' },
};

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const PRIORITY_LABEL = { high: 'Alta', medium: 'Média', low: 'Baixa' };

const LEVEL_RING_CIRCUMFERENCE = 2 * Math.PI * 52; // r=52 in the SVG

/* --------------------------------------------------------------------------
   2. ESTADO DA APLICAÇÃO
   -------------------------------------------------------------------------- */

let state = {
  tasks: [],            // lista de tarefas (ver createTask())
  totalPoints: 0,        // pontuação total acumulada
  ui: {
    activeCategory: 'all',
    searchQuery: '',
    sortBy: 'time',
    calendarViewDate: new Date(),   // mês exibido no calendário
    selectedCalendarDate: toDateStr(new Date()),
  },
  notifiedToday: new Set(), // ids de tarefas já notificadas hoje (não persistido)
};

let editingTaskId = null;       // id da tarefa em edição no modal (null = nova)
let selectedDaysMulti = [];     // seleção temporária do picker "dias específicos"
let selectedWeekdaySingle = new Date().getDay(); // seleção temporária do picker "semanalmente"
let confirmCallback = null;     // callback pendente do modal de confirmação

/* --------------------------------------------------------------------------
   3. PERSISTÊNCIA
   -------------------------------------------------------------------------- */

function saveState() {
  const toPersist = {
    tasks: state.tasks,
    totalPoints: state.totalPoints,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.tasks)) state.tasks = parsed.tasks;
    if (typeof parsed.totalPoints === 'number') state.totalPoints = parsed.totalPoints;
  } catch (e) {
    console.warn('Não foi possível carregar dados salvos:', e);
  }
}

/* --------------------------------------------------------------------------
   4. UTILITÁRIOS DE DATA
   -------------------------------------------------------------------------- */

// Formata uma data local como 'YYYY-MM-DD' (evita bugs de fuso do toISOString).
function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateStr(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(dateStrA, dateB) {
  const a = parseDateStr(dateStrA);
  const diff = dateB.setHours ? dateB : parseDateStr(dateB);
  return Math.round((new Date(diff.getFullYear(), diff.getMonth(), diff.getDate()) - a) / 86400000);
}

function daysInMonth(year, month /* 1-12 */) {
  return new Date(year, month, 0).getDate();
}

function todayStr() {
  return toDateStr(new Date());
}

function formatFullDate(date) {
  const weekday = WEEKDAY_FULL[date.getDay()];
  return `${weekday}, ${date.getDate()} de ${MONTH_NAMES[date.getMonth()].toLowerCase()} de ${date.getFullYear()}`;
}

function formatTimeLabel(t) {
  return t || '';
}

/* --------------------------------------------------------------------------
   5. MOTOR DE RECORRÊNCIA
   Decide se uma tarefa está "devida" (deve aparecer como pendente) em uma
   data específica, de acordo com seu tipo de recorrência.
   -------------------------------------------------------------------------- */

function isDueOnDate(task, date) {
  const dateStr = toDateStr(date);

  // A tarefa nunca aparece antes de ter sido criada.
  if (dateStr < task.createdDate) return false;

  const rec = task.recurrence;
  switch (rec.type) {
    case 'once':
      return rec.date === dateStr;

    case 'daily':
      return true;

    case 'specific-days':
      return rec.days.includes(date.getDay());

    case 'weekly':
      return date.getDay() === rec.weekday;

    case 'every-x-days': {
      const diff = daysBetween(task.createdDate, date);
      return diff >= 0 && diff % rec.interval === 0;
    }

    case 'monthly': {
      const clampedDay = Math.min(rec.monthDay, daysInMonth(date.getFullYear(), date.getMonth() + 1));
      return date.getDate() === clampedDay;
    }

    default:
      return false;
  }
}

function isCompletedOnDate(task, dateStr) {
  return task.completedDates.includes(dateStr);
}

/* --------------------------------------------------------------------------
   6. PONTOS / NÍVEIS / ESTATÍSTICAS
   Curva de progressão: para sair do nível L é necessário 100*L de XP.
   Isso cria uma progressão crescente (100, 200, 300, 400 XP por nível...).
   -------------------------------------------------------------------------- */

function getLevelInfo(totalPoints) {
  let level = 1;
  let base = 0;
  let needed = 100;
  while (totalPoints >= base + needed) {
    base += needed;
    level += 1;
    needed = 100 * level;
  }
  const currentXp = totalPoints - base;
  return { level, currentXp, xpNeeded: needed, progress: currentXp / needed };
}

function pointsEarnedOn(dateStr) {
  return state.tasks
    .filter((t) => t.completedDates.includes(dateStr))
    .reduce((sum, t) => sum + t.points, 0);
}

function computeStreak() {
  let streak = 0;
  const today = new Date();
  const tStr = toDateStr(today);
  const dueToday = state.tasks.filter((t) => isDueOnDate(t, today));
  const doneToday = dueToday.length > 0 && dueToday.every((t) => isCompletedOnDate(t, tStr));
  if (doneToday) streak += 1;

  const cursor = new Date(today);
  cursor.setDate(cursor.getDate() - 1);

  for (let i = 0; i < 365; i += 1) {
    const dStr = toDateStr(cursor);
    const due = state.tasks.filter((t) => isDueOnDate(t, cursor));
    if (due.length === 0) {
      cursor.setDate(cursor.getDate() - 1);
      continue; // dia neutro (sem tarefas devidas) não quebra a sequência
    }
    const done = due.every((t) => isCompletedOnDate(t, dStr));
    if (!done) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function computeCompletionRate30d() {
  let totalDue = 0;
  let totalDone = 0;
  const cursor = new Date();
  for (let i = 0; i < 30; i += 1) {
    const dStr = toDateStr(cursor);
    const due = state.tasks.filter((t) => isDueOnDate(t, cursor));
    totalDue += due.length;
    totalDone += due.filter((t) => isCompletedOnDate(t, dStr)).length;
    cursor.setDate(cursor.getDate() - 1);
  }
  if (totalDue === 0) return 0;
  return Math.round((totalDone / totalDue) * 100);
}

function totalCompletionsAllTime() {
  return state.tasks.reduce((sum, t) => sum + t.completedDates.length, 0);
}

/* --------------------------------------------------------------------------
   7. RENDERIZAÇÃO
   -------------------------------------------------------------------------- */

function render() {
  renderHeaderDate();
  renderCategoryChips();
  renderTaskList();
  renderLevelCard();
  renderStatsCard();
  renderCalendar();
  renderHistoryChart();
}

function renderHeaderDate() {
  document.getElementById('currentDate').textContent = formatFullDate(new Date());
}

function renderCategoryChips() {
  const container = document.getElementById('categoryChips');
  const chips = [{ key: 'all', label: 'Todas', color: null }].concat(
    Object.entries(CATEGORIES).map(([key, c]) => ({ key, label: c.label, color: c.color }))
  );

  container.innerHTML = chips
    .map((c) => {
      const active = state.ui.activeCategory === c.key ? 'active' : '';
      const style = c.color ? `style="--cat-color:${c.color}"` : '';
      const dot = c.color ? `<span class="chip__dot"></span>` : '';
      return `<button type="button" class="chip ${active}" data-category="${c.key}" ${style}>${dot}${c.label}</button>`;
    })
    .join('');

  container.querySelectorAll('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.ui.activeCategory = btn.dataset.category;
      renderCategoryChips();
      renderTaskList();
    });
  });
}

function getDueTasksForDate(date) {
  return state.tasks.filter((t) => isDueOnDate(t, date));
}

function renderTaskList() {
  const today = new Date();
  const tStr = toDateStr(today);
  const allDueToday = getDueTasksForDate(today);

  // Resumo do dia (sempre reflete TODAS as tarefas devidas, sem filtros).
  const doneCount = allDueToday.filter((t) => isCompletedOnDate(t, tStr)).length;
  document.getElementById('todaySummary').innerHTML =
    allDueToday.length === 0
      ? 'Nenhuma missão programada para hoje.'
      : `<strong>${doneCount}</strong> de ${allDueToday.length} missões concluídas hoje`;

  // Aplica filtro de categoria + busca.
  let visible = allDueToday.filter((t) => {
    const matchesCategory = state.ui.activeCategory === 'all' || t.category === state.ui.activeCategory;
    const matchesSearch = t.name.toLowerCase().includes(state.ui.searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  visible = sortTasks(visible);

  const list = document.getElementById('taskList');
  const empty = document.getElementById('emptyState');

  if (visible.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = visible.map((t) => taskCardHTML(t, tStr)).join('');

  // Listeners de cada card
  visible.forEach((t) => {
    const card = list.querySelector(`[data-task-id="${t.id}"]`);
    card.querySelector('.task-checkbox input').addEventListener('change', () => toggleComplete(t.id));
    card.querySelector('.js-edit').addEventListener('click', () => openTaskModal(t.id));
    card.querySelector('.js-delete').addEventListener('click', () => confirmDeleteTask(t.id));
  });
}

function sortTasks(tasks) {
  const copy = [...tasks];
  switch (state.ui.sortBy) {
    case 'time':
      copy.sort((a, b) => {
        if (!a.time && !b.time) return a.name.localeCompare(b.name);
        if (!a.time) return 1;
        if (!b.time) return -1;
        return a.time.localeCompare(b.time);
      });
      break;
    case 'priority':
      copy.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.name.localeCompare(b.name));
      break;
    case 'points':
      copy.sort((a, b) => b.points - a.points);
      break;
    case 'name':
      copy.sort((a, b) => a.name.localeCompare(b.name));
      break;
    default:
      break;
  }
  return copy;
}

function taskCardHTML(t, tStr) {
  const cat = CATEGORIES[t.category] || CATEGORIES.geral;
  const completed = isCompletedOnDate(t, tStr);
  return `
    <article class="task-card ${completed ? 'completed' : ''}" data-task-id="${t.id}" style="--cat-color:${cat.color}">
      <label class="task-checkbox">
        <input type="checkbox" ${completed ? 'checked' : ''} aria-label="Concluir ${escapeHtml(t.name)}">
        <span class="task-checkbox__box"><svg viewBox="0 0 24 24">${ICONS.check}</svg></span>
      </label>
      <div class="task-card__body">
        <div class="task-card__top">
          <span class="task-card__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[cat.icon]}</svg></span>
          <span class="task-card__name">${escapeHtml(t.name)}</span>
        </div>
        ${t.description ? `<p class="task-card__desc">${escapeHtml(t.description)}</p>` : ''}
        <div class="task-card__meta">
          ${t.time ? `<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS.clock}</svg>${formatTimeLabel(t.time)}</span>` : ''}
          <span><span class="priority-dot priority-dot--${t.priority}"></span>${PRIORITY_LABEL[t.priority]}</span>
          <span>${recurrenceLabel(t.recurrence)}</span>
        </div>
      </div>
      <div class="task-card__points"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS.points}</svg>${t.points}</div>
      <div class="task-card__actions">
        <button type="button" class="js-edit" title="Editar" aria-label="Editar"><svg class="icon" viewBox="0 0 24 24">${ICONS.edit}</svg></button>
        <button type="button" class="js-delete" title="Excluir" aria-label="Excluir"><svg class="icon" viewBox="0 0 24 24">${ICONS.trash}</svg></button>
      </div>
    </article>`;
}

function recurrenceLabel(rec) {
  switch (rec.type) {
    case 'once': return 'Uma vez';
    case 'daily': return 'Todo dia';
    case 'specific-days': return rec.days.map((d) => WEEKDAY_SHORT[d]).join('');
    case 'weekly': return `Toda ${WEEKDAY_FULL[rec.weekday]}`;
    case 'every-x-days': return `A cada ${rec.interval} dias`;
    case 'monthly': return `Dia ${rec.monthDay}/mês`;
    default: return '';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

/* ---------- Sidebar: nível, estatísticas ---------- */

function renderLevelCard() {
  const { level, currentXp, xpNeeded, progress } = getLevelInfo(state.totalPoints);
  document.getElementById('levelValue').textContent = level;
  document.getElementById('xpCurrent').textContent = currentXp;
  document.getElementById('xpNeeded').textContent = xpNeeded;

  const ring = document.getElementById('levelRingProgress');
  const offset = LEVEL_RING_CIRCUMFERENCE * (1 - Math.min(progress, 1));
  ring.style.strokeDasharray = `${LEVEL_RING_CIRCUMFERENCE}`;
  ring.style.strokeDashoffset = `${offset}`;
}

function renderStatsCard() {
  const tStr = todayStr();
  document.getElementById('statTotalPoints').textContent = state.totalPoints;
  document.getElementById('statTodayPoints').textContent = pointsEarnedOn(tStr);
  document.getElementById('statCompleted').textContent = totalCompletionsAllTime();
  document.getElementById('statRate').textContent = `${computeCompletionRate30d()}%`;
  document.getElementById('streakValue').textContent = computeStreak();
}

/* ---------- Sidebar: calendário ---------- */

function renderCalendar() {
  const viewDate = state.ui.calendarViewDate;
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  document.getElementById('calendarMonthLabel').textContent = `${MONTH_NAMES[month]} ${year}`;

  const firstWeekday = new Date(year, month, 1).getDay();
  const totalDays = daysInMonth(year, month + 1);
  const tStr = todayStr();

  let cellsHTML = '';
  for (let i = 0; i < firstWeekday; i += 1) {
    cellsHTML += `<div class="cal-day empty"></div>`;
  }
  for (let day = 1; day <= totalDays; day += 1) {
    const cellDate = new Date(year, month, day);
    const cellStr = toDateStr(cellDate);
    const hasTasks = getDueTasksForDate(cellDate).length > 0;
    const classes = ['cal-day'];
    if (cellStr === tStr) classes.push('today');
    if (cellStr === state.ui.selectedCalendarDate) classes.push('selected');
    cellsHTML += `<button type="button" class="${classes.join(' ')}" data-date="${cellStr}">${day}${hasTasks ? '<span class="cal-day__dot"></span>' : ''}</button>`;
  }

  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = cellsHTML;
  grid.querySelectorAll('.cal-day:not(.empty)').forEach((el) => {
    el.addEventListener('click', () => {
      state.ui.selectedCalendarDate = el.dataset.date;
      renderCalendar();
    });
  });

  renderCalendarDayTasks();
}

function renderCalendarDayTasks() {
  const dStr = state.ui.selectedCalendarDate;
  const date = parseDateStr(dStr);
  const tasks = sortTasks(getDueTasksForDate(date));
  const container = document.getElementById('calendarDayTasks');

  if (tasks.length === 0) {
    container.innerHTML = `<p class="cal-empty-msg">Nenhuma missão em ${date.getDate()} de ${MONTH_NAMES[date.getMonth()].toLowerCase()}.</p>`;
    return;
  }

  container.innerHTML = tasks
    .map((t) => {
      const cat = CATEGORIES[t.category] || CATEGORIES.geral;
      const done = isCompletedOnDate(t, dStr);
      return `<div class="cal-task-row">
        <span class="cal-task-dot" style="--cat-color:${cat.color}"></span>
        <span class="cal-task-name">${escapeHtml(t.name)}${done ? ' ✓' : ''}</span>
        <span class="cal-task-pts">${t.points}</span>
      </div>`;
    })
    .join('');
}

/* ---------- Sidebar: histórico ---------- */

function renderHistoryChart() {
  const days = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - 29);
  for (let i = 0; i < 30; i += 1) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const values = days.map((d) => pointsEarnedOn(toDateStr(d)));
  const max = Math.max(...values, 1);

  const chart = document.getElementById('historyChart');
  chart.innerHTML = values
    .map((v, i) => {
      const heightPct = Math.max((v / max) * 100, 2);
      const label = `${days[i].getDate()}/${days[i].getMonth() + 1}: ${v} pts`;
      return `<div class="history-bar ${v === 0 ? 'zero' : ''}" style="height:${heightPct}%" title="${label}"></div>`;
    })
    .join('');
}

/* --------------------------------------------------------------------------
   8. CRUD DE TAREFAS (MODAL)
   -------------------------------------------------------------------------- */

function createEmptyTaskDefaults() {
  return {
    name: '',
    description: '',
    time: '',
    points: 10,
    category: 'geral',
    priority: 'medium',
    recurrence: { type: 'once', date: todayStr() },
  };
}

function populateCategorySelect() {
  const select = document.getElementById('taskCategory');
  select.innerHTML = Object.entries(CATEGORIES)
    .map(([key, c]) => `<option value="${key}">${c.label}</option>`)
    .join('');
}

function buildWeekdayPicker(container, mode) {
  container.innerHTML = WEEKDAY_SHORT
    .map((label, i) => `<button type="button" class="weekday-toggle" data-day="${i}" title="${WEEKDAY_FULL[i]}">${label}</button>`)
    .join('');

  container.querySelectorAll('.weekday-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const day = Number(btn.dataset.day);
      if (mode === 'multi') {
        const idx = selectedDaysMulti.indexOf(day);
        if (idx >= 0) selectedDaysMulti.splice(idx, 1);
        else selectedDaysMulti.push(day);
        refreshWeekdayPickerUI(container, mode);
      } else {
        selectedWeekdaySingle = day;
        refreshWeekdayPickerUI(container, mode);
      }
    });
  });
  refreshWeekdayPickerUI(container, mode);
}

function refreshWeekdayPickerUI(container, mode) {
  container.querySelectorAll('.weekday-toggle').forEach((btn) => {
    const day = Number(btn.dataset.day);
    const active = mode === 'multi' ? selectedDaysMulti.includes(day) : selectedWeekdaySingle === day;
    btn.classList.toggle('active', active);
  });
}

function updateRecurrenceFieldsVisibility() {
  const type = document.getElementById('taskRecurrence').value;
  document.getElementById('fieldOnceDate').classList.toggle('hidden', type !== 'once');
  document.getElementById('fieldSpecificDays').classList.toggle('hidden', type !== 'specific-days');
  document.getElementById('fieldEveryXDays').classList.toggle('hidden', type !== 'every-x-days');
  document.getElementById('fieldWeekly').classList.toggle('hidden', type !== 'weekly');
  document.getElementById('fieldMonthly').classList.toggle('hidden', type !== 'monthly');
}

function openTaskModal(taskId) {
  editingTaskId = taskId || null;
  const task = taskId ? state.tasks.find((t) => t.id === taskId) : null;
  const data = task || createEmptyTaskDefaults();

  document.getElementById('modalTitle').textContent = task ? 'Editar missão' : 'Nova missão';
  document.getElementById('taskId').value = taskId || '';
  document.getElementById('taskName').value = data.name;
  document.getElementById('taskDescription').value = data.description;
  document.getElementById('taskTime').value = data.time;
  document.getElementById('taskPoints').value = data.points;
  document.getElementById('taskCategory').value = data.category;
  document.getElementById('taskPriority').value = data.priority;
  document.getElementById('taskRecurrence').value = data.recurrence.type;
  document.getElementById('taskOnceDate').value = data.recurrence.date || todayStr();
  document.getElementById('taskInterval').value = data.recurrence.interval || 2;
  document.getElementById('taskMonthDay').value = data.recurrence.monthDay || 1;

  selectedDaysMulti = data.recurrence.type === 'specific-days' ? [...data.recurrence.days] : [];
  selectedWeekdaySingle = data.recurrence.type === 'weekly' ? data.recurrence.weekday : new Date().getDay();
  buildWeekdayPicker(document.getElementById('weekdayPickerMulti'), 'multi');
  buildWeekdayPicker(document.getElementById('weekdayPickerSingle'), 'single');

  updateRecurrenceFieldsVisibility();
  document.getElementById('deleteTaskBtn').classList.toggle('hidden', !task);

  document.getElementById('taskModal').classList.remove('hidden');
  document.getElementById('taskName').focus();
}

function closeTaskModal() {
  document.getElementById('taskModal').classList.add('hidden');
  editingTaskId = null;
}

function buildRecurrenceFromForm() {
  const type = document.getElementById('taskRecurrence').value;
  switch (type) {
    case 'once':
      return { type, date: document.getElementById('taskOnceDate').value || todayStr() };
    case 'daily':
      return { type };
    case 'specific-days':
      return { type, days: selectedDaysMulti.length ? [...selectedDaysMulti].sort() : [new Date().getDay()] };
    case 'weekly':
      return { type, weekday: selectedWeekdaySingle };
    case 'every-x-days':
      return { type, interval: Math.max(2, Number(document.getElementById('taskInterval').value) || 2) };
    case 'monthly':
      return { type, monthDay: Math.min(31, Math.max(1, Number(document.getElementById('taskMonthDay').value) || 1)) };
    default:
      return { type: 'once', date: todayStr() };
  }
}

function handleTaskFormSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('taskName').value.trim();
  if (!name) return;

  const payload = {
    name,
    description: document.getElementById('taskDescription').value.trim(),
    time: document.getElementById('taskTime').value,
    points: Math.max(1, Number(document.getElementById('taskPoints').value) || 1),
    category: document.getElementById('taskCategory').value,
    priority: document.getElementById('taskPriority').value,
    recurrence: buildRecurrenceFromForm(),
  };

  if (editingTaskId) {
    const task = state.tasks.find((t) => t.id === editingTaskId);
    Object.assign(task, payload);
    showToast(`Missão "${name}" atualizada.`, 'success');
  } else {
    state.tasks.push({
      id: generateId(),
      createdDate: todayStr(),
      completedDates: [],
      ...payload,
    });
    showToast(`Missão "${name}" criada.`, 'success');
  }

  saveState();
  closeTaskModal();
  render();
}

function generateId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function confirmDeleteTask(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const earnedPoints = task.points * task.completedDates.length;
  const pointsNote = earnedPoints > 0 ? ` Os ${earnedPoints} pontos já ganhos com ela também serão removidos do seu total.` : '';
  showConfirm('Excluir missão?', `"${task.name}" será removida permanentemente, junto de seu histórico.${pointsNote}`, () => {
    state.totalPoints = Math.max(0, state.totalPoints - earnedPoints);
    state.tasks = state.tasks.filter((t) => t.id !== taskId);
    saveState();
    render();
    showToast(earnedPoints > 0 ? `Missão excluída. -${earnedPoints} pontos removidos.` : 'Missão excluída.', 'danger');
  });
}

/* --------------------------------------------------------------------------
   9. CONCLUSÃO DE TAREFAS
   -------------------------------------------------------------------------- */

function toggleComplete(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const tStr = todayStr();
  const alreadyDone = task.completedDates.includes(tStr);

  if (alreadyDone) {
    task.completedDates = task.completedDates.filter((d) => d !== tStr);
    state.totalPoints = Math.max(0, state.totalPoints - task.points);
  } else {
    task.completedDates.push(tStr);
    state.totalPoints += task.points;
    showToast(`+${task.points} XP · ${task.name}`, 'success');
    const card = document.querySelector(`[data-task-id="${taskId}"]`);
    if (card) {
      card.classList.add('pulse');
      setTimeout(() => card.classList.remove('pulse'), 500);
    }
  }
  saveState();
  render();
}

/* --------------------------------------------------------------------------
   10. FILTROS, BUSCA, ORDENAÇÃO — ver renderTaskList() / sortTasks()
   (os listeners de input estão na seção 13)
   -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
   11. EXPORTAR / IMPORTAR / RESET DIÁRIO
   -------------------------------------------------------------------------- */

function exportData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    tasks: state.tasks,
    totalPoints: state.totalPoints,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `questlog-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Dados exportados com sucesso.', 'success');
}

function importDataFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed.tasks)) throw new Error('Formato inválido');
      showConfirm(
        'Importar dados?',
        'Isso substituirá todas as tarefas e pontuações atuais pelos dados do arquivo selecionado.',
        () => {
          state.tasks = parsed.tasks;
          state.totalPoints = typeof parsed.totalPoints === 'number' ? parsed.totalPoints : 0;
          saveState();
          render();
          showToast('Dados importados com sucesso.', 'success');
        }
      );
    } catch (err) {
      showToast('Arquivo inválido. Verifique o backup exportado.', 'danger');
    }
  };
  reader.readAsText(file);
}

function resetDailyProgress() {
  showConfirm(
    'Reiniciar progresso do dia?',
    'As conclusões e pontos de hoje serão removidos, mas suas tarefas continuam salvas.',
    () => {
      const tStr = todayStr();
      state.tasks.forEach((t) => {
        if (t.completedDates.includes(tStr)) {
          state.totalPoints = Math.max(0, state.totalPoints - t.points);
          t.completedDates = t.completedDates.filter((d) => d !== tStr);
        }
      });
      saveState();
      render();
      showToast('Progresso do dia reiniciado.', 'success');
    }
  );
}

/* --------------------------------------------------------------------------
   12. NOTIFICAÇÕES E TOASTS
   -------------------------------------------------------------------------- */

function showToast(message, type = '') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 200);
  }, 3600);
}

function showConfirm(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  confirmCallback = onConfirm;
  document.getElementById('confirmModal').classList.remove('hidden');
}

function closeConfirm() {
  document.getElementById('confirmModal').classList.add('hidden');
  confirmCallback = null;
}

// ---------- Remoção manual de pontos ----------

function openRemovePointsModal() {
  const input = document.getElementById('removePointsInput');
  document.getElementById('removePointsHint').textContent =
    `Você tem ${state.totalPoints} pontos. Escolha quantos deseja remover do total.`;
  input.max = state.totalPoints;
  input.value = Math.min(10, Math.max(1, state.totalPoints || 1));
  document.getElementById('removePointsModal').classList.remove('hidden');
  input.focus();
}

function closeRemovePointsModal() {
  document.getElementById('removePointsModal').classList.add('hidden');
}

function handleRemovePointsConfirm() {
  const input = document.getElementById('removePointsInput');
  let amount = Math.floor(Number(input.value));
  if (!amount || amount <= 0) {
    showToast('Informe uma quantidade válida de pontos.', 'danger');
    return;
  }
  amount = Math.min(amount, state.totalPoints);
  state.totalPoints = Math.max(0, state.totalPoints - amount);
  saveState();
  render();
  closeRemovePointsModal();
  showToast(`-${amount} pontos removidos do total.`, 'danger');
}

// Verifica periodicamente tarefas com horário próximo (janela de 10 min) e
// ainda não concluídas hoje, avisando via toast e, se permitido, via
// notificação nativa do navegador.
function checkUpcomingTasks() {
  const now = new Date();
  const tStr = toDateStr(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  getDueTasksForDate(now).forEach((task) => {
    if (!task.time || isCompletedOnDate(task, tStr)) return;
    const [h, m] = task.time.split(':').map(Number);
    const taskMinutes = h * 60 + m;
    const diff = taskMinutes - nowMinutes;
    const key = `${task.id}-${tStr}`;
    if (diff >= 0 && diff <= 10 && !state.notifiedToday.has(key)) {
      state.notifiedToday.add(key);
      showToast(`⏰ "${task.name}" começa em breve (${task.time})`, '');
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification('Questlog', { body: `${task.name} — ${task.time}` });
        } catch (e) { /* ambiente pode bloquear notificações nativas */ }
      }
    }
  });
}

function requestNotificationPermission() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

/* --------------------------------------------------------------------------
   13. INICIALIZAÇÃO E LISTENERS
   -------------------------------------------------------------------------- */

function init() {
  loadState();
  populateCategorySelect();
  render();
  attachEventListeners();
  requestNotificationPermission();

  setInterval(checkUpcomingTasks, 30 * 1000);
  // Recarrega a tela periodicamente para refletir a virada do dia
  // (ex.: uma tarefa "de hoje" deixa de estar devida à meia-noite).
  setInterval(render, 60 * 1000);
}

function attachEventListeners() {
  // Topbar
  document.getElementById('addTaskBtn').addEventListener('click', () => openTaskModal(null));
  document.getElementById('resetDayBtn').addEventListener('click', resetDailyProgress);
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', (e) => {
    if (e.target.files[0]) importDataFromFile(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('searchInput').addEventListener('input', (e) => {
    state.ui.searchQuery = e.target.value;
    renderTaskList();
  });
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    state.ui.sortBy = e.target.value;
    renderTaskList();
  });

  // Modal de tarefa
  document.getElementById('closeModalBtn').addEventListener('click', closeTaskModal);
  document.getElementById('cancelTaskBtn').addEventListener('click', closeTaskModal);
  document.getElementById('taskModal').addEventListener('click', (e) => {
    if (e.target.id === 'taskModal') closeTaskModal();
  });
  document.getElementById('taskForm').addEventListener('submit', handleTaskFormSubmit);
  document.getElementById('taskRecurrence').addEventListener('change', updateRecurrenceFieldsVisibility);
  document.getElementById('deleteTaskBtn').addEventListener('click', () => {
    if (editingTaskId) {
      const id = editingTaskId;
      closeTaskModal();
      confirmDeleteTask(id);
    }
  });

  // Modal de confirmação
  document.getElementById('confirmCancelBtn').addEventListener('click', closeConfirm);
  document.getElementById('confirmModal').addEventListener('click', (e) => {
    if (e.target.id === 'confirmModal') closeConfirm();
  });
  document.getElementById('confirmOkBtn').addEventListener('click', () => {
    const cb = confirmCallback;
    closeConfirm();
    if (cb) cb();
  });

  // Remover pontos
  document.getElementById('removePointsBtn').addEventListener('click', openRemovePointsModal);
  document.getElementById('removePointsCancelBtn').addEventListener('click', closeRemovePointsModal);
  document.getElementById('removePointsConfirmBtn').addEventListener('click', handleRemovePointsConfirm);
  document.getElementById('removePointsModal').addEventListener('click', (e) => {
    if (e.target.id === 'removePointsModal') closeRemovePointsModal();
  });

  // Calendário
  document.getElementById('calPrev').addEventListener('click', () => {
    const d = state.ui.calendarViewDate;
    state.ui.calendarViewDate = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    renderCalendar();
  });
  document.getElementById('calNext').addEventListener('click', () => {
    const d = state.ui.calendarViewDate;
    state.ui.calendarViewDate = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    renderCalendar();
  });

  // Atalho: Esc fecha modais abertos
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeTaskModal();
      closeConfirm();
      closeRemovePointsModal();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
