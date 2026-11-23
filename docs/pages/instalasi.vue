<script setup>
import { installPrereqs, changes } from '~/composables/useContent';

useHead({
  title: 'Instalasi · Dynamic Island untuk Hyprland',
  meta: [
    {
      name: 'description',
      content:
        'Panduan instalasi Dynamic Island untuk Hyprland: prasyarat, langkah pemasangan, konfigurasi opsional, dan cara mencabutnya kembali.',
    },
  ],
});

const clone = `git clone https://github.com/Ryuuutaaa/dynamic-island-hyprland.git
cd dynamic-island-hyprland`;

const dryRun = `./install.sh --dry-run`;

const install = `./install.sh`;

const verify = `# Island harus muncul sebagai layer surface
hyprctl layers | grep dynamic-island

# Submap navigasi harus kembali ke default saat island tertutup
hyprctl submap`;

const gemini = `mkdir -p ~/.config/dynamic-iland
cp .env.example ~/.config/dynamic-iland/.env
chmod 600 ~/.config/dynamic-iland/.env
# lalu isi GEMINI_API_KEY=... di berkas tersebut`;

const calendar = `# Di dalam island: buka Pengaturan, lalu halaman Kalender
# atau simpan URL feed secara manual:
printf '%s' 'https://calendar.google.com/calendar/ical/.../basic.ics' \\
  > ~/.config/dynamic-iland/calendar.url
chmod 600 ~/.config/dynamic-iland/calendar.url`;

const uninstall = `./uninstall.sh                # cabut semuanya, termasuk API key
./uninstall.sh --keep-env     # cabut kode, pertahankan API key Gemini
./uninstall.sh --dry-run      # lihat rencana pencabutan`;

const restartGuard = `# Saat menguji installer dengan HOME palsu, jangan sentuh
# proses milik sesi nyata:
DYNAMIC_ISLAND_NO_RESTART=1 HOME=/tmp/uji ./install.sh`;
</script>

