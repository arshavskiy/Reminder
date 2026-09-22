<template>
  <div class="quotes-page" :dir="dir">
    <header class="quotes-head">
      <div><h1 class="page-header__title">{{ l.quotes.title }}</h1>
        <p>{{ l.quotes.subtitle }}</p></div>
      <div class="quotes-actions">
        <router-link :to="href('/quotes/new')" class="btn btn--primary"><n-icon :component="AddOutline" :size="16"/>{{ l.quotes.newQuote }}</router-link>
        <button class="btn btn--ghost" :disabled="loading" @click="load"><n-icon :component="RefreshOutline" :size="16"/>{{ l.common.refresh }}</button>
      </div>
    </header>
    <n-spin :show="loading">
      <div v-if="rows.length" class="quotes-table-wrap">
        <table class="quotes-table">
          <thead><tr><th>{{ l.quotes.number }}</th><th>{{ l.quotes.client }}</th><th>{{ l.quotes.inspection }}</th><th>{{ l.quotes.validUntil }}</th><th>{{ l.quotes.amount }}</th><th>{{ l.quotes.status }}</th><th>{{ l.quotes.storage }}</th><th class="actions-title">{{ l.common.actions }}</th></tr></thead>
          <tbody>
            <tr v-for="quote in rows" :key="quote._id" class="quote-row" @click="openQuote(quote)">
              <td><router-link class="quote-link" :to="href(`/quotes/${quote._id}`)" @click.stop>{{ quote.number || l.common.draft }}</router-link></td>
              <td>{{ quote.customer.name || l.common.unnamedClient }}</td><td>{{ quote.reportNumber || "—" }}</td><td>{{ formatDate(quote.dueDate) }}</td>
              <td class="quote-amount">{{ formatMoney(quote.totalCents) }}</td><td><span class="quote-status" :class="`quote-status--${quote.status}`">{{ statusLabel(quote.status) }}</span></td><td>{{ storageLabel(quote) }}</td>
              <td class="quote-actions" @click.stop>
                <n-dropdown :options="rowActionsFor(quote)" placement="bottom-end" trigger="click" @select="(key: string) => handleRowAction(key, quote)">
                  <button class="btn btn--ghost btn--xs icon-btn" type="button" :aria-label="l.common.actions"><n-icon :component="EllipsisVerticalOutline" :size="16"/></button>
                </n-dropdown>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="quotes-empty">{{ l.quotes.empty }}</div>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import {h, onMounted, ref, type Component} from "vue";
import {useRouter} from "vue-router";
import {NDropdown, NIcon, NSpin, useMessage} from "naive-ui";
import {AddOutline, DownloadOutline, EllipsisVerticalOutline, EyeOutline, PaperPlaneOutline, RefreshOutline, TrashOutline} from "@vicons/ionicons5";
import {paymentService, type PaymentRequest} from "../services/paymentService";
import {useConfirm} from "../composables/useConfirm";
import {useI18n} from "../composables/useI18n.js";

