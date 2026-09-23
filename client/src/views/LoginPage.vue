<template>
  <div class="login-page" :dir="t.dir">
    <nav class="landing-nav">
      <a class="nav-brand" href="#top" aria-label="RemindOCR">
        <img :src="logoSrc" alt="" class="nav-brand__logo"/>
        <span class="nav-brand__text">RemindOCR</span>
      </a>
      <div class="nav-links">
        <n-tooltip placement="bottom" :keep-alive-on-hover="false">
          <template #trigger>
            <button
                :aria-label="isDark ? t.copy.themeToLight : t.copy.themeToDark"
                class="iconbtn"
                type="button"
                @click="toggleTheme"
            >
              <n-icon :component="isDark ? SunnyOutline : MoonOutline" :size="18"/>
            </button>
          </template>
          {{ isDark ? t.copy.themeLight : t.copy.themeDark }}
        </n-tooltip>
        <a class="nav-lang" :href="t.otherPath" :hreflang="t.otherHreflang" :lang="t.otherHreflang" @click.prevent="switchLocale">{{ t.copy.langSwitch }}</a>
        <a class="nav-cta" href="#login-card">{{ t.copy.navCta }}</a>
      </div>
    </nav>

    <section id="top" class="hero-section">
      <div class="hero">
        <div class="hero-content">
          <!--          <div class="hero-badge">-->
          <!--            <span>מותאם לעסקים ישראלים</span>-->
          <!--          </div>-->
          <h1>{{ t.copy.heroTitle }}</h1>
          <h2 style="font-size: 24px; line-height: 52px">EXTRACT • TRACK • AUTOMATE</h2>
          <p class="hero-desc">{{ t.copy.heroDesc }}</p>
          <!--          <p class="hero-purpose">-->
          <!--            חיבור Gmail הוא אופציונלי ומשמש רק להצגת הודעות עם קבצים מצורפים ולייבוא קובצי PDF שהמשתמש בוחר להכניס למערכת.-->
          <!--          </p>-->
          <!--          <div class="hero-actions">-->
          <!--            <a class="btn-primary" href="#login-card">כניסה למערכת</a>-->
          <!--            <a class="btn-secondary" href="#features">למד עוד</a>-->
          <!--          </div>-->
        </div>

        <div id="login-card" class="login-card">
          <div class="login-brand">
            <img :src="logoSrc" alt="" class="login-brand__logo"/>
            <h2 class="login-brand__title">RemindOCR</h2>
            <p class="login-brand__sub">{{ t.copy.brandSub }}</p>
          </div>

          <n-alert v-if="route.query.billing === 'one_time'" style="margin-bottom:16px" type="info">
            {{
              localeStore.locale === "en"
                  ? "One-time payment for the number of months purchased. After payment verification, we’ll remind you by email and in the app when that period ends. Already registered? Sign in to your existing account."
                  : "תשלום חד־פעמי למספר החודשים שנרכשו. לאחר אימות התשלום נזכיר לכם באימייל ובאפליקציה בסיום התקופה ששולמה. כבר נרשמתם? התחברו לחשבון הקיים."
            }}
          </n-alert>
          <n-alert v-if="successMsg" type="success" :title="successMsg" style="margin-bottom:16px" closable
                   @close="successMsg = null"/>
          <n-alert v-if="errorMsg" type="error" :title="errorMsg" style="margin-bottom:16px" closable
                   @close="clearError"/>

          <n-tabs v-model:value="activeTab" type="line" animated style="width:100%;margin-bottom:8px">
            <n-tab-pane name="login" :tab="t.copy.tabLogin">
              <n-form @submit.prevent="handleLogin" style="margin-top:8px">
                <n-form-item :label="t.copy.email" :show-feedback="false" style="margin-bottom:12px">
                  <n-input
                      v-model:value="loginEmail"
                      type="email"
                      placeholder="you@example.com"
                      size="large"
                      autocomplete="email"
                      :input-props="{ autocomplete: 'username', name: 'email' }"
                      :disabled="loading"
                  />
                </n-form-item>
                <n-form-item :label="t.copy.password" :show-feedback="false" style="margin-bottom:16px">
                  <n-input
                      v-model:value="loginPassword"
                      type="password"
                      placeholder="••••••••"
                      size="large"
                      show-password-on="click"
                      autocomplete="current-password"
                      :input-props="{ autocomplete: 'current-password' }"
                      :disabled="loading"
                  />
                </n-form-item>
                <n-button
                    type="primary"
                    size="large"
                    style="width:100%;margin-bottom:8px"
                    attr-type="submit"
                    :loading="loading"
                    :disabled="!loginEmail || !loginPassword"
                >
                  {{ t.copy.loginSubmit }}
                </n-button>
                <div style="text-align:center">
                  <n-button text size="small" @click="showForgot = true">{{ t.copy.forgot }}</n-button>
                </div>
              </n-form>

              <div class="divider"><span>{{ t.copy.or }}</span></div>
              <GoogleSignIn :label="t.copy.google" @error="onGisError"/>
            </n-tab-pane>

            <n-tab-pane name="register" :tab="t.copy.tabRegister">
              <n-form @submit.prevent="handleRegister" style="margin-top:8px">
                <n-form-item :label="t.copy.fullName" :show-feedback="false" style="margin-bottom:12px">
                  <n-input
                      v-model:value="regName"
                      :placeholder="t.copy.namePlaceholder"
                      size="large"
                      autocomplete="name"
                      :input-props="{ autocomplete: 'name', name: 'name' }"
                      :disabled="loading"
                  />
                </n-form-item>
                <n-form-item :label="t.copy.email" :show-feedback="false" style="margin-bottom:12px">
                  <n-input
                      v-model:value="regEmail"
                      type="email"
                      placeholder="you@example.com"
                      size="large"
                      autocomplete="email"
                      :input-props="{ autocomplete: 'username', name: 'email' }"
                      :disabled="loading"
                  />
                </n-form-item>
                <n-form-item :label="t.copy.password" :show-feedback="false" style="margin-bottom:4px">
                  <n-input
                      v-model:value="regPassword"
                      type="password"
                      :placeholder="t.copy.passwordPlaceholder"
                      size="large"
                      show-password-on="click"
                      autocomplete="new-password"
                      :input-props="{ autocomplete: 'new-password' }"
                      :disabled="loading"
                  />
                </n-form-item>
                <p v-if="regPassword && regPassword.length < 8"
                   style="color:var(--color-warning);font-size:12px;margin:4px 0 12px">
                  {{ t.copy.passwordTooShort }}</p>
                <div style="height:12px" v-else/>
                <n-checkbox
                    v-model:checked="regTermsAccepted"
                    :disabled="loading"
                    class="register-terms"
                >
                  {{ t.copy.termsPrefix }}
                  <a :href="marketingUrl('/terms', localeStore.locale)" rel="noopener" target="_blank">{{ t.copy.terms }}</a>
                  {{ t.copy.termsAnd }}
                  <a :href="marketingUrl('/privacy', localeStore.locale)" rel="noopener" target="_blank">{{ t.copy.privacy }}</a>
                </n-checkbox>
                <n-button
                    type="primary"
                    size="large"
                    style="width:100%"
                    attr-type="submit"
                    :loading="loading"
                    :disabled="!regEmail || !regPassword || regPassword.length < 8 || !regTermsAccepted"
                >
                  {{ t.copy.registerSubmit }}
                </n-button>
              </n-form>
            </n-tab-pane>
          </n-tabs>

          <p class="login-footer">{{ t.copy.footerAccess }}</p>
        </div>
      </div>
    </section>

    <!--    <section class="stats">-->
    <!--      <div class="stats-inner">-->
    <!--        <div>-->
    <!--          <div class="stat-num">100%</div>-->
    <!--          <div class="stat-label">עברית מלאה — ממשק ו-OCR</div>-->
    <!--        </div>-->
    <!--        <div>-->
    <!--          <div class="stat-num">AI</div>-->
    <!--          <div class="stat-label">חילוץ נתונים אוטומטי</div>-->
    <!--        </div>-->
    <!--        <div>-->
    <!--          <div class="stat-num">0₪</div>-->
    <!--          <div class="stat-label">עלות הרצה עצמית</div>-->
    <!--        </div>-->
    <!--        <div>-->
    <!--          <div class="stat-num">∞</div>-->
    <!--          <div class="stat-label">לקוחות ומסמכים</div>-->
    <!--        </div>-->
    <!--      </div>-->
    <!--    </section>-->

    <!--    <section id="features" class="content-section">-->
    <!--      <div class="section-header">-->
    <!--        <h2>כל מה שצריך במקום אחד</h2>-->
    <!--        <p>מתוכנן עבור עסקים שצריכים לעקוב אחר מסמכים, חוזים ותסקירים בזמן אמת</p>-->
    <!--      </div>-->
    <!--      <div class="features-grid">-->
    <!--        <article class="feature-card">-->
    <!--          &lt;!&ndash;          <div class="feature-icon">📄</div>&ndash;&gt;-->
    <!--          <h3>ייבוא מסמכים חכם</h3>-->
    <!--          <p>העלה קבצי PDF, Word, Excel ותמונות, או ייבא קובצי PDF מצורפים מ-Gmail לאחר אישור מפורש שלך. ייבוא קבלות עד-->
    <!--            יבוא קבלות היסטורי מ-Gmail שמור למסלול עסקי.</p>-->
    <!--        </article>-->
    <!--        <article class="feature-card feature-card&#45;&#45;accent">-->
    <!--          <h3>ניסיון של 30 יום</h3>-->
    <!--          <p>כל היכולות של המסלול הבסיסי, עד 50 מסמכים — ידני ומאימייל יחד. ללא כרטיס אשראי. בסיסי כולל 50 קבלות ו-50-->
    <!--            תסקירים בחודש, ועסקי ללא הגבלה.</p>-->
    <!--        </article>-->
    <!--        &lt;!&ndash;        <article class="feature-card">&ndash;&gt;-->
    <!--        &lt;!&ndash;          <div class="feature-icon">✉️</div>&ndash;&gt;&ndash;&gt;-->
    <!--        &lt;!&ndash;          <h3>ייבוא PDF מ-Gmail</h3>&ndash;&gt;-->
    <!--        &lt;!&ndash;          <p>חיבור Gmail הוא אופציונלי, לקריאה בלבד, ומשמש להצגת הודעות עם קבצים מצורפים ולייבוא קובצי PDF שהמשתמש בוחר.</p>&ndash;&gt;-->
    <!--        &lt;!&ndash;        </article>&ndash;&gt;-->
    <!--        <article class="feature-card">-->
    <!--          &lt;!&ndash;          <div class="feature-icon">⏰</div>&ndash;&gt;-->
    <!--          <h3>תזכורות אוטומטיות</h3>-->
    <!--          <p>קבל אימייל 90, 60 ו-30 יום לפני שחוזה או תסקיר פג תוקף. לא עוד הפתעות.</p>-->
    <!--        </article>-->
    <!--        <article class="feature-card feature-card&#45;&#45;accent">-->
    <!--          <h3>סנכרון Google Calendar</h3>-->
    <!--          <p>חבר יומן Google וקבל תסקירים עתידיים ביומן ייעודי בשם ״תסקירים״, עם פרטי לקוח, איש קשר וציוד בתוך האירוע.-->
    <!--            במסלול עסקי.</p>-->
    <!--        </article>-->
    <!--        <article class="feature-card">-->
    <!--          &lt;!&ndash;          <div class="feature-icon">👥</div>&ndash;&gt;-->
    <!--          <h3>ניהול לקוחות</h3>-->
    <!--          <p>כרטיס לקוח מלא עם היסטוריית חוזים, תזכורות ומשימות. כולל חיפוש מהיר.</p>-->
    <!--        </article>-->
    <!--        <article class="feature-card">-->
    <!--          &lt;!&ndash;          <div class="feature-icon">🔍</div>&ndash;&gt;-->
    <!--          <h3>חיפוש מלא בתוך המסמכים</h3>-->
    <!--          <p>חפש לפי שם לקוח, מספר חוזה, תאריך ועוד — גם בתוכן המסמך עצמו.</p>-->
    <!--        </article>-->