<template>
  <div>
    <section class="shell hero" style="padding-bottom: var(--s12)">
      <h1 class="hero__display" style="font-size: clamp(2rem, 4.6vw, 3rem)">
        Instalasi
      </h1>
      <p class="hero__lead">
        Empat langkah, semuanya bisa dibatalkan. Installer memeriksa prasyarat
        sebelum menyentuh berkas apa pun, membuat backup untuk setiap berkas
        yang diubah, dan menyediakan mode dry-run.
      </p>
      <p class="hero__meta">
        Diuji di Linux + Hyprland 0.57 dengan config Lua dan config hyprlang
        lama.
      </p>
    </section>

    <!-- Prasyarat -->
    <section class="shell section">
      <div class="section__head">
        <h2 class="section__title">Prasyarat</h2>
        <p class="section__note">
          Yang wajib harus ada, kalau tidak installer berhenti dengan kode keluar
          1. Yang opsional hanya mengurangi fitur terkait.
        </p>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Tingkat</th>
              <th scope="col">Perintah</th>
              <th scope="col">Keterangan</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="[cmd, why] in installPrereqs.required" :key="cmd">
              <td><span class="tag tag--ok">wajib</span></td>
              <td><code>{{ cmd }}</code></td>
              <td>{{ why }}</td>
            </tr>
            <tr v-for="[cmd, why] in installPrereqs.optional" :key="cmd">
              <td><span class="tag">opsional</span></td>
              <td><code>{{ cmd }}</code></td>
              <td>{{ why }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Langkah -->
    <section class="shell section">
      <div class="section__head">
        <h2 class="section__title">Langkah pemasangan</h2>
        <p class="section__note">
          Jalankan dari folder repositori. Installer idempoten dan aman
          dijalankan ulang.
        </p>
      </div>

      <div class="steps">
        <div class="step">
          <div class="step__no" aria-hidden="true" />
          <div class="step__body">
            <h3 class="step__title">Ambil repositori</h3>
            <p class="step__desc">
              Letakkan di lokasi permanen. Installer membuat symlink dari
              <code>~/.config/ags/dynamic-iland</code> ke folder ini, jadi
              memindahkannya setelah pemasangan akan memutus symlink.
            </p>
            <CodeBlock label="terminal" :code="clone" />
          </div>
        </div>

        <div class="step">
          <div class="step__no" aria-hidden="true" />
          <div class="step__body">
            <h3 class="step__title">Lihat rencananya dulu</h3>
            <p class="step__desc">
              Mode dry-run mencetak setiap perubahan tanpa menyentuh berkas
              maupun proses. Gunakan ini untuk memastikan tidak ada konflik
              dengan konfigurasi yang sudah ada.
            </p>
            <CodeBlock label="terminal" :code="dryRun" />
          </div>
        </div>

        <div class="step">
          <div class="step__no" aria-hidden="true" />
          <div class="step__body">
            <h3 class="step__title">Jalankan installer</h3>
            <p class="step__desc">
              Installer membackup setiap berkas yang diubah dengan akhiran
              <code>.dyn-island.bak</code>, lalu merestart waybar dan AGS
              memakai argumen yang sama seperti proses yang sedang berjalan.
            </p>
            <CodeBlock label="terminal" :code="install" />

            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Yang diubah</th>
                    <th scope="col">Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="[what, detail] in changes" :key="what">
                    <td>{{ what }}</td>
                    <td>{{ detail }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="step">
          <div class="step__no" aria-hidden="true" />
          <div class="step__body">
            <h3 class="step__title">Periksa hasilnya</h3>
            <p class="step__desc">
              Notch harus muncul di tengah tepi atas. Arahkan pointer ke atasnya
              untuk membuka, lalu coba panah kiri dan kanan.
            </p>
            <CodeBlock label="terminal" :code="verify" />

            <div class="note note--ok">
              <span class="note__title">Kalau notch tidak muncul</span>
              Periksa log AGS di <code>~/.cache/ags-dynamic-island.log</code>.
              Penyebab paling umum adalah AGS v2 yang terpasang, atau baris
              import belum masuk ke <code>~/.config/ags/config.js</code>.
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Fitur opsional -->
    <section class="shell section">
      <div class="section__head">
        <h2 class="section__title">Fitur yang perlu disiapkan sendiri</h2>
        <p class="section__note">
          Island tetap berjalan tanpa keduanya. Bagian ini hanya diperlukan
          kalau kamu ingin memakai chat Gemini dan kalender.
        </p>
      </div>

      <div class="steps">
        <div class="step">
          <div class="step__no" aria-hidden="true" />
          <div class="step__body">
            <h3 class="step__title">Gemini API key</h3>
            <p class="step__desc">
              Kunci disimpan di luar repositori dengan permission 0600 dan tidak
              pernah ditampilkan utuh di antarmuka. Urutan pencarian: environment
              <code>GEMINI_API_KEY</code>, lalu
              <code>~/.config/dynamic-iland/.env</code>, lalu berkas JSON lama.
            </p>
            <CodeBlock label="terminal" :code="gemini" />
            <div class="note note--warn">
              <span class="note__title">Jangan commit kunci</span>
              <code>.env</code> sudah masuk <code>.gitignore</code>. Kalau kamu
              pernah menempelkan kunci di tempat publik, rotasi kuncinya di
              Google AI Studio.
            </div>
          </div>
        </div>

        <div class="step">
          <div class="step__no" aria-hidden="true" />
          <div class="step__body">
            <h3 class="step__title">Feed kalender</h3>
            <p class="step__desc">
              Gunakan alamat rahasia iCal dari Google Calendar atau Outlook.
              URL ini bersifat pribadi, jadi jangan ditaruh di
              <code>config.js</code> yang ikut di-commit. Island memvalidasi
              bahwa isinya benar-benar <code>BEGIN:VCALENDAR</code> sebelum
              menyimpan.
            </p>
            <CodeBlock label="terminal" :code="calendar" />
          </div>
        </div>
      </div>
    </section>

    <!-- Pencabutan -->
    <section class="shell section">
      <div class="section__head">
        <h2 class="section__title">Mencabut kembali</h2>
        <div class="prose">
          <p>
            Pencabutan mengikuti urutan pemasangan secara terbalik. Berkas
            konfigurasi dikembalikan ke kondisi semula: diuji pada lima berkas,
            kelimanya identik byte per byte setelah uninstall.
          </p>
        </div>
      </div>

      <CodeBlock label="terminal" :code="uninstall" />

      <div class="note" style="margin-top: var(--s6)">
        <span class="note__title">Data pengguna tidak disentuh</span>
        Tugas, air, rak, jadwal sholat, cuaca, kalender, standup, dan pengaturan
        tetap ada di <code>~/.local/share/dynamic-iland</code> dan
        <code>~/.config/dynamic-iland</code>. Uninstaller mencetak perintah untuk
        menghapusnya kalau kamu memang ingin bersih total.
      </div>
    </section>

    <!-- Catatan pengujian -->
    <section class="shell section section--last">
      <div class="section__head">
        <h2 class="section__title">Catatan untuk pengujian</h2>
        <div class="prose">
          <p>
            Kalau kamu menguji installer dengan <code>HOME</code> sementara,
            waybar dan AGS yang berjalan tetap milik sesi nyata. Restart proses
            akan mematikan bar yang sedang kamu pakai. Setel
            <code>DYNAMIC_ISLAND_NO_RESTART=1</code> untuk melewati seluruh
            restart.
          </p>
        </div>
      </div>

      <CodeBlock label="terminal" :code="restartGuard" />

      <div class="note" style="margin-top: var(--s6)">
        <strong>Menjalankan ulang.</strong> Setiap kali theme waybar diganti,
        jalankan <code>./install.sh</code> lagi, karena blok penyeimbang tinggi
        bar berada di CSS theme tersebut.
      </div>
    </section>
  </div>
</template>
