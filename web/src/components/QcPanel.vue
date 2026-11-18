<script setup lang="ts">
import type { QcReport } from '../api';
defineProps<{ qc: QcReport | null }>();
const SEV: Record<string, string> = { high: '严重', medium: '中等', low: '轻微' };
</script>

<template>
  <div v-if="!qc" class="small muted">这一章还没有跑过自动质检。</div>
  <div v-else class="small">
    <p style="margin: 0 0 6px">
      <span :class="['badge', qc.verdict === 'passed' ? 'published' : 'ready']">{{ qc.verdict === 'passed' ? '✓ 质检通过' : '⚠ 需要人工看一下' }}</span>
      <span class="muted"> · {{ new Date(qc.ranAt).toLocaleString() }}</span>
    </p>
    <p style="margin: 4px 0">
      AI 味指数：<strong>{{ qc.aiScoreBefore }}</strong> → <strong :class="qc.aiScoreAfter < 5 ? 'ok' : 'warn'">{{ qc.aiScoreAfter }}</strong>
      <span class="muted">（0 = 很干净{{ qc.aiEditApplied ? '，已自动润色' : '' }}）</span>
    </p>
    <p v-if="qc.aiTells.length" class="muted" style="margin: 4px 0">剩余痕迹：{{ qc.aiTells.join('、') }}</p>
    <p style="margin: 4px 0">一致性：发现 {{ qc.issuesFound.length }} 处，自动修正 {{ qc.issuesFixed }} 处，剩余 {{ qc.remaining.length }} 处</p>
    <ul v-if="qc.remaining.length" class="list">
      <li v-for="(i, n) in qc.remaining" :key="n">
        <span :class="i.severity === 'high' ? 'err' : 'warn'">[{{ SEV[i.severity] ?? i.severity }}]</span> {{ i.problem }}
        <div class="muted">“{{ i.quote }}” → {{ i.fix }}</div>
      </li>
    </ul>
    <p v-for="n in qc.notes" :key="n" class="warn" style="margin: 4px 0">{{ n }}</p>
  </div>
</template>
