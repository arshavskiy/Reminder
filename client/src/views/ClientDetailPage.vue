<template>
  <div class="client-detail" dir="rtl">
    <n-spin :show="store.loading && !store.active">
      <template v-if="store.active">
        <PageHeader :title="store.active.display_name" :subtitle="headerSubtitle">
          <template #breadcrumb>
            <router-link to="/clients">{{ l.clientDetail.clients }}</router-link>
            <span class="sep">/</span>
            <span>{{ store.active.display_name }}</span>
          </template>
          <template #actions>
            <button class="btn btn--ghost" type="button" @click="router.push('/clients')">
              <n-icon :component="ArrowForwardOutline" class="btn-icon" />
              {{ l.clientDetail.back }}
            </button>
            <n-tooltip v-if="canCreateInspection" :disabled="writesAllowed">
              <template #trigger>
                <span class="locked-action" @click="!writesAllowed && goToSubscription()">
                  <button :disabled="!writesAllowed" class="btn btn--primary" type="button" @click="openReport">
                    <n-icon :component="DocumentTextOutline" class="btn-icon"/>
                    {{ l.clientDetail.newInspection }}
                  </button>
                </span>
              </template>
              {{ l.clientDetail.upgrade }}
            </n-tooltip>
            <button class="btn btn--primary" type="button" @click="openEdit">
              <n-icon :component="CreateOutline" class="btn-icon" />
              {{ l.clientDetail.edit }}
            </button>
          </template>
        </PageHeader>

        <section class="identity-card">
          <div
            class="identity-card__avatar"
            :class="store.active.entity_type === 'company' ? 'identity-card__avatar--company' : 'identity-card__avatar--person'"
          >
            <n-icon
              :component="store.active.entity_type === 'company' ? BusinessOutline : PersonOutline"
              :size="28"
            />
          </div>
          <div class="identity-card__body">
            <div class="identity-card__chips">
              <span class="type-chip">{{ entityLabel(store.active.entity_type) }}</span>
              <span v-if="store.active.id_number" class="meta-chip ltr">{{ store.active.id_number }}</span>
            </div>
            <div v-if="contactChips.length" class="contact-chips">
              <a
                v-for="chip in contactChips"
                :key="chip.key"
                class="contact-chip"
                :href="chip.href"
                :class="{ 'contact-chip--plain': !chip.href }"
              >
                <n-icon :component="chip.icon" :size="14" />
                <span :class="{ ltr: chip.ltr }">{{ chip.label }}</span>
              </a>
            </div>
          </div>
        </section>

        <div class="stat-row">
          <component
            :is="stat.tab ? 'button' : 'div'"
            v-for="stat in clientStats"
            :key="stat.key"
            class="stat"
            :class="{ 'stat--active': stat.tab && activeTab === stat.tab, 'stat--static': !stat.tab }"
            :type="stat.tab ? 'button' : undefined"
            @click="onStatClick(stat)"
          >
            <n-icon :component="stat.icon" :size="18" class="stat__icon" />
            <span class="stat__num" :class="stat.accent ? 'stat__num--accent' : undefined">{{ stat.value }}</span>
            <span class="stat__label">{{ stat.label }}</span>
          </component>
        </div>

        <section class="details-card">
          <div class="details-card__head">
            <h2>{{ l.clientDetail.details }}</h2>
            <button class="btn btn--ghost btn--xs" type="button" @click="openEdit">
              <n-icon :component="CreateOutline" :size="14" class="btn-icon" />
              {{ l.clientDetail.edit }}
            </button>
          </div>
          <dl class="details-grid">
            <div v-for="detail in clientDetails" :key="detail.key" class="details-item">
              <dt>{{ detail.label }}</dt>
              <dd :class="{ muted: detail.empty, ltr: detail.ltr }" :title="detail.value">
                <a v-if="detail.href && !detail.empty" :href="detail.href">{{ detail.value }}</a>
                <template v-else>{{ detail.value }}</template>
              </dd>
            </div>
          </dl>
          <div v-if="clientTags.length" class="details-tags">
            <span v-for="tag in clientTags" :key="tag" class="tag tag--neutral">{{ tag }}</span>
          </div>
          <p v-if="clientNotes" class="details-notes">{{ clientNotes }}</p>
        </section>

        <div class="sectiontabs" role="tablist" :aria-label="l.clientDetail.details">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="sectionpill"
            :class="{ 'sectionpill--active': activeTab === tab.key }"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.key"
            @click="activeTab = tab.key"
          >
            <n-icon :component="tab.icon" :size="14" />
            {{ tab.label }}
            <span class="sectionpill__count">{{ tab.count }}</span>
          </button>
        </div>

        <section v-if="activeTab === 'docs'" class="tab-panel">
          <div v-if="store.activeDocuments.length" class="table-wrap">
            <table class="detail-table">
              <colgroup>
                <col class="col-file" />
                <col class="col-type" />
                <col class="col-status" />
                <col class="col-date" />
                <col class="col-date" />
                <col class="col-date" />
                <col class="col-open" />
              </colgroup>
              <thead>
                <tr>
                  <th>{{ l.clientDetail.colDocument }}</th>
                  <th class="hide-sm">{{ l.clientDetail.colType }}</th>
                  <th>{{ l.clientDetail.colStatus }}</th>
                  <th class="hide-sm">{{ l.clientDetail.colInspectionDate }}</th>
                  <th class="hide-sm">{{ l.clientDetail.colValidUntil }}</th>
                  <th class="hide-sm">{{ l.clientDetail.colImported }}</th>
                  <th>{{ l.clientDetail2.actions }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="doc in store.activeDocuments"
                  :key="doc.id"
                  class="detail-table__row"
                  tabindex="0"
                  @click="router.push(`/documents/${doc.id}`)"
                  @keydown.enter.prevent="router.push(`/documents/${doc.id}`)"
                  @keydown.space.prevent="router.push(`/documents/${doc.id}`)"
                >
                  <td>
                    <div class="file-cell">
                      <n-icon :component="DocumentTextOutline" :size="16" />
                      <span class="cell-truncate" :title="doc.file_name">{{ doc.file_name }}</span>
                    </div>
                  </td>
                  <td class="hide-sm"><span :class="doc.document_type ? '' : 'muted'">{{ doc.document_type || "—" }}</span></td>
                  <td><StatusBadge :status="doc.processing_status" /></td>
                  <td class="hide-sm">{{ formatDate(doc.inspection_date) }}</td>
                  <td class="hide-sm">{{ formatDate(doc.expiry_date) }}</td>
                  <td class="hide-sm">{{ formatDate(doc.import_date) }}</td>
                  <td class="col-open" @click.stop>
                    <n-tooltip placement="top">
                      <template #trigger>
                        <button
                          class="btn btn--ghost btn--xs icon-btn"
                          type="button"
                          @click="router.push(`/documents/${doc.id}`)"
                        >
                          <n-icon :component="OpenOutline" :size="14" class="btn-icon" />
                        </button>
                      </template>
                      {{ l.clientDetail.openDocument }}
                    </n-tooltip>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="panel-empty">
            <n-icon :component="DocumentTextOutline" :size="36" />
            <h3>{{ l.clientDetail.noDocs }}</h3>
            <p>{{ l.clientDetail.noDocsHint }}</p>
          </div>
        </section>

        <section v-else-if="activeTab === 'equipment'" class="tab-panel">
          <div class="tab-panel__head">
            <span class="tab-panel__head-spacer"></span>
            <button class="btn btn--primary" type="button" @click="openEquipmentAdd">
              <n-icon :component="AddOutline" class="btn-icon" />
              {{ l.clientDetail.addEquipment }}
            </button>
          </div>
          <n-spin :show="loadingEquipment">
            <div v-if="equipment.length" class="table-wrap">
              <table class="detail-table">
                <colgroup>
                  <col class="col-name" />
                  <col class="col-cat" />
                  <col class="col-meta" />
                  <col class="col-meta" />
                  <col class="col-meta" />
                  <col class="col-meta" />
                  <col class="col-source" />
                  <col class="col-open" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{{ l.clientDetail.colName }}</th>
                    <th class="hide-sm">{{ l.clientDetail.colCategory }}</th>
                    <th class="hide-sm">{{ l.clientDetail.colManufacturer }}</th>
                    <th class="hide-sm">{{ l.clientDetail.colModel }}</th>
                    <th class="hide-sm">{{ l.clientDetail.colSerial }}</th>
                    <th class="hide-sm">{{ l.clientDetail.colLoad }}</th>
                    <th>{{ l.clientDetail.colSourceDoc }}</th>
                    <th>{{ l.clientDetail2.actions }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in equipment"
                    :key="row.id"
                    class="detail-table__row"
                    tabindex="0"
                    @click="router.push(`/field?equipment=${row.id}`)"
                    @keydown.enter.prevent="router.push(`/field?equipment=${row.id}`)"
                    @keydown.space.prevent="router.push(`/field?equipment=${row.id}`)"
                  >
                    <td><span class="cell-truncate" :title="row.name">{{ row.name }}</span></td>
                    <td class="hide-sm">{{ categoryLabel(row.category) }}</td>
                    <td class="hide-sm"><span :class="row.manufacturer ? '' : 'muted'">{{ row.manufacturer || "—" }}</span></td>
                    <td class="hide-sm"><span :class="row.model ? '' : 'muted'">{{ row.model || "—" }}</span></td>
                    <td class="hide-sm">
                      <span class="ltr" :class="row.serial_number ? '' : 'muted'">{{ row.serial_number || "—" }}</span>
                    </td>
                    <td class="hide-sm"><span :class="row.capacity ? '' : 'muted'">{{ row.capacity || "—" }}</span></td>
                    <td @click.stop>
                      <button
                        v-if="row.document_id"
                        class="source-link"
                        type="button"
                        @click="router.push(`/documents/${row.document_id}`)"
                      >
                        {{ row.document_name || l.clientDetail.colSourceDoc }}
                      </button>
                      <span v-else class="muted">—</span>
                    </td>
                    <td class="col-open" @click.stop>
                      <n-tooltip placement="top">
                        <template #trigger>
                          <button
                            class="btn btn--ghost btn--xs icon-btn"
                            type="button"
                            @click="router.push(`/field?equipment=${row.id}`)"
                          >
                            <n-icon :component="OpenOutline" :size="14" class="btn-icon" />
                          </button>
                        </template>
                        {{ l.clientDetail.openInspection }}
                      </n-tooltip>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else-if="!loadingEquipment" class="panel-empty">
              <n-icon :component="ConstructOutline" :size="36" />
              <h3>{{ l.clientDetail.noEquipment }}</h3>
              <p>{{ l.clientDetail.noEquipmentHint }}</p>
            </div>
          </n-spin>

          <EquipmentQuickAddModal
            v-model:show="showEquipmentAdd"
            :client-id="String(route.params.id)"
            @created="onEquipmentCreated"
          />
        </section>

        <section v-else class="tab-panel">
          <ol v-if="store.activeTimeline.length" class="timeline">
            <li v-for="event in store.activeTimeline" :key="event.id" class="timeline-item">
              <span class="timeline-item__icon" :class="`timeline-item__icon--${eventTone(event.event_type)}`">
                <n-icon :component="eventIcon(event.event_type)" :size="16" />
              </span>
              <div class="timeline-item__body">
                <strong>{{ event.title }}</strong>
                <p v-if="event.description">{{ event.description }}</p>
              </div>
              <time class="timeline-item__time">{{ formatDate(event.event_date) }}</time>
            </li>
          </ol>
          <div v-else class="panel-empty">
            <n-icon :component="TimeOutline" :size="36" />
            <h3>{{ l.clientDetail.noEvents }}</h3>
            <p>{{ l.clientDetail.noEventsHint }}</p>
          </div>
        </section>
      </template>

      <div v-else-if="!store.loading" class="panel-empty panel-empty--page">
        <n-icon :component="PeopleOutline" :size="40" />
        <h3>{{ l.clientDetail.notFound }}</h3>
        <p>{{ l.clientDetail.notFoundHint }}</p>
        <button class="btn btn--primary" type="button" @click="router.push('/clients')">{{ l.clientDetail.backToClients }}</button>
      </div>
    </n-spin>

    <n-modal
      v-model:show="showEdit"
      :title="l.clientDetail.editTitle"
      :show-icon="false"
      preset="dialog"
      class="client-form-modal"
      style="width: min(560px, 94vw)"
      :mask-closable="!saving"
    >
      <n-form v-if="editForm" label-placement="top" class="client-form">
        <n-form-item :label="l.clientDetail.fullName" required>
          <n-input v-model:value="editForm.display_name" :placeholder="l.clientDetail.fullNamePlaceholder" />
        </n-form-item>
        <n-form-item :label="l.clientDetail.colType">
          <n-radio-group v-model:value="editForm.entity_type">
            <n-radio-button value="person">{{ l.clientDetail.person }}</n-radio-button>
            <n-radio-button value="company">{{ l.clientDetail.company }}</n-radio-button>
          </n-radio-group>
        </n-form-item>
        <div class="client-form__grid">
          <n-form-item :label="l.clientDetail.contactPerson">
            <n-input v-model:value="editForm.contact_person" :placeholder="l.clientDetail.contactPersonPlaceholder" />
          </n-form-item>
          <n-form-item :label="l.clientDetail.idNumber">
            <n-input v-model:value="editForm.id_number" dir="ltr" />
          </n-form-item>
          <n-form-item :label="l.clientDetail.email">
            <n-input v-model:value="editForm.email" class="email-ltr" dir="ltr" placeholder="israel@example.com" />
          </n-form-item>
          <n-form-item :label="l.clientDetail.phone">
            <n-input v-model:value="editForm.phone" placeholder="02-0000000" />
          </n-form-item>
          <n-form-item :label="l.clientDetail.mobile">
            <n-input v-model:value="editForm.mobile" placeholder="050-0000000" />
          </n-form-item>
        </div>
        <n-form-item :label="l.clientDetail.notes">
          <n-input v-model:value="editForm.notes" type="textarea" :rows="3" />
        </n-form-item>
      </n-form>
      <template #action>
        <n-button :disabled="saving" @click="closeEdit">{{ l.clientDetail.cancel }}</n-button>
        <n-button type="primary" :loading="saving" @click="doSave">{{ l.clientDetail.saveChanges }}</n-button>
      </template>
    </n-modal>

    <HydraulicCheckModal ref="hydraulicModalRef" v-model:show="showHydraulicModal" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type Component } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  NButton,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NModal,
  NRadioButton,
  NRadioGroup,
  NSpin,
  NTooltip,
  useMessage,
} from "naive-ui";
import {
  AddOutline,
  ArrowForwardOutline,
  BriefcaseOutline,
  BusinessOutline,
  CallOutline,
  ConstructOutline,
  CreateOutline,
  DocumentTextOutline,
  MailOutline,
  NotificationsOutline,
  OpenOutline,
  PeopleOutline,
  PersonOutline,
  PhonePortraitOutline,
  TimeOutline,
} from "@vicons/ionicons5";
import { useClientsStore } from "../stores/clients.js";
import { api } from "../services/apiService.js";
import StatusBadge from "../components/StatusBadge.vue";
import PageHeader from "../components/PageHeader.vue";
import EquipmentQuickAddModal from "../components/EquipmentQuickAddModal.vue";
import HydraulicCheckModal from "../components/contracts/HydraulicCheckModal.vue";
import {useAuthStore} from "../stores/auth.js";
import {resolveUserPlan} from "../shared/pricingPlans.js";
import {useI18n} from "../composables/useI18n.js";
import {useDevModal} from "../composables/useDevModal.js";
import type { Equipment, EventType } from "@shared/types.js";

