import {
    computeTimes, nextPrayer, skyFor, formatClock, formatDate,
    formatDateShort, formatMinutes, parseIcsEvents, chooseNextEvent,
    recommendModel, METHODS,
} from './lib/core.js';

// Renderer: mengatur state notch, ukuran jendela, dan halaman.
// Logika murni ada di lib/core.js; semua I/O lewat window.island (preload).

const api = window.island;

const GEO = {
    closed: { w: 150, h: 50, ear: 10, r: 16 },
    expanded: { w: 420, h: 140, ear: 22, r: 32 },
    chat: { w: 520, h: 220, ear: 22, r: 32 },
    calendar: { w: 520, h: 272, ear: 22, r: 32 },
};

const PAGES = [
    { id: 'idle', icon: '◷', label: 'Ringkasan' },
    { id: 'prayer', icon: '☾', label: 'Sholat' },
    { id: 'calendar', icon: '▤', label: 'Kalender' },
    { id: 'stats', icon: '▦', label: 'Statistik' },
    { id: 'chat', icon: '✎', label: 'Chat' },
    { id: 'settings', icon: '⚙', label: 'Pengaturan' },
];

const state = {
    hovered: false,
    page: 'idle',
    prayer: null,
    events: [],
    nextEvent: null,
    messages: [],
    chatBusy: false,
    chatModel: '',
    keyStatus: { has: false, masked: '', source: '' },
    battery: { available: false, percent: 0, charging: false },
    info: null,
    support: null,
    platformLabel: '',
};

const el = {
    island: document.getElementById('island'),
    time: document.getElementById('clock-time'),
    date: document.getElementById('clock-date'),
    ring: document.getElementById('ring-value'),
    title: document.getElementById('page-title'),
    platform: document.getElementById('platform-badge'),
    body: document.getElementById('page-body'),
    nav: document.getElementById('nav'),
};

// ── ukuran & state notch ────────────────────────────────────────────────

const targetGeometry = () => {
    if (!state.hovered) return GEO.closed;
    if (state.page === 'chat') return GEO.chat;
    if (state.page === 'calendar') return GEO.calendar;
    return GEO.expanded;
};

const applyGeometry = () => {
    const geo = targetGeometry();
    const root = document.documentElement.style;
    root.setProperty('--notch-w', `${geo.w}px`);
    root.setProperty('--notch-h', `${geo.h}px`);
    root.setProperty('--ear', `${geo.ear}px`);
    root.setProperty('--radius', `${geo.r}px`);

    el.island.classList.toggle('expanded', state.hovered);

    // Jendela TIDAK di-resize (lihat main/index.js). Yang dilaporkan adalah
    // badan notch yang terlihat supaya main process bisa menembuskan klik di
    // luar area itu.
    const bounds = el.island.getBoundingClientRect();
    api.window.notchRect({
        x: Math.round(bounds.left),
        y: Math.round(bounds.top),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
    });
};

// ── jam & baterai ───────────────────────────────────────────────────────

const renderClock = () => {
    const now = new Date();
    el.time.textContent = formatClock(now);
    el.date.textContent = formatDateShort(now);
};

const renderBattery = () => {
    const circumference = 78.54;
    const percent = state.battery.available ? Math.max(0, Math.min(100, state.battery.percent)) : 0;
    el.ring.style.strokeDashoffset = String(circumference * (1 - percent / 100));
    el.ring.classList.toggle('charging', !!state.battery.charging);
};

const pollBattery = async () => {
    state.battery = await api.system.battery();
    renderBattery();
};

// ── sholat ──────────────────────────────────────────────────────────────

const location = () => ({
    latitude: -8.65,
    longitude: 115.2167,
    method: 'kemenag',
});

const refreshPrayer = () => {
    const now = new Date();
    const times = computeTimes(now, location());
    state.prayer = { ...times, location: location(), next: nextPrayer(times, now) };
};

// ── halaman ─────────────────────────────────────────────────────────────

const h = (tag, props = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key.startsWith('on') && typeof value === 'function')
            node.addEventListener(key.slice(2).toLowerCase(), value);
        else if (value !== undefined && value !== null) node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) {
        if (child == null) continue;
        node.append(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
};

const row = (label, value, tone = '') =>
    h('div', { class: 'row' }, [
        h('span', { class: 'label', text: label }),
        h('span', { class: `value ${tone}`.trim(), text: value }),
    ]);

const section = text => h('div', { class: 'section', text });

const renderIdle = () => {
    const now = new Date();
    const next = state.prayer?.next;
    const kids = [
        h('div', { class: 'rows' }, [
            h('div', { class: 'big-clock', text: formatClock(now) }),
            h('div', { class: 'big-date', text: formatDate(now) }),
            section('Ringkasan'),
            row('Baterai', state.battery.available ? `${Math.round(state.battery.percent)}%` : '—'),
            row('Sholat berikutnya', next ? `${next.name} ${next.label}${next.tomorrow ? ' (besok)' : ''}` : '—'),
            row('Acara berikutnya', state.nextEvent?.title ?? '—'),
            row('Platform', state.platformLabel),
        ]),
    ];
    return h('div', {}, kids);
};

const renderPrayer = () => {
    const times = state.prayer?.times ?? [];
    const next = state.prayer?.next;
    const grid = h('div', { class: 'prayer-grid' },
        times.map(time => h('div', {
            class: `prayer${next && next.key === time.key ? ' next' : ''}`,
        }, [
            h('div', { class: 'name', text: time.name }),
            h('div', { class: 'time', text: time.label }),
        ])));
    return h('div', { class: 'rows' }, [
        row('Kota', 'Denpasar · Kemenag'),
        row('Berikutnya', next ? `${next.name} ${next.label}` : '—'),
        grid,
        row('Sky phase', skyFor(state.prayer, nowMinutes()).phase),
    ]);
};

const nowMinutes = () => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
};

