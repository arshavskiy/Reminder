<template>
  <aside
    id="app-sidebar-panel"
    class="app-nav"
    :class="{
      'app-nav--collapsed': collapsed && !isMobile,
      'app-nav--mobile-open': isMobile && mobileOpen,
    }"
    :aria-label="l.chrome.navTitle"
  >
    <div class="app-nav__brand" @click="goHome">
      <div class="app-nav__logo">
        <img class="app-nav__logo-img" :src="logoSrc" alt="" />
      </div>
      <span v-show="showLabels" class="app-nav__brand-text">לובי</span>
    </div>

    <nav class="app-nav__list">
      <div v-for="item in visibleNav" :key="item.key" class="app-nav__group">
        <n-popover
          v-if="item.children?.length && !isMobile"
          trigger="hover"
          :placement="flyoutPlacement"
          :show-arrow="false"
          raw
          :delay="40"
          :duration="120"
        >
          <template #trigger>
            <button
              type="button"
              class="app-nav__item"
              :class="{
                'app-nav__item--active': isItemActive(item) && !item.children?.length,
                'app-nav__item--locked': isPlanLocked(item),
                'app-nav__item--parent-active': isItemActive(item),
              }"
              :aria-disabled="isPlanLocked(item) ? 'true' : undefined"
              @click="onItemClick(item)"
            >
              <n-icon class="app-nav__icon" :component="item.icon" :size="24" />
              <span v-show="showLabels" class="app-nav__label">{{ item.label }}</span>
              <n-icon
                v-if="showLabels"
                class="app-nav__chevron"
                :component="ChevronBackOutline"
                :size="16"
              />
            </button>
          </template>
          <div class="app-nav__flyout" :dir="localeStore.dir">
            <button
              v-for="child in item.children"
              :key="navChildKey(child)"
              type="button"
              class="app-nav__flyout-item"
              :class="{
                'app-nav__flyout-item--active': isActiveNav(child.key, child.query),
                'app-nav__flyout-item--locked': isPlanLocked(child),
              }"
              :disabled="isPlanLocked(child)"
              @click="navigate(child)"
            >
              {{ child.label }}
            </button>
          </div>
        </n-popover>

        <n-tooltip
          v-else
          placement="left"
          :disabled="showLabels && !isPlanLocked(item)"
          :keep-alive-on-hover="false"
        >
          <template #trigger>
            <button
              type="button"
              class="app-nav__item"
              :class="{
                'app-nav__item--active': isItemActive(item) && !item.children?.length,
                'app-nav__item--open': isExpanded(item.key),
                'app-nav__item--locked': isPlanLocked(item),
                'app-nav__item--parent-active': isItemActive(item) && !!item.children?.length,
              }"
              :aria-expanded="item.children?.length ? isExpanded(item.key) : undefined"
              :aria-disabled="isPlanLocked(item) ? 'true' : undefined"
              @click="onItemClick(item)"
            >
              <n-icon class="app-nav__icon" :component="item.icon" :size="24" />
              <span v-show="showLabels" class="app-nav__label">{{ item.label }}</span>
              <n-icon
                v-if="showLabels && item.children?.length"
                class="app-nav__chevron"
                :component="ChevronBackOutline"
                :size="16"
              />
            </button>
          </template>
          {{ isPlanLocked(item) ? navLockLabel(item) : item.label }}
        </n-tooltip>

        <div
          v-if="isMobile && item.children?.length && isExpanded(item.key)"
          class="app-nav__sub"
        >
          <n-tooltip
            v-for="child in item.children"
            :key="navChildKey(child)"
            placement="left"
            :disabled="!isPlanLocked(child)"
            :keep-alive-on-hover="false"
          >
            <template #trigger>
              <button
                type="button"
                class="app-nav__subitem"
                :class="{
                  'app-nav__subitem--active': isActiveNav(child.key, child.query),
                  'app-nav__subitem--locked': isPlanLocked(child),
                }"
                :aria-disabled="isPlanLocked(child) ? 'true' : undefined"
                @click="navigate(child)"
              >
                <span class="app-nav__subitem-dot" aria-hidden="true" />
                <span class="app-nav__label">{{ child.label }}</span>
              </button>
            </template>
            {{ navLockLabel(child) }}
          </n-tooltip>
        </div>
      </div>
    </nav>

    <div class="app-nav__footer">
      <n-tooltip placement="left" :disabled="showLabels" :keep-alive-on-hover="false">
        <template #trigger>
          <a
            class="app-nav__item app-nav__subscription"
            :class="{ 'app-nav__item--active': isProfileSubscription }"
            :href="localizedPath('/profile') + '?section=subscription'"
            @click.prevent="goSubscription"
          >
            <n-icon class="app-nav__icon" :component="DiamondOutline" :size="24" />
            <span v-show="showLabels" class="app-nav__label">{{ l.chrome.subscription }}</span>
            <span
              v-if="showLabels && subscriptionPlanLabel"
              class="app-nav__plan"
            >{{ subscriptionPlanLabel }}</span>
          </a>
        </template>
        {{ subscriptionTooltip }}
      </n-tooltip>

      <div class="app-nav__user" :class="{ 'app-nav__user--collapsed': !showLabels }">
        <UserDropdown
          :inline="isMobile"
          :userName="authStore.user?.name ?? authStore.user?.email ?? null"
          :userEmail="authStore.user?.email ?? null"
          :userPicture="authStore.user?.picture_url ?? null"
          :userRole="authStore.user?.role ?? null"
          @navigated="emit('update:mobileOpen', false)"
        />
      </div>

      <button
        v-if="!isMobile"
        type="button"
        class="app-nav__collapse"
        :aria-label="collapsed ? l.chrome.expandNav : l.chrome.collapseNav"
        @click="emit('update:collapsed', !collapsed)"
      >
        <n-icon
          :component="collapsed ? ChevronBackOutline : ChevronForwardOutline"
          :size="18"
        />
      </button>
    </div>
  </aside>

  <div
    v-if="isMobile && mobileOpen"
    class="app-nav__backdrop"
    @click="emit('update:mobileOpen', false)"
  />