<!--        <article class="feature-card">-->
    <!--          &lt;!&ndash;          <div class="feature-icon">🏭</div>&ndash;&gt;-->
    <!--          <h3>קטלוג ציוד</h3>-->
    <!--          <p>נהל מלאי ציוד — מנופים, פיגומים, מעליות ועוד — מקושר לתסקירי הבדיקה.</p>-->
<!--        </article>-->
    <!--        <article class="feature-card">-->
    <!--          &lt;!&ndash;          <div class="feature-icon">📊</div>&ndash;&gt;-->
    <!--          <h3>דוחות חודשיים</h3>-->
    <!--          <p>הפק דוחות לפי לקוח, שדות וסדר עמודות שנשמרים לכל משתמש.</p>-->
    <!--        </article>-->
    <!--        <article class="feature-card">-->
    <!--          <h3>סנכרון Google Drive</h3>-->
    <!--          <p>שמירת מסמכים בתיקיית RemindOCR ב-Google Drive, כולל סנכרון אוטומטי וייצוא. זמין כבר בניסיון.</p>-->
    <!--        </article>-->
    <!--      </div>-->
    <!--    </section>-->

    <!--    <section id="how" class="how-section">-->
    <!--      <div class="content-section">-->
    <!--        <div class="section-header">-->
    <!--          <h2>איך זה עובד?</h2>-->
    <!--          <p>תהליך פשוט בשלושה שלבים</p>-->
    <!--        </div>-->
    <!--        <div class="steps">-->
    <!--          <div class="step">-->
    <!--            <div class="step__num">1</div>-->
    <!--            <h3>ייבא מסמך</h3>-->
    <!--            <p>גרור קבצים. המערכת מטפלת ב- Word, Excel ותמונות.</p>-->
    <!--          </div>-->
    <!--          <div class="step">-->
    <!--            <div class="step__num">2</div>-->
    <!--            <h3>AI מחלץ נתונים</h3>-->
    <!--            <p>המערכת קוראת את המסמך ומחלצת שם לקוח, תאריך פקיעה, סכום ועוד.</p>-->
    <!--          </div>-->
    <!--          <div class="step">-->
    <!--            <div class="step__num">3</div>-->
    <!--            <h3>סנכרן ושלח תזכורות</h3>-->
    <!--            <p>המערכת מתזמנת התרעות אימייל ומסנכרנת את התסקירים ל-Google Calendar עם כל פרטי הלקוח והציוד.</p>-->
    <!--          </div>-->
    <!--        </div>-->
    <!--      </div>-->
    <!--    </section>-->

    <!-- Forgot password modal -->
    <n-modal v-model:show="showForgot" preset="card" :title="t.copy.forgotTitle" :style="{maxWidth: '380px', direction: t.dir}">
      <p style="margin-top:0">{{ t.copy.forgotBody }}</p>
      <n-input
          v-model:value="forgotEmail"
          type="email"
          placeholder="you@example.com"
          size="large"
          :disabled="loading"
          style="margin-bottom:16px"
      />
      <template #footer>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <n-button @click="showForgot = false">{{ t.copy.cancel }}</n-button>
          <n-button type="primary" :loading="loading" :disabled="!forgotEmail" @click="handleForgot">{{ t.copy.send }}</n-button>
        </div>
      </template>
    </n-modal>

    <footer v-if="false" class="landing-footer">
      <strong>RemindOCR</strong> — מערכת ניהול תסקירים ותזכורות לעסקים ישראלים
      <div class="landing-footer__legal">
        © 2026 HandCoded. כל הזכויות שמורות. |
        <a href="https://remindocr.com/terms">תנאי שימוש</a> |
        <a href="https://remindocr.com/privacy">מדיניות פרטיות</a> |
        <a href="https://remindocr.com/accessibility">נגישות</a> |
        <a href="https://remindocr.com/security">אבטחת מידע</a>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from "vue";
