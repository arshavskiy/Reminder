<template>
  <Teleport to="body">
    <div v-if="walkthrough.active.value && walkthrough.currentStep.value" class="wt-overlay" @click.self="walkthrough.skipTour()">

      <div
        ref="spotlightRef"
        class="wt-spotlight"
        :style="spotlightStyle"
      />

      <div
        ref="tooltipRef"
        class="wt-tooltip"
        :style="tooltipStyle"
        :dir="dir"
      >
        <div class="wt-tooltip__header">
          <span class="wt-tooltip__title">{{ walkthrough.currentStep.value.title }}</span>
          <button class="wt-tooltip__close" @click="walkthrough.skipTour()" aria-label="סגור">×</button>
        </div>
        <p class="wt-tooltip__text">{{ walkthrough.currentStep.value.text }}</p>
        <div class="wt-tooltip__footer">
          <span class="wt-tooltip__progress">
            {{ walkthrough.currentStepIndex.value + 1 }} / {{ walkthrough.totalSteps.value }}
          </span>
          <div class="wt-tooltip__actions">
            <button
              v-if="walkthrough.currentStepIndex.value > 0"
              class="wt-btn wt-btn--ghost"
              @click="walkthrough.prevStep()"
            >הקודם</button>
            <button class="wt-btn wt-btn--primary" @click="walkthrough.nextStep()">
              {{ walkthrough.isLastStep.value ? 'סיום' : 'הבא' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { useWalkthrough } from "../composables/useWalkthrough.js";
import {useI18n} from "../composables/useI18n.js";

const walkthrough = useWalkthrough();
const {dir} = useI18n();
const spotlightRef = ref<HTMLElement | null>(null);
const tooltipRef = ref<HTMLElement | null>(null);
const targetRect = ref<DOMRect | null>(null);

function updateTargetRect() {
  const step = walkthrough.currentStep.value;
  if (!step) { targetRect.value = null; return; }
  const el = document.querySelector(step.selector);
  if (!el) { targetRect.value = null; return; }
  targetRect.value = el.getBoundingClientRect();
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

const spotlightStyle = computed(() => {
  const r = targetRect.value;
  if (!r) return { display: "none" };
  const pad = 8;
  return {
    top: `${r.top - pad}px`,
    left: `${r.left - pad}px`,
    width: `${r.width + pad * 2}px`,
    height: `${r.height + pad * 2}px`,
  };
});

const tooltipStyle = computed(() => {
  const r = targetRect.value;
  if (!r) return { display: "none" };
  const placement = walkthrough.currentStep.value?.placement ?? "bottom";
  const pad = 16;
  const tooltipWidth = 340;
  const style: Record<string, string> = {};

  if (placement === "bottom") {
    style.top = `${r.bottom + pad}px`;
    style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - 8))}px`;
  } else if (placement === "top") {
    style.bottom = `${window.innerHeight - r.top + pad}px`;
    style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - 8))}px`;
  } else if (placement === "left") {
    style.top = `${r.top + r.height / 2 - 60}px`;
    style.right = `${window.innerWidth - r.left + pad}px`;
  } else {
    style.top = `${r.top + r.height / 2 - 60}px`;
    style.left = `${r.right + pad}px`;
  }
  return style;
});

let resizeObserver: ResizeObserver | null = null;

watch(
  [() => walkthrough.active.value, () => walkthrough.currentStepIndex.value],
  async () => {
    if (!walkthrough.active.value) return;
    await nextTick();
    requestAnimationFrame(() => {
      updateTargetRect();
    });
  },
  { immediate: true },
);

onMounted(() => {
  window.addEventListener("resize", updateTargetRect);
  window.addEventListener("scroll", updateTargetRect, true);
});

onUnmounted(() => {
  window.removeEventListener("resize", updateTargetRect);
  window.removeEventListener("scroll", updateTargetRect, true);
});
</script>

<style scoped>
.wt-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: auto;
}

.wt-spotlight {
  position: fixed;
  border-radius: 10px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
  z-index: 10000;
  pointer-events: none;
  transition: all 0.3s ease;
  background: transparent;
}

.wt-tooltip {
  position: fixed;
  width: 340px;
  max-width: calc(100vw - 16px);
  background: var(--bg-card, #1e1e2e);
  border: 1px solid var(--border-color, #333);
  border-radius: 14px;
  padding: 18px;
  z-index: 10001;
  pointer-events: auto;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  transition: all 0.3s ease;
}

.wt-tooltip__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 10px;
}

.wt-tooltip__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--primary-color, #63e2b7);
  line-height: 1.3;
}

.wt-tooltip__close {
  background: none;
  border: none;
  color: var(--text-secondary, #999);
  font-size: 20px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.wt-tooltip__close:hover {
  color: var(--text-primary, #fff);
}

.wt-tooltip__text {
  font-size: 14px;
  color: var(--text-secondary, #bbb);
  line-height: 1.6;
  margin: 0 0 14px;
}

.wt-tooltip__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.wt-tooltip__progress {
  font-size: 12px;
  color: var(--text-tertiary, #777);
  font-weight: 600;
}

.wt-tooltip__actions {
  display: flex;
  gap: 8px;
}

.wt-btn {
  border: none;
  border-radius: 8px;
  padding: 7px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.wt-btn--primary {
  background: var(--primary-color, #63e2b7);
  color: #111;
}
.wt-btn--primary:hover {
  filter: brightness(1.1);
}

.wt-btn--ghost {
  background: transparent;
  color: var(--text-secondary, #bbb);
  border: 1px solid var(--border-color, #444);
}
.wt-btn--ghost:hover {
  background: var(--bg-hover, rgba(255,255,255,0.05));
}

@media (max-width: 480px) {
  .wt-tooltip {
    width: calc(100vw - 24px);
    left: 12px !important;
    right: auto !important;
  }
}
</style>
