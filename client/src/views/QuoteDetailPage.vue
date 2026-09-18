<template>
  <div class="quote-detail" :dir="dir">
    <nav class="quote-detail__tabs" :aria-label="l.chrome.workspaceAria"><router-link :to="href('/documents')">{{ l.chrome.nav.documents }}</router-link><router-link :to="href('/quotes')">{{ l.chrome.nav.quotes }}</router-link></nav>
    <div class="quote-detail__bar">
      <button class="btn btn--ghost" type="button" @click="router.push(href('/quotes'))"><n-icon :component="ArrowForwardOutline" :size="16"/>{{ l.quotes.backToQuotes }}</button>
      <div v-if="quote" class="quote-detail__actions">
        <router-link v-if="quote.status === 'draft' || quote.status === 'issued'" :to="href(`/quotes/${quote._id}/edit`)" class="btn btn--ghost"><n-icon :component="CreateOutline" :size="16"/>{{ l.common.edit }}</router-link>
        <a class="btn btn--ghost" :href="paymentService.pdf(quote._id, quote.updatedAt)" download><n-icon :component="DownloadOutline" :size="16"/>{{ l.quotes.downloadPdf }}</a>
        <button class="btn btn--ghost" :disabled="sending || !quote.customer.email" @click="send"><n-icon :component="PaperPlaneOutline" :size="16"/>{{ sending ? l.quotes.sending : l.quotes.sendEmail }}</button>
        <button class="btn btn--danger" :disabled="deleting" @click="confirmDelete"><n-icon :component="TrashOutline" :size="16"/>{{ l.common.delete }}</button>
      </div>
    </div>
    <n-spin :show="loading">
      <template v-if="quote">
        <header class="quote-detail__head"><div><span class="quote-detail__eyebrow">{{ l.quotes.eyebrow }}</span><h1>{{ quote.number || l.common.draft }}</h1><p>{{ quote.customer.name || l.common.unnamedClient }} · {{ l.quotes.inspection }} {{ quote.reportNumber || "—" }}</p></div><span class="quote-status" :class="`quote-status--${quote.status}`">{{ statusLabel(quote.status) }}</span></header>
        <div class="quote-detail__grid">
          <aside class="quote-detail__left">
            <section class="quote-preview"><div class="quote-preview__title"><h2>{{ l.quotes.previewTitle }}</h2><span>{{ l.quotes.previewHint }}</span></div><iframe v-if="quote.status === 'issued'" :src="paymentService.pdf(quote._id, quote.updatedAt)" :title="`${l.quotes.eyebrow} ${quote.number || ''}`"/><div v-else class="quote-preview__empty">{{ l.quotes.previewEmpty }}</div></section>
          </aside>
          <section class="quote-detail__right">
            <div class="quote-summary">
              <div><span>{{ l.quotes.validUntil }}</span><strong>{{ formatDate(quote.dueDate) }}</strong></div><div><span>{{ l.quotes.amount }}</span><strong>{{ formatMoney(quote.totalCents) }}</strong></div><div><span>{{ l.quotes.email }}</span><strong dir="ltr">{{ quote.customer.email || "—" }}</strong></div><div><span>{{ l.quotes.storage }}</span><strong>{{ storageLabel(quote) }}</strong></div>
            </div>
            <section v-if="quote.lines?.length" class="quote-lines"><h2>{{ l.quotes.lines }}</h2><table><thead><tr><th>{{ l.quotes.line }}</th><th>{{ l.quotes.description }}</th><th>{{ l.quotes.qty }}</th><th>{{ l.quotes.unitPrice }}</th><th>{{ l.quotes.total }}</th></tr></thead><tbody><tr v-for="(line,index) in quote.lines" :key="line.rateId || index"><td>{{ line.section || "—" }}</td><td>{{ line.label || "—" }}</td><td>{{ line.quantity || 0 }}</td><td>{{ formatMoney(line.unitCents || 0) }}</td><td>{{ formatMoney(line.totalCents ?? (line.unitCents || 0) * (line.quantity || 0)) }}</td></tr></tbody></table></section>
          </section>
        </div>
      </template>
      <div v-else-if="!loading" class="quote-error">{{ l.quotes.notFound }}</div>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import {onMounted, ref} from "vue"; import {useRoute, useRouter} from "vue-router"; import {NIcon,NSpin,useMessage} from "naive-ui"; import {ArrowForwardOutline,DownloadOutline,CreateOutline,PaperPlaneOutline,TrashOutline} from "@vicons/ionicons5";
