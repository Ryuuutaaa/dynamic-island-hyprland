import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import {
    wifi, scan, connect, disconnect, toggleRadio, openPortal,
    securityLabel, isEnterprise,
} from './wifi.js';
import { eventButton, scrollDelta } from './pointer.js';
import { page } from '../state.js';

const WIFI_GLYPH = '\uf1eb';
const LOCK_GLYPH = '\uf023';
const SCAN_GLYPH = '\uf021';

const LIST_W = 210;
const LIST_H = 90;
const RIGHT_W = 204;

const signalClass = signal =>
    signal >= 65 ? 'is-strong' : signal >= 40 ? 'is-mid' : 'is-weak';

const badgeFor = (item, state) => {
    if (state.busy === item.ssid) return ['…', 'is-busy', false];
    if (state.connected === item.ssid) return ['Putus', 'is-on', true];
    if (isEnterprise(item.security)) return ['Manual', 'is-manual', false];
    return ['Sambung', '', false];
};

const DeviceRow = (item, selected, state, onSelect, onToggle) => {
    const [badgeText, badgeState, showDot] = badgeFor(item, state);
    const signal = Widget.Label({
        className: `dyn-island-wf-signal ${signalClass(item.signal)}`,
        label: WIFI_GLYPH,
    });
    const name = Widget.Label({
        className: 'dyn-island-wf-device-name',
        label: item.ssid,
        truncate: 'end',
        maxWidthChars: 14,
        xalign: 0,
    });
    const nameChildren = [signal, name];
    if (item.security)
        nameChildren.push(Widget.Label({ className: 'dyn-island-wf-lock', label: LOCK_GLYPH }));
    const badgeLabel = Widget.Label({
        className: 'dyn-island-wf-badge-label',
        label: badgeText,
    });
    // Dot hanya dimasukkan saat terhubung: show_all milik container akan
    // menampilkan kembali child yang visible=false.
    const badgeChildren = showDot
        ? [Widget.Label({ className: 'dyn-island-wf-badge-dot', label: '●' }), badgeLabel]
        : [badgeLabel];
    const badge = Widget.Button({
        className: `dyn-island-wf-badge ${badgeState}`.trim(),
        child: Widget.Box({
            spacing: 8,
            halign: Gtk.Align.CENTER,
            children: badgeChildren,
        }),
        sensitive: state.enabled && state.busy !== item.ssid,
        tooltipText: state.connected === item.ssid
            ? `Putuskan ${item.ssid}`
            : `Sambungkan ${item.ssid}`,
        onClicked: () => onToggle(item),
    });

    const row = Widget.EventBox({
        className: `dyn-island-wf-device${selected ? ' is-selected' : ''}`,
        child: Widget.CenterBox({
            startWidget: Widget.Box({ spacing: 7, children: nameChildren }),
            endWidget: badge,
        }),
        setup: self => {
            self.connect('button-press-event', (_w, event) => {
                if (eventButton(event) !== 1) return false;
                onSelect(item);
                return true;
            });
        },
    });
    row.set_size_request(LIST_W, -1);
    return row;
};