type TabKey = "docs" | "equipment" | "timeline";

type ClientDetailItem = {
  key: string;
  label: string;
  value: string;
  empty?: boolean;
  ltr?: boolean;
  href?: string;
};

type ContactChip = {
  key: string;
  label: string;
  icon: Component;
  href?: string;
  ltr?: boolean;
};

type EditForm = {
  display_name: string;
  entity_type: "person" | "company";
  contact_person: string;
  id_number: string;
  email: string;
  phone: string;
  mobile: string;
  notes: string;
};

const CATEGORY_LABELS = computed<Record<string, string>>(() => ({
  lift: l.value.clientDetail.catLift,
  accessory: l.value.clientDetail.catAccessory,
  scaffold: l.value.clientDetail.catScaffold,
  ladder: l.value.clientDetail.catLadder,
  balloon: l.value.clientDetail.catBalloon,
  intake: l.value.clientDetail.catIntake,
  extractor: l.value.clientDetail.catExtractor,
  other: l.value.clientDetail.catOther,
}));

const route = useRoute();
const router = useRouter();
const {href, l, canCreateInspection} = useI18n();
const authStore = useAuthStore();
const writesAllowed = computed(() => resolveUserPlan(authStore.user) !== "expired");

function goToSubscription() {
  router.push({path: href("/profile"), query: {section: "subscription"}});
}
const store = useClientsStore();
const message = useMessage();

