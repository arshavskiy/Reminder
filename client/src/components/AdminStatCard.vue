<template>
  <div class="stat-card" :class="`stat-card--${status}`">
    <div class="stat-card__header">
      <div class="stat-card__title">{{ title }}</div>
      <n-icon v-if="icon" :component="icon" :size="20" class="stat-card__icon" />
    </div>
    
    <div class="stat-card__values">
      <div class="stat-card__primary">
        <div class="stat-card__num" :class="sizeClass(formattedPrimary, 7, 12)" :title="formattedPrimary">{{ formattedPrimary }}</div>
        <div class="stat-card__label">{{ primaryLabel }}</div>
      </div>
      
      <div v-if="secondary !== undefined" class="stat-card__secondary">
        <div class="stat-card__num-small" :class="sizeClass(formattedSecondary, 7, 12)" :title="formattedSecondary">{{ formattedSecondary }}</div>
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

/** Long values (dates, "0.00 / 8 GB") step down a size so they fit the card instead of wrapping or clipping. */
function sizeClass(text: string, medium: number, small: number): string {
  const length = String(text ?? "").length;
  if (length > small) return "is-sm";
  if (length > medium) return "is-md";
  return "";
}

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
  padding: 14px 16px;
  min-height: 112px;
  min-width: 0;
  container-type: inline-size;
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
  font-size: clamp(10px, 6.5cqi, 13px);
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-card__icon {
  color: var(--brand-color);
  opacity: 0.7;
}

.stat-card__values {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  min-width: 0;
}

.stat-card__primary {
  flex: 1;
  min-width: 0;
}

.stat-card__num {
  font-size: clamp(15px, 13cqi, 26px);
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.1;
  margin-bottom: 4px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stat-card__num.is-md {
  font-size: clamp(14px, 11cqi, 18px);
}
.stat-card__num.is-sm {
  font-size: clamp(12px, 9cqi, 15px);
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
  font-size: clamp(10px, 5.5cqi, 12px);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-card__secondary {
  text-align: left;
  padding-left: 10px;
  border-left: 1px solid var(--border-color);
  flex: 0 1 auto;
  min-width: 0;
  max-width: 46%;
}

.stat-card__num-small {
  font-size: clamp(12px, 8cqi, 16px);
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.15;
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stat-card__num-small.is-md {
  font-size: clamp(11px, 7cqi, 14px);
}
.stat-card__num-small.is-sm {
  font-size: clamp(11px, 6cqi, 12px);
}

.stat-card__label-small {
  font-size: clamp(10px, 5cqi, 11px);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