import {useRoute, useRouter} from "vue-router";
import {NAlert, NButton, NCheckbox, NForm, NFormItem, NIcon, NInput, NModal, NTabPane, NTabs, NTooltip} from "naive-ui";
import {MoonOutline, SunnyOutline} from "@vicons/ionicons5";
import {useAuthStore} from "../stores/auth.js";
import {useDashboardStore} from "../stores/dashboard.js";
import {useDocumentsStore} from "../stores/documents.js";
import {useContractsStore} from "../stores/contracts.js";
import {useClientsStore} from "../stores/clients.js";
import {useRemindersStore} from "../stores/reminders.js";
import {dashboardPath, localizedPath, marketingUrl, useLocaleStore} from "../stores/locale.js";
import {INTENT_KEY, parseIntent, readIntent} from "../shared/signupIntent";
import GoogleSignIn from "../components/GoogleSignIn.vue";
import {useDevModal} from "../composables/useDevModal.js";
import {trackConversion} from "../analytics.js";

const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

const authStore = useAuthStore();
const dashStore = useDashboardStore();
const docsStore = useDocumentsStore();
const contractsStore = useContractsStore();
const clientsStore = useClientsStore();
const remindersStore = useRemindersStore();
const localeStore = useLocaleStore();
const route = useRoute();
const router = useRouter();
const t = computed(() => {
  const english = localeStore.locale === "en";
  const loginish = route.path.endsWith("/login");
  return {
    copy: localeStore.messages,
    dir: localeStore.dir,
    otherHreflang: english ? "he" : "en",
    otherPath: english
      ? (loginish ? "/login" : "/")
      : (loginish ? "/en/login" : "/en"),
  };
});
const darkPref = ref(localStorage.getItem("theme") === "dark");
const isDark = computed(() => darkPref.value);
const logoSrc = computed(() => (isDark.value ? "/remindocr-logo-dark.png" : "/remindocr-logo-light.png"));