const showEdit = ref(false);
useDevModal("client.edit", showEdit);
const saving = ref(false);
const editForm = ref<EditForm | null>(null);
const equipment = ref<Equipment[]>([]);
const loadingEquipment = ref(false);
const showEquipmentAdd = ref(false);
useDevModal("client.equipmentAdd", showEquipmentAdd);
const hydraulicModalRef = ref<InstanceType<typeof HydraulicCheckModal> | null>(null);
const showHydraulicModal = ref(false);

function openEquipmentAdd() {
  showEquipmentAdd.value = true;
}

function onEquipmentCreated(eq: Equipment) {
  router.push(`/field?equipment=${eq.id}`);
}

function openReport() {
  if (!writesAllowed.value) return;
  hydraulicModalRef.value?.open({clientId: String(route.params.id)});
}
const activeTab = ref<TabKey>("docs");
let editClosing = false;

const headerSubtitle = computed(() => {
  const client = store.active;
  if (!client) return undefined;
  return client.contact_person || client.email || entityLabel(client.entity_type);
});

const clientStats = computed(() => {
  const client = store.active;
  return [
    {
      key: "documents",
      label: l.value.clientDetail.statDocuments,
      value: client?.doc_count ?? client?.document_count ?? store.activeDocuments.length,
      icon: DocumentTextOutline,
      tab: "docs" as TabKey,
      accent: false,
    },
    {
      key: "contracts",
      label: l.value.clientDetail.statContracts,
      value: client?.contract_count ?? 0,
      icon: BriefcaseOutline,
      tab: null,
      accent: false,
    },
    {
      key: "reminders",
      label: l.value.clientDetail.statOpenReminders,
      value: client?.open_reminder_count ?? 0,
      icon: NotificationsOutline,
      tab: null,
      accent: (client?.open_reminder_count ?? 0) > 0,
    },
  ];
});

