<template>
  <div class="quotes-page" dir="rtl">
    <nav class="quotes-tabs" aria-label="אזור מסמכים"><router-link to="/documents">מסמכים</router-link><router-link to="/contracts">תסקירים</router-link><router-link class="quotes-tabs__active" to="/quotes">הצעות מחיר</router-link></nav>
    <header class="quotes-head">
      <div>
        <h1>הצעות מחיר</h1>
        <p>הצעות מחיר שנוצרו מתסקירים. מסמכים אלה נשמרים בנפרד מארכיון המסמכים.</p>
      </div>
      <button class="btn btn--ghost" :disabled="loading" @click="load">
        רענן
      </button>
    </header>

    <n-spin :show="loading">
      <div v-if="rows.length" class="quotes-list">
        <article v-for="quote in rows" :key="quote._id" class="quote-card">
          <div class="quote-card__main">
            <div>
              <strong class="quote-number">{{ quote.number || 'טיוטה' }}</strong>
              <p>{{ quote.customer.name || 'לקוח ללא שם' }} · {{ quote.reportType }}</p>
            </div>
            <span class="quote-status" :class="`quote-status--${quote.status}`">{{ statusLabel(quote.status) }}</span>
          </div>
          <dl class="quote-meta">
            <div><dt>תסקיר</dt><dd>{{ quote.reportNumber || '—' }}</dd></div>
            <div><dt>בתוקף עד</dt><dd>{{ formatDate(quote.dueDate) }}</dd></div>
            <div><dt>סכום</dt><dd>{{ formatMoney(quote.totalCents) }}</dd></div>
            <div><dt>שמירה</dt><dd>{{ storageLabel(quote) }}</dd></div>
          </dl>
          <div class="quote-actions">
            <a v-if="quote.status === 'issued'" class="btn btn--primary" :href="paymentService.pdf(quote._id)" target="_blank" rel="noopener">פתח PDF</a>
            <button v-if="quote.status === 'issued'" class="btn btn--ghost" :disabled="sending === quote._id || !quote.customer.email" @click="send(quote)">
              {{ sending === quote._id ? 'שולח…' : 'שלח במייל' }}
            </button>
            <span v-if="quote.status === 'issued' && !quote.customer.email" class="quote-note">חסר אימייל ללקוח</span>
          </div>
        </article>
      </div>
      <div v-else class="quotes-empty">אין הצעות מחיר עדיין. אפשר ליצור הצעת מחיר בשלב האחרון של תסקיר חדש.</div>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import {onMounted, ref} from "vue";
import {NSpin, useMessage} from "naive-ui";
import {paymentService, type PaymentRequest} from "../services/paymentService";

const message = useMessage();
const rows = ref<PaymentRequest[]>([]);
const loading = ref(false);
const sending = ref<string | null>(null);

function formatDate(value: string) { return value ? value.split("-").reverse().join("/") : "—"; }
function formatMoney(cents: number) { return new Intl.NumberFormat("he-IL", {style: "currency", currency: "ILS"}).format((cents || 0) / 100); }
function statusLabel(status: string) { return status === "issued" ? "הופקה" : status === "draft" ? "טיוטה" : status; }
function storageLabel(quote: PaymentRequest) {
  const storage = quote.storage;
  if (!storage) return "נשמר מקומית";
  return [storage.local === "saved" ? "מקומי" : null, storage.object === "saved" ? "S3" : null, storage.drive === "saved" ? "Drive" : null].filter(Boolean).join(" · ") || "ממתין";
}
async function load() {
  loading.value = true;
  try { rows.value = (await paymentService.list()).rows.filter((row) => row.documentKind === "quote"); }
  catch (error) { message.error(error instanceof Error ? error.message : "לא ניתן לטעון הצעות מחיר"); }
  finally { loading.value = false; }
}
async function send(quote: PaymentRequest) {
  if (!quote.customer.email) return;
  sending.value = quote._id;
  try { await paymentService.send(quote._id, quote.customer.email, crypto.randomUUID()); message.success("הצעת המחיר נשלחה"); await load(); }
  catch (error) { message.error(error instanceof Error ? error.message : "שליחת ההצעה נכשלה"); }
  finally { sending.value = null; }
}
onMounted(load);
</script>

<style scoped>
.quotes-tabs{display:flex;gap:8px;margin:0 0 22px;border-bottom:1px solid var(--border-color)}.quotes-tabs a{color:var(--text-secondary);padding:9px 14px;text-decoration:none;border-bottom:2px solid transparent}.quotes-tabs a:hover,.quotes-tabs__active{color:var(--brand-color);border-bottom-color:var(--brand-color);font-weight:600}.quotes-head{display:flex;justify-content:space-between;gap:18px;align-items:start;margin-bottom:24px}.quotes-head h1{margin:0;color:var(--text-primary);font-size:26px}.quotes-head p{margin:7px 0 0;color:var(--text-secondary)}.quotes-list{display:grid;gap:14px}.quote-card{background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:20px}.quote-card__main{display:flex;justify-content:space-between;gap:12px;align-items:start}.quote-number{font-size:18px;color:var(--text-primary)}.quote-card p{margin:6px 0 0;color:var(--text-secondary)}.quote-status{padding:4px 10px;border-radius:999px;background:#fff3d8;color:#8a6100;font-size:13px}.quote-status--issued{background:#e4f6eb;color:#167344}.quote-meta{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:18px 0}.quote-meta div{border-inline-start:1px solid var(--border-color);padding-inline-start:12px}.quote-meta dt{font-size:12px;color:var(--text-muted)}.quote-meta dd{margin:4px 0 0;color:var(--text-primary);font-weight:600}.quote-actions{display:flex;align-items:center;gap:8px}.quote-note{color:#b27a02;font-size:13px}.quotes-empty{padding:40px;text-align:center;background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;color:var(--text-secondary)}@media(max-width:700px){.quotes-page{padding:18px}.quote-meta{grid-template-columns:repeat(2,1fr)}}
</style>