const activeTab = ref<"login" | "register">("login");
const loading = ref(false);
const successMsg = ref<string | null>(null);
const gisError = ref<string | null>(null);
const routeError = ref<string | null>(null);

// Login form
const loginEmail = ref("");
const loginPassword = ref("");

// Register form
const regName = ref("");
const regEmail = ref("");
const regPassword = ref("");
const regTermsAccepted = ref(false);

// Forgot password
const showForgot = ref(false);
useDevModal("login.forgotPassword", showForgot);
const forgotEmail = ref("");

const errorMsg = computed(() => {
  const copy = localeStore.messages;
  if (gisError.value) return copy.errors[gisError.value as keyof typeof copy.errors] ?? `${copy.unknownError}: ${gisError.value}`;
  if (routeError.value) return copy.errors[routeError.value as keyof typeof copy.errors] ?? `${copy.unknownError}: ${routeError.value}`;
  return null;
});

function switchLocale() {
  router.replace({path: t.value.otherPath, query: route.query});
}

function clearError() {
  gisError.value = null;
  routeError.value = null;
  router.replace({path: route.path});
}

function onGisError(msg: string) {
  gisError.value = msg;
}

function toggleTheme() {
  const next = isDark.value ? "light" : "dark";
  darkPref.value = next === "dark";
  localStorage.setItem("theme", next);
  document.documentElement.setAttribute("data-theme", next);
  window.dispatchEvent(new CustomEvent("remindocr:theme-change", {detail: next}));
}