</template>

<script setup lang="ts">
import {computed, ref, watch} from "vue";
import {useRoute, useRouter} from "vue-router";
import {NIcon, NPopover, NTooltip} from "naive-ui";
import {
  ChevronBackOutline,
  ChevronForwardOutline,
  ConstructOutline,
  DiamondOutline,
  DocumentTextOutline,
  HomeOutline,
  MailOutline,
  MapOutline,
  NotificationsOutline,
  PeopleOutline,
  StatsChartOutline,
  WalletOutline,
} from "@vicons/ionicons5";
import type {Component} from "vue";
import UserDropdown from "./UserDropdown.vue";
import {useAuthStore} from "../stores/auth.js";
import {useFeaturesStore} from "../stores/features.js";
import {localizedPath, stripLocalePrefix, useLocaleStore} from "../stores/locale.js";
import {FEATURES} from "../shared/features.js";
import {
  isLapsedTrial as isLapsedTrialPlan,
  normalizePlanId,
  planMeetsMinimum,
  resolveUserPlan,
  type PlanId,
} from "../shared/pricingPlans.js";

const props = defineProps<{
  collapsed: boolean;
  mobileOpen: boolean;
  isMobile: boolean;
  logoSrc: string;
}>();

const emit = defineEmits<{
  "update:collapsed": [value: boolean];
  "update:mobileOpen": [value: boolean];
}>();

const router = useRouter();
const route = useRoute();
const localeStore = useLocaleStore();
const authStore = useAuthStore();
const featuresStore = useFeaturesStore();
const l = computed(() => localeStore.catalog);

const showLabels = computed(() => props.isMobile || !props.collapsed);
const flyoutPlacement = computed(() => (localeStore.dir === "rtl" ? "left-start" : "right-start"));

