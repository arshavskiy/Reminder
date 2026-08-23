<template>
  <div class="pricing-page" dir="rtl">
    <nav v-if="!authStore.user" class="pricing-nav">
      <router-link class="pricing-brand" to="/login">
        <img class="pricing-brand__logo" :src="logoSrc" alt="" />
        <span>RemindOCR</span>
      </router-link>
      <div class="pricing-nav__links">
        <router-link to="/login">כניסה</router-link>
        <router-link class="pricing-nav__cta" to="/login?tab=register">הרשמה</router-link>
      </div>
    </nav>

    <div class="pricing-atmosphere" aria-hidden="true">
      <span class="pricing-blob pricing-blob--a" />
      <span class="pricing-blob pricing-blob--b" />
      <span class="pricing-grid-fade" />
    </div>

    <section class="pricing-hero">
      <img class="pricing-hero__mark" :src="logoSrc" alt="" />
      <p class="pricing-brand-name">RemindOCR</p>
      <h1>מסלול אחד. כל המסמכים במקום אחד.</h1>
      <p class="pricing-hero__lead">
        ייבוא חשבוניות ותסקירים, חילוץ OCR, ותזכורות אוטומטיות — לפי נפח העבודה שלכם.
      </p>
      <p v-if="currentPlanId" class="pricing-current-chip">
        המסלול שלכם כרגע: <strong>{{ currentPlanLabel }}</strong>
      </p>
    </section>

    <section class="pricing-grid" aria-label="מסלולי מנוי">
      <article
        v-for="(plan, index) in plans"
        :key="plan.id"
        class="plan-card"
        :class="{
          'plan-card--highlight': plan.highlighted,
          'plan-card--current': plan.id === currentPlanId,
        }"
        :style="{ '--enter-delay': `${index * 70}ms` }"
      >
        <div v-if="plan.highlighted" class="plan-card__badge">מומלץ</div>
        <div v-else-if="plan.id === currentPlanId" class="plan-card__badge plan-card__badge--current">המסלול שלכם</div>

        <div class="plan-card__head">
          <h2>{{ plan.name }}</h2>
          <div class="plan-price">
            <span v-if="plan.oldPrice != null" class="plan-price__old">₪{{ plan.oldPrice }}</span>
            <strong>₪{{ plan.price }}</strong>
            <span class="plan-price__period">{{ plan.period }}</span>
          </div>
          <p>{{ plan.blurb }}</p>
        </div>

        <ul class="plan-list">
          <li v-for="feature in plan.features" :key="feature">
            <n-icon :component="CheckmarkCircleOutline" :size="18" />
            <span>{{ feature }}</span>
          </li>
        </ul>

        <button
          class="plan-cta"
          :class="{
            'plan-cta--primary': plan.highlighted || plan.id !== currentPlanId,
            'plan-cta--current': plan.id === currentPlanId,
          }"
          type="button"
          @click="startPlan(plan.id)"
        >
          {{ ctaLabel(plan.id) }}
        </button>
      </article>
    </section>

    <section class="pricing-trust">
      <div class="pricing-trust__item">
        <n-icon :component="ShieldCheckmarkOutline" :size="22" />
        <div>
          <strong>אכיפת מכסה בשרת</strong>
          <span>המגבלה נבדקת בייבוא עצמו — לא רק בממשק.</span>
        </div>
      </div>
      <div class="pricing-trust__item">
        <n-icon :component="MailOutline" :size="22" />
        <div>
          <strong>תזכורות אוטומטיות</strong>
          <span>מיילים ללקוחות לפני תום תוקף תסקירים וחוזים.</span>
        </div>
      </div>
      <div class="pricing-trust__item">
        <n-icon :component="DocumentTextOutline" :size="22" />
        <div>
          <strong>OCR + AI</strong>
          <span>חילוץ תאריכים, לקוחות ומספרי רישוי מהמסמך.</span>
        </div>
      </div>
    </section>

    <section class="pricing-faq">
      <h2>שאלות נפוצות</h2>
      <div class="pricing-faq__list">
        <details v-for="item in faq" :key="item.q" class="pricing-faq__item">
          <summary>{{ item.q }}</summary>
          <p>{{ item.a }}</p>
        </details>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { NIcon } from "naive-ui";
import {
  CheckmarkCircleOutline,
  DocumentTextOutline,
  MailOutline,
  ShieldCheckmarkOutline,
} from "@vicons/ionicons5";
import { useAuthStore } from "../stores/auth.js";