async function handleLogin() {
  loading.value = true;
  gisError.value = null;
  routeError.value = null;
  successMsg.value = null;
  try {
    const res = await fetch(`${SERVER}/api/auth/login`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      credentials: "include",
      body: JSON.stringify({email: loginEmail.value, password: loginPassword.value, ...readIntent()}),
    });
    const data = await res.json() as any;
    if (!res.ok) {
      routeError.value = data.error ?? "auth_failed";
      return;
    }
    authStore.setUser(data.user);
    trackConversion("Login", {method: "email"});
    // if (data.user?.role === "admin") {
    //   router.replace("/admin");
    //   return;
    // }
    // Preload key stores in background so pages feel instant
    Promise.all([
      dashStore.fetch(),
      docsStore.fetch(),
      contractsStore.fetch({limit: 200}),
      clientsStore.fetch({limit: 200}),
      remindersStore.fetch(),
    ]).catch(() => {
    });
    const oneTimeReturn = readIntent().billing === "one_time";
    try {
      sessionStorage.removeItem(INTENT_KEY);
    } catch { /* Storage is optional. */
    }
    router.replace(oneTimeReturn
        ? {path: localizedPath("/profile"), query: {section: "subscription"}}
        : dashboardPath());
  } catch {
    routeError.value = "auth_failed";
  } finally {
    loading.value = false;
  }
}

async function handleRegister() {
  if (!regTermsAccepted.value) {
    routeError.value = "terms_required";
    return;
  }
  loading.value = true;
  gisError.value = null;
  routeError.value = null;
  successMsg.value = null;
  try {
    const res = await fetch(`${SERVER}/api/auth/register`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      credentials: "include",
      body: JSON.stringify({
        email: regEmail.value,
        password: regPassword.value,
        name: regName.value,
        ...readIntent(),
      }),
    });
    const data = await res.json() as any;
    if (!res.ok) {
      routeError.value = data.error ?? "auth_failed";
      return;
    }
    successMsg.value = data.emailSent === false
        ? localeStore.messages.registerOkNoEmail
        : localeStore.messages.registerOk;
    trackConversion("CompleteRegistration", {method: "email"});
    regEmail.value = "";
    regPassword.value = "";
    regName.value = "";
    regTermsAccepted.value = false;
    activeTab.value = "login";
  } catch {
    routeError.value = "auth_failed";
  } finally {
    loading.value = false;
  }
}

async function handleForgot() {
  loading.value = true;
  try {
    await fetch(`${SERVER}/api/auth/forgot-password`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({email: forgotEmail.value, locale: localeStore.locale}),
    });
    showForgot.value = false;
    successMsg.value = localeStore.messages.forgotOk;
    forgotEmail.value = "";
  } catch {
    // silently ignore
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  document.documentElement.setAttribute("data-theme", isDark.value ? "dark" : "light");

  const e = route.query.error as string | undefined;
  if (e) routeError.value = e;

  if (route.query.tab === "register") activeTab.value = "register";

  // Remember which plan the visitor came in for. Held in sessionStorage because
  // Google sign-in leaves the page entirely and returns without the query string.
  // It is attribution only — the server records it and never grants a plan from it.
  const intent = parseIntent(route.query.plan, route.query.billing, route.query.months);
  if (intent) {
    try {
      sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent));
    } catch { /* private mode: the intent is simply not carried */
    }
    activeTab.value = "register";
  }

  if (!authStore.initialized) await authStore.fetchMe();
  if (authStore.user) router.replace(intent?.billing === "one_time"
      ? {path: localizedPath("/profile"), query: {section: "subscription"}}
      : dashboardPath());
});
</script>

