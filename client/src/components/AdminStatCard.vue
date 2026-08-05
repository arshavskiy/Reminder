<template>
  <div class="stat-card" :class="`stat-card--${status}`">
    <div class="stat-card__header">
      <div class="stat-card__title">{{ title }}</div>
      <n-icon v-if="icon" :component="icon" :size="20" class="stat-card__icon" />
    </div>
    
    <div class="stat-card__values">
      <div class="stat-card__primary">
        <div class="stat-card__num">{{ formattedPrimary }}</div>
        <div class="stat-card__label">{{ primaryLabel }}</div>
      </div>
      
      <div v-if="secondary !== undefined" class="stat-card__secondary">
        <div class="stat-card__num-small">{{ formattedSecondary }}</div>
        <div class="stat-card__label-small">{{ secondaryLabel }}</div>
      </div>
    </div>
    
    <div v-if="trend" class="stat-card__trend" :class="`trend--${trend}`">
      {{ trendText }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { NIcon } from "naive-ui";
import type { Component } from "vue";

interface Props {
  title: string;
  primary: number | string;
  primaryLabel: string;
  secondary?: number | string;
  secondaryLabel?: string;
  status?: "success" | "warning" | "error" | "default";
  icon?: Component;
  trend?: "up" | "down" | "stable";
  trendText?: string;
  format?: "number" | "percent" | "bytes" | "custom";
  secondaryFormat?: "number" | "percent" | "bytes";
  customFormat?: (val: any) => string;
}

const props = withDefaults(defineProps<Props>(), {
  status: "default",
  format: "number",
});

const formattedPrimary = computed(() => {
  if (props.customFormat) return props.customFormat(props.primary);
  if (props.format === "percent") return `${props.primary}%`;
  if (props.format === "bytes") return formatBytes(Number(props.primary));
  return String(props.primary);
});

const formattedSecondary = computed(() => {
  if (props.secondary === undefined) return "";
  if (props.customFormat) return props.customFormat(props.secondary);
  const fmt = props.secondaryFormat ?? "number";
  if (fmt === "percent") return `${props.secondary}%`;
  if (fmt === "bytes") return formatBytes(Number(props.secondary));
  return String(props.secondary);
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + " " + sizes[i];
}
</script>

<style scoped>
.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px 18px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.stat-card--success {
  border-color: rgba(24, 160, 88, 0.3);
  background: rgba(24, 160, 88, 0.04);
}

.stat-card--warning {
  border-color: rgba(240, 160, 32, 0.3);
  background: rgba(240, 160, 32, 0.04);
}

.stat-card--error {
  border-color: rgba(208, 48, 80, 0.3);
  background: rgba(208, 48, 80, 0.04);
}

.stat-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.stat-card__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-card__icon {
  color: var(--brand-color);
  opacity: 0.7;
}

.stat-card__values {
  display: flex;
  align-items: flex-end;
  gap: 16px;
}

.stat-card__primary {
  flex: 1;
}

.stat-card__num {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
  margin-bottom: 4px;
}

.stat-card--error .stat-card__num {
  color: #d03050;
}

.stat-card--warning .stat-card__num {
  color: #f0a020;
}

.stat-card--success .stat-card__num {
  color: #18a058;
}

.stat-card__label {
  font-size: 12px;
  color: var(--text-secondary);
}

.stat-card__secondary {
  text-align: center;
  padding-right: 8px;
  border-right: 1px solid var(--border-color);
}

.stat-card__num-small {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1;
  margin-bottom: 2px;
}

.stat-card__label-small {
  font-size: 11px;
  color: var(--text-secondary);
}

.stat-card__trend {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 4px;
  margin-top: 8px;
}

.trend--up {
  color: #18a058;
  background: rgba(24, 160, 88, 0.1);
}

.trend--down {
  color: #d03050;
  background: rgba(208, 48, 80, 0.1);
}

.trend--stable {
  color: var(--text-secondary);
  background: var(--bg-hover);
}
</style>
