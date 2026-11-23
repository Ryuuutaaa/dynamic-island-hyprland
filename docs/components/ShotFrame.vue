<script setup>
const props = defineProps({
  src: { type: String, required: true },
  alt: { type: String, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  natural: { type: Boolean, default: false },
});

const open = ref(false);
const trigger = ref(null);
const closeBtn = ref(null);

function onKey(event) {
  if (event.key === 'Escape') close();
}

function close() {
  open.value = false;
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
});

// Fokus masuk ke dialog saat terbuka dan kembali ke tombol pemicu saat
// ditutup. Tanpa ini pengguna keyboard kehilangan posisinya di halaman.
watch(open, async (value) => {
  if (!import.meta.client) return;
  document.body.style.overflow = value ? 'hidden' : '';
  await nextTick();
  if (value) closeBtn.value?.focus();
  else trigger.value?.focus();
});

onBeforeUnmount(() => {
  if (import.meta.client) document.body.style.overflow = '';
});
</script>

<template>
  <div>
    <button
      ref="trigger"
      type="button"
      class="shot"
      :class="{ 'shot--natural': props.natural }"
      :aria-label="`Perbesar tangkapan layar: ${alt}`"
      @click="open = true"
    >
      <img
        :src="props.src"
        :alt="props.alt"
        :width="props.width"
        :height="props.height"
        loading="lazy"
        decoding="async"
      />
      <span class="shot__zoom" aria-hidden="true">perbesar</span>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        class="lightbox"
        role="dialog"
        aria-modal="true"
        :aria-label="alt"
        @click.self="close"
      >
        <img
          class="lightbox__img"
          :src="props.src"
          :alt="props.alt"
          :width="props.width"
          :height="props.height"
        />
        <div class="lightbox__bar">
          <span>{{ alt }}</span>
          <button
            ref="closeBtn"
            type="button"
            class="lightbox__close"
            @click="close"
          >
            Tutup <kbd>Esc</kbd>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