<style scoped>
@import "https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800&display=swap";

.login-page {
  --landing-nav-height: 64px;
  --login-font-family: "Rubik", "Lato", "Arial", "Helvetica Neue", sans-serif;
  --login-brand-tint: color-mix(in srgb, var(--brand-color) 12%, transparent);
  --login-brand-border: color-mix(in srgb, var(--brand-color) 22%, var(--border-color));
  min-height: 100vh;
  padding-top: var(--landing-nav-height);
  background: var(--bg-app);
  color: var(--text-primary);
  font-family: var(--login-font-family);
  line-height: 1.6;
  overflow-x: hidden;
  scroll-behavior: smooth;
}

.landing-nav {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 20;
  height: var(--landing-nav-height);
  padding: 0 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: color-mix(in srgb, var(--bg-card) 92%, transparent);
  border-bottom: 1px solid var(--border-color);
  backdrop-filter: blur(12px);
}

.nav-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text-primary);
  text-decoration: none;
}

.nav-brand__text {
  font-size: 17px;
  font-weight: 700;
}

.nav-brand__logo {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  object-fit: cover;
  box-shadow: 0 1px 8px rgba(15, 23, 42, 0.14);
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 8px;
}

.iconbtn {
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.iconbtn:hover {
  background: var(--login-brand-tint);
  border-color: var(--login-brand-border);
  color: var(--brand-color);
}

.nav-lang {
  padding: 8px 12px;
  border-radius: 8px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
}
.nav-lang:hover {
  background: var(--login-brand-tint);
  color: var(--brand-color);
}

.nav-links a {
  padding: 8px 16px;
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 14px;
  text-decoration: none;
  transition: background 0.15s, color 0.15s;
}

.nav-links a:hover {
  background: var(--login-brand-tint);
  color: var(--brand-color);
}

.register-terms {
  display: block;
  margin: 0 0 14px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.register-terms a {
  color: var(--brand-color);
  font-weight: 700;
  text-decoration: none;
}

.register-terms a:hover {
  text-decoration: underline;
}

.nav-links .nav-cta {
  padding: 10px 20px;
  background: var(--brand-color);
  color: var(--text-inverse);
  font-weight: 700;
}

.nav-links .nav-cta:hover {
  background: var(--brand-color-pressed);
  color: var(--text-inverse);
}


.hero {
  width: min(1300px, 100%);
  margin: 0 auto;
  padding: 84px 48px 76px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 420px;
  gap: 64px;
  align-items: center;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  background: var(--login-brand-tint);
  color: var(--brand-color);
  border: 1px solid var(--login-brand-border);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 20px;
}

.hero-kicker {
  margin: 0 0 8px;
  color: var(--brand-color);
  font-size: 15px;
  font-weight: 700;
}

.hero h1 {
  max-width: 640px;
  margin: 0 0 20px;
  color: var(--text-primary);
  font-size: clamp(32px, 4vw, 52px);
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: 0;
}

.hero h1 span {
  color: var(--brand-color);
}

.hero-desc {
  max-width: 620px;
  margin: 0 0 18px;
  color: var(--text-secondary);
  font-size: 18px;
  line-height: 1.7;
}

.hero-purpose {
  max-width: 620px;
  margin: 0 0 36px;
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--login-brand-border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 15px;
  line-height: 1.65;
}

.hero-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-primary,
.btn-secondary,
.btn-white {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 700;
  text-decoration: none;
  transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
}

.btn-primary {
  padding: 14px 28px;
  background: var(--brand-color);
  color: var(--text-inverse);
}

.btn-primary:hover {
  background: var(--brand-color-pressed);
  transform: translateY(-1px);
}

.btn-secondary {
  padding: 14px 28px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
}

.btn-secondary:hover {
  background: var(--bg-hover);
  transform: translateY(-1px);
}

.login-card {
  width: 100%;
  max-width: 420px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 36px 32px 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.08);
  scroll-margin-top: 86px;
}

.login-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
}

.login-brand__logo {
  width: 88px;
  height: 88px;
  border-radius: 20px;
  object-fit: contain;
  background: color-mix(in srgb, var(--bg-card) 88%, var(--brand-color));
  box-shadow: 0 8px 20px color-mix(in srgb, var(--text-primary) 10%, transparent);
}

.login-brand__title {
  font-size: 24px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
}

.login-brand__sub {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
  text-align: center;
}

.divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px 0;
  color: var(--text-secondary);
  font-size: 13px;
  width: 100%;
}

.divider::before,
.divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--border-color);
}

.login-footer {
  margin-top: 20px;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
}

.stats {
  background: var(--bg-card);
  border-top: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  padding: 48px;
}