type PlanId = "free" | "basic" | "business";

const router = useRouter();
const authStore = useAuthStore();
const isDark = computed(() => document.documentElement.getAttribute("data-theme") === "dark");
const logoSrc = computed(() => (isDark.value ? "/remindocr-logo-dark.png" : "/remindocr-logo-light.png"));

const PLAN_LABELS: Record<PlanId, string> = {
  free: "חינמי",
  basic: "בסיסי",
  business: "עסקי",
};

const plans: Array<{
  id: PlanId;
  name: string;
  price: number;
  oldPrice?: number;
  period: string;
  blurb: string;
  highlighted?: boolean;
  features: string[];
}> = [
  {
    id: "free",
    name: "חינמי",
    price: 0,
    period: "חד פעמי",
    blurb: "להתחלה מהירה ובדיקת התהליך עם כמות מסמכים מוגבלת.",
    features: [
      "משתמש אחד",
      "25 מסמכי חשבוניות/קבלות חד פעמי",
      "20 מסמכי תסקירים/חוזים חד פעמי",
      "OCR מתקדם",
      "תצוגה מקדימה וחילוץ נתונים",
      "תזכורות אימייל בסיסיות",
      "דוח חודשי ידני",
    ],
  },
  {
    id: "basic",
    name: "בסיסי",
    price: 69,
    oldPrice: 86,
    period: "/ חודש",
    blurb: "מתאים לעסק קטן שמייבא מסמכים בכל חודש.",
    features: [
      "2 משתמשים",
      'חיבור 2 חשבונות דוא"ל',
      "50 מסמכי חשבוניות/קבלות בחודש",
      "40 מסמכי תסקירים/חוזים בחודש",
      "OCR מתקדם",
      "המרת קבלות לקובץ אקסל",
      "תזכורות אימייל אוטומטיות",
      "דוחות חודשיים אוטומטיים",
    ],
  },
  {
    id: "business",
    name: "עסקי",
    price: 179,
    oldPrice: 224,
    period: "/ חודש",
    blurb: "למי שמייבא מסמכים באופן שוטף ורוצה יותר נפח עבודה.",
    highlighted: true,
    features: [
      "משתמשים ללא הגבלה",
      "חשבונות אימייל ללא הגבלה",
      "חשבוניות וקבלות ללא הגבלה",
      "תסקירים וחוזים ללא הגבלה",
      "סנכרון היסטורי של 4 שנים",
      "מסמכים ללא הגבלה לניהול ידני",
      "תזכורות אימייל ללא הגבלה",
      "דוחות חודשיים אוטומטיים לכל הלקוחות",
    ],
  },
];

const faq = [
  {
    q: "מה קורה כשמגיעים למכסת המסמכים?",
    a: "הייבוא נחסם בצד השרת עד חידוש המכסה או שדרוג מסלול. המסמכים הקיימים נשארים זמינים.",
  },
  {
    q: "אפשר להתחיל בחינם ולשדרג אחר כך?",
    a: "כן. המסלול החינמי מיועד לבדיקה, ואפשר לעבור לבסיסי או עסקי בכל שלב מהפרופיל או מעמוד המנויים.",
  },
  {
    q: "האם חיבור Gmail חובה?",
    a: "לא. אפשר להעלות מסמכים ידנית. Gmail משמש רק לייבוא קבצים מצורפים שתבחרו.",
  },
];

function planFromRole(role: string | null | undefined): PlanId {
  if (role === "admin") return "business";
  if (role === "pro") return "basic";
  return "free";
}

const currentPlanId = computed<PlanId | null>(() => {
  if (!authStore.user) return null;
  const plan = authStore.user.plan ?? planFromRole(authStore.user.role);
  return plan;
});

const currentPlanLabel = computed(() =>
  currentPlanId.value ? PLAN_LABELS[currentPlanId.value] : "",
);

function ctaLabel(planId: PlanId): string {
  if (planId === currentPlanId.value) return "המסלול הנוכחי";
  if (!authStore.user) return "התחל עכשיו";
  if (planId === "free") return "עבור לחינמי";
  return "שדרג עכשיו";
}

function startPlan(_planId: PlanId) {
  router.push(authStore.user ? "/profile" : "/login?tab=register");
}
</script>