const tabs = computed(() => [
  { key: "docs" as const, label: l.value.clientDetail.statDocuments, icon: DocumentTextOutline, count: store.activeDocuments.length },
  { key: "equipment" as const, label: l.value.clientDetail.tabEquipment, icon: ConstructOutline, count: equipment.value.length },
  { key: "timeline" as const, label: l.value.clientDetail.tabTimeline, icon: TimeOutline, count: store.activeTimeline.length },
]);

const contactChips = computed<ContactChip[]>(() => {
  const client = store.active;
  if (!client) return [];
  const chips: ContactChip[] = [];
  if (client.contact_person?.trim()) {
    chips.push({ key: "contact", label: client.contact_person, icon: PersonOutline });
  }
  if (client.email?.trim()) {
    chips.push({ key: "email", label: client.email, icon: MailOutline, href: `mailto:${client.email}`, ltr: true });
  }
  if (client.mobile?.trim()) {
    chips.push({ key: "mobile", label: client.mobile, icon: PhonePortraitOutline, href: `tel:${client.mobile}`, ltr: true });
  }
  if (client.phone?.trim()) {
    chips.push({ key: "phone", label: client.phone, icon: CallOutline, href: `tel:${client.phone}`, ltr: true });
  }
  return chips;
});

const clientNotes = computed(() => {
  const client = store.active;
  if (!client) return "";
  return cleanNotes(client.notes, client.contact_person);
});

