<script setup lang="ts">
import type { StoryState } from '../api';
defineProps<{ state: StoryState }>();
</script>

<template>
  <div class="small">
    <p style="margin: 0 0 6px"><strong>时间：</strong>{{ state.time }} · <strong>地点：</strong>{{ state.location }}</p>
    <ul class="list">
      <li v-for="c in state.characters" :key="c.name">
        <strong>{{ c.name }}</strong> <span class="muted">· {{ c.status }} · 在 {{ c.location }}</span>
        <div><span class="muted">知道/不知道：</span>{{ c.knowledge }}</div>
        <div><span class="muted">关系：</span>{{ c.relationships }}</div>
      </li>
    </ul>
    <template v-if="state.openThreads.length">
      <h3 style="margin-top: 10px">未收伏笔</h3>
      <ul style="margin: 0; padding-left: 18px"><li v-for="t in state.openThreads" :key="t">{{ t }}</li></ul>
    </template>
    <template v-if="state.facts.length">
      <h3 style="margin-top: 10px">已确立事实</h3>
      <ul style="margin: 0; padding-left: 18px"><li v-for="f in state.facts" :key="f">{{ f }}</li></ul>
    </template>
  </div>
</template>
