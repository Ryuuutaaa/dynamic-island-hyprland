// Logika daftar tugas: parsing input, normalisasi jam, transformasi state.
//
// MURNI: tidak ada `gi://GLib`, tidak ada akses berkas, tidak ada notifikasi.
// Pemanggil (AGS maupun Electron) yang menyimpan dan mengirim notifikasi.
//
// Bentuk state: { tasks: [{ id, text, done, due, notified }] }

/** Batas waktu pengingat yang terlewat masih dikirim (menit). */
export const CATCHUP_MINUTES = 60;

export const emptyState = () => ({ tasks: [] });

// ── parsing ─────────────────────────────────────────────────────────────

// "Beli susu @14:30" -> { text: 'Beli susu', due: '14:30' }
export const parseInput = raw => {
    const text = String(raw ?? '').trim();
    const match = text.match(/^(.*?)\s*@\s*(\d{1,2})[:.](\d{2})\s*$/);
    if (!match) return { text, due: null };
    const hour = Math.min(23, Math.max(0, Number(match[2])));
    const minute = Math.min(59, Math.max(0, Number(match[3])));
    return {
        text: match[1].trim(),
        due: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    };
};

// "9:5" tidak valid; "9:05" / "09.05" -> "09:05"
export const normalizeDue = value => {
    const match = /^(\d{1,2})[:.](\d{2})$/.exec(String(value ?? '').trim());
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const minutesOf = stamp => {
    const [hour, minute] = String(stamp).split(':').map(Number);
    return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : -1;
};

export { minutesOf };

// ── validasi data tersimpan ─────────────────────────────────────────────
// Dipakai saat memuat berkas: entri rusak dibuang, bukan membuat aplikasi
// gagal start.
export const sanitizeState = saved => {
    const tasks = Array.isArray(saved?.tasks) ? saved.tasks : [];
    return {
        tasks: tasks
            .filter(task => task && typeof task.text === 'string' && task.text.trim())
            .map((task, index) => ({
                id: Number(task.id) || index + 1,
                text: task.text,
                done: !!task.done,
                due: typeof task.due === 'string' ? task.due : null,
                notified: !!task.notified,
            })),
    };
};

// ── transformasi state (kembalikan state BARU) ──────────────────────────

export const nextId = state =>
    state.tasks.reduce((max, task) => Math.max(max, task.id), 0) + 1;

const normalizeDueInput = raw => {
    const text = String(raw ?? '').trim();
    if (!text) return { ok: true, due: null };
    const due = normalizeDue(text);
    return due ? { ok: true, due } : { ok: false, due: null };
};

export const addTask = (state, text, due = null) => {
    const clean = String(text ?? '').trim();
    if (!clean) return { state, task: null };
    const normalized = normalizeDueInput(due);
    if (!normalized.ok) return { state, task: null };
    const task = {
        id: nextId(state),
        text: clean,
        done: false,
        due: normalized.due,
        notified: false,
    };
    return { state: { ...state, tasks: [...state.tasks, task] }, task };
};

// Tambah dari satu baris input: "Beli susu @14:30".
export const addTaskFromInput = (state, raw) => {
    const { text, due } = parseInput(raw);
    if (!text) return { state, task: null };
    const task = { id: nextId(state), text, done: false, due, notified: false };
    return { state: { ...state, tasks: [...state.tasks, task] }, task };
};

export const updateTask = (state, id, text, due = null) => {
    const clean = String(text ?? '').trim();
    if (!clean) return { state, task: null };
    const normalized = normalizeDueInput(due);
    if (!normalized.ok) return { state, task: null };

    let updated = null;
    const tasks = state.tasks.map(task => {
        if (task.id !== Number(id)) return task;
        const dueChanged = task.due !== normalized.due;
        updated = {
            ...task,
            text: clean,
            due: normalized.due,
            // Jam berubah berarti pengingat lama tidak berlaku lagi.
            notified: dueChanged ? false : task.notified,
        };
        return updated;
    });
    if (!updated) return { state, task: null };
    return { state: { ...state, tasks }, task: updated };
};

export const toggleTask = (state, id) => ({
    ...state,
    tasks: state.tasks.map(task =>
        (task.id === id ? { ...task, done: !task.done } : task)),
});

export const removeTask = (state, id) => ({
    ...state,
    tasks: state.tasks.filter(task => task.id !== id),
});

// ── ringkasan & pengingat ───────────────────────────────────────────────

export const doneCount = state => state.tasks.filter(task => task.done).length;
export const totalCount = state => state.tasks.length;

// Tugas yang jatuh tempo pada menit ini tetapi belum diingatkan. Toleransi
// CATCHUP_MINUTES supaya pengingat tidak hilang saat aplikasi baru hidup.
export const dueTasks = (state, nowMinutes) =>
    state.tasks.filter(task => {
        if (task.done || task.notified || !task.due) return false;
        const at = minutesOf(task.due);
        if (at < 0) return false;
        return at <= nowMinutes && nowMinutes - at <= CATCHUP_MINUTES;
    });

// Tandai tugas-tugas itu sudah diingatkan; mengembalikan state baru.
export const markNotified = (state, tasks) => ({
    ...state,
    tasks: state.tasks.map(task =>
        (tasks.includes(task) ? { ...task, notified: true } : task)),
});
