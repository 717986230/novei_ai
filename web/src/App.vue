<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { toastMsg } from './toast';
const route = useRoute();
const showNav = computed(() => route.path !== '/login');
</script>

<template>
  <header v-if="showNav" class="topbar">
    <RouterLink to="/" class="brand">Novel AI <span>Global</span></RouterLink>
    <nav>
      <RouterLink to="/">作品</RouterLink>
      <RouterLink to="/settings">设置</RouterLink>
    </nav>
  </header>
  <main class="container">
    <RouterView />
  </main>
  <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
</template>
