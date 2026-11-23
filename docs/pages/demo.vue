<script setup>
useHead({
  title: 'Live demo · Dynamic Island untuk Hyprland',
  meta: [
    {
      name: 'description',
      content:
        'Coba Dynamic Island langsung di browser: notch yang membesar saat didekati, 16 halaman yang bisa dinavigasi, dengan geometri dan timing asli.',
    },
  ],
});
</script>

<template>
  <div>
    <section class="shell hero" style="padding-bottom: var(--s8)">
      <h1 class="hero__display" style="font-size: clamp(2rem, 4.6vw, 3rem)">
        Coba sendiri.
      </h1>
      <p class="hero__lead">
        Ini replika yang berjalan di browser. Bentuk, ukuran, durasi animasi, dan
        isi halaman mengikuti implementasi aslinya. Yang tidak bisa ditiru di
        sini adalah perilaku layer surface itu sendiri.
      </p>
    </section>

    <section class="shell section section--last" style="padding-top: 0">
      <DemoIsland />
    </section>

    <section class="shell section section--last">
      <div class="section__head">
        <h2 class="section__title">Apa yang sama, apa yang berbeda</h2>
        <p class="section__note">
          Demo ini replika setia, bukan port. Perbedaan di bawah disengaja dan
          tidak mengubah kesimpulan saat mencoba.
        </p>
      </div>

      <div class="grid-2">
        <div class="panel">
          <h3 class="panel__title">Sama</h3>
          <p class="panel__body">
            Geometri tiap keadaan dan tiap halaman, radius sudut, ukuran telinga,
            durasi 320 ms dengan kurva yang sama, urutan 16 halaman, perilaku
            panah kiri dan kanan, dan panah kiri di tampilan lirik yang kembali
            ke kartu musik.
          </p>
        </div>
        <div class="panel">
          <h3 class="panel__title">Berbeda</h3>
          <p class="panel__body">
            Yang asli adalah layer surface GTK3 di atas Hyprland, jadi ia menempel
            ke bezel layar dan memakai wallpaper kamu. Di sini ia duduk di dalam
            kartu, memakai panggung bergradasi, dan ikon Nerd Font diganti ikon
            garis.
          </p>
        </div>
        <div class="panel">
          <h3 class="panel__title">Data contoh</h3>
          <p class="panel__body">
            Isi halaman memakai data tetap supaya semua orang melihat hal yang
            sama. Yang asli membaca MPRIS, <code>nmcli</code>,
            <code>hwmon</code>, feed iCal, dan berkas lokal.
          </p>
        </div>
        <div class="panel">
          <h3 class="panel__title">Tanpa jaringan</h3>
          <p class="panel__body">
            Demo berjalan sepenuhnya di browser. Tidak ada request, tidak ada
            API key, dan tidak ada data yang dikirim ke mana pun.
          </p>
        </div>
      </div>

      <div class="note" style="margin-top: var(--s8)">
        <span class="note__title">Perilaku hover yang asli</span>
        Notch asli dipasang di window layer-shell, jadi <code>enter</code> dan
        <code>leave</code> dibaca dari window itu, bukan dari EventBox anak yang
        tidak pernah menerima crossing event. Demo memakai
        <code>mouseenter</code> dan <code>mouseleave</code> pada panggungnya,
        yang setara untuk tujuan mencoba.
      </div>
    </section>
  </div>
</template>
