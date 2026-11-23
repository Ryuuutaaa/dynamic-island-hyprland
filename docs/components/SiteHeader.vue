<script setup>
const route = useRoute();

const links = [
  { to: '/', label: 'Pengenalan' },
  { to: '/fitur', label: 'Fitur' },
  { to: '/demo', label: 'Demo' },
  { to: '/instalasi', label: 'Instalasi' },
];

const isActive = (to) =>
  to === '/' ? route.path === '/' : route.path.startsWith(to);
</script>

<template>
  <header class="topbar">
    <div class="shell topbar__inner">
      <NuxtLink to="/" class="brand" aria-label="Dynamic Island, ke pengenalan">
        <span class="brand__mark" aria-hidden="true" />
        <span>Dynamic Island</span>
      </NuxtLink>

      <nav class="nav" aria-label="Navigasi utama">
        <NuxtLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          :class="{ 'is-active': isActive(link.to) }"
          :aria-current="isActive(link.to) ? 'page' : undefined"
        >
          {{ link.label }}
        </NuxtLink>
        <a
          class="nav__repo"
          href="https://github.com/Ryuuutaaa/dynamic-island-hyprland"
          rel="noopener"
          target="_blank"
        >
          GitHub<span aria-hidden="true"> ↗</span>
        </a>
      </nav>
    </div>
  </header>
</template>