const clientTags = computed(() => parseTags(store.active?.tags));

const clientDetails = computed<ClientDetailItem[]>(() => {
  const client = store.active;
  if (!client) return [];

  const address = [client.address, client.city, client.po_box, client.client_zipcode]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" · ");

  const details: ClientDetailItem[] = [
    detailItem("display_name", l.value.clientDetail.clientName, client.display_name),
    detailItem("entity_type", l.value.clientDetail.clientType, entityLabel(client.entity_type)),
    detailItem("contact_person", l.value.clientDetail.contactPerson, client.contact_person),
    { ...detailItem("id_number", l.value.clientDetail.idNumber, client.id_number), ltr: true },
    { ...detailItem("email", l.value.clientDetail.email, client.email), ltr: true, href: client.email ? `mailto:${client.email}` : undefined },
    { ...detailItem("phone", l.value.clientDetail.phone, client.phone), ltr: true, href: client.phone ? `tel:${client.phone}` : undefined },
    { ...detailItem("mobile", l.value.clientDetail.mobile, client.mobile), ltr: true, href: client.mobile ? `tel:${client.mobile}` : undefined },
  ];

  if (client.fax?.trim()) {
    details.push({ ...detailItem("fax", l.value.clientDetail.fax, client.fax), ltr: true });
  }
  if (address) {
    details.push(detailItem("address", l.value.clientDetail.address, address));
  }

  details.push(
    detailItem("created_at", l.value.clientDetail.created, formatDate(client.created_at)),
    detailItem("updated_at", l.value.clientDetail.updated, formatDate(client.updated_at)),
  );

  return details;
});

