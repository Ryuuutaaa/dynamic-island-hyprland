// Parser output `dbus-monitor` untuk notifikasi Desktop Notifications Spec.
//
// Dipisah dari ipc/notifications.js supaya bisa diuji tanpa spawn proses
// (dan tanpa Electron). Semua masukan berupa baris teks; keluaran berupa
// objek notifikasi atau null.
//
// Kenapa parser manual: dbus-monitor mencetak isi string APA ADANYA, jadi
// newline dari aplikasi menjadi baris baru. Notifikasi web Chromium berbentuk
// "<origin>\n\n<body>", sehingga body selalu multi-baris.

const decode = text => text
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\\\/g, '\\');

export function createNotifyParser(onNotify) {
    let capturing = false;
    let fields = [];
    let pending = null;      // { parts: string[] } untuk string multi-baris
    let inActions = false;
    let sawActions = false;

    const take = value => {
        if (inActions) return;          // actions = pasangan key/label
        if (!sawActions) fields.push(value);
    };

    const flush = () => {
        if (!capturing) return;
        capturing = false;
        const captured = fields;
        fields = [];
        inActions = false;
        sawActions = false;
        pending = null;
        // Argumen Notify: app, replaces_id(uint32), icon, summary, body
        if (captured.length < 3) return;
        const [app, icon, summary, body = ''] = captured;
        if (!summary && !body) return;
        onNotify({
            app: decode(app),
            title: decode(summary ?? ''),
            body: decode(body).replace(/\n{2,}/g, '\n').trim(),
        });
    };

    return line => {
        if (line.includes('member=Notify')) {
            flush();
            capturing = true;
            fields = [];
            inActions = false;
            sawActions = false;
            pending = null;
            return;
        }
        if (!capturing) return;

        // Lanjutan string multi-baris: selesai saat kutip penutup muncul.
        if (pending) {
            pending.parts.push(line);
            if (line.endsWith('"')) {
                const value = pending.parts.join('\n').slice(0, -1);
                pending = null;
                take(decode(value));
            }
            return;
        }

        // uint32 = replaces_id (argumen kedua), tidak dipakai.
        if (!sawActions && /^\s*uint32 \d+$/.test(line)) return;

        if (/^\s*array \[/.test(line)) {
            if (!sawActions) { inActions = true; sawActions = true; }
            return;
        }
        if (/^\s*\]/.test(line)) { inActions = false; return; }

        // expire_time menutup argumen Notify.
        if (/^\s*int32 -?\d+$/.test(line)) { flush(); return; }

        const match = /^\s*string "(.*)$/.exec(line);
        if (!match) return;
        if (match[1].endsWith('"')) take(decode(match[1].slice(0, -1)));
        else pending = { parts: [match[1]] };
    };
}

export default createNotifyParser;