<style scoped>
.pricing-page {
  position: relative;
  isolation: isolate;
  min-height: 100%;
  overflow: hidden;
  color: var(--text-primary);
  font-family: "Segoe UI", Arial, Helvetica, sans-serif;
  background:
    radial-gradient(1200px 520px at 85% -10%, color-mix(in srgb, var(--brand-color) 16%, transparent), transparent 60%),
    radial-gradient(900px 480px at 0% 20%, color-mix(in srgb, var(--brand-color) 10%, transparent), transparent 55%),
    var(--bg-app);
}

.pricing-page :is(h1, h2, h3, p, span, strong, button, a, li, summary, details) {
  font-family: inherit;
}

.pricing-atmosphere {
  pointer-events: none;
  position: absolute;
  inset: 0;
  z-index: 0;
}

.pricing-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(40px);
  opacity: 0.45;
  animation: float-blob 12s ease-in-out infinite;
}

.pricing-blob--a {
  top: 8%;
  left: 8%;
  width: 220px;
  height: 220px;
  background: color-mix(in srgb, var(--brand-color) 28%, transparent);
}

.pricing-blob--b {
  top: 28%;
  right: 6%;
  width: 280px;
  height: 280px;
  background: color-mix(in srgb, #0ea5e9 14%, transparent);
  animation-delay: -4s;
}

.pricing-grid-fade {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(color-mix(in srgb, var(--border-color) 55%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--border-color) 55%, transparent) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse 70% 50% at 50% 0%, #000 20%, transparent 75%);
  opacity: 0.35;
}

.pricing-nav,
.pricing-hero,
.pricing-grid,
.pricing-trust,
.pricing-faq {
  position: relative;
  z-index: 1;
}

.pricing-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 28px;
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 80%, transparent);
  background: color-mix(in srgb, var(--bg-card) 82%, transparent);
  backdrop-filter: blur(10px);
}

.pricing-brand,
.pricing-nav__links {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pricing-brand,
.pricing-nav__links a {
  color: var(--text-primary);
  text-decoration: none;
  font-weight: 800;
}

.pricing-brand__logo {
  width: 36px;
  height: 36px;
  border-radius: 9px;
}

.pricing-nav__cta {
  padding: 8px 14px;
  border-radius: 10px;
  background: var(--brand-color);
  color: #fff !important;
  box-shadow: 0 8px 20px color-mix(in srgb, var(--brand-color) 28%, transparent);
}

.pricing-hero {
  max-width: 740px;
  margin: 0 auto;
  padding: 64px 24px 28px;
  text-align: center;
  animation: fade-up 0.55s ease both;
}

.pricing-hero__mark {
  display: block;
  width: 56px;
  height: 56px;
  margin: 0 auto 14px;
  border-radius: 14px;
  object-fit: contain;
  box-shadow: 0 10px 28px color-mix(in srgb, var(--brand-color) 22%, transparent);
}

.pricing-brand-name {
  margin: 0 0 10px;
  color: var(--brand-color);
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 0.04em;
}

.pricing-hero h1 {
  margin: 0;
  font-size: clamp(30px, 5vw, 48px);
  line-height: 1.12;
  font-weight: 900;
  letter-spacing: -0.02em;
}

.pricing-hero__lead {
  margin: 16px auto 0;
  max-width: 560px;
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1.7;
}

.pricing-current-chip {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  margin: 20px auto 0;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--brand-color) 28%, var(--border-color));
  background: color-mix(in srgb, var(--brand-color) 10%, var(--bg-card));
  color: var(--text-secondary);
  font-size: 13px;
}

.pricing-current-chip strong {
  color: var(--brand-color);
}

.pricing-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 340px));
  justify-content: center;
  gap: 20px;
  padding: 20px 24px 40px;
}

.plan-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 560px;
  padding: 28px 24px;
  border: 1px solid var(--border-color);
  border-radius: 18px;
  background: color-mix(in srgb, var(--bg-card) 92%, transparent);
  box-shadow: 0 10px 30px color-mix(in srgb, var(--text-primary) 4%, transparent);
  backdrop-filter: blur(8px);
  transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
  animation: fade-up 0.55s ease both;
  animation-delay: var(--enter-delay, 0ms);
}

.plan-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 18px 40px color-mix(in srgb, var(--text-primary) 8%, transparent);
}

.plan-card--highlight {
  border-color: color-mix(in srgb, var(--brand-color) 55%, var(--border-color));
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--brand-color) 10%, var(--bg-card)) 0%,
      var(--bg-card) 38%
    );
  box-shadow: 0 18px 48px color-mix(in srgb, var(--brand-color) 16%, transparent);
  transform: translateY(-6px);
}