function onStatClick(stat: { tab: TabKey | null }) {
  if (stat.tab) activeTab.value = stat.tab;
}

function categoryLabel(c: string) {
  return CATEGORY_LABELS.value[c] ?? c;
}

function detailItem(key: string, label: string, value: string | null | undefined): ClientDetailItem {
  const text = displayValue(value);
  return { key, label, value: text, empty: text === "—" };
}

function displayValue(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : "—";
}

function entityLabel(entityType: string) {
  return entityType === "company" ? l.value.clientDetail.company : l.value.clientDetail.person;
}

function parseTags(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).map((tag) => tag.trim()).filter(Boolean) : [];
  } catch {
    return raw.split(",").map((tag) => tag.trim()).filter(Boolean);
  }
}

function cleanNotes(notes: string | null | undefined, contactPerson: string | null | undefined) {
  const value = notes?.trim();
  if (!value || !contactPerson?.trim()) return value ?? "";
  const contactLine = new RegExp(`^\\s*איש\\s+קשר\\s*[:：-]\\s*${escapeRegExp(contactPerson.trim())}\\s*$`, "m");
  return value.replace(contactLine, "").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("he-IL");
}

function eventTone(type: EventType): "success" | "warning" | "info" | "default" {
  if (type === "email_sent") return "success";
  if (type === "reminder_fired") return "warning";
  if (type === "document_added" || type === "contract_signed") return "info";
  return "default";
}