const ROLE_RANK: Record<string, number> = {user: 0, pro: 1, admin: 2};
const PLAN_SHORT = computed(() => localeStore.catalog.plans);

type NavItem = {
  key: string;
  label: string;
  icon: Component;
  minPlan?: PlanId | PlanId[];
  minRole?: string;
  feature?: string;
  children?: Array<{
    key: string;
    label: string;
    query?: Record<string, string>;
    minPlan?: PlanId | PlanId[];
    minRole?: string;
    feature?: string;
  }>;
};

const allNav = computed<NavItem[]>(() => {
  const nav = localeStore.catalog.chrome.nav;
  return [
    {
      label: nav.dashboard,
      key: "dashboard",
      icon: HomeOutline,
      minPlan: "expired" as const,
      feature: FEATURES.pages.dashboard,
    },
    {
      label: nav.documents,
      key: "documents",
      icon: DocumentTextOutline,
      minPlan: "expired" as const,
      feature: FEATURES.pages.documents,
      children: [
        {
          label: nav.documents,
          key: "documents",
          minPlan: "expired" as const,
          feature: FEATURES.pages.documents,
        },
        {
          label: nav.quotes,
          key: "quotes",
          feature: FEATURES.pages.contracts,
        },
        {
          label: localeStore.catalog.documents.activityLog,
          key: "activity",
          query: {kind: "document"},
          minPlan: "expired" as const,
          feature: FEATURES.pages.reminders,
        },
      ],
    },
    {
      label: nav.reminders,
      key: "reminders",
      icon: NotificationsOutline,
      minPlan: "expired" as const,
      feature: FEATURES.pages.reminders,
      children: [
        {
          label: nav.reminders,
          key: "reminders",
          minPlan: "expired" as const,
          feature: FEATURES.pages.reminders,
        },
        {
          label: localeStore.catalog.reminders.activityLog,
          key: "activity",
          query: {kind: "email"},
          minPlan: "expired" as const,
          feature: FEATURES.pages.reminders,
        },
      ],
    },
    {
      label: localeStore.catalog.common.expenses,
      key: "invoices",
      icon: WalletOutline,
      minPlan: "business" as const,
      feature: FEATURES.pages.invoices,
      children: [
        {
          label: nav.invoices,
          key: "invoices",
          minPlan: "business" as const,
          feature: FEATURES.pages.invoices,
        },
        {
          label: localeStore.catalog.common.expenses,
          key: "invoices/expenses",
          minPlan: "business" as const,
          feature: FEATURES.pages.invoices,
        },
      ],
    },
    {
      label: nav.reports,
      key: "reports",
      icon: StatsChartOutline,
      minPlan: "expired" as const,
      feature: FEATURES.pages.reports,
    },
    {
      label: nav.clients,
      key: "clients",
      icon: PeopleOutline,
      minPlan: "expired" as const,
      feature: FEATURES.pages.clients,
    },
    {
      label: nav.equipment,
      key: "equipment",
      icon: ConstructOutline,
      minPlan: "expired" as const,
      feature: FEATURES.pages.equipment,
      children: [
        {
          label: localeStore.catalog.equipment.tabEquipment,
          key: "equipment",
          query: {section: "equipment"},
          minPlan: "expired" as const,
          feature: FEATURES.pages.equipment,
        },
        {
          label: localeStore.catalog.equipment.tabManufacturers,
          key: "equipment",
          query: {section: "manufacturers"},
          minPlan: "expired" as const,
          feature: FEATURES.pages.equipment,
        },
      ],
    },
    {
      label: nav.field,
      key: "field",
      icon: MapOutline,
      minPlan: "business" as const,
      feature: FEATURES.pages.field,
    },
    {
      label: nav.gmail,
      key: "gmail",
      icon: MailOutline,
      minRole: "admin",
      feature: FEATURES.pages.gmail,
    },
  ];
});

function planAllowsNav(minPlan: PlanId | PlanId[] | undefined): boolean {
  return planMeetsMinimum(resolveUserPlan(authStore.user), minPlan);
}