.stats-inner {
  width: min(1100px, 100%);
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 32px;
  text-align: center;
}

.stat-num {
  margin-bottom: 6px;
  color: var(--brand-color);
  font-size: 42px;
  font-weight: 800;
  line-height: 1;
}

.stat-label {
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
}

.content-section {
  width: min(1100px, 100%);
  margin: 0 auto;
  padding: 80px 48px;
}

.section-header {
  text-align: center;
  margin-bottom: 56px;
}

.section-header h2 {
  margin: 0 0 12px;
  color: var(--text-primary);
  font-size: clamp(24px, 3vw, 36px);
  font-weight: 800;
  letter-spacing: 0;
}

.section-header p {
  max-width: 540px;
  margin: 0 auto;
  color: var(--text-secondary);
  font-size: 17px;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
}

.feature-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 28px;
  transition: box-shadow 0.2s, transform 0.2s;
}

.feature-card:hover {
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.07);
  transform: translateY(-2px);
}

.feature-card--accent {
  border-color: var(--login-brand-border);
  background: color-mix(in srgb, var(--brand-color) 7%, var(--bg-card));
}

.feature-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 16px;
  background: var(--login-brand-tint);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}

.feature-card h3 {
  margin: 0 0 8px;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 700;
}

.feature-card p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.how-section {
  background: var(--bg-card);
}

.plans-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  align-items: stretch;
}

/* Self-serve checkout is not live yet, so the yearly/monthly buttons are hidden
   rather than removed — unhide them and drop the WhatsApp block to switch over
   once Green Invoice payment links exist. */
.plan--soon .plan__ctas {
  display: none;
}

.plan__cta--wa {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #25d366;
  color: #fff;
}

.plan__cta--wa:hover {
  background: #1da851;
}

.plan__cta--wa svg {
  width: 18px;
  height: 18px;
  fill: currentColor;
  flex: none;
}

.plan__soon-note {
  margin: 10px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
}

.plan {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 32px 26px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
}

.plan--highlighted {
  border-color: var(--brand-color);
  box-shadow: 0 12px 32px rgb(0 0 0 / 8%);
}

.plan__badge {
  position: absolute;
  top: -12px;
  inset-inline-start: 26px;
  background: var(--brand-color);
  color: var(--text-inverse);
  font-size: 12px;
  font-weight: 700;
  padding: 4px 14px;
  border-radius: 999px;
}

.plan__name {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 6px;
  color: var(--text-primary);
}

.plan__blurb {
  color: var(--text-secondary);
  font-size: 14px;
  min-height: 44px;
  margin-bottom: 18px;
}

.plan__price {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}

.plan__price strong {
  font-size: 40px;
  font-weight: 800;
  line-height: 1;
  color: var(--text-primary);
}

.plan__price-old {
  color: var(--text-secondary);
  text-decoration: line-through;
  font-size: 17px;
  opacity: 0.75;
}

.plan__price-period {
  color: var(--text-secondary);
  font-size: 14px;
}

.plan__price-year {
  margin: 0 0 6px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
}

.plan__vat {
  margin: 0 0 18px;
  color: var(--text-secondary);
  font-size: 12px;
  opacity: 0.8;
}

.plan__additional {
  margin: 0 0 10px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
}

.plan__features {
  list-style: none;
  padding: 0;
  margin: 0 0 26px;
  flex: 1;
}

.plan__features li {
  position: relative;
  padding-right: 26px;
  margin-bottom: 10px;
  font-size: 14px;
  color: var(--text-secondary);
}

.plan__features li::before {
  content: "✓";
  position: absolute;
  right: 0;
  color: var(--brand-color);
  font-weight: 700;
}

/* One bordered control with two rows, so yearly and monthly read as a billing
   choice rather than as a live button next to a disabled one. */
.plan__ctas {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
}

.plan__ctas--accent {
  border-color: var(--brand-color);
}

.plan__ctas .plan__cta {
  border-radius: 0;
}

.plan__ctas .plan__cta + .plan__cta {
  border-top: 1px solid var(--border-color);
  font-size: 14px;
  font-weight: 600;
  padding: 11px 18px;
}

.plan__cta--solo {
  display: block;
  border: 1px solid var(--border-color);
}

.plan__cta-save {
  display: inline-block;
  margin-inline-start: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgb(255 255 255 / 22%);
  font-size: 11px;
  font-weight: 700;
  vertical-align: middle;
}

.plan__cta--ghost .plan__cta-save {
  background: color-mix(in srgb, var(--brand-color) 14%, transparent);
  color: var(--brand-color);
}

.plan__cta {
  display: block;
  text-align: center;
  padding: 12px 18px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.15s ease, transform 0.15s ease;
}

