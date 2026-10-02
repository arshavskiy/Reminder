<template>
  <section v-if="visible" class="whats-new" :dir="dir" aria-live="polite">
    <header class="whats-new__head">
      <div>
        <h2 class="whats-new__title">
          <n-icon :component="SparklesOutline" :size="18" />{{ m.heading }}
        </h2>
        <p class="whats-new__sub">{{ m.subheading }}</p>
      </div>
      <n-button size="small" type="primary" ghost :loading="saving" @click="dismiss">{{ m.dismiss }}</n-button>
    </header>
    <ul class="whats-new__list">
      <li v-for="item in items" :key="item.id" class="whats-new__item">
        <div class="whats-new__item-head">
          <strong>{{ m.items[item.id].title }}</strong>
          <span v-if="item.businessOnly" class="whats-new__tag">{{ m.businessTag }}</span>
        </div>
        <p>{{ m.items[item.id].text }}</p>
        <div v-if="item.action && !item.locked" class="whats-new__actions">
          <n-button size="tiny" type="primary" @click="item.action">{{ m.items[item.id].action }}</n-button>
          <n-button v-if="item.tour" size="tiny" quaternary @click="startTour(item)">{{ m.tour }}</n-button>
        </div>
      </li>
    </ul>
  </section>
</template>

<script lang="ts" setup>
import {computed, ref} from "vue";
import {useRouter} from "vue-router";
import {NButton, NIcon} from "naive-ui";
import {SparklesOutline} from "@vicons/ionicons5";
import {useI18n} from "../composables/useI18n.js";
import {useWalkthrough} from "../composables/useWalkthrough.js";
import {useAuthStore} from "../stores/auth.js";
import {useFeaturesStore} from "../stores/features.js";
import {useUserSettingsStore} from "../stores/userSettings.js";
import {FEATURES} from "../shared/features.js";
import {planAllowsDocumentImport, planAllowsEmailIn, planAllowsGoogleCalendar, resolveUserPlan} from "../shared/pricingPlans.js";
import {WHATS_NEW_RELEASE, whatsNewMessages, type WhatsNewItemId} from "../locales/whatsNewMessages.js";

const emit = defineEmits<{ (e: "upload"): void }>();

const {href, locale, dir} = useI18n();
const router = useRouter();
const walkthrough = useWalkthrough();
const authStore = useAuthStore();
const featuresStore = useFeaturesStore();
const settingsStore = useUserSettingsStore();
const saving = ref(false);
const hiddenNow = ref(false);

const m = computed(() => whatsNewMessages[locale.value === "en" ? "en" : "he"]);
const plan = computed(() => resolveUserPlan(authStore.user));

interface Item {
  id: WhatsNewItemId;
  businessOnly?: boolean;
  /** Plan does not include it: shown with a tag, without a button. */
  locked?: boolean;
  action?: () => void;
  tour?: string;
}

const items = computed<Item[]>(() => {
  const list: Item[] = [];
  const canImport = planAllowsDocumentImport(plan.value);
  if (canImport) {
    list.push({id: "emailIn", businessOnly: true, locked: !planAllowsEmailIn(plan.value), action: () => router.push({path: href("/profile"), query: {section: "settings"}}), tour: "profile"});
    list.push({id: "camera", action: () => emit("upload")});
    if (featuresStore.hasFeature(FEATURES.pages.discovery)) {
      list.push({id: "discovery", action: () => router.push(href("/discover-reminders")), tour: "discovery"});
    }
  }
  if (planAllowsEmailIn(plan.value)) {
    list.push({id: "invoiceScan", businessOnly: true, action: () => router.push(href("/invoices"))});
  }
  list.push({id: "feed", businessOnly: true, locked: !planAllowsGoogleCalendar(plan.value), action: () => router.push({path: href("/profile"), query: {section: "settings"}}), tour: "profile"});
  list.push({id: "push"});
  if (canImport) list.push({id: "dueSoon"});
  list.push({id: "tableViews"});
  return list;
});

const visible = computed(() =>
  settingsStore.initialized
  && !hiddenNow.value
  && settingsStore.settings?.whats_new_seen !== WHATS_NEW_RELEASE
  && items.value.length > 0,
);

function startTour(item: Item) {
  const tourId = item.tour;
  if (!tourId) return;
  // Tours run on the page that holds their targets, so go there first.
  const target = tourId === "discovery" ? {path: href("/discover-reminders")} : {path: href("/profile"), query: {section: "settings"}};
  void router.push(target).then(() => {
    setTimeout(() => walkthrough.startTour(tourId), 700);
  });
}

async function dismiss() {
  saving.value = true;
  try {
    await settingsStore.save({whats_new_seen: WHATS_NEW_RELEASE});
  } catch {
    // Not persisted (offline?): hide for this visit and show again next time.
  } finally {
    hiddenNow.value = true;
    saving.value = false;
  }
}
</script>

<style scoped>
.whats-new {
  margin-bottom: 20px;
  padding: 16px 18px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--brand-color) 35%, var(--border-color));
  background: color-mix(in srgb, var(--brand-color) 8%, var(--bg-card));
}
.whats-new__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.whats-new__title { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 16px; color: var(--text-primary); }
.whats-new__sub { margin: 4px 0 0; font-size: 13px; color: var(--text-secondary); }
.whats-new__list { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
.whats-new__item { padding: 12px; border-radius: 10px; background: var(--bg-card); border: 1px solid var(--border-color); }
.whats-new__item p { margin: 6px 0 0; font-size: 13px; line-height: 1.5; color: var(--text-secondary); }
.whats-new__item-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: var(--text-primary); }
.whats-new__tag { font-size: 11px; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--border-color); color: var(--text-secondary); }
.whats-new__actions { display: flex; gap: 8px; margin-top: 10px; }
@media (max-width: 640px) {
  .whats-new { padding: 12px; }
  .whats-new__list { grid-template-columns: 1fr; }
}
</style>
