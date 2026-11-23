<script setup>
const props = defineProps({
  label: { type: String, default: '' },
  code: { type: String, required: true },
});

const copied = ref(false);
let timer = 0;

async function copy() {
  try {
    await navigator.clipboard.writeText(props.code);
    copied.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      copied.value = false;
    }, 1600);
  } catch {
    copied.value = false;
  }
}

onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <figure class="code">
    <figcaption v-if="props.label" class="code__label">
      <span>{{ props.label }}</span>
      <button
        type="button"
        class="copy"
        :data-copied="copied"
        :aria-label="copied ? 'Tersalin' : 'Salin perintah'"
        @click="copy"
      >
        {{ copied ? 'tersalin' : 'salin' }}
      </button>
    </figcaption>
    <pre><code>{{ props.code }}</code></pre>
  </figure>
</template>
