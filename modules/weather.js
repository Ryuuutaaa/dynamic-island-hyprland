import GLib from 'gi://GLib';
import Variable from 'resource:///com/github/Aylur/ags/variable.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import CONFIG from '../config.js';

// Cuaca dari Open-Meteo: gratis, tanpa API key, tanpa akun.
// Koordinat mengikuti config `prayer.latitude/longitude` kecuali diisi sendiri
// di `config.weather`. Data terakhir di-cache ke disk supaya notch tetap punya
// isi saat offline; refresh default 15 menit dan hanya berjalan kalau modul
// weather dipakai.

const DIR = `${GLib.get_user_data_dir()}/dynamic-iland`;
const FILE = `${DIR}/weather.json`;
const API = 'https://api.open-meteo.com/v1/forecast';

// WMO weather code -> label + glyph Nerd Font (FA: sun/moon/cloud/tint/snow/bolt)
const CODES = {
    0: ['Cerah', 'sun'],
    1: ['Cerah berawan', 'sun'],
    2: ['Berawan sebagian', 'sun'],
    3: ['Berawan', 'cloud'],
    45: ['Berkabut', 'cloud'],
    48: ['Kabut beku', 'cloud'],
    51: ['Gerimis ringan', 'rain'],
    53: ['Gerimis', 'rain'],
    55: ['Gerimis lebat', 'rain'],
    56: ['Gerimis beku', 'rain'],
    57: ['Gerimis beku lebat', 'rain'],
    61: ['Hujan ringan', 'rain'],
    63: ['Hujan', 'rain'],
    65: ['Hujan lebat', 'rain'],
    66: ['Hujan beku', 'rain'],
    67: ['Hujan beku lebat', 'rain'],
    71: ['Salju ringan', 'snow'],
    73: ['Salju', 'snow'],
    75: ['Salju lebat', 'snow'],
    77: ['Butiran salju', 'snow'],
    80: ['Hujan lokal', 'rain'],
    81: ['Hujan lokal lebat', 'rain'],
    82: ['Hujan sangat lebat', 'rain'],
    85: ['Salju lokal', 'snow'],
    86: ['Salju lokal lebat', 'snow'],
    95: ['Badai petir', 'thunder'],
    96: ['Badai + hujan es', 'thunder'],
    99: ['Badai + hujan es lebat', 'thunder'],
};

export const GLYPHS = {
    sun: '\uf185',
    moon: '\uf186',
    cloud: '\uf0c2',
    rain: '\uf043',
    snow: '\uf2dc',
    thunder: '\uf0e7',
};

const describe = code => CODES[code] ?? ['Tidak diketahui', 'cloud'];
export const glyphFor = (code, isDay = true) => {
    const [, kind] = describe(code);
    if ((kind === 'sun' || kind === 'moon') && !isDay) return GLYPHS.moon;
    return GLYPHS[kind] ?? GLYPHS.cloud;
};
export const labelFor = code => describe(code)[0];

export const weather = Variable({
    ok: false,
    temp: null,
    feels: null,
    code: 0,
    isDay: true,
    wind: null,
    humidity: null,
    daily: [],
    hourly: [],
    updatedAt: 0,
    city: '',
    error: '',
});

const coords = () => ({
    latitude: CONFIG.weather?.latitude ?? CONFIG.prayer?.latitude ?? -8.65,
    longitude: CONFIG.weather?.longitude ?? CONFIG.prayer?.longitude ?? 115.2167,
    city: CONFIG.weather?.city ?? CONFIG.prayer?.city ?? '',
});

const readCache = () => {
    try {
        const [ok, bytes] = GLib.file_get_contents(FILE);
        if (!ok) return null;
        return JSON.parse(new TextDecoder().decode(bytes));
    } catch (_) {
        return null;
    }
};

const writeCache = value => {
    try {
        GLib.mkdir_with_parents(DIR, 0o755);
        GLib.file_set_contents(FILE, JSON.stringify(value));
    } catch (_) { }
};

const buildUrl = () => {
    const { latitude, longitude } = coords();
    const unit = CONFIG.weather?.units === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    return `${API}?latitude=${latitude}&longitude=${longitude}`
        + '&current=temperature_2m,apparent_temperature,is_day,weather_code,'
        + 'wind_speed_10m,relative_humidity_2m'
        + '&hourly=temperature_2m,weather_code'
        + '&daily=weather_code,temperature_2m_max,temperature_2m_min'
        + '&timezone=auto&forecast_days=5'
        + `&temperature_unit=${unit}&wind_speed_unit=kmh`;
};

let inFlight = false;

export async function refreshWeather() {
    if (inFlight) return weather.value;
    inFlight = true;
    try {
        const raw = await Utils.execAsync([
            'curl', '-fsS', '--connect-timeout', '6', '--max-time', '12', buildUrl(),
        ]);
        const data = JSON.parse(raw);
        const current = data.current ?? {};
        const daily = (data.daily?.time ?? []).map((date, index) => ({
            date,
            code: data.daily.weather_code?.[index] ?? 0,
            max: Math.round(data.daily.temperature_2m_max?.[index] ?? 0),
            min: Math.round(data.daily.temperature_2m_min?.[index] ?? 0),
        }));
        const hours = (data.hourly?.time ?? []).map((time, index) => ({
            time,
            temp: Math.round(data.hourly.temperature_2m?.[index] ?? 0),
            code: data.hourly.weather_code?.[index] ?? 0,
        }));
        const value = {
            ok: true,
            temp: Math.round(current.temperature_2m ?? 0),
            feels: Math.round(current.apparent_temperature ?? 0),
            code: Number(current.weather_code ?? 0),
            isDay: !!Number(current.is_day ?? 1),
            wind: Math.round(current.wind_speed_10m ?? 0),
            humidity: Math.round(current.relative_humidity_2m ?? 0),
            daily: daily.slice(0, 5),
            hourly: hours,
            updatedAt: Date.now(),
            city: coords().city,
            error: '',
        };
        weather.value = value;
        writeCache(value);
        return value;
    } catch (error) {
        weather.value = {
            ...weather.value,
            error: String(error?.message ?? error ?? 'gagal'),
        };
        return weather.value;
    } finally {
        inFlight = false;
    }
}

export function watchWeather() {
    const cached = readCache();
    if (cached?.ok) weather.value = { ...cached, error: '' };

    const minutes = Math.max(5, Number(CONFIG.weather?.refreshMinutes) || 15);
    Utils.interval(minutes * 60 * 1000, () => { refreshWeather(); });
    refreshWeather();
}