.plan-card--highlight:hover {
  transform: translateY(-10px);
}

.plan-card--current:not(.plan-card--highlight) {
  border-color: color-mix(in srgb, var(--brand-color) 40%, var(--border-color));
}

.plan-card__badge {
  position: absolute;
  top: 14px;
  left: 14px;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--brand-color);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.plan-card__badge--current {
  background: color-mix(in srgb, var(--brand-color) 14%, var(--bg-card));
  color: var(--brand-color);
  border: 1px solid color-mix(in srgb, var(--brand-color) 30%, transparent);
}

.plan-card__head h2 {
  margin: 0 0 14px;
  font-size: 22px;
  font-weight: 900;
}

.plan-card__head p {
  margin: 12px 0 0;
  color: var(--text-secondary);
  line-height: 1.55;
  font-size: 14px;
}

.plan-price {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
}

.plan-price strong {
  font-size: 40px;
  line-height: 1;
  font-weight: 900;
  letter-spacing: -0.03em;
}

.plan-price__old {
  color: var(--text-muted, var(--text-secondary));
  text-decoration: line-through;
  font-size: 15px;
  font-weight: 700;
}

.plan-price__period {
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
}

.plan-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.plan-list li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.45;
}

.plan-list :deep(.n-icon) {
  color: var(--brand-color);
  flex: 0 0 auto;
  margin-top: 1px;
}

.plan-cta {
  width: 100%;
  height: 46px;
  border: 0;
  border-radius: 12px;
  cursor: pointer;
  font-family: inherit;
  font-size: 15px;
  font-weight: 800;
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.plan-cta--primary {
  background: var(--brand-color);
  color: #fff;
  box-shadow: 0 10px 22px color-mix(in srgb, var(--brand-color) 28%, transparent);
}

.plan-cta--primary:hover {
  transform: translateY(-1px);
  filter: brightness(1.05);
}

.plan-cta--current {
  background: color-mix(in srgb, var(--brand-color) 10%, var(--bg-card));
  color: var(--brand-color);
  border: 1px solid color-mix(in srgb, var(--brand-color) 28%, var(--border-color));
  cursor: default;
}

.pricing-trust {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  max-width: 1080px;
  margin: 0 auto 48px;
  padding: 0 24px;
}

.pricing-trust__item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 18px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: color-mix(in srgb, var(--bg-card) 88%, transparent);
  animation: fade-up 0.6s ease both;
  animation-delay: 0.2s;
}

.pricing-trust__item :deep(.n-icon) {
  color: var(--brand-color);
  flex: 0 0 auto;
}

.pricing-trust__item strong {
  display: block;
  margin-bottom: 4px;
  font-size: 14px;
}

.pricing-trust__item span {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.pricing-faq {
  max-width: 720px;
  margin: 0 auto 72px;
  padding: 0 24px;
}

.pricing-faq h2 {
  margin: 0 0 18px;
  text-align: center;
  font-size: 22px;
  font-weight: 900;
}

.pricing-faq__list {
  display: grid;
  gap: 10px;
}

.pricing-faq__item {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  padding: 4px 16px;
}

.pricing-faq__item summary {
  cursor: pointer;
  list-style: none;
  padding: 14px 0;
  font-weight: 800;
  font-size: 14px;
}

.pricing-faq__item summary::-webkit-details-marker {
  display: none;
}

.pricing-faq__item p {
  margin: 0 0 14px;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.65;
}

@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes float-blob {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(18px) scale(1.05); }
}

@media (prefers-reduced-motion: reduce) {
  .pricing-blob,
  .pricing-hero,
  .plan-card,
  .pricing-trust__item {
    animation: none;
  }

  .plan-card,
  .plan-card--highlight,
  .plan-card:hover,
  .plan-card--highlight:hover {
    transform: none;
  }
}

@media (max-width: 980px) {
  .pricing-grid {
    grid-template-columns: 1fr;
    max-width: 440px;
    margin: 0 auto;
  }

  .plan-card,
  .plan-card--highlight {
    min-height: 0;
    transform: none;
  }

  .plan-card--highlight:hover,
  .plan-card:hover {
    transform: translateY(-2px);
  }

  .pricing-trust {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .pricing-nav {
    padding: 0 16px;
  }

  .pricing-hero {
    padding-top: 40px;
  }
}
</style>