export default () => {
    let selectedSsid = null;
    let userSelected = false;

    // ── kolom kiri: judul, aksi, daftar jaringan ─────────────────────────────
    const scanningLabel = Widget.Label({ className: 'dyn-island-wf-scanning', label: 'memindai…' });
    const powerDot = Widget.Label({ className: 'dyn-island-wf-power-dot', label: '●' });
    const powerLabel = Widget.Label({ className: 'dyn-island-wf-power-label', label: 'Aktif' });
    const power = Widget.Button({
        className: 'dyn-island-wf-power',
        child: Widget.Box({ spacing: 6, children: [powerDot, powerLabel] }),
        tooltipText: 'Nyalakan / matikan Wi-Fi',
        onClicked: () => toggleRadio(),
    });
    const scanButton = Widget.Button({
        className: 'dyn-island-wf-iconbtn',
        child: Widget.Label({ className: 'dyn-island-wf-iconbtn-label', label: SCAN_GLYPH }),
        tooltipText: 'Pindai ulang',
        onClicked: () => scan(true),
    });
    const title = Widget.Label({ className: 'dyn-island-wf-title', label: 'Wi-Fi' });
    const header = Widget.CenterBox({
        className: 'dyn-island-wf-header',
        startWidget: Widget.Box({ spacing: 8, children: [title, scanningLabel] }),
        endWidget: Widget.Box({ spacing: 8, children: [scanButton, power] }),
    });
    header.set_size_request(LIST_W, 22);

    const list = Widget.Box({ className: 'dyn-island-wf-list', vertical: true, spacing: 3 });
    const pane = Widget.Scrollable({
        className: 'dyn-island-wf-pane',
        hscroll: 'never',
        vscroll: 'external',
    });
    pane.child = list;
    pane.set_size_request(LIST_W, LIST_H);

    for (const widget of [scanningLabel])
        widget.set_no_show_all(true);

    const scrollPane = event => {
        const dy = scrollDelta(event);
        if (!dy) return false;
        const adjustment = pane.get_vadjustment();
        if (!adjustment) return false;
        const max = Math.max(0, adjustment.upper - adjustment.page_size);
        if (max <= 0) return false;
        adjustment.value = Math.max(0, Math.min(max, adjustment.value + dy * 36));
        return true;
    };
    pane.connect('scroll-event', (_self, event) => scrollPane(event));

    const left = Widget.Box({
        className: 'dyn-island-wf-left',
        vertical: true,
        spacing: 4,
        widthRequest: LIST_W,
        valign: Gtk.Align.CENTER,
        children: [header, pane],
    });

    // ── kolom kanan: panel detail ────────────────────────────────────────────
    const icon = Widget.Label({ className: 'dyn-island-wf-icon', label: WIFI_GLYPH });
    const name = Widget.Label({
        className: 'dyn-island-wf-name',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 14,
    });
    const meta = Widget.Label({
        className: 'dyn-island-wf-meta',
        xalign: 0,
        truncate: 'end',
        maxWidthChars: 22,
    });
    const statusDot = Widget.Label({ className: 'dyn-island-wf-status-dot', label: '●' });
    const statusText = Widget.Label({ className: 'dyn-island-wf-status-text' });
    const ipLabel = Widget.Label({
        className: 'dyn-island-wf-ip',
        xalign: 1,
        truncate: 'end',
        maxWidthChars: 16,
    });
    const status = Widget.CenterBox({
        className: 'dyn-island-wf-status',
        startWidget: Widget.Box({ spacing: 8, children: [statusDot, statusText] }),
        endWidget: ipLabel,
    });
    const portalButton = Widget.Button({
        className: 'dyn-island-wf-portal',
        child: Widget.Label({
            className: 'dyn-island-wf-portal-label',
            label: 'Buka halaman login',
        }),
        onClicked: () => openPortal(),
    });
    const hint = Widget.Label({
        className: 'dyn-island-wf-hint',
        xalign: 0,
        wrap: true,
        maxWidthChars: 24,
    });

    const head = Widget.Box({
        className: 'dyn-island-wf-head',
        spacing: 8,
        valign: Gtk.Align.CENTER,
        children: [
            icon,
            Widget.Box({
                className: 'dyn-island-wf-text',
                vertical: true,
                spacing: 4,
                widthRequest: 136,
                valign: Gtk.Align.CENTER,
                children: [name, meta],
            }),
        ],
    });

    const detail = Widget.Box({
        className: 'dyn-island-wf-detail',
        vertical: true,
        spacing: 8,
        children: [head, status, portalButton, hint],
    });

    const emptyIcon = Widget.Label({ className: 'dyn-island-wf-empty-icon', label: WIFI_GLYPH });
    const emptyTitle = Widget.Label({ className: 'dyn-island-wf-empty-title' });
    const emptyHint = Widget.Label({
        className: 'dyn-island-wf-empty-hint',
        wrap: true,
        maxWidthChars: 24,
        justify: Gtk.Justification.CENTER,
    });
    const empty = Widget.Box({
        className: 'dyn-island-wf-empty-box',
        vertical: true,
        spacing: 8,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [emptyIcon, emptyTitle, emptyHint],
    });

    const right = Widget.Box({
        className: 'dyn-island-wf-panel',
        vertical: true,
        widthRequest: RIGHT_W,
        valign: Gtk.Align.CENTER,
        children: [detail, empty],
    });

    for (const widget of [status, portalButton, hint, detail, empty])
        widget.set_no_show_all(true);

    const selectedNetwork = () => {
        const { networks, connected } = wifi.value;
        if (!networks.length) return null;
        let item = userSelected
            ? networks.find(entry => entry.ssid === selectedSsid)
            : null;
        if (!item) {
            item = networks.find(entry => entry.ssid === connected)
                ?? networks[0];
            selectedSsid = item?.ssid ?? null;
        }
        return item ?? null;
    };

    const select = item => {
        userSelected = true;
        selectedSsid = item.ssid;
        refresh();
    };

    const toggle = item => {
        if (!wifi.value.enabled || wifi.value.busy) return;
        userSelected = true;
        selectedSsid = item.ssid;
        if (item.ssid === wifi.value.connected) disconnect();
        else connect(item.ssid);
        refresh();
    };

    const refresh = () => {
        const state = wifi.value;
        powerLabel.label = state.enabled ? 'Aktif' : 'Mati';
        power.className = `dyn-island-wf-power${state.enabled ? ' is-on' : ''}`;
        powerDot.className = `dyn-island-wf-power-dot${state.enabled ? ' is-on' : ''}`;
        scanButton.sensitive = state.enabled && !state.scanning;
        scanningLabel.visible = state.scanning;
        if (state.scanning) scanningLabel.show();

        const networks = state.networks;
        const selected = selectedNetwork();

        list.children = networks.length
            ? networks.map(item => DeviceRow(
                item,
                item.ssid === selected?.ssid,
                state,
                select,
                toggle))
            : [Widget.Label({
                className: 'dyn-island-wf-empty',
                label: state.enabled
                    ? (state.scanning ? 'Memindai…' : 'Tidak ada jaringan')
                    : 'Wi-Fi nonaktif',
                xalign: 0,
            })];

        // Panel kanan: detail kalau ada jaringan, empty state kalau tidak.
        if (!selected) {
            detail.visible = false;
            empty.visible = true;
            emptyIcon.className = `dyn-island-wf-empty-icon${state.enabled ? '' : ' is-off'}`;
            emptyTitle.label = state.enabled ? 'Tidak ada jaringan' : 'Wi-Fi nonaktif';
            emptyHint.label = state.enabled
                ? 'Tekan pindai untuk mencari jaringan.'
                : 'Tekan tombol daya untuk menyalakan.';
            return;
        }

        detail.visible = true;
        empty.visible = false;

        const connected = state.connected === selected.ssid;
        const portal = connected && state.connectivity === 'portal';
        const busy = state.busy === selected.ssid;

        icon.className = `dyn-island-wf-icon ${signalClass(selected.signal)}`;
        name.label = selected.ssid;
        name.tooltipText = selected.ssid;
        meta.label = `${securityLabel(selected.security)} · ${selected.signal}%`
            + (selected.saved ? ' · tersimpan' : '');
        meta.tooltipText = meta.label;

        status.visible = true;
        statusDot.className = 'dyn-island-wf-status-dot'
            + (portal ? ' is-portal' : connected ? ' is-on' : '');
        statusText.label = busy
            ? 'Menyambungkan…'
            : portal ? 'Butuh login'
                : connected ? 'Tersambung' : 'Tidak tersambung';
        ipLabel.label = connected && state.ip ? state.ip : '';
        ipLabel.tooltipText = ipLabel.label;

        portalButton.visible = portal && !busy;
        hint.visible = !portal;
        hint.className = `dyn-island-wf-hint${state.error ? ' is-error' : ''}`;
        if (state.error) hint.label = state.error;
        else if (busy) hint.label = 'Menunggu jawaban dari jaringan…';
        else if (connected) hint.label = 'Terhubung ke internet.';
        else if (isEnterprise(selected.security)) hint.label = 'Jaringan 802.1X butuh pengaturan identitas.';
        else hint.label = selected.security
            ? 'Tekan Sambung untuk memasukkan password.'
            : 'Jaringan terbuka, langsung tersambung.';
    };

    return Widget.Box({
        className: 'dyn-island-wifi',
        spacing: 14,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [left, right],
        setup: self => {
            refresh();
            self.hook(wifi, refresh);
            self.hook(page, () => {
                if (page.value === 'wifi') scan(true);
            });
            self.connect('map', () => {
                const top = self.get_toplevel();
                if (!top || top.__wfScrollHooked) return;
                top.__wfScrollHooked = true;
                top.connect('scroll-event', (_w, event) => {
                    if (page.value !== 'wifi' || !pane.get_mapped()) return false;
                    return scrollPane(event);
                });
            });
        },
    });
};