function eventIcon(type: EventType): Component {
  if (type === "email_sent") return MailOutline;
  if (type === "reminder_fired") return NotificationsOutline;
  if (type === "contract_signed") return BriefcaseOutline;
  if (type === "document_added") return DocumentTextOutline;
  return CreateOutline;
}

watch(showEdit, (open) => {
  if (!open) {
    editClosing = true;
    window.setTimeout(() => {
      editClosing = false;
    }, 280);
    return;
  }
  if (!store.active) return;
  editForm.value = {
    display_name: store.active.display_name,
    entity_type: store.active.entity_type === "company" ? "company" : "person",
    contact_person: store.active.contact_person ?? "",
    id_number: store.active.id_number ?? "",
    email: store.active.email ?? "",
    phone: store.active.phone ?? "",
    mobile: store.active.mobile ?? "",
    notes: store.active.notes ?? "",
  };
});

function openEdit() {
  if (editClosing || showEdit.value) return;
  showEdit.value = true;
}

function closeEdit() {
  editClosing = true;
  showEdit.value = false;
}

async function doSave() {
  if (!editForm.value || !store.active) return;
  saving.value = true;
  try {
    await store.update(store.active.id, editForm.value);
    message.success(l.value.clientDetail.saved);
    showEdit.value = false;
    await store.fetchOne(store.active.id);
  } catch (e) {
    message.error(String(e));
  } finally {
    saving.value = false;
  }
}

async function loadEquipment(clientId: string) {
  loadingEquipment.value = true;
  try {
    equipment.value = await api.equipment.list({ client_id: clientId });
  } catch {
    equipment.value = [];
  } finally {
    loadingEquipment.value = false;
  }
}

watch(
  () => String(route.params.id || ""),
  async (id) => {
    if (!id) return;
    activeTab.value = "docs";
    try {
      await store.fetchOne(id);
    } catch {
      // store.active is cleared; empty state is shown
    }
    await loadEquipment(id);
  },
  { immediate: true },
);
</script>

<style scoped>
.locked-action {
  display: inline-flex;
}

.locked-action button:disabled {
  pointer-events: none;
}
.client-detail {
  direction: rtl;
}

.identity-card {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  padding: 16px 18px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
}

.identity-card__avatar {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

.identity-card__avatar--company {
  background: color-mix(in srgb, var(--brand-color) 14%, transparent);
  color: var(--brand-color);
}

.identity-card__avatar--person {
  background: color-mix(in srgb, #2080f0 14%, transparent);
  color: #2080f0;
}

.identity-card__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.identity-card__chips,
.contact-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.type-chip,
.meta-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}

.type-chip {
  background: color-mix(in srgb, var(--brand-color) 13%, var(--bg-card));
  color: var(--brand-color);
}

.meta-chip {
  background: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.contact-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}

.contact-chip:hover:not(.contact-chip--plain) {
  border-color: var(--brand-color);
  color: var(--brand-color);
}

.contact-chip--plain {
  cursor: default;
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
  padding: 16px 18px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}

.stat:hover:not(.stat--static),
.stat--active {
  background: color-mix(in srgb, var(--brand-color) 6%, var(--bg-card));
  border-color: color-mix(in srgb, var(--brand-color) 35%, var(--border-color));
}

.stat--static {
  cursor: default;
}

.stat__icon {
  color: var(--text-secondary);
}

.stat__num {
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
  color: var(--text-primary);
}

.stat__num--accent {
  color: var(--brand-color);
}

.stat__label {
  font-size: 13px;
  color: var(--text-secondary);
}

.details-card {
  margin-bottom: 18px;
  padding: 16px 18px 8px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
}

.details-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.details-card h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.details-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 20px;
  margin: 0;
}

.details-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);
  min-width: 0;
}

.details-item dt {
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
}

.details-item dd {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.details-item dd a {
  color: var(--brand-color);
  text-decoration: none;
}

.details-item dd a:hover {
  text-decoration: underline;
}

.details-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px 0 8px;
}

.details-notes {
  margin: 4px 0 12px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-secondary);
  white-space: pre-wrap;
}

.sectiontabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
  padding: 6px;
  background: var(--bg-elevated);
  border-radius: 14px;
  border: 1px solid var(--border-color);
}

.sectionpill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.sectionpill:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.sectionpill--active {
  background: var(--bg-card);
  color: var(--text-primary);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

.sectionpill__count {
  min-width: 18px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}

.sectionpill--active .sectionpill__count {
  background: color-mix(in srgb, var(--brand-color) 16%, transparent);
  color: var(--brand-color);
}

.table-wrap {
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
  overflow: auto;
}

.detail-table {
  width: 100%;
  min-width: 760px;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}

.detail-table th,
.detail-table td {
  padding: 8px 10px;
  text-align: right;
  vertical-align: middle;
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
  line-height: 1.35;
}

.detail-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
  white-space: nowrap;
}

.detail-table tbody tr:last-child td {
  border-bottom: none;
}

.detail-table__row {
  cursor: pointer;
}

.detail-table__row:hover td {
  background: color-mix(in srgb, var(--brand-color) 5%, var(--bg-card));
}

.detail-table__row:focus-visible td {
  background: color-mix(in srgb, var(--brand-color) 8%, var(--bg-card));
  box-shadow: inset 0 0 0 1px var(--brand-color);
}

.col-file { width: 28%; }
.col-type { width: 12%; }
.col-status { width: 12%; }
.col-date { width: 13%; }
.col-open { width: 72px; }
.col-name { width: 20%; }
.col-cat { width: 14%; }
.col-meta { width: 13%; }
.col-source { width: 16%; }

.file-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--text-primary);
}

.file-cell :deep(.n-icon) {
  flex: 0 0 auto;
  color: var(--text-secondary);
}

.cell-truncate {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-open {
  text-align: center;
}

.tab-panel__head {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.tab-panel__head-spacer {
  flex: 1;
}

.icon-btn {
  padding: 2px;
  min-width: 28px;
  min-height: 28px;
  justify-content: center;
}

.icon-btn .btn-icon {
  margin: 0;
}

.source-link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--brand-color);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.source-link:hover {
  opacity: 0.8;
}

.timeline {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
  overflow: hidden;
}

.timeline-item {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
}

.timeline-item:last-child {
  border-bottom: none;
}

.timeline-item__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

.timeline-item__icon--success {
  background: color-mix(in srgb, var(--color-success) 14%, transparent);
  color: var(--color-success);
}

.timeline-item__icon--warning {
  background: color-mix(in srgb, var(--color-warning) 16%, transparent);
  color: var(--color-warning);
}

.timeline-item__icon--info {
  background: color-mix(in srgb, var(--brand-color) 14%, transparent);
  color: var(--brand-color);
}

.timeline-item__body strong {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.timeline-item__body p {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.timeline-item__time {
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
}

.panel-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 56px 20px;
  border: 1px dashed var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
  text-align: center;
  color: var(--text-secondary);
}

.panel-empty :deep(.n-icon) {
  color: var(--brand-color);
  opacity: 0.7;
  margin-bottom: 4px;
}

.panel-empty h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
}

.panel-empty p {
  margin: 0 0 8px;
  font-size: 13px;
}

.panel-empty--page {
  margin-top: 24px;
}

.muted {
  color: var(--text-muted);
}

.ltr {
  direction: ltr;
  unicode-bidi: isolate;
  text-align: right;
}

.client-form__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 12px;
}

.client-form__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.email-ltr :deep(.n-input__input-el) {
  direction: ltr;
  text-align: left;
}

@media (max-width: 900px) {
  .stat-row,
  .details-grid {
    grid-template-columns: 1fr;
  }

}

@media (max-width: 640px) {
  .identity-card {
    align-items: flex-start;
  }

  .client-form__grid {
    grid-template-columns: 1fr;
  }

  .timeline-item {
    grid-template-columns: 36px minmax(0, 1fr);
  }

  .timeline-item__time {
    grid-column: 2;
  }
}
</style>
