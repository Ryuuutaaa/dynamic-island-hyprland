<script setup>
import { shots, geometry } from '~/composables/useContent';

useHead({
  title: 'Dynamic Island untuk Hyprland',
});
</script>

<template>
  <div>
    <!-- Notch tertutup tampil sebagai objek utama, bukan tangkapan layar penuh -->
    <section class="shell hero">
      <p class="hero__meta" style="margin-bottom: var(--s6)">
        AGS v1 · GJS · GTK3 · Hyprland
      </p>

      <h1 class="hero__display">
        Notch yang <em>hidup</em> di tepi atas layar.
      </h1>

      <p class="hero__lead">
        Dynamic Island menggantikan bar tengah dengan satu elemen yang tenang
        saat diam dan melebar saat didekati. Dibangun di atas AGS v1, bukan
        aplikasi terpisah: seluruh isinya adalah widget GTK3 di dalam satu layer
        surface.
      </p>

      <div class="hero__actions">
        <NuxtLink to="/instalasi" class="btn btn--primary">
          Pasang sekarang <span class="btn__arrow" aria-hidden="true">→</span>
        </NuxtLink>
        <NuxtLink to="/fitur" class="btn btn--link">
          Lihat semua fitur
        </NuxtLink>
      </div>

      <div style="margin-top: var(--s16)">
        <ShotFrame
          :src="shots.closed.src"
          :alt="shots.closed.alt"
          :width="shots.closed.w"
          :height="shots.closed.h"
          natural
        />
        <p
          style="
            margin-top: var(--s3);
            font-family: var(--mono);
            font-size: 0.6875rem;
            color: var(--fg-faint);
          "
        >
          170 × 50 px termasuk telinga. Ring baterai, jam, dan satu indikator
          kontekstual.
        </p>
      </div>
    </section>

    <!-- Apa ini -->
    <section class="shell section">
      <div class="section__head">
        <h2 class="section__title">Bentuknya mengikuti satu ide</h2>
        <div class="prose">
          <p>
            Notch ini bukan panel yang disembunyikan. Ia menempel ke tepi atas
            layar dengan sudut atas rata dan hanya sudut bawah yang melengkung,
            ditambah <strong>telinga</strong> berupa kurva konkaf yang menyatu
            ke bezel. Karena itu ia terlihat seperti potongan perangkat, bukan
            jendela yang mengambang.
          </p>
          <p>
            Tiga keadaan, semuanya berbagi rasio 3:1 supaya animasi buka dan
            tutup tidak mengubah aspek dan kartu tidak terlihat melar di tengah
            transisi.
          </p>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <caption class="sr-only" style="position: absolute; left: -9999px">
            Geometri notch per keadaan
          </caption>
          <thead>
            <tr>
              <th scope="col">Keadaan</th>
              <th scope="col">Ukuran badan</th>
              <th scope="col">Radius bawah</th>
              <th scope="col">Telinga</th>
              <th scope="col">Pemicu</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in geometry" :key="row.state">
              <td>
                <code>{{ row.state }}</code>
              </td>
              <td>{{ row.size }}</td>
              <td>{{ row.radius }} px</td>
              <td>{{ row.ear }} px</td>
              <td>{{ row.trigger }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p
        style="
          margin-top: var(--s3);
          font-family: var(--mono);
          font-size: 0.6875rem;
          color: var(--fg-faint);
        "
      >
        Sumber: config.js → geometry. Halaman tertentu lebih lebar: lirik 520,
        jadwal sholat 580, chat dan pengaturan 520 × 232, kalender 520 × 272.
      </p>
    </section>

    <!-- Prinsip -->
    <section class="shell section">
      <div class="section__head">
        <h2 class="section__title">Kaya tapi tenang</h2>
        <div class="prose">
          <p>
            Notch tertutup hanya menampilkan <strong>satu</strong> indikator
            kontekstual di samping jam dan ring baterai. Urutannya diatur di
            <code>closedIndicators</code>: indikator pertama yang aktif yang
            dipakai, sisanya tidak terlihat. Menambah modul tidak menumpuk isi
            notch.
          </p>
        </div>
      </div>

      <div class="grid-2">
        <div class="panel">
          <h3 class="panel__title">Indikator yang tersedia</h3>
          <p class="panel__body">
            Musik berupa equalizer, pomodoro, tugas, timer, air, cuaca berupa
            ikon dan suhu, dan tanggal sebagai fallback tanpa ikon. Semuanya
            memakai satu label aktivitas yang sama.
          </p>
        </div>
        <div class="panel">
          <h3 class="panel__title">Animasi yang diukur, bukan dikira</h3>
          <p class="panel__body">
            Ukuran memakai cubic-bezier(.34, 1.32, .5, 1) selama 320 ms dengan
            solver bezier sungguhan. Rasio di setiap frame terukur 2,98 sampai
            3,02 sepanjang transisi.
          </p>
        </div>
        <div class="panel">
          <h3 class="panel__title">Hover diambil dari layer window</h3>
          <p class="panel__body">
            EventBox anak tidak pernah menerima enter karena clip memiliki
            GdkWindow sendiri. Karena itu enter dan leave dipasang di window
            layer-shell, lalu posisi pointer divalidasi terhadap badan visual
            island.
          </p>
        </div>
        <div class="panel">
          <h3 class="panel__title">Data pengguna tetap lokal</h3>
          <p class="panel__body">
            Tugas, air, rak, kalender, standup, dan pengaturan disimpan di
            <code>~/.local/share/dynamic-iland</code> dan
            <code>~/.config/dynamic-iland</code>. Tidak ada sinkronisasi kecuali
            yang kamu pasang sendiri.
          </p>
        </div>
      </div>
    </section>

    <!-- Cakupan platform -->
    <section class="shell section section--last">
      <div class="section__head">
        <h2 class="section__title">Hanya Linux dengan Hyprland</h2>
        <div class="prose">
          <p>
            Instalasi bergantung pada <code>hyprctl</code>, waybar, swaync, dan
            gtk-layer-shell. Tidak satu pun tersedia di Windows atau macOS, dan
            <code>hyprctl</code> tidak ada di compositor Wayland lain seperti
            Sway, river, atau niri, maupun di X11.
          </p>
          <p>
            Repositori ini juga memuat versi Electron untuk Windows dan macOS di
            folder <code>desktop/</code>, tetapi versi itu tidak dapat meniru
            perilaku layer-shell dengan sempurna. Dokumentasi ini fokus pada
            versi AGS yang menjadi produk utama.
          </p>
        </div>
      </div>

      <div class="note">
        <strong>Sebelum memasang:</strong> pasang AGS versi 1.x. AGS v2 menolak
        memuat konfigurasi ini karena API <code>resource:///</code> sudah
        dihapus di v2. Installer memeriksa versi dan berhenti sebelum menyentuh
        berkas apa pun.
      </div>
    </section>
  </div>
</template>