function isVisibleLeaf(item: {
  minPlan?: PlanId | PlanId[];
  minRole?: string;
  feature?: string;
}): boolean {
  const userRank = ROLE_RANK[authStore.user?.role ?? "user"] ?? 0;
  return (
    userRank >= (ROLE_RANK[item.minRole ?? "user"] ?? 0) &&
    planAllowsNav(item.minPlan) &&
    (!item.feature || featuresStore.hasFeature(item.feature))
  );
}

const visibleNav = computed(() =>
  allNav.value
    .map((item) => {
      if (!item.children?.length) return isVisibleLeaf(item) ? item : null;
      const children = item.children.filter(isVisibleLeaf);
      if (!children.length) return isVisibleLeaf(item) ? {...item, children: undefined} : null;
      return {...item, children};
    })
    .filter(Boolean) as NavItem[],
);

const isLapsedTrial = computed(() => isLapsedTrialPlan(authStore.user));

function isPlanLocked(item: {minPlan?: PlanId | PlanId[]}): boolean {
  if (!item.minPlan) return false;
  if (isLapsedTrial.value) return false;
  return !planAllowsNav(item.minPlan);
}

function navLockLabel(item: {minPlan?: PlanId | PlanId[]}): string {
  if (!item.minPlan) return "";
  if (Array.isArray(item.minPlan)) {
    const names = item.minPlan.map((plan) => PLAN_SHORT.value[normalizePlanId(plan)]).filter(Boolean);
    if (!names.length) return "";
    return localeStore.t("chrome.lockPlansOnly", {plans: names.join(" / ")});
  }
  const label = PLAN_SHORT.value[normalizePlanId(item.minPlan)];
  return label ? localeStore.t("chrome.lockPlanAndUp", {plan: label}) : "";
}

const subscriptionPlanLabel = computed(() => {
  if (!authStore.user) return "";
  return PLAN_SHORT.value[resolveUserPlan(authStore.user)] ?? "";
});

const subscriptionTooltip = computed(() => {
  const plan = subscriptionPlanLabel.value;
  return plan
    ? localeStore.t("chrome.subscriptionTooltipPlan", {plan})
    : localeStore.catalog.chrome.subscriptionTooltip;
});

const isProfileSubscription = computed(() => {
  const path = stripLocalePrefix(route.path);
  return path === "/profile" && route.query.section === "subscription";
});

const activeKey = computed(() => {
  const seg = stripLocalePrefix(route.path).split("/")[1] || "dashboard";
  return seg;
});

function isActiveNav(key: string, query?: Record<string, string>): boolean {
  const path = stripLocalePrefix(route.path);
  if (key === "activity") {
    if (path !== "/activity") return false;
    return !query?.kind || route.query.kind === query.kind;
  }
  const onPage = key.includes("/")
    ? path === `/${key}` || path.startsWith(`/${key}/`)
    : activeKey.value === key || path === `/${key}` || path.startsWith(`/${key}/`);
  if (!onPage) return false;
  if (query?.section) {
    const current = String(route.query.section || (key === "equipment" ? "equipment" : ""));
    return current === query.section;
  }
  return true;
}

function navChildKey(child: {key: string; query?: Record<string, string>}) {
  const extra = child.query?.section || child.query?.kind;
  return extra ? `${child.key}:${extra}` : child.key;
}

function isItemActive(item: NavItem): boolean {
  if (isActiveNav(item.key)) return true;
  return !!item.children?.some((child) => isActiveNav(child.key, child.query));
}

const expandedKeys = ref<Set<string>>(new Set());

function isExpanded(key: string): boolean {
  return expandedKeys.value.has(key);
}

function syncExpandedFromRoute() {
  const next = new Set(expandedKeys.value);
  for (const item of visibleNav.value) {
    if (item.children?.some((child) => isActiveNav(child.key, child.query)) || isActiveNav(item.key)) {
      next.add(item.key);
    }
  }
  expandedKeys.value = next;
}