const renderCalendar = () => {
    const events = state.events.slice(0, 6);
    const rows = events.map(event => row(
        new Date(event.start).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
        event.title,
    ));
    return h('div', { class: 'rows' }, [
        section(`${state.events.length} acara`),
        ...(rows.length ? rows : [h('div', { class: 'row' }, [h('span', { class: 'label', text: 'Belum ada acara tersimpan' })])]),
    ]);
};

const renderStats = () => {
    const info = state.info ?? {};
    return h('div', { class: 'rows' }, [
        section('Sistem'),
        row('Platform', `${info.platform ?? '?'} / ${info.arch ?? '?'}`),
        row('CPU', `${info.cpus ?? '?'} core · load ${info.load1 ?? '?'}`),
        row('Memori', `${info.memoryUsedMb ?? '?'} / ${info.memoryTotalMb ?? '?'} MB (${info.memoryPercent ?? '?'}%)`),
        row('Uptime', `${Math.floor((info.uptimeSec ?? 0) / 3600)} jam`),
    ]);
};

const renderChat = () => {
    const list = h('div', { class: 'chat-list' });

    if (!state.keyStatus.has) {
        list.append(h('div', { class: 'bubble error' }, [
            'API key Gemini belum di-set. ',
            h('button', {
                class: 'pill',
                text: 'Buka Pengaturan',
                onclick: () => { state.page = 'settings'; render(); },
            }),
        ]));
    }

    for (const message of state.messages) {
        list.append(h('div', { class: `bubble ${message.role}`, text: message.text }));
    }
    if (state.chatBusy) list.append(h('div', { class: 'bubble pending', text: 'Gemini sedang mengetik…' }));

    const input = h('input', {
        class: 'field',
        placeholder: 'Tanya Gemini…',
        'data-chat-input': '1',
    });
    const send = async () => {
        const text = String(input.value ?? '').trim();
        if (!text || state.chatBusy) return;
        input.value = '';
        state.messages.push({ role: 'user', text });
        state.chatBusy = true;
        render();
        const result = await api.chat.send({ messages: state.messages, model: state.chatModel });
        state.chatBusy = false;
        if (result.ok) state.messages.push({ role: 'model', text: result.text });
        else state.messages.push({ role: 'error', text: result.error });
        render();
    };
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') send();
    });

    return h('div', { class: 'rows', style: 'height:100%;display:flex;flex-direction:column' }, [
        list,
        h('div', { class: 'chat-input' }, [
            input,
            h('button', { class: 'pill', text: 'Kirim', onclick: send }),
        ]),
    ]);
};

const renderSettings = () => {
    const keyRow = h('div', { class: 'row' }, [
        h('span', { class: 'label', text: 'API key Gemini' }),
        h('span', {
            class: `value ${state.keyStatus.has ? 'ok' : 'warn'}`,
            text: state.keyStatus.has ? state.keyStatus.masked : 'Belum di-set',
        }),
    ]);

    const keyInput = h('input', {
        class: 'field',
        placeholder: 'Tempel API key Gemini',
        type: 'password',
        style: 'width:100%',
    });
    const message = h('div', { class: 'row' }, [h('span', { class: 'value', text: '' })]);

    const save = async () => {
        message.firstChild.textContent = 'Menguji key…';
        const result = await api.chat.saveKey(keyInput.value);
        if (!result.ok) {
            message.firstChild.textContent = `Gagal: ${result.error}`;
            message.firstChild.className = 'value warn';
            return;
        }
        const model = recommendModel(result.models) ?? 'gemini-3.5-flash-lite';
        state.chatModel = model;
        await api.store.set({ chatModel: model });
        state.keyStatus = await api.chat.keyStatus();
        keyInput.value = '';
        message.firstChild.textContent = `Siap. ${result.models.length} model, dipakai ${model}.`;
        message.firstChild.className = 'value ok';
        render();
    };

    return h('div', { class: 'rows' }, [
        section('Gemini'),
        keyRow,
        keyInput,
        h('div', { style: 'display:flex;gap:5px' }, [
            h('button', { class: 'pill', text: 'Uji & simpan', onclick: save }),
            h('button', {
                class: 'pill',
                text: 'Hapus',
                onclick: async () => {
                    await api.chat.clearKey();
                    state.keyStatus = await api.chat.keyStatus();
                    render();
                },
            }),
        ]),
        message,
        section('Dukungan platform'),
        ...Object.entries(state.support?.features ?? {}).map(([name, ok]) =>
            row(name, ok ? 'tersedia' : 'tidak tersedia', ok ? 'ok' : 'warn')),
    ]);
};

