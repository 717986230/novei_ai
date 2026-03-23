<template>
  <div class="app-shell">
    <aside class="app-sidebar">
      <div class="brand">
        <div class="brand-mark">NA</div>
        <div>
          <h1>Novel AI Studio</h1>
          <p>小说生产与运营控制台</p>
        </div>
      </div>

      <div class="sidebar-block">
        <div class="sidebar-eyebrow">Workspace</div>
        <div class="sidebar-title">写作、生成、编辑在同一条工作流里完成</div>
      </div>

      <el-menu class="nav-menu" :default-active="activePath" router>
        <el-menu-item index="/manager">工作台</el-menu-item>
        <el-menu-item index="/config">系统配置</el-menu-item>
      </el-menu>

      <div class="sidebar-card">
        <div class="sidebar-card-title">默认运行结构</div>
        <div class="sidebar-card-value">Vue 3 + Spring Boot + MySQL</div>
        <div class="sidebar-card-sub">前端通过 Vite 代理访问 `http://localhost:8080`。</div>
      </div>
    </aside>

    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const activePath = computed(() => route.path.replace(/\/$/, '') || '/manager');
</script>