watch([() => route.path, visibleNav], syncExpandedFromRoute, {immediate: true});

function toggleExpanded(key: string) {
  const next = new Set(expandedKeys.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedKeys.value = next;
}

function navigate(item: {key: string; minPlan?: PlanId | PlanId[]; query?: Record<string, string>}) {
  if (isPlanLocked(item)) return;
  emit("update:mobileOpen", false);
  const path = item.key === "dashboard" ? "/dashboard" : `/${item.key}`;
  router.push({path: localizedPath(path), query: item.query});
}

function onItemClick(item: NavItem) {
  if (isPlanLocked(item)) return;

  if (props.isMobile && item.children?.length) {
    toggleExpanded(item.key);
    return;
  }

  navigate(item);
}

function goHome() {
  emit("update:mobileOpen", false);
  router.push(localizedPath("/dashboard"));
}

function goSubscription() {
  emit("update:mobileOpen", false);
  router.push({path: localizedPath("/profile"), query: {section: "subscription"}});
}
</script>

<style scoped>
.app-nav {
  --app-nav-bg: #1e2d35;
  --app-nav-bg-hover: rgba(255, 255, 255, 0.06);
  --app-nav-bg-active: rgba(99, 226, 183, 0.14);
  --app-nav-text: rgba(255, 255, 255, 0.82);
  --app-nav-text-muted: rgba(255, 255, 255, 0.55);
  --app-nav-text-active: #63e2b7;
  --app-nav-border: rgba(255, 255, 255, 0.08);
  --app-nav-width: 232px;
  --app-nav-collapsed-width: 68px;

  position: relative;
  z-index: 120;
  display: flex;
  flex-direction: column;
  width: var(--app-nav-width);
  flex: 0 0 var(--app-nav-width);
  height: 100%;
  background: var(--app-nav-bg);
  color: var(--app-nav-text);
  border-inline-end: 1px solid var(--app-nav-border);
  transition: width 0.2s ease, flex-basis 0.2s ease;
  overflow: hidden;
}

.app-nav--collapsed {
  width: var(--app-nav-collapsed-width);
  flex-basis: var(--app-nav-collapsed-width);
}

.app-nav__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 64px;
  padding: 14px 16px;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid var(--app-nav-border);
}

.app-nav--collapsed .app-nav__brand {
  justify-content: center;
  padding-inline: 10px;
}

.app-nav__logo {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  overflow: hidden;
  flex: 0 0 auto;
  background: transparent;
}

.app-nav__logo-img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.app-nav__brand-text {
  font-weight: 700;
  font-size: 15px;
  color: #fff;
  letter-spacing: 0.2px;
  white-space: nowrap;
}

.app-nav__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.app-nav__group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.app-nav__item,
.app-nav__subitem {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 46px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--app-nav-text);
  cursor: pointer;
  font: inherit;
  font-size: 13.5px;
  font-weight: 500;
  text-align: start;
  text-decoration: none;
  transition: background 0.15s ease, color 0.15s ease;
}

.app-nav--collapsed .app-nav__item {
  justify-content: center;
  padding-inline: 0;
}

.app-nav__item:hover,
.app-nav__subitem:hover {
  background: var(--app-nav-bg-hover);
  color: #fff;
}

.app-nav__item--active,
.app-nav__item--parent-active,
.app-nav__subitem--active {
  background: var(--app-nav-bg-active);
  color: var(--app-nav-text-active);
  font-weight: 650;
}

.app-nav__item--open .app-nav__chevron {
  transform: rotate(-90deg);
}

.app-nav__item--locked,
.app-nav__subitem--locked {
  opacity: 0.45;
  cursor: not-allowed;
}

.app-nav__item--locked:hover,
.app-nav__subitem--locked:hover {
  background: transparent;
  color: var(--app-nav-text);
}

.app-nav__icon {
  flex: 0 0 auto;
  color: inherit;
  opacity: 0.95;
}