.plan__cta--primary {
  background: var(--brand-color);
  color: var(--text-inverse);
}

.plan__cta--primary:hover {
  background: var(--brand-color-pressed);
}

.plan__cta--ghost {
  background: var(--bg-card);
  color: var(--text-primary);
}

.plan__cta--ghost:hover {
  background: var(--bg-hover);
  color: var(--brand-color);
}

.plan__cta-note {
  display: block;
  font-size: 12px;
  font-weight: 500;
  opacity: 0.85;
  margin-top: 2px;
}

@media (max-width: 900px) {
  .plans-grid {
    grid-template-columns: 1fr;
  }
}

.steps {
  display: flex;
  align-items: flex-start;
  gap: 0;
}

.step {
  flex: 1;
  text-align: center;
  padding: 0 24px;
  position: relative;
}

.step:not(:last-child)::after {
  content: "";
  position: absolute;
  top: 24px;
  left: 0;
  width: 100%;
  height: 2px;
  background: var(--border-color);
}

.step__num {
  position: relative;
  z-index: 1;
  width: 48px;
  height: 48px;
  margin: 0 auto 16px;
  border-radius: 50%;
  background: var(--brand-color);
  color: var(--text-inverse);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
}

.step h3 {
  margin: 0 0 8px;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 700;
}

.step p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.cta-section {
  background: linear-gradient(135deg, var(--brand-color), var(--brand-color-pressed));
  padding: 80px 48px;
  text-align: center;
}

.cta-section h2 {
  margin: 0 0 28px;
  color: var(--text-inverse);
  font-size: clamp(24px, 3vw, 40px);
  font-weight: 800;
  letter-spacing: 0;
}

.btn-white {
  padding: 14px 32px;
  background: var(--bg-card);
  color: var(--brand-color-pressed);
}

.btn-white:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.landing-footer {
  background: var(--bg-elevated);
  color: var(--text-secondary);
  padding: 40px 48px;
  text-align: center;
  font-size: 14px;
}

.landing-footer strong {
  color: var(--text-primary);
}

.landing-footer__legal {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.landing-footer__legal a {
  color: var(--brand-color);
  text-decoration: none;
}

.landing-footer__legal a:hover {
  color: var(--brand-color-hover);
  text-decoration: underline;
}

:deep(.n-tabs) {
  width: 100%;
}

:deep(.n-button),
:deep(.n-input),
:deep(.n-input__input-el),
:deep(.n-form-item-label),
:deep(.n-tabs),
:deep(.n-alert),
:deep(.n-card),
:deep(.n-modal) {
  font-family: var(--login-font-family);
}

@media (max-width: 900px) {
  .landing-nav {
    height: auto;
    min-height: 58px;
    padding: 10px 16px;
    gap: 12px;
  }

  .nav-links a:not(.nav-cta):not(.nav-lang) {
    display: none;
  }

  .nav-links .nav-cta {
    padding: 9px 14px;
    font-size: 13px;
    white-space: nowrap;
  }

  .hero {
    grid-template-columns: 1fr;
    padding: 44px 20px 40px;
    gap: 32px;
    text-align: center;
  }

  .hero-content {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .hero-desc {
    font-size: 16px;
    margin-bottom: 28px;
  }

  .hero-actions {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
  }

  .btn-primary,
  .btn-secondary,
  .btn-white {
    width: 100%;
    max-width: 360px;
    margin-inline: auto;
  }

  .login-card {
    margin-inline: auto;
    max-width: 440px;
  }

  .stats {
    padding: 36px 20px;
  }

  .stats-inner {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px 16px;
  }

  .content-section {
    padding: 48px 20px;
  }

  .section-header {
    margin-bottom: 32px;
  }

  .features-grid {
    grid-template-columns: 1fr;
  }

  .steps {
    flex-direction: column;
    align-items: center;
    gap: 30px;
  }

  .step {
    width: 100%;
    max-width: 420px;
    padding: 0;
  }

  .step::after {
    display: none;
  }

  .cta-section {
    padding: 48px 20px;
  }
}

@media (max-width: 420px) {
  .landing-nav {
    display: grid;
    grid-template-columns: 1fr auto;
    padding-inline: 12px;
  }

  .nav-brand__text {
    font-size: 14px;
  }

  .nav-links .nav-cta {
    padding: 8px 10px;
    font-size: 12px;
  }

  .hero {
    padding: 36px 16px 34px;
  }

  .hero h1 {
    font-size: 30px;
  }

  .login-card {
    padding: 32px 22px 24px;
  }

  .stats-inner {
    grid-template-columns: 1fr;
  }

  .content-section {
    padding: 42px 16px;
  }
}
</style>