import {paymentService,type PaymentRequest} from "../services/paymentService"; import {useConfirm} from "../composables/useConfirm";
import {useI18n} from "../composables/useI18n.js";
const route=useRoute(); const router=useRouter(); const message=useMessage(); const {confirm}=useConfirm(); const {l, href, dir}=useI18n(); const quote=ref<PaymentRequest|null>(null); const loading=ref(true); const sending=ref(false); const deleting=ref(false);
function formatDate(value:string){return value?value.split("-").reverse().join("/"):"—"} function formatMoney(cents:number){return new Intl.NumberFormat("he-IL",{style:"currency",currency:"ILS"}).format((cents||0)/100)} function statusLabel(status:string){return status==="issued"?"הופקה":status==="draft"?"טיוטה":status}
function storageLabel(row:PaymentRequest){const storage=row.storage;if(!storage)return "מקומי";return [storage.local==="saved"?"מקומי":null,storage.object==="saved"?"S3":null,storage.drive==="saved"?"Drive":null].filter(Boolean).join(" · ")||"ממתין"}
async function load(){loading.value=true;try{quote.value=await paymentService.get(String(route.params.id))}catch(error){message.error(error instanceof Error?error.message:"לא ניתן לטעון את ההצעה")}finally{loading.value=false}}
async function send(){if(!quote.value?.customer.email)return;sending.value=true;try{await paymentService.send(quote.value._id,quote.value.customer.email,crypto.randomUUID());message.success("הצעת המחיר נשלחה");await load()}catch(error){message.error(error instanceof Error?error.message:"שליחת ההצעה נכשלה")}finally{sending.value=false}}
function confirmDelete(){if(!quote.value)return;confirm({title:"מחיקת הצעת מחיר",content:`למחוק את הצעת המחיר "${quote.value.number||"טיוטה"}"? גם קובץ ה-PDF המקושר יימחק.`,confirmText:"מחק",onConfirm:async()=>{if(!quote.value)return;deleting.value=true;try{await paymentService.delete(quote.value._id);message.success("הצעת המחיר נמחקה");await router.push("/quotes")}catch(error){message.error(error instanceof Error?error.message:"מחיקת ההצעה נכשלה")}finally{deleting.value=false}}})}
onMounted(load);
</script>

<style scoped>
.quote-detail__tabs{display:flex;gap:8px;margin-bottom:18px;border-bottom:1px solid var(--border-color)}.quote-detail__tabs a{color:var(--text-secondary);padding:9px 14px;text-decoration:none}.quote-detail__bar,.quote-detail__actions,.quote-detail__head,.quote-preview__title{display:flex;align-items:center;justify-content:space-between;gap:10px}.quote-detail__bar{margin-bottom:18px}.quote-detail__actions{justify-content:flex-end;flex-wrap:wrap}.quote-detail__actions a{text-decoration:none}.quote-detail__head,.quote-summary,.quote-lines,.quote-preview{background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px}.quote-detail__head{padding:20px;margin-bottom:14px}.quote-detail__eyebrow{color:var(--brand-color);font-weight:700}.quote-detail h1{margin:4px 0;color:var(--text-primary)}.quote-detail p{margin:0;color:var(--text-secondary)}.quote-status{padding:5px 11px;border-radius:999px;background:#fff3d8;color:#8a6100}.quote-status--issued{background:#e4f6eb;color:#167344}.quote-detail__grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:20px;align-items:start}.quote-detail__left{position:sticky;top:16px;display:flex;flex-direction:column;gap:16px;min-width:0}.quote-detail__right{display:flex;flex-direction:column;gap:14px;min-width:0}.quote-summary{display:grid;grid-template-columns:repeat(2,1fr);margin-bottom:0}.quote-summary div{padding:16px;border-inline-start:1px solid var(--border-color)}.quote-summary div:first-child{border-inline-start:0}.quote-summary span{display:block;color:var(--text-muted);font-size:12px}.quote-summary strong{display:block;margin-top:5px;color:var(--text-primary)}.quote-lines{padding:18px;margin-bottom:0;overflow:auto}.quote-lines h2,.quote-preview h2{margin:0 0 12px}.quote-lines table{width:100%;border-collapse:collapse}.quote-lines th,.quote-lines td{padding:10px;border-bottom:1px solid var(--border-color);text-align:right}.quote-preview{padding:18px}.quote-preview__title span{color:var(--text-secondary)}.quote-preview iframe{width:100%;height:760px;border:1px solid var(--border-color);border-radius:10px;background:white}.quote-preview__empty,.quote-error{padding:50px;text-align:center;color:var(--text-secondary)}@media(max-width:1024px){.quote-detail__grid{grid-template-columns:1fr}.quote-detail__left{position:static}}@media(max-width:760px){.quote-detail__bar,.quote-detail__head{align-items:flex-start;flex-direction:column}.quote-summary{grid-template-columns:repeat(2,1fr)}.quote-preview iframe{height:600px}}
</style>