.app-nav__label {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.app-nav__chevron,
.app-nav__user-chevron {
  flex: 0 0 auto;
  color: var(--app-nav-text-muted);
  transition: transform 0.15s ease;
}

.app-nav__group :deep(.n-popover) {
  display: block;
  width: 100%;
}

.app-nav__flyout {
  min-width: 168px;
  padding: 10px 8px;
  border-radius: 14px;
  background: #243b46;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.app-nav__flyout-item {
  display: block;
  width: 100%;
  min-height: 40px;
  padding: 8px 16px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.88);
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  text-align: start;
}

.app-nav__flyout-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.app-nav__flyout-item--active {
  background: rgba(99, 226, 183, 0.14);
  color: #63e2b7;
}

.app-nav__flyout-item--locked,
.app-nav__flyout-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.app-nav__sub {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 2px 0 6px;
}

.app-nav__subitem {
  min-height: 36px;
  padding-inline-start: 22px;
  font-size: 13px;
  color: var(--app-nav-text-muted);
}

.app-nav__subitem-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.55;
  flex: 0 0 auto;
  margin-inline: 8px 2px;
}

.app-nav__subitem--active .app-nav__subitem-dot {
  opacity: 1;
  background: var(--app-nav-text-active);
}

.app-nav__footer {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 8px 12px;
  border-top: 1px solid var(--app-nav-border);
}

.app-nav__subscription {
  text-decoration: none;
}

.app-nav__plan {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 600;
  color: var(--app-nav-text-muted);
  white-space: nowrap;
}

.app-nav__user {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 48px;
  padding: 4px 6px;
  border-radius: 10px;
}

.app-nav__user:hover {
  background: var(--app-nav-bg-hover);
}

.app-nav__user--collapsed {
  justify-content: center;
  padding-inline: 0;
}

.app-nav__user :deep(.user-dropdown) {
  flex: 1 1 auto;
  min-width: 0;
}

.app-nav__user :deep(.user-dropdown__trigger) {
  width: 100%;
  color: var(--app-nav-text);
  background: transparent;
  border-color: transparent;
  box-shadow: none;
  padding-inline: 6px;
}

.app-nav__user :deep(.user-dropdown__trigger:hover) {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}

.app-nav__user :deep(.user-dropdown__name) {
  display: block;
  color: #fff;
  font-size: 13px;
  max-width: 120px;
}

.app-nav__user :deep(.user-dropdown__avatar) {
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.app-nav__user :deep(.app-nav__chevron) {
  margin-inline-start: auto;
  color: var(--app-nav-text-muted);
}

.app-nav__user--collapsed :deep(.user-dropdown__meta),
.app-nav__user--collapsed :deep(.app-nav__chevron) {
  display: none;
}

.app-nav__user--collapsed :deep(.user-dropdown__trigger) {
  justify-content: center;
}

.app-nav__collapse {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-top: 4px;
  margin-left: 8px;
  margin-right: auto;
  border: 1px solid var(--app-nav-border);
  border-radius: 50%;
  background: transparent;
  color: var(--app-nav-text-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.app-nav--collapsed .app-nav__collapse {
  align-self: center;
  margin-left: 0;
  margin-right: 0;
}

.app-nav__collapse:hover {
  background: var(--app-nav-bg-hover);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.18);
}

.app-nav__backdrop {
  display: none;
}

@media (max-width: 900px) {
  .app-nav {
    position: fixed;
    inset-block: 0;
    inset-inline-start: 0;
    width: min(280px, 86vw);
    flex-basis: auto;
    transform: translateX(100%);
    transition: transform 0.2s ease;
    box-shadow: none;
  }

  [dir="ltr"] .app-nav {
    transform: translateX(-100%);
  }

  .app-nav--mobile-open {
    transform: translateX(0);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08), 0 18px 40px rgba(0, 0, 0, 0.28);
  }

  [dir="ltr"] .app-nav--mobile-open {
    transform: translateX(0);
  }

  .app-nav__backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 110;
    background: rgba(15, 23, 28, 0.45);
  }
}
</style>
