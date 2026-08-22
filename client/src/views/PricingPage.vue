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

    <section class="pricing-hero">
      <p class="pricing-eyebrow">מנויים</p>
      <h1>בחרו את המסלול שמתאים לכמות המסמכים שלכם</h1>
      <p>
        RemindOCR מאפשרת לייבא חשבוניות, קבלות ותסקירי בדיקה, לחלץ נתונים עם OCR ו-AI,
        ולנהל מסמכים ותזכורות במקום אחד.
      </p>
    </section>

    <section class="pricing-grid" aria-label="מסלולי מנוי">
      <article class="plan-card">
        <div class="plan-card__head">
          <h2>בסיסי</h2>
          <div class="plan-price">
            <span class="plan-price__old">₪86</span>
            <strong>₪69</strong>
            <span>/ חודש</span>
          </div>
          <p>מתאים לעסק קטן שמייבא מסמכים בכמות מוגבלת.</p>
        </div>
        <ul class="plan-list">
          <li><n-icon :component="CheckmarkOutline" />2 משתמשים</li>
          <li><n-icon :component="CheckmarkOutline" />חיבור 2 חשבונות דוא"ל</li>
          <li><n-icon :component="CheckmarkOutline" />עד 30 מסמכים בחודש</li>
          <li><n-icon :component="CheckmarkOutline" />OCR מתקדם</li>
          <li><n-icon :component="CheckmarkOutline" />המרת קבלות לקובץ אקסל</li>
          <li><n-icon :component="CheckmarkOutline" />סנכרון מסמכים ל-Google Drive</li>
        </ul>
        <n-button type="primary" size="large" block @click="startPlan">התחל עכשיו</n-button>
      </article>

      <article class="plan-card plan-card--highlight">
        <div class="plan-card__badge">מומלץ לעסקים פעילים</div>
        <div class="plan-card__head">
          <h2>עסקי</h2>
          <div class="plan-price">
            <span class="plan-price__old">₪224</span>
            <strong>₪179</strong>
            <span>/ חודש</span>
          </div>
          <p>למי שמייבא מסמכים באופן שוטף ורוצה יותר נפח עבודה.</p>
        </div>
        <ul class="plan-list">
          <li><n-icon :component="CheckmarkOutline" />משתמשים ללא הגבלה</li>
          <li><n-icon :component="CheckmarkOutline" />חשבונות אימייל ללא הגבלה</li>
          <li><n-icon :component="CheckmarkOutline" />עד 100 מסמכים בחודש</li>
          <li><n-icon :component="CheckmarkOutline" />סנכרון היסטורי של 4 שנים</li>
          <li><n-icon :component="CheckmarkOutline" />חשבוניות WhatsApp ללא הגבלה</li>
          <li><n-icon :component="CheckmarkOutline" />מסמכים ללא הגבלה לניהול ידני</li>
        </ul>
        <n-button type="primary" size="large" block @click="startPlan">התחל עכשיו</n-button>
      </article>
    </section>

    <section class="pricing-feature-band">
      <div>
        <n-icon :component="DocumentTextOutline" :size="24" />
        <strong>ייבוא חשבוניות ותסקירי בדיקה</strong>
        <span>חיפוש ב-Gmail, תצוגה מקדימה, חילוץ נתונים ושמירת המסמך במערכת.</span>
      </div>
      <div>
        <n-icon :component="FlashOutline" :size="24" />
        <strong>אכיפת מכסה בצד השרת</strong>
        <span>המגבלה נבדקת בייבוא עצמו, כך שהמסלול נשמר גם מול קריאות API ישירות.</span>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { NButton, NIcon } from "naive-ui";
import { CheckmarkOutline, DocumentTextOutline, FlashOutline } from "@vicons/ionicons5";
import { useAuthStore } from "../stores/auth.js";

const router = useRouter();
const authStore = useAuthStore();
const isDark = computed(() => document.documentElement.getAttribute("data-theme") === "dark");
const logoSrc = computed(() => (isDark.value ? "/remindocr-logo-dark.png" : "/remindocr-logo-light.png"));

function startPlan() {
  router.push(authStore.user ? "/profile" : "/login?tab=register");
}
</script>

<style scoped>
.pricing-page {
  min-height: 100%;
  color: var(--text-primary);
}

.pricing-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 28px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card);
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
  border-radius: 8px;
  background: var(--brand-color);
  color: var(--text-inverse) !important;
}

.pricing-hero {
  max-width: 760px;
  margin: 0 auto;
  padding: 72px 24px 32px;
  text-align: center;
}

.pricing-eyebrow {
  margin: 0 0 10px;
  color: var(--brand-color);
  font-weight: 800;
}

.pricing-hero h1 {
  margin: 0;
  font-size: clamp(30px, 5vw, 52px);
  line-height: 1.08;
  letter-spacing: 0;
}

.pricing-hero p:not(.pricing-eyebrow) {
  margin: 18px auto 0;
  max-width: 640px;
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1.7;
}

.pricing-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 360px));
  justify-content: center;
  gap: 18px;
  padding: 24px;
}

.plan-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 22px;
  min-height: 560px;
  padding: 28px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
}

.plan-card--highlight {
  border-color: var(--brand-color);
  box-shadow: 0 16px 42px color-mix(in srgb, var(--brand-color) 14%, transparent);
}

.plan-card__badge {
  align-self: flex-start;
  padding: 5px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand-color) 12%, var(--bg-card));
  color: var(--brand-color);
  font-size: 12px;
  font-weight: 800;
}

.plan-card__head h2 {
  margin: 0 0 12px;
  font-size: 24px;
  font-weight: 900;
}

.plan-card__head p {
  margin: 12px 0 0;
  color: var(--text-secondary);
}

.plan-price {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.plan-price strong {
  font-size: 36px;
  line-height: 1;
}

.plan-price__old {
  color: var(--text-muted);
  text-decoration: line-through;
}

.plan-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 13px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.plan-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
}

.plan-list :deep(.n-icon) {
  color: #2f80ff;
  flex: 0 0 auto;
}

.pricing-feature-band {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  max-width: 920px;
  margin: 10px auto 72px;
  padding: 0 24px;
}

.pricing-feature-band > div {
  display: grid;
  gap: 8px;
  padding: 20px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
}

.pricing-feature-band :deep(.n-icon) {
  color: var(--brand-color);
}

.pricing-feature-band span {
  color: var(--text-secondary);
  line-height: 1.55;
}

@media (max-width: 760px) {
  .pricing-grid,
  .pricing-feature-band {
    grid-template-columns: 1fr;
  }

  .pricing-nav {
    padding: 0 16px;
  }
}
</style>
