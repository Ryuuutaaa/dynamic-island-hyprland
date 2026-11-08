import Gtk from 'gi://Gtk?version=3.0';
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import {
    wifi, scan, connect, disconnect, toggleRadio, openPortal,
    securityLabel, isEnterprise,
} from './wifi.js';
import { eventButton } from './pointer.js';
import { page } from '../state.js';

const WIFI_GLYPH = '\uf1eb';
const LOCK_GLYPH = '\uf023';
const SCAN_GLYPH = '\uf021';

const LIST_W = 200;
const LIST_H = 70;
const RIGHT_W = 190;

const signalClass = signal =>
    signal >= 65 ? 'is-strong' : signal >= 40 ? 'is-mid' : 'is-weak';

const badgeFor = (item, state) => {
    if (state.busy === item.ssid) return ['…', 'is-busy'];
    if (state.connected === item.ssid) return ['Putus', 'is-on'];
    if (isEnterprise(item.security)) return ['Manual', 'is-manual'];
    return ['Sambung', ''];
};

const DeviceRow = (item, selected, state, onSelect, onToggle) => {
    const [badgeText, badgeState] = badgeFor(item, state);
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
    const lock = Widget.Label({
        className: 'dyn-island-wf-lock',
        label: LOCK_GLYPH,
        visible: !!item.security,
    });
    const badge = Widget.Button({
        className: `dyn-island-wf-badge ${badgeState}`.trim(),
        child: Widget.Label({ className: 'dyn-island-wf-badge-label', label: badgeText }),
        sensitive: state.enabled && state.busy !== item.ssid,
        tooltipText: state.connected === item.ssid
            ? `Putuskan ${item.ssid}`
            : `Sambungkan ${item.ssid}`,
        onClicked: () => onToggle(item),
    });

    const row = Widget.EventBox({
        className: `dyn-island-wf-device${selected ? ' is-selected' : ''}`,
        child: Widget.CenterBox({
            startWidget: Widget.Box({ spacing: 6, children: [signal, name, lock] }),
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

    // ── kolom kiri ───────────────────────────────────────────────────────────
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
        startWidget: Widget.Box({ spacing: 4, children: [title, scanButton] }),
        endWidget: power,
    });
    header.set_size_request(LIST_W, -1);

    const list = Widget.Box({ className: 'dyn-island-wf-list', vertical: true, spacing: 2 });
    const pane = Widget.Scrollable({
        className: 'dyn-island-wf-pane',
        hscroll: 'never',
        vscroll: 'external',
    });
    pane.child = list;
    pane.set_size_request(LIST_W, LIST_H);

    const scrollPane = event => {
        let dy = 0;
        try {
            const deltas = event.get_scroll_deltas?.();
            if (Array.isArray(deltas) && deltas[0]) dy = Number(deltas[2]) || 0;
        } catch (_) { }
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
        spacing: 6,
        widthRequest: LIST_W,
        valign: Gtk.Align.CENTER,
        children: [header, pane],
    });

    // ── kolom kanan ──────────────────────────────────────────────────────────
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
        maxWidthChars: 20,
    });
    const statusDot = Widget.Label({ className: 'dyn-island-wf-status-dot', label: '●' });
    const statusText = Widget.Label({ className: 'dyn-island-wf-status-text' });
    const status = Widget.Box({
        className: 'dyn-island-wf-status',
        spacing: 6,
        valign: Gtk.Align.CENTER,
        children: [statusDot, statusText],
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
        maxWidthChars: 26,
    });

    const head = Widget.Box({
        className: 'dyn-island-wf-head',
        spacing: 10,
        valign: Gtk.Align.CENTER,
        widthRequest: RIGHT_W,
        children: [
            icon,
            Widget.Box({
                className: 'dyn-island-wf-text',
                vertical: true,
                spacing: 1,
                widthRequest: 132,
                valign: Gtk.Align.CENTER,
                children: [name, meta],
            }),
        ],
    });

    const right = Widget.Box({
        className: 'dyn-island-wf-right',
        vertical: true,
        spacing: 6,
        widthRequest: RIGHT_W,
        valign: Gtk.Align.CENTER,
        children: [head, status, portalButton, hint],
    });

    for (const widget of [status, portalButton, hint])
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

        if (!selected) {
            icon.className = 'dyn-island-wf-icon is-weak';
            name.label = state.enabled ? 'Tidak ada jaringan' : 'Wi-Fi nonaktif';
            meta.label = state.enabled ? 'Tekan pindai untuk mencari' : 'Nyalakan untuk memakai';
            status.visible = false;
            portalButton.visible = false;
            hint.visible = true;
            hint.className = 'dyn-island-wf-hint';
            hint.label = state.enabled
                ? 'Belum ada jaringan yang terdeteksi di sekitar.'
                : 'Tekan tombol daya di kiri untuk menyalakan Wi-Fi.';
            return;
        }

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
        statusDot.className = `dyn-island-wf-status-dot`
            + (portal ? ' is-portal' : connected && state.connectivity !== 'portal' ? ' is-on' : '');
        statusText.label = busy
            ? 'Menyambungkan…'
            : portal ? 'Butuh login'
                : connected ? 'Tersambung' : 'Tidak tersambung';

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
        spacing: 12,
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