const RENDERERS = {
    idle: renderIdle,
    prayer: renderPrayer,
    calendar: renderCalendar,
    stats: renderStats,
    chat: renderChat,
    settings: renderSettings,
};

const renderNav = () => {
    el.nav.replaceChildren(
        h('button', { text: '‹', onclick: () => step(-1), 'aria-label': 'Sebelumnya' }),
        h('div', { class: 'tabs' }, PAGES.map(page => h('button', {
            class: `tab${page.id === state.page ? ' active' : ''}`,
            title: page.label,
            text: page.icon,
            onclick: () => { state.page = page.id; render(); },
        }))),
        h('button', { text: '›', onclick: () => step(1), 'aria-label': 'Berikutnya' }),
    );
};

const step = delta => {
    const index = PAGES.findIndex(page => page.id === state.page);
    const next = (index + delta + PAGES.length) % PAGES.length;
    state.page = PAGES[next].id;
    render();
};

const render = () => {
    const page = PAGES.find(entry => entry.id === state.page) ?? PAGES[0];
    el.title.textContent = page.label;
    el.body.replaceChildren((RENDERERS[state.page] ?? renderIdle)());
    renderNav();
    applyGeometry();

    // Fokus otomatis ke input chat/settings saat halaman itu dibuka lewat klik.
    if (state.hovered && (state.page === 'chat' || state.page === 'settings')) {
        const field = el.body.querySelector('input.field');
        if (field && document.activeElement !== field) field.focus({ preventScroll: true });
    }
};

// ── hover: masuk/keluar notch ───────────────────────────────────────────

const setHovered = value => {
    if (state.hovered === value) return;
    state.hovered = value;
    render();
};

// Hover dideteksi lewat posisi kursor dari main process, BUKAN mouseenter:
// jendela mencakup area transparan yang jauh lebih besar dari notch, jadi
// event mouse bisa tidak pernah sampai saat kursor masuk dari aplikasi lain
// (klik ditembuskan). Polling 80ms cukup halus untuk transisi 620ms.
const startHoverWatch = () => {
    setInterval(async () => {
        const point = await api.window.pointer();
        const bounds = el.island.getBoundingClientRect();
        const inside = point.x >= bounds.left && point.x <= bounds.right
            && point.y >= bounds.top && point.y <= bounds.bottom;
        // Saat terbuka, jangan tutup selama kursor masih di dalam notch.
        setHovered(inside);
    }, 80);
};

// Klik di luar notch tidak terdeteksi oleh Electron tanpa window transparan
// penuh layar; sebagai gantinya, klik pada notch yang sedang terbuka tidak
// menutup, dan mouseleave menutup. Itu perilaku yang sama dengan versi GTK.

// ── data berkala ────────────────────────────────────────────────────────

const loadKeyStatus = async () => {
    state.keyStatus = await api.chat.keyStatus();
    const saved = await api.store.get('chatModel');
    state.chatModel = saved || 'gemini-3.5-flash-lite';
};

const loadCalendar = async () => {
    // Feed ICS diisi lewat halaman Pengaturan versi ini (file feed.json).
    const feed = await api.store.get('calendar');
    if (!feed?.icsText) return;
    state.events = parseIcsEvents(feed.icsText);
    state.nextEvent = chooseNextEvent(state.events);
};

const boot = async () => {
    const platformInfo = await api.platform();
    // Objek dari contextBridge bersifat FROZEN: menambah properti padanya
    // melempar TypeError dan mematikan seluruh boot. Simpan di state.
    state.platformLabel = `${platformInfo.platform}-${platformInfo.arch}`;
    el.platform.textContent = state.platformLabel;

    state.info = await api.system.info();
    state.support = await api.system.support();

    await loadKeyStatus();
    await loadCalendar();
    refreshPrayer();
    renderClock();
    await pollBattery();
    render();

    startHoverWatch();

    setInterval(renderClock, 1000);
    setInterval(refreshPrayer, 30_000);
    setInterval(pollBattery, 60_000);
};

// Hook uji: dipakai untuk memverifikasi halaman tanpa klik koordinat.
// Tidak disimpan di produksi? Ini aplikasi desktop lokal; hook ini hanya
// membaca/mengubah state UI, bukan akses sistem.
window.__island = {
    state,
    go: id => { state.page = id; render(); },
    expand: value => { state.hovered = !!value; render(); },
    pages: () => PAGES.map(page => page.id),
};

boot();
