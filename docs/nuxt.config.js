// Situs ini murni statis (tidak ada API dan tidak ada data per pengguna),
// jadi output-nya digenerate ke .output/public dan bisa dilayani dari
// hosting statis apa pun, termasuk sub-path seperti GitHub Pages.
export default defineNuxtConfig({
  ssr: true,
  nitro: {
    preset: 'static',
  },
  devtools: { enabled: false },
  modules: [],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'id' },
      title: 'Dynamic Island untuk Hyprland',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content:
            'Notch interaktif di tepi atas layar untuk Hyprland. Dibangun dengan AGS v1 dan GTK3. Dokumentasi, tangkapan layar asli, dan panduan instalasi.',
        },
        { name: 'theme-color', content: '#0a0a0c' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap',
        },
      ],
    },
  },
  compatibilityDate: '2025-01-01',
});
