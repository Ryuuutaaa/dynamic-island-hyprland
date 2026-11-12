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

const PAGE_W = 428;
const LIST_H = 88;

const signalClass = signal =>
    signal >= 65 ? 'is-strong' : signal >= 40 ? 'is-mid' : 'is-weak';

const actionFor = (item, state) => {
    if (state.busy === item.ssid) return ['…', 'is-busy'];
    if (state.connected === item.ssid) return ['Putus', 'is-on'];
    if (isEnterprise(item.security)) return ['Manual', 'is-manual'];
    return ['Sambung', ''];
};

// Satu baris = satu jaringan. Seluruh baris adalah target klik
// (sambung/putus); teks action di kanan hanya penanda visual.
const DeviceRow = (item, state, onToggle) => {
    const connected = state.connected === item.ssid;
    const [actionText, actionState] = actionFor(item, state);
    const signal = Widget.Label({
        className: `dyn-island-wf-signal ${signalClass(item.signal)}`,
        label: WIFI_GLYPH,
    });
    const name = Widget.Label({
        className: 'dyn-island-wf-device-name',
        label: item.ssid,
        truncate: 'end',
        maxWidthChars: 30,
        xalign: 0,
        hexpand: true,
    });
    const nameChildren = [signal, name];
    if (item.security)
        nameChildren.push(Widget.Label({ className: 'dyn-island-wf-lock', label: LOCK_GLYPH }));

    const action = Widget.Label({
        className: `dyn-island-wf-action ${actionState}`.trim(),
        label: actionText,
    });

    const meta = `${securityLabel(item.security)} · ${item.signal}%`
        + (item.saved ? ' · tersimpan' : '');
    const row = Widget.EventBox({
        className: `dyn-island-wf-device${connected ? ' is-connected' : ''}`,
        tooltipText: `${item.ssid}\n${meta}`
            + (isEnterprise(item.security) ? '\n802.1X butuh pengaturan identitas.' : ''),
        child: Widget.Box({
            spacing: 8,
            valign: Gtk.Align.CENTER,
            children: [...nameChildren, action],
        }),
        setup: self => {
            self.connect('button-press-event', (_w, event) => {
                if (eventButton(event) !== 1) return false;
                onToggle(item);
                return true;
            });
        },
    });
    row.set_size_request(PAGE_W, -1);
    return row;
};

export default () => {
    // ── header: judul + status ringkas + aksi ────────────────────────────────
    const title = Widget.Label({ className: 'dyn-island-wf-title', label: 'Wi-Fi' });
    const context = Widget.Label({
        className: 'dyn-island-wf-context',
        truncate: 'end',
        maxWidthChars: 34,
    });

    const powerIcon = Widget.Label({
        className: 'dyn-island-wf-power-icon',
        label: '\uf011',
    });
    const power = Widget.Button({
        className: 'dyn-island-wf-power',
        child: powerIcon,
        tooltipText: 'Nyalakan / matikan Wi-Fi',
        onClicked: () => toggleRadio(),
    });
    const scanButton = Widget.Button({
        className: 'dyn-island-wf-iconbtn',
        tooltipText: 'Pindai ulang',
        child: Widget.Label({ className: 'dyn-island-wf-iconbtn-label', label: SCAN_GLYPH }),
        onClicked: () => scan(true),
    });
    const loginButton = Widget.Button({
        className: 'dyn-island-wf-login',
        tooltipText: 'Buka halaman login captive portal',
        child: Widget.Label({ className: 'dyn-island-wf-login-label', label: 'Login' }),
        onClicked: () => openPortal(),
    });
    loginButton.set_no_show_all(true);

    const header = Widget.CenterBox({
        className: 'dyn-island-wf-header',
        startWidget: Widget.Box({ spacing: 8, children: [title, context] }),
        endWidget: Widget.Box({ spacing: 4, children: [loginButton, scanButton, power] }),
    });
    header.set_size_request(PAGE_W, 24);

    // ── satu kolom: daftar jaringan ─────────────────────────────────────────
    const list = Widget.Box({ className: 'dyn-island-wf-list', vertical: true, spacing: 2 });
    const pane = Widget.Scrollable({
        className: 'dyn-island-wf-pane',
        hscroll: 'never',
        vscroll: 'external',
    });
    pane.child = list;
    pane.set_size_request(PAGE_W, LIST_H);

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

    const toggle = item => {
        if (!wifi.value.enabled || wifi.value.busy) return;
        if (isEnterprise(item.security)) return;
        if (item.ssid === wifi.value.connected) disconnect();
        else connect(item.ssid);
    };

    const refresh = () => {
        const state = wifi.value;
        power.className = `dyn-island-wf-power${state.enabled ? ' is-on' : ''}`;
        powerIcon.className = `dyn-island-wf-power-icon${state.enabled ? ' is-on' : ''}`;
        power.tooltipText = state.enabled ? 'Matikan Wi-Fi' : 'Nyalakan Wi-Fi';
        scanButton.sensitive = state.enabled && !state.scanning;

        const error = String(state.error ?? '').trim();
        const portal = state.connectivity === 'portal' && !!state.connected;
        let contextText = '';
        let contextClass = '';
        let contextTooltip = '';
        if (error) {
            contextText = error;
            contextClass = 'is-error';
            contextTooltip = error;
        } else if (state.busy) {
            contextText = 'Menyambungkan…';
            contextTooltip = `Menyambungkan ke ${state.busy}`;
        } else if (portal) {
            contextText = 'Butuh login';
            contextClass = 'is-portal';
            contextTooltip = `${state.connected} butuh login lewat web`;
        } else if (state.connected) {
            contextText = 'Tersambung';
            contextTooltip = `${state.connected}${state.ip ? ` · ${state.ip}` : ''}`;
        } else if (state.scanning) {
            contextText = 'Memindai…';
        } else if (!state.enabled) {
            contextText = 'Nonaktif';
        } else {
            contextText = 'Tidak tersambung';
        }
        context.label = contextText;
        context.className = `dyn-island-wf-context ${contextClass}`.trim();
        context.tooltipText = contextTooltip;

        loginButton.visible = portal && !state.busy;
        if (loginButton.visible) {
            loginButton.show();
            loginButton.child.show();
        }

        const networks = state.networks;
        list.children = networks.length
            ? networks.map(item => DeviceRow(item, state, toggle))
            : [Widget.Label({
                className: 'dyn-island-wf-empty',
                label: state.enabled
                    ? (state.scanning ? 'Memindai…' : 'Tidak ada jaringan')
                    : 'Wi-Fi nonaktif',
                xalign: 0.5,
                halign: Gtk.Align.CENTER,
                valign: Gtk.Align.CENTER,
                vexpand: true,
            })];
    };

    return Widget.Box({
        className: 'dyn-island-wifi',
        vertical: true,
        spacing: 4,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        children: [header, pane],
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