const router = useRouter(); const message = useMessage(); const {confirm} = useConfirm();
const {l, href, dir} = useI18n();
const rows = ref<PaymentRequest[]>([]); const loading = ref(false); const sending = ref<string | null>(null); const deleting = ref<string | null>(null);
function formatDate(value: string) { return value ? value.split("-").reverse().join("/") : "—"; }
function formatMoney(cents: number) { return new Intl.NumberFormat("he-IL", {style: "currency", currency: "ILS"}).format((cents || 0) / 100); }
function statusLabel(status: string) { return status === "issued" ? l.value.quotes.issued : status === "draft" ? l.value.common.draft : status; }
function storageLabel(quote: PaymentRequest) { const storage = quote.storage; if (!storage) return l.value.quotes.local; return [storage.local === "saved" ? l.value.quotes.local : null, storage.object === "saved" ? "S3" : null, storage.drive === "saved" ? "Drive" : null].filter(Boolean).join(" · ") || l.value.quotes.waiting; }
function openQuote(quote: PaymentRequest) { void router.push(href(`/quotes/${quote._id}`)); }
async function load() { loading.value = true; try { rows.value = (await paymentService.list()).rows.filter((row) => row.documentKind === "quote"); } catch (error) { message.error(error instanceof Error ? error.message : "לא ניתן לטעון הצעות מחיר"); } finally { loading.value = false; } }
async function send(quote: PaymentRequest) { if (!quote.customer.email) return; sending.value = quote._id; try { await paymentService.send(quote._id, quote.customer.email, crypto.randomUUID()); message.success("הצעת המחיר נשלחה"); await load(); } catch (error) { message.error(error instanceof Error ? error.message : "שליחת ההצעה נכשלה"); } finally { sending.value = null; } }
function confirmDelete(quote: PaymentRequest) { confirm({title: "מחיקת הצעת מחיר", content: `למחוק את הצעת המחיר "${quote.number || "טיוטה"}"? גם קובץ ה-PDF המקושר יימחק.`, confirmText: "מחק", onConfirm: async () => { deleting.value = quote._id; try { await paymentService.delete(quote._id); message.success("הצעת המחיר נמחקה"); await load(); } catch (error) { message.error(error instanceof Error ? error.message : "מחיקת ההצעה נכשלה"); } finally { deleting.value = null; } }}); }
function downloadQuotePdf(quote: PaymentRequest) {
  const a = document.createElement("a");
  a.href = paymentService.pdf(quote._id);
  a.download = "";
  a.click();
}
function renderActionIcon(icon: Component) { return () => h(NIcon, {component: icon}); }
function rowActionsFor(quote: PaymentRequest) {
  const c = l.value;
  const actions: Array<Record<string, unknown>> = [
    {label: c.quotes.viewQuote, key: "view", icon: renderActionIcon(EyeOutline)},
  ];
  if (quote.status === "issued") {
    actions.push({label: c.quotes.downloadPdf, key: "download", icon: renderActionIcon(DownloadOutline)});
    actions.push({
      label: quote.customer.email ? c.quotes.sendEmail : c.quotes.missingClientEmail,
      key: "send",
      icon: renderActionIcon(PaperPlaneOutline),
      disabled: sending.value === quote._id || !quote.customer.email,
    });
  }
  actions.push({type: "divider", key: "d1"});
  actions.push({
    label: c.quotes.deleteQuote,
    key: "delete",
    icon: renderActionIcon(TrashOutline),
    disabled: deleting.value === quote._id,
    props: {style: "color: var(--color-error, #d03050)"},
  });
  return actions;
}
function handleRowAction(key: string, quote: PaymentRequest) {
  if (key === "view") { openQuote(quote); return; }
  if (key === "download") { downloadQuotePdf(quote); return; }
  if (key === "send") { void send(quote); return; }
  if (key === "delete") { confirmDelete(quote); return; }
}
onMounted(load);
</script>

<style scoped>
.quotes-head{display:flex;justify-content:space-between;gap:18px;align-items:start;margin-bottom:24px}.quotes-head h1{margin:0;color:var(--text-primary);font-size:26px}.quotes-head p{margin:7px 0 0;color:var(--text-secondary)}
.quotes-actions{display:flex;gap:10px;align-items:center}
.quotes-actions a{text-decoration:none}.quotes-table-wrap{overflow:auto;background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px}.quotes-table{width:100%;border-collapse:collapse;min-width:980px}.quotes-table th,.quotes-table td{padding:14px 16px;text-align:start;border-bottom:1px solid var(--border-color);color:var(--text-primary)}.quotes-table th{background:var(--bg-muted);color:var(--text-secondary);font-size:13px;font-weight:600}.quotes-table tbody tr:last-child td{border-bottom:0}.quote-row{cursor:pointer;transition:background .15s ease}.quote-row:hover{background:var(--bg-hover)}.quote-link{color:var(--brand-color);font-weight:700;text-decoration:none}.quote-amount{font-weight:700;white-space:nowrap}.quote-status{display:inline-flex;padding:4px 10px;border-radius:999px;background:#fff3d8;color:#8a6100;font-size:13px}.quote-status--issued{background:#e4f6eb;color:#167344}.actions-title{text-align:center!important}.quote-actions{display:flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}.quote-actions a{text-decoration:none}.quote-delete{color:#d03050;border-color:rgba(208,48,80,.35)}.quotes-empty{padding:40px;text-align:center;background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;color:var(--text-secondary)}@media(max-width:700px){.quotes-page{padding:18px}.quotes-head{align-items:center}.quotes-head p{font-size:14px}}
</style>
