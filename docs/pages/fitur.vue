<script setup>
import { features, osd, shots } from '~/composables/useContent';

useHead({
  title: 'Fitur · Dynamic Island untuk Hyprland',
  meta: [
    {
      name: 'description',
      content:
        'Enam belas halaman island dengan tangkapan layar asli: media, lirik sinkron, pomodoro, kalender, jadwal sholat, dan lainnya.',
    },
  ],
});
</script>

<template>
  <div>
    <section class="shell hero" style="padding-bottom: var(--s12)">
      <h1 class="hero__display" style="font-size: clamp(2rem, 4.6vw, 3rem)">
        Enam belas halaman, satu notch.
      </h1>
      <p class="hero__lead">
        Setiap gambar di halaman ini diambil dari island yang benar-benar
        berjalan di Hyprland, bukan mockup. Klik gambar untuk memperbesar.
      </p>
    </section>

    <!-- indeks: jalan pintas ke tiap fitur -->
    <section class="shell" style="padding-bottom: var(--s12)">
      <nav class="index" aria-label="Indeks fitur">
        <a v-for="f in features" :key="f.id" :href="`#${f.id}`">
          <span class="index__name">{{ f.title }}</span>
          <span class="index__desc">{{ f.page }}</span>
        </a>
      </nav>
    </section>

    <section class="shell section">
      <article
        v-for="(f, i) in features"
        :id="f.id"
        :key="f.id"
        class="feature"
        :class="{ 'feature--flip': i % 2 === 1 }"
      >
        <div class="feature__text">
          <h2 class="feature__title">
            {{ f.title }}
            <span class="feature__page">{{ f.page }}</span>
          </h2>
          <p class="feature__desc">{{ f.desc }}</p>
          <ul class="feature__specs">
            <li v-for="spec in f.specs" :key="spec">{{ spec }}</li>
          </ul>
        </div>

        <div class="feature__visual">
          <ShotFrame
            :src="shots[f.shot].src"
            :alt="shots[f.shot].alt"
            :width="shots[f.shot].w"
            :height="shots[f.shot].h"
          />
          <template v-if="f.extra">
            <div style="margin-top: var(--s3)">
              <ShotFrame
                :src="shots[f.extra].src"
                :alt="shots[f.extra].alt"
                :width="shots[f.extra].w"
                :height="shots[f.extra].h"
              />
            </div>
          </template>
        </div>
      </article>
    </section>

    <!-- OSD dan notifikasi: komponen di luar halaman nav -->
    <section class="shell section">
      <div class="section__head">
        <h2 class="section__title">Di luar halaman navigasi</h2>
        <p class="section__note">
          Tiga keadaan transient muncul sendiri tanpa mengubah halaman aktif.
          Tidak punya dot dan tidak bisa dicapai lewat panah.
        </p>
      </div>

      <article
        v-for="item in osd"
        :key="item.id"
        class="feature"
        style="grid-template-columns: minmax(0, 1fr) minmax(0, 0.9fr)"
      >
        <div class="feature__text">
          <h2 class="feature__title">{{ item.title }}</h2>
          <p class="feature__desc">{{ item.desc }}</p>
        </div>
        <div class="feature__visual">
          <ShotFrame
            :src="shots[item.shot].src"
            :alt="shots[item.shot].alt"
            :width="shots[item.shot].w"
            :height="shots[item.shot].h"
          />
        </div>
      </article>
    </section>

    <section class="shell section section--last">
      <div class="section__head">
        <h2 class="section__title">Navigasi</h2>
        <div class="prose">
          <p>
            Saat melebar, muncul baris <code>‹ [tujuh ikon] ›</code> di
            bawah-tengah kartu dengan latar transparan. Tujuh slot menampilkan
            jendela halaman di sekitar halaman aktif, jadi ikon yang terlihat
            bergeser saat kamu berpindah.
          </p>
          <p>
            Klik ikon memilih halaman. Halaman biasa bertahan sepuluh detik lalu
            kembali ke halaman istirahat; halaman chat bertahan sampai kamu
            pindah sendiri. Scroll wheel di atas notch juga memindah halaman,
            kecuali di halaman yang punya scroll internal.
          </p>
          <p>
            <kbd>Super</kbd> + <kbd>N</kbd> membuka island tanpa hover, dan
            <kbd>Esc</kbd> menutupnya. Selama island terbuka, panah kiri dan
            kanan berpindah halaman lewat submap Hyprland, dan tombol itu tidak
            diteruskan ke aplikasi yang sedang fokus.
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
