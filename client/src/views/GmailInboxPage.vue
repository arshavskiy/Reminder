<template>
  <div class="page2 gmail-page" :dir="dir">
    <PageHeader
      :title="l.gmail.title"
      :subtitle="connectedEmail ? t('gmail.connected', {email: connectedEmail}) : l.gmail.subtitle"
      :count="importedDocuments.length > 0 ? importedDocuments.length : undefined"
    >
      <template #hero>
        <div class="gmail-actions">
          <MobileActionButton
            v-if="connected && (isAdmin || selectedGuidedFlow)"
            :disabled="loading"
            class="rbtn rbtn--ghost"
            type="button"
            @click="refreshCurrentFlow"
            :label="l.common.refresh">
            <template #icon>
              <n-icon :class="{ 'refresh-icon--spin': loading }" :component="RefreshOutline" class="btn-icon"/>
            </template>

            {{ l.common.refresh }}
          </MobileActionButton>
          <MobileActionButton
            v-if="connected && (isAdmin || selectedGuidedFlow)"
            :class="{ 'rbtn--loading': importingAll }"
            :disabled="loading || importingAll"
            class="rbtn rbtn--primary"
            type="button"
            @click="importAllNew"
            :label="l.common.importAll">
            <template #icon>
              <GmailLogo :size="16" class="btn-icon"/>
            </template>

            {{ l.common.importAll }}
          </MobileActionButton>
          <n-select
            v-if="connected && isAdmin"
            v-model:value="selectedTemplateId"
            :options="templateOptions"
            clearable
            :placeholder="l.gmail.autoTemplate"
            size="small"
            class="gmail-actions__select"
          />
          <button
            v-if="connected"
            class="rbtn rbtn--ghost rbtn--danger"
            type="button"
            @click="disconnect"
          >
            {{ l.common.disconnectGmail }}
          </button>
          <MobileActionButton
            v-if="!connected && !loading"
            class="rbtn rbtn--primary gmail-actions__btn--full"
            type="button"
            @click="connectGmail"
            :label="l.common.connectGmail">
            <template #icon>
              <n-icon :component="LogoGoogle" class="btn-icon"/>
            </template>

            {{ l.common.connectGmail }}
          </MobileActionButton>
        </div>
      </template>
      <template v-if="connected && isAdmin" #actions>
        <div id="gmail-search-section" class="gmail-search-bar">
          <span class="gmail-search-bar__label">{{ l.common.search }}</span>
          <div class="file-type-checks">
            <n-checkbox v-model:checked="fileTypes.pdf">PDF</n-checkbox>
            <n-checkbox v-model:checked="fileTypes.doc">DOC/DOCX</n-checkbox>
            <n-checkbox v-model:checked="fileTypes.xls">XLS/XLSX</n-checkbox>
            <n-checkbox v-model:checked="fileTypes.img">{{ l.common.images }}</n-checkbox>
          </div>
          <n-select
            v-model:value="searchTemplateId"
            :options="templateOptions"
            :placeholder="l.gmail.docType"
            filterable
            clearable
            class="toolbar__type"
          />
          <n-select
            v-model:value="filterType"
            :options="filterTypeOptions"
            :placeholder="l.gmail.extraFilter"
            class="toolbar__type toolbar__type--sm"
            @update:value="onFilterChange"
          />
          <n-select
            v-if="filterType === 'sender'"
            v-model:value="filterSender"
            :options="senderOptions"
            :placeholder="l.common.sender"
            filterable
            clearable
            tag
            class="toolbar__supplier"
          />
          <n-date-picker
            v-if="filterType === 'date'"
            v-model:value="filterDateRange"
            type="daterange"
            clearable
            class="toolbar__dates"
          />
          <n-input
            v-if="filterType === 'inspection'"
            v-model:value="filterIdentifierText"
            :placeholder="l.gmail.licenseOrInspection"
            clearable
            class="toolbar__search"
            :allow-input="(v: string) => /^\d*$/.test(v)"
            @keydown.enter="buildAndSearch"
          />
          <MobileActionButton
            :class="{ 'rbtn--loading': loading }"
            :disabled="loading"
            class="rbtn rbtn--primary gmail-search-bar__submit"
            type="button"
            @click="buildAndSearch"
            :label="l.common.search">
            <template #icon>
              <n-icon :component="SearchOutline" class="btn-icon"/>
            </template>

            {{ l.common.search }}
          </MobileActionButton>
        </div>
      </template>
    </PageHeader>

    <nav v-if="sectionNavItems.length" class="filterbar filterbar--compact gmail-section-nav" :aria-label="l.gmail.pageNav">
      <a
        v-for="item in sectionNavItems"
        :key="item.id"
        class="pill pill--compact"
        :href="`#${item.id}`"
      >
        {{ item.label }}
      </a>
    </nav>

    <div v-if="connected && !isAdmin" class="filterbar filterbar--compact gmail-flow-tabs" role="tablist" :aria-label="l.gmail.flowAria">
      <button
        type="button"
        class="pill pill--compact"
        :class="{ 'pill--active': selectedGuidedFlow === 'invoice' }"
        role="tab"
        :aria-selected="selectedGuidedFlow === 'invoice'"
        @click="selectGuidedFlow('invoice')"
      >
        <n-icon :component="DocumentOutline" :size="16" />
        {{ l.gmail.importInvoices }}
      </button>
      <button
        type="button"
        class="pill pill--compact"
        :class="{ 'pill--active': selectedGuidedFlow === 'inspection' }"
        role="tab"
        :aria-selected="selectedGuidedFlow === 'inspection'"
        @click="selectGuidedFlow('inspection')"
      >
        <n-icon :component="DocumentOutline" :size="16" />
        {{ l.gmail.importInspection }}
      </button>
    </div>

    <section v-if="connected && !isAdmin && selectedGuidedFlow" class="guided-flow-bar">
      <div>
        <span class="guided-flow-bar__label">{{ l.gmail.flowLabel }}</span>
        <strong>{{ guidedFlowLabel }}</strong>
      </div>
      <span class="guided-flow-bar__query">{{ searchQuery }}</span>
    </section>

    <GmailImportJobStatus
      v-if="visibleImportJob"
      :job="visibleImportJob"
      :dismissible="!importingAll"
      @retry="retryGmailImports"
      @dismiss="lastImportJob = null"
    />

    <!-- Not connected -->
    <div v-if="!connected && !loading" class="empty">
      <n-icon :component="LogoGoogle" :size="48" class="empty__icon" style="color:#4285F4" />
      <p>{{ l.gmail.connectHint }}</p>
      <button class="rbtn rbtn--primary mt-3" type="button" @click="connectGmail">
        <n-icon :component="LogoGoogle" class="btn-icon" />
        {{ l.common.connectGmail }}
      </button>
    </div>

    <!-- Loading status -->
    <n-spin v-else-if="loading" size="large" style="margin:80px auto;display:block" />

    <!-- Inbox table -->
    <section
      v-else-if="isAdmin || selectedGuidedFlow"
      :id="isAdmin ? undefined : 'gmail-search-section'"
      class="gmail-search-section"
    >
      <div
        v-if="linkOnlyContextActive && linkKindEmails.length && !linkOnlyDismissed"
        class="link-only-notice"
      >
        <div class="link-only-notice__text">
          <strong>נמצאו {{ linkKindEmails.length }} מיילי חשבונית עם קישור בלבד, ללא קובץ מצורף</strong>
          <span>מיילים כאלה (למשל ריוחית, Green Invoice) לא ניתנים לייבוא אוטומטי כרגע — יש להוריד את המסמך ידנית מהקישור.</span>
          <ul class="link-only-notice__list">
            <li v-for="row in linkKindEmails.slice(0, 40)" :key="row.id">
              <span>{{ row.subject }} — {{ row.from }}</span>
              <button
                v-if="row.importable"
                class="btn btn--ghost btn--xs"
                type="button"
                :disabled="importingInlineId === row.id"
                @click="handleImportInline(row)"
              >
                {{ importingInlineId === row.id ? "מייבא..." : "ייבוא" }}
              </button>
            </li>
          </ul>
        </div>
        <button class="btn btn--ghost btn--xs" type="button" @click="linkOnlyDismissed = true">הבנתי</button>
      </div>

      <div
        v-if="linkOnlyContextActive && inlineKindEmails.length && !inlineOnlyDismissed"
        class="link-only-notice"
      >
        <div class="link-only-notice__text">
          <strong>נמצאו {{ inlineKindEmails.length }} מיילי אישור תשלום עם פרטים בתוך גוף המייל, ללא קובץ</strong>
          <span>PayPal, Google Play, Hyp ו-Meta Ads אפשר לייבא. שאר האישורים מוצגים כאן בלי ייבוא אוטומטי.</span>
          <ul class="link-only-notice__list">
            <li v-for="row in inlineKindEmails.slice(0, 80)" :key="row.id">
              <span>{{ row.subject }} — {{ row.from }}</span>
              <button
                v-if="row.importable"
                class="btn btn--ghost btn--xs"
                type="button"
                :disabled="importingInlineId === row.id"
                @click="handleImportInline(row)"
              >
                {{ importingInlineId === row.id ? "מייבא..." : "ייבוא" }}
              </button>
            </li>
          </ul>
        </div>
        <button class="btn btn--ghost btn--xs" type="button" @click="inlineOnlyDismissed = true">הבנתי</button>
      </div>

      <div v-if="!emails.length" class="empty">
        <p>לא נמצאו מיילים עם קבצי {{ selectedTypeLabel }} מצורפים</p>
      </div>

      <div v-else class="inbox-table-block">
        <div class="inbox-cards">
          <article
            v-for="row in emails"
            :key="`card-${row.id}`"
            class="inbox-card"
          >
            <header class="inbox-card__head">
              <div class="inbox-card__from" :title="row.from">{{ formatFrom(row.from) }}</div>
              <div class="inbox-card__date">{{ formatDate(row.internalDate) }}</div>
            </header>
            <div class="inbox-card__subject" :title="row.subject">{{ row.subject || "—" }}</div>
            <div
              v-for="att in row.attachments"
              :key="att.attachmentId"
              class="inbox-card__file"
            >
              <div class="inbox-file">
                <n-icon :component="DocumentOutline" :size="14" class="inbox-file__icon" />
                <span class="inbox-file__name" :title="`${att.filename || 'קובץ מצורף'} · ${formatSize(att.size)}`">
                  {{ att.filename || "קובץ מצורף" }}
                </span>
              </div>
              <div class="inbox-row-actions">
                <button class="btn btn--ghost btn--xs icon-btn" type="button" aria-label="תצוגה מקדימה" @click="previewAttachment(row.id, att)">
                  <n-icon :component="EyeOutline" :size="14" class="btn-icon" />
                </button>
                <button class="btn btn--ghost btn--xs icon-btn" type="button" aria-label="הורד" @click="downloadAttachment(row.id, att)">
                  <n-icon :component="DownloadOutline" :size="14" class="btn-icon" />
                </button>
                <button
                  class="btn btn--primary btn--xs icon-btn"
                  type="button"
                  aria-label="ייבא למסמכים"
                  :class="{ 'btn--loading': importing[att.attachmentId] }"
                  :disabled="Boolean(importing[att.attachmentId])"
                  @click="importAttachment(row.id, att)"
                >
                  <n-icon :component="CloudDownloadOutline" :size="14" class="btn-icon" />
                </button>
              </div>
            </div>
          </article>
        </div>

        <div class="inbox-table-wrap">
          <table class="inbox-table">
          <thead>
            <tr>
              <th class="col-from">{{ l.common.from }}</th>
              <th class="col-subject">{{ l.common.subject }}</th>
              <th class="col-date">{{ l.common.date }}</th>
              <th class="col-file">{{ l.common.file }}</th>
              <th class="col-actions">{{ l.common.actions }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in emails" :key="row.id">
              <tr
                v-for="(att, attIndex) in row.attachments"
                :key="att.attachmentId"
                class="inbox-row"
              >
                <td v-if="attIndex === 0" class="col-from" :rowspan="row.attachments.length">
                  <span class="inbox-from" :title="row.from">{{ formatFrom(row.from) }}</span>
                </td>
                <td v-if="attIndex === 0" class="col-subject" :rowspan="row.attachments.length">
                  <span class="inbox-subject" :title="row.subject">{{ row.subject || "—" }}</span>
                </td>
                <td v-if="attIndex === 0" class="col-date" :rowspan="row.attachments.length">
                  {{ formatDate(row.internalDate) }}
                </td>
                <td class="col-file">
                  <div class="inbox-file">
                    <n-icon :component="DocumentOutline" :size="14" class="inbox-file__icon" />
                    <span class="inbox-file__name" :title="`${att.filename || 'קובץ מצורף'} · ${formatSize(att.size)}`">{{ att.filename || "קובץ מצורף" }}</span>
                  </div>
                </td>
                <td class="col-actions">
                  <div class="inbox-row-actions">
                    <n-tooltip placement="top">
                      <template #trigger>
                        <button
                          class="btn btn--ghost btn--xs icon-btn"
                          type="button"
                          @click="previewAttachment(row.id, att)"
                        >
                          <n-icon :component="EyeOutline" :size="14" class="btn-icon" />
                        </button>
                      </template>
                      תצוגה מקדימה
                    </n-tooltip>
                    <n-tooltip placement="top">
                      <template #trigger>
                        <button
                          class="btn btn--ghost btn--xs icon-btn"
                          type="button"
                          @click="downloadAttachment(row.id, att)"
                        >
                          <n-icon :component="DownloadOutline" :size="14" class="btn-icon" />
                        </button>
                      </template>
                      הורד
                    </n-tooltip>
                    <n-tooltip placement="top">
                      <template #trigger>
                        <span class="inbox-row-actions__tip">
                          <button
                            class="btn btn--primary btn--xs icon-btn"
                            type="button"
                            :class="{ 'btn--loading': importing[att.attachmentId] }"
                            :disabled="Boolean(importing[att.attachmentId])"
                            @click="importAttachment(row.id, att)"
                          >
                            <n-icon :component="CloudDownloadOutline" :size="14" class="btn-icon" />
                          </button>
                        </span>
                      </template>
                      {{ importing[att.attachmentId] ? "מייבא…" : "ייבא למסמכים" }}
                    </n-tooltip>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
          </table>
        </div>
        <div v-if="nextPageToken" class="load-more-wrap">
          <button
            :class="{ 'rbtn--loading': loadingMore }"
            :disabled="loadingMore"
            class="rbtn rbtn--ghost"
            type="button"
            @click="loadMore"
          >
            {{ l.gmail.loadMore }}
            <template v-if="totalEstimate"> ({{ emails.length }} מתוך ~{{ totalEstimate }})</template>
          </button>
        </div>
      </div>
    </section>

    <!-- Import results modal -->
    <n-modal v-model:show="importResults.show" preset="card" :title="l.gmail.importResults" style="max-width:600px">
      <div class="import-results">
        <div class="import-results__summary">
          <span class="import-results__stat import-results__stat--ok">{{ t("gmail.importedCountStat", {n: importResults.imported}) }}</span>
          <span class="import-results__stat import-results__stat--skip">{{ t("gmail.skippedCount", {n: importResults.skipped}) }}</span>
          <span v-if="importResults.errors > 0" class="import-results__stat import-results__stat--err">{{ t("gmail.errorsCount", {n: importResults.errors}) }}</span>
        </div>
        <table v-if="importResults.results.length" class="import-results__table">
          <thead><tr><th>{{ l.common.file }}</th><th>{{ l.common.status }}</th></tr></thead>
          <tbody>
            <tr v-for="r in importResults.results" :key="r.filename + r.messageId">
              <td class="import-results__file">{{ r.filename }}</td>
              <td>
                <span v-if="r.documentId" class="tag tag--success">{{ l.gmail.imported }}</span>
                <span v-else-if="r.error" class="tag tag--danger" :title="r.explanation ?? r.error">
                  {{ r.explanation ?? "שגיאה" }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </n-modal>

    <n-modal
      v-model:show="importedBusinessModal.show"
      preset="card"
      :title="l.gmail.assignBusiness"
      class="gmail-business-modal"
      :style="{ width: '460px', maxWidth: 'calc(100vw - 32px)' }"
    >
      <div class="gmail-business-form" :dir="dir">
        <n-input
          v-model:value="importedBusinessModal.value"
          clearable
          :placeholder="l.gmail.newBusiness"
          @keydown.enter="saveImportedBusinessModal"
        />
        <div class="gmail-business-form__actions">
          <n-button @click="importedBusinessModal.show = false">{{ l.common.cancel }}</n-button>
          <n-button type="primary" :disabled="!importedBusinessModal.value.trim()" @click="saveImportedBusinessModal">
            {{ l.common.save }}
          </n-button>
        </div>
      </div>
    </n-modal>

    <section v-if="connected && (isAdmin || selectedGuidedFlow) && importedDocuments.length" id="gmail-imported-section" class="gmail-docs-section">
      <div class="gmail-docs-head">
        <div>
          <h2 class="gmail-docs-title">{{ l.gmail.importedTitle }}</h2>
          <p class="gmail-docs-subtitle">{{ t("gmail.importedCount", {shown: filteredImportedDocuments.length, total: importedDocuments.length}) }}</p>
        </div>
        <n-tooltip v-if="selectedImportedCount" placement="top">
          <template #trigger>
            <button
              class="btn btn--ghost btn--xs icon-btn gmail-docs-delete-selected"
              type="button"
              :disabled="deletingImportedDocuments"
              :aria-label="l.common.deleteSelected"
              @click="deleteSelectedImportedDocuments"
            >
              <n-icon :component="TrashOutline" class="btn-icon" />
            </button>
          </template>
          {{ t("gmail.deleteSelectedDocs", {n: selectedImportedCount}) }}
        </n-tooltip>
      </div>

      <div class="filterbar filterbar--compact">
        <ResponsiveFilterButton
          v-for="option in importedStatusStrip"
          :key="option.value || 'all'"
          type="button"
          class="pill pill--compact"
          :class="{ 'pill--active': (importedStatusFilter ?? '') === option.value }"
          @click="setImportedStatus(option.value)"

          :aria-pressed="(importedStatusFilter ?? '') === option.value"
          :count="option.count"
          :filter-key="option.value"
          :label="option.label"
        />
        <div class="toolbar__view-toggle">
          <n-tooltip placement="top">
            <template #trigger>
              <button
                :class="{ 'rbtn--ghost-active': importedView === 'grid' }"
                :aria-label="l.common.cards"
                class="rbtn rbtn--ghost rbtn--icon"
                type="button"
                @click="importedView = 'grid'"
              >
                <n-icon :component="GridOutline" :size="16" class="btn-icon"/>
              </button>
            </template>
            {{ l.common.cards }}
          </n-tooltip>
          <n-tooltip placement="top">
            <template #trigger>
              <button
                :class="{ 'rbtn--ghost-active': importedView === 'list' }"
                :aria-label="l.common.tableView"
                class="rbtn rbtn--ghost rbtn--icon"
                type="button"
                @click="importedView = 'list'"
              >
                <n-icon :component="ListOutline" :size="16" class="btn-icon"/>
              </button>
            </template>
            {{ l.common.tableView }}
          </n-tooltip>
        </div>
      </div>

      <div class="toolbar gmail-doc-filters">
        <n-input
          v-model:value="importedSearch"
          clearable
          :placeholder="l.gmail.searchImported"
          class="toolbar__search"
        />
        <n-select
          v-model:value="importedTypeFilter"
          :options="importedTypeOptions"
          clearable
          filterable
          :placeholder="l.gmail.docType"
          class="toolbar__type"
        />
        <n-select
          v-model:value="importedSourceFilter"
          :options="importedSourceOptions"
          clearable
          filterable
          :placeholder="l.common.source"
          class="toolbar__supplier"
        />
        <n-select
          v-model:value="importedCategoryFilter"
          :options="importedCategoryOptions"
          clearable
          filterable
          :placeholder="l.common.category"
          class="toolbar__type"
        />
        <n-date-picker
          v-model:value="importedDateRange"
          type="daterange"
          clearable
          class="toolbar__dates"
        />
      </div>

      <div v-if="filteredImportedDocuments.length && importedView === 'grid'" class="gmail-doc-grid">
        <article
          v-for="doc in pagedImportedDocuments"
          :key="doc.id"
          class="gmail-doc-card"
          @click="openImportedDocument(doc)"
        >
          <div class="gmail-doc-card__preview">
            <img
              v-if="importedDocThumbnailSrc(doc)"
              :src="importedDocThumbnailSrc(doc) || ''"
              :alt="doc.file_name"
              loading="lazy"
            />
            <img
              v-else-if="isImageDoc(doc)"
              :src="importedDocPreviewSrc(doc)"
              :alt="doc.file_name"
              loading="lazy"
            />
            <iframe
              v-else-if="isPdfDoc(doc)"
              :src="importedDocPreviewSrc(doc)"
              :title="doc.file_name"
              loading="lazy"
            />
            <div v-else class="gmail-doc-card__fallback">
              <n-icon :component="DocumentOutline" :size="42" />
            </div>
            <span class="gmail-doc-card__status">{{ importedStatusLabel(doc.processing_status) }}</span>
          </div>
          <div class="gmail-doc-card__body">
            <div class="gmail-doc-card__supplier" :title="importedSupplier(doc)">{{ importedSupplier(doc) }}</div>
            <div class="gmail-doc-card__amount">{{ importedAmount(doc) }}</div>
            <div class="gmail-doc-card__meta">
              <span>{{ importedDocType(doc) }}</span>
              <span>{{ importedDisplayDate(doc) }}</span>
            </div>
            <div class="gmail-doc-card__category">{{ importedProviderCategoryLabel(doc) }}</div>
            <div
              v-if="doc.importExplanation"
              class="gmail-doc-card__explain"
              :class="`gmail-doc-card__explain--${doc.importStatus ?? 'imported'}`"
              :title="doc.importExplanation"
            >
              {{ importStatusLabel(doc.importStatus) }} · {{ doc.importExplanation }}
            </div>
            <div class="gmail-doc-card__source" :title="doc.sourceSubject">{{ doc.sourceSubject || doc.file_name }}</div>
          </div>
        </article>
      </div>

      <div v-else-if="filteredImportedDocuments.length" class="gmail-doc-table-wrap">
        <table class="gmail-doc-table">
          <thead>
            <tr>
              <th class="gmail-doc-table__select-head">
                <n-checkbox
                  :checked="allPagedImportedSelected"
                  :indeterminate="somePagedImportedSelected && !allPagedImportedSelected"
                  :disabled="deletingImportedDocuments"
                  @update:checked="togglePagedImportedSelection"
                />
              </th>
              <th>{{ l.common.supplier }}</th>
              <th>{{ l.common.category }}</th>
              <th>{{ l.common.status }}</th>
              <th>{{ l.gmail.importExplanation }}</th>
              <th>{{ l.common.date }}</th>
              <th>{{ l.gmail.importDate }}</th>
              <th>{{ l.gmail.business }}</th>
              <th>{{ l.common.type }}</th>
              <th>{{ l.common.amount }}</th>
              <th class="gmail-doc-table__actions-head">{{ l.common.actions }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="doc in pagedImportedDocuments"
              :key="doc.id"
              class="gmail-doc-table-row"
              tabindex="0"
              role="button"
              @click="openImportedDocument(doc)"
              @keydown.enter.prevent="openImportedDocument(doc)"
              @keydown.space.prevent="openImportedDocument(doc)"
            >
              <td class="gmail-doc-table__select" @click.stop>
                <n-checkbox
                  :checked="selectedImportedDocumentIds.has(doc.id)"
                  :disabled="deletingImportedDocuments"
                  @update:checked="(checked) => toggleImportedDocument(doc.id, Boolean(checked))"
                />
              </td>
              <td class="cell-strong">{{ importedSupplier(doc) }}</td>
              <td>
                <span class="gmail-doc-category">{{ importedProviderCategoryLabel(doc) }}</span>
              </td>
              <td @click.stop>
                <n-select
                  v-if="doc.invoice_id"
                  :value="doc.invoice_status || 'new'"
                  :options="invoiceStatusOptions"
                  size="small"
                  class="gmail-doc-status-select"
                  @update:value="(value) => updateImportedInvoiceStatus(doc, String(value))"
                />
                <span v-else class="status-pill" :class="`status-pill--${doc.processing_status}`">{{ importedStatusLabel(doc.processing_status) }}</span>
              </td>
              <td>
                <span
                  class="gmail-import-explain"
                  :class="`gmail-import-explain--${doc.importStatus ?? 'imported'}`"
                  :title="doc.importExplanation ?? ''"
                >
                  {{ importStatusLabel(doc.importStatus) }}
                  <span v-if="doc.importExplanation">· {{ doc.importExplanation }}</span>
                </span>
              </td>
              <td>{{ importedDisplayDate(doc) }}</td>
              <td>{{ importedImportDate(doc) }}</td>
              <td>{{ importedBusiness(doc) }}</td>
              <td>{{ importedDocType(doc) }}</td>
              <td class="gmail-doc-table__amount">{{ importedAmount(doc) }}</td>
              <td class="gmail-doc-table__actions" @click.stop>
                <n-dropdown
                  :options="importedDocActionOptions(doc)"
                  placement="bottom-start"
                  trigger="click"
                  @select="(key: string) => handleImportedDocAction(key, doc)"
                >
                  <button class="btn btn--ghost btn--xs icon-btn gmail-doc-row-action" type="button" :aria-label="l.common.actions">
                    <n-icon :component="EllipsisVerticalOutline" class="btn-icon" />
                  </button>
                </n-dropdown>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="filteredImportedDocuments.length > importedPageSize" class="gmail-doc-pagination">
        <n-pagination
          v-model:page="importedPage"
          v-model:page-size="importedPageSize"
          :item-count="filteredImportedDocuments.length"
          :page-sizes="[8, 12, 24, 48]"
          show-size-picker
        />
      </div>

      <div v-if="!filteredImportedDocuments.length" class="empty">
        {{ l.gmail.emptyFiltered }}
      </div>
    </section>

  </div>
</template>

<script setup lang="ts">
import MobileActionButton from "../components/MobileActionButton.vue";
import ResponsiveFilterButton from "../components/ResponsiveFilterButton.vue";
import { computed, h, onMounted, ref, watch, type Component } from "vue";
import { useRoute } from "vue-router";
import {
  NButton, NCheckbox, NDatePicker, NDropdown, NIcon, NInput, NModal, NPagination, NSelect, NSpin, NTooltip,
  useMessage, type SelectOption,
} from "naive-ui";
import {
  ArchiveOutline,
  BriefcaseOutline,
  CloudDownloadOutline,
  DocumentOutline,
  DownloadOutline,
  EllipsisVerticalOutline,
  EyeOutline,
  GridOutline,
  ListOutline,
  LogoGoogle,
  PricetagOutline,
  RefreshOutline,
  SearchOutline,
  TrashOutline,
} from "@vicons/ionicons5";
import { api, type GmailAttachment, type GmailEmail, type GmailImportedDocument, type GmailImportHistoryItem, type GmailImportJob, type GmailLinkOnlyEmail, type GmailSearchProvider } from "../services/apiService.js";
import { useAuthStore } from "../stores/auth.js";
import type { DocTemplate } from "../shared/types.js";
import PageHeader from "../components/PageHeader.vue";
import {useI18n} from "../composables/useI18n.js";
import {useDevModal} from "../composables/useDevModal.js";
import GmailLogo from "../components/GmailLogo.vue";
import GmailImportJobStatus from "../components/GmailImportJobStatus.vue";

const route = useRoute();
const {l, dir, t} = useI18n();
const message = useMessage();
const authStore = useAuthStore();

const selectedTemplateId = ref<string | null>(null);
const searchTemplateId = ref<string | null>(null);
const templateOptions = ref<{ label: string; value: string }[]>([]);
const templates = ref<DocTemplate[]>([]);

const connected = ref(false);
const connectionSource = ref<string | null>(null);
const connectedEmail = ref<string | null>(null);
const loading = ref(false);
const loadingMore = ref(false);
const importingAll = ref(false);
const activeImportJob = ref<GmailImportJob | null>(null);
const lastImportJob = ref<GmailImportJob | null>(null);
const emails = ref<GmailEmail[]>([]);
const searchQuery = ref("");
const nextPageToken = ref<string | null>(null);
const totalEstimate = ref<number | null>(null);
const importing = ref<Record<string, boolean>>({});
const selectedGuidedFlow = ref<"invoice" | "inspection" | null>(null);
const linkOnlyEmails = ref<GmailLinkOnlyEmail[]>([]);
const linkOnlyDismissed = ref(false);
const inlineOnlyDismissed = ref(false);
const linkOnlyContextActive = ref(false);
const linkKindEmails = computed(() => linkOnlyEmails.value.filter((row) => row.kind === "link"));
const inlineKindEmails = computed(() => linkOnlyEmails.value.filter((row) => row.kind === "inline"));
const importingInlineId = ref<string | null>(null);
const isAdmin = computed(() => authStore.user?.role === "admin");
const guidedFlowLabel = computed(() => selectedGuidedFlow.value === "invoice" ? l.value.gmail.importInvoices : l.value.gmail.importInspection);
const visibleImportJob = computed(() => activeImportJob.value ?? lastImportJob.value);

const sectionNavItems = computed(() => {
  if (!connected.value) return [];
  const items: Array<{ id: string; label: string }> = [];
  if (!isAdmin.value && selectedGuidedFlow.value) items.push({ id: "gmail-search-section", label: l.value.common.search });
  if ((isAdmin.value || selectedGuidedFlow.value) && importedDocuments.value.length) items.push({ id: "gmail-imported-section", label: l.value.gmail.imported });
  return items;
});

// Import results modal
const importResults = ref<{
  show: boolean;
  imported: number;
  skipped: number;
  errors: number;
  results: Array<{ messageId: string; filename: string; documentId?: string; error?: string; explanation?: string }>;
}>({ show: false, imported: 0, skipped: 0, errors: 0, results: [] });
useDevModal("gmail.importResults", computed({
  get: () => importResults.value.show,
  set: (v) => { importResults.value.show = v; },
}));

// Import history
type ImportedDocumentCard = GmailImportedDocument & {
  sourceSubject: string;
  sourceDate: string | null;
  sourceMessageId: string;
  sourceFilename: string;
  importStatus: string | null;
  importExplanation: string | null;
  importRetryable: boolean;
  importRetryMode: "failed" | "rejected" | "retryable" | null;
};
const historyItems = ref<GmailImportHistoryItem[]>([]);

const importedView = ref<"grid" | "list">("grid");
const importedSearch = ref("");
const importedStatusFilter = ref<string | null>(null);
const importedTypeFilter = ref<string | null>(null);
const importedSourceFilter = ref<string | null>(null);
const importedCategoryFilter = ref<string | null>(null);
const importedDateRange = ref<[number, number] | null>(null);
const importedPage = ref(1);
const importedPageSize = ref(12);
const selectedImportedDocumentIds = ref(new Set<string>());
const deletingImportedDocuments = ref(false);
const importedBusinessModal = ref<{
  show: boolean;
  doc: ImportedDocumentCard | null;
  value: string;
}>({ show: false, doc: null, value: "" });
useDevModal("gmail.assignBusiness", computed({
  get: () => importedBusinessModal.value.show,
  set: (v) => { importedBusinessModal.value.show = v; },
}));
const invoiceStatusOptions = computed<SelectOption[]>(() => [
  { label: l.value.common.statusNew, value: "new" },
  { label: l.value.common.statusReviewed, value: "reviewed" },
  { label: l.value.common.statusOutgoing, value: "outgoing" },
  { label: l.value.common.statusArchived, value: "archived" },
]);

// File type checkboxes
const fileTypes = ref({ pdf: true, doc: false, xls: false, img: false });

const fileTypeLabels = computed(() => ({ pdf: "PDF", doc: "DOC/DOCX", xls: "XLS/XLSX", img: l.value.common.images }));
const selectedTypeLabel = computed(() => {
  const labels = fileTypeLabels.value;
  const active = Object.entries(fileTypes.value).filter(([, v]) => v).map(([k]) => labels[k as keyof typeof labels]);
  return active.length ? active.join(" / ") : l.value.gmail.files;
});

// Extra filters
const filterType = ref<string>("none");
const filterSender = ref<string | null>(null);
const filterDateRange = ref<[number, number] | null>(null);
const filterIdentifierText = ref("");
const senderProviders = ref<GmailSearchProvider[]>([]);

const filterTypeOptions = computed<SelectOption[]>(() => [
  { label: l.value.gmail.none, value: "none" },
  { label: l.value.gmail.bySender, value: "sender" },
  { label: l.value.gmail.byDate, value: "date" },
  { label: l.value.gmail.byInspection, value: "inspection" },
]);

const senderOptions = computed<SelectOption[]>(() => senderProviders.value.map((option) => ({
  label: option.label,
  value: option.id,
})));
const senderQueryByValue = computed(() => new Map(senderProviders.value.map((option) => [option.id, option.terms])));

const filteredHistoryItems = computed<GmailImportHistoryItem[]>(() => {
  if (isAdmin.value || !selectedGuidedFlow.value) return historyItems.value;
  return historyItems.value
    .map((item) => ({
      ...item,
      files: (item.files ?? []).filter((file) => {
        if (!file.document) return false;
        return documentMatchesFlow(file.document, selectedGuidedFlow.value!);
      }),
    }))
    .filter((item) => (item.files ?? []).length > 0);
});

const importedDocuments = computed<ImportedDocumentCard[]>(() => filteredHistoryItems.value.flatMap((item) =>
  (item.files ?? [])
    .filter((file) => file.document)
    .map((file) => ({
      ...(file.document as GmailImportedDocument),
      sourceSubject: item.subject || "",
      sourceDate: item.imported_at || null,
      sourceMessageId: item.message_id,
      sourceFilename: file.filename,
      importStatus: file.import_status ?? null,
      importExplanation: file.import_explanation ?? null,
      importRetryable: Boolean(file.retryable),
      importRetryMode: file.retry_mode ?? null,
    })),
));

const importedStatusStrip = computed(() => {
  const counts: Record<string, number> = {};
  for (const doc of importedDocuments.value) {
    const status = doc.processing_status || "unknown";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return [
    { label: l.value.common.all, value: "", count: importedDocuments.value.length },
    { label: l.value.common.queued, value: "queued", count: counts.queued ?? 0 },
    { label: l.value.common.processing, value: "processing", count: counts.processing ?? 0 },
    { label: l.value.common.statusNew, value: "done", count: counts.done ?? 0 },
    { label: l.value.common.error, value: "error", count: counts.error ?? 0 },
  ];
});

function setImportedStatus(value: string) {
  importedStatusFilter.value = value || null;
}

const importedTypeOptions = computed<SelectOption[]>(() => uniqueOptions(
  importedDocuments.value.map((doc) => importedDocType(doc)),
));

const importedSourceOptions = computed<SelectOption[]>(() => uniqueOptions(
  importedDocuments.value.map((doc) => importedSupplier(doc)).filter((value) => value !== "ספק לא מזוהה"),
));

const importedCategoryOptions = computed<SelectOption[]>(() => uniqueOptions(
  importedDocuments.value.map((doc) => importedProviderCategory(doc)),
  providerCategoryLabel,
));

const filteredImportedDocuments = computed(() => {
  const query = importedSearch.value.trim().toLowerCase();
  return importedDocuments.value.filter((doc) => {
    if (importedStatusFilter.value && doc.processing_status !== importedStatusFilter.value) return false;
    if (importedTypeFilter.value && importedDocType(doc) !== importedTypeFilter.value) return false;
    if (importedSourceFilter.value && importedSupplier(doc) !== importedSourceFilter.value) return false;
    if (importedCategoryFilter.value && importedProviderCategory(doc) !== importedCategoryFilter.value) return false;
    if (importedDateRange.value) {
      const ts = importedDocumentTime(doc);
      const [from, to] = importedDateRange.value;
      if (!ts || ts < from || ts > to + 86_399_999) return false;
    }
    if (!query) return true;
    const haystack = [
      doc.file_name,
      doc.sourceSubject,
      importedSupplier(doc),
      importedProviderCategoryLabel(doc),
      importedDocType(doc),
      importedAmount(doc),
      importedDisplayDate(doc),
      doc.importExplanation,
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });
});

const pagedImportedDocuments = computed(() => {
  const start = (importedPage.value - 1) * importedPageSize.value;
  return filteredImportedDocuments.value.slice(start, start + importedPageSize.value);
});

const selectedImportedCount = computed(() => selectedImportedDocumentIds.value.size);
const pagedImportedIds = computed(() => pagedImportedDocuments.value.map((doc) => doc.id));
const allPagedImportedSelected = computed(() => (
  pagedImportedIds.value.length > 0
  && pagedImportedIds.value.every((id) => selectedImportedDocumentIds.value.has(id))
));
const somePagedImportedSelected = computed(() => pagedImportedIds.value.some((id) => selectedImportedDocumentIds.value.has(id)));

watch(
  [importedSearch, importedStatusFilter, importedTypeFilter, importedSourceFilter, importedCategoryFilter, importedDateRange, importedView],
  () => {
    importedPage.value = 1;
  },
);

watch(importedPageSize, () => {
  importedPage.value = 1;
});

watch(filteredImportedDocuments, (rows) => {
  const maxPage = Math.max(1, Math.ceil(rows.length / importedPageSize.value));
  if (importedPage.value > maxPage) importedPage.value = maxPage;
  pruneImportedSelection(rows);
});

function toggleImportedDocument(id: string, selected: boolean) {
  const next = new Set(selectedImportedDocumentIds.value);
  if (selected) next.add(id);
  else next.delete(id);
  selectedImportedDocumentIds.value = next;
}

function togglePagedImportedSelection(selected: boolean) {
  const next = new Set(selectedImportedDocumentIds.value);
  for (const id of pagedImportedIds.value) {
    if (selected) next.add(id);
    else next.delete(id);
  }
  selectedImportedDocumentIds.value = next;
}

function pruneImportedSelection(rows = filteredImportedDocuments.value) {
  const visible = new Set(rows.map((doc) => doc.id));
  const next = new Set([...selectedImportedDocumentIds.value].filter((id) => visible.has(id)));
  if (next.size !== selectedImportedDocumentIds.value.size) {
    selectedImportedDocumentIds.value = next;
  }
}

function onFilterChange() {
  filterSender.value = null;
  filterDateRange.value = null;
  filterIdentifierText.value = "";
}

const fileTypeMap: Record<string, string[]> = {
  pdf: ["pdf"],
  doc: ["doc", "docx"],
  xls: ["xls", "xlsx"],
  img: ["jpg", "jpeg", "png"],
};

function buildSearchQuery() {
  const parts: string[] = ["has:attachment"];

  const exts: string[] = [];
  for (const [key, extensions] of Object.entries(fileTypeMap)) {
    if (fileTypes.value[key as keyof typeof fileTypes.value]) {
      exts.push(...extensions);
    }
  }
  if (exts.length === 1) {
    parts.push(`filename:${exts[0]}`);
  } else if (exts.length > 1) {
    parts.push(`{${exts.map(e => `filename:${e}`).join(" ")}}`);
  }

  if (filterType.value === "sender" && filterSender.value) {
    parts.push(buildSenderQuery(filterSender.value));
  }
  if (filterType.value === "date" && filterDateRange.value) {
    const [from, to] = filterDateRange.value;
    parts.push(`after:${fmtDate(from)}`, `before:${fmtDate(to + 86400000)}`);
  }
  if (filterType.value === "inspection" && filterIdentifierText.value.trim()) {
    parts.push(`filename:${filterIdentifierText.value.trim()}`);
  }
  const templateTerms = selectedSearchTemplateTerms();
  if (templateTerms.length === 1) {
    parts.push(formatGmailSearchTerm(templateTerms[0]));
  } else if (templateTerms.length > 1) {
    parts.push(`{${templateTerms.map(formatGmailSearchTerm).join(" ")}}`);
  }
  if (selectedGuidedFlow.value === "inspection" && filterType.value !== "date") {
    parts.push("newer_than:16m");
  }

  searchQuery.value = parts.join(" ");
}

function guidedTemplateId(flow: "invoice" | "inspection"): string | null {
  const matcher = flow === "invoice"
    ? (template: DocTemplate) => template.document_kind === "invoice" || /חשבונית|קבלה|דרישת\s*תשלום/i.test(template.name)
    : (template: DocTemplate) => template.document_kind === "inspection_report" || /תסקיר|בדיקה|ציוד|הרמה/i.test(template.name);
  return templates.value.find(matcher)?.id ?? null;
}

function configureGuidedFlow(flow: "invoice" | "inspection") {
  selectedGuidedFlow.value = flow;
  const templateId = guidedTemplateId(flow);
  selectedTemplateId.value = templateId;
  searchTemplateId.value = templateId;
  fileTypes.value = flow === "invoice"
    ? { pdf: true, doc: true, xls: true, img: false }
      : {pdf: true, doc: true, xls: false, img: false};
  filterType.value = "none";
  filterSender.value = null;
  filterDateRange.value = null;
  filterIdentifierText.value = "";
  buildSearchQuery();
}

function selectGuidedFlow(flow: "invoice" | "inspection") {
  if (selectedGuidedFlow.value === flow && emails.value.length) return;
  configureGuidedFlow(flow);
  importedSearch.value = "";
  importedStatusFilter.value = null;
  importedTypeFilter.value = null;
  importedSourceFilter.value = null;
  importedCategoryFilter.value = null;
  importedDateRange.value = null;
  importedPage.value = 1;

  loadInbox();
}

function resetGuidedFlow() {
  selectedGuidedFlow.value = null;
  selectedTemplateId.value = null;
  searchTemplateId.value = null;
  emails.value = [];
  nextPageToken.value = null;
  totalEstimate.value = null;
  searchQuery.value = "";
}

function refreshCurrentFlow() {
  if (selectedGuidedFlow.value) configureGuidedFlow(selectedGuidedFlow.value);
  else buildSearchQuery();
  loadInbox();
}

function requestedGuidedFlow(): "invoice" | "inspection" | null {
  const queryFlow = String(route.query.flow ?? "");
  const storedFlow = sessionStorage.getItem("gmail:guided-flow") ?? "";
  const flow = queryFlow || storedFlow;
  sessionStorage.removeItem("gmail:guided-flow");
  return flow === "inspection" || flow === "invoice" ? flow : null;
}

function isInvoiceContext(): boolean {
  if (selectedGuidedFlow.value === "invoice") return true;
  const id = importTemplateId();
  const template = templates.value.find((t) => String(t.id) === id);
  if (!template) return false;
  return template.document_kind === "invoice" || /חשבונית|קבלה|דרישת\s*תשלום/i.test(template.name);
}

function selectedSearchTemplateTerms(): string[] {
  const template = templates.value.find((t) => String(t.id) === searchTemplateId.value);
  if (!template) return [];
  const candidates = [
    template.name,
    template.document_kind !== "unknown" ? template.document_kind : "",
    ...(template.match_keywords ?? []),
  ];
  const seen = new Set<string>();
  return candidates
    .map((term) => String(term ?? "").trim())
    .filter((term) => term.length >= 3)
    .filter((term) => {
      const key = term.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function formatGmailSearchTerm(term: string): string {
  return `"${term.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function buildSenderQuery(value: string): string {
  const mappedTerms = senderQueryByValue.value.get(value);
  if (mappedTerms?.length) {
    return `{${mappedTerms.map((term) => looksLikeDomain(term) ? `from:${term}` : formatGmailSearchTerm(term)).join(" ")}}`;
  }
  const freeValue = value.trim();
  return looksLikeDomain(freeValue) || freeValue.includes("@")
    ? `from:${freeValue}`
    : formatGmailSearchTerm(freeValue);
}

function looksLikeDomain(value: string): boolean {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value.trim());
}

function buildAndSearch() {
  buildSearchQuery();
  loadInbox();
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

async function previewAttachment(messageId: string, att: GmailAttachment) {
  const url = api.gmail.attachmentUrl(messageId, att.attachmentId, att.filename) + "&preview=1";
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank");
  } catch {
    window.$message?.error("שגיאה בטעינת הקובץ");
  }
}

async function downloadAttachment(messageId: string, att: GmailAttachment) {
  const url = api.gmail.attachmentUrl(messageId, att.attachmentId, att.filename);
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = att.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.$message?.error("שגיאה בהורדת הקובץ");
  }
}

function formatFrom(from: string) {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : from;
}

function formatDate(internalDate: string) {
  return new Date(Number(internalDate)).toLocaleDateString("he-IL");
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function connectGmail() {
  loading.value = true;
  try {
    const { url } = await api.gmail.authUrl();
    window.location.href = url;
  } catch (err: any) {
    if (err?.status === 403 || err?.message === "forbidden") {
      message.error("חיבור Gmail זמין במסלול עסקי בלבד");
    } else {
      message.error("שגיאה בהתחברות ל-Gmail");
    }
    loading.value = false;
  }
}

async function loadInbox() {
  loading.value = true;
  nextPageToken.value = null;
  try {
    const result = await api.gmail.inbox(searchQuery.value || undefined, undefined, undefined, importTemplateId());
    emails.value = result.emails;
    nextPageToken.value = result.nextPageToken;
    totalEstimate.value = result.resultSizeEstimate;
    linkOnlyContextActive.value = isInvoiceContext();
    if (linkOnlyContextActive.value) loadLinkOnlyEmails();
    else linkOnlyEmails.value = [];
  } catch (err: any) {
    if (err?.message?.includes("gmail_not_connected")) {
      connected.value = false;
    } else if (err?.message?.includes("gmail_auth_invalid")) {
      connected.value = false;
      message.error("ההרשאה ל-Gmail פגה או לא תקינה. נתק וחבר Gmail מחדש.");
    } else if (err?.status === 403 || err?.message === "forbidden") {
      message.error("גישה ל-Gmail זמינה למשתמשי Pro ומנהלים בלבד");
    } else {
      message.error("שגיאה בטעינת תיבת הדואר");
    }
  } finally {
    loading.value = false;
  }
}

let linkOnlyRequestId = 0;

async function loadLinkOnlyEmails() {
  linkOnlyDismissed.value = false;
  inlineOnlyDismissed.value = false;
  const requestId = ++linkOnlyRequestId;
  try {
    const result = await api.gmail.linkOnlyInbox(undefined, undefined, importTemplateId());
    if (requestId !== linkOnlyRequestId) return; // a newer call already superseded this one
    linkOnlyEmails.value = result.emails;
  } catch {
    if (requestId === linkOnlyRequestId) linkOnlyEmails.value = [];
  }
}

async function handleImportInline(row: GmailLinkOnlyEmail) {
  importingInlineId.value = row.id;
  try {
    const result = await api.gmail.importInline(row.id, importTemplateId());
    message.success(`יובאה חשבונית מ-${result.receipt.vendor}: ${result.receipt.amount} ${result.receipt.currency}`);
    linkOnlyEmails.value = linkOnlyEmails.value.filter((email) => email.id !== row.id);
  } catch (err: any) {
    if (String(err?.message ?? "").includes("not_a_recognized_inline_receipt")) {
      message.error("לא ניתן לייבא מייל זה אוטומטית");
    } else {
      message.error("שגיאה בייבוא המייל");
    }
  } finally {
    importingInlineId.value = null;
  }
}

async function loadMore() {
  if (!nextPageToken.value) return;
  loadingMore.value = true;
  try {
    const result = await api.gmail.inbox(searchQuery.value || undefined, undefined, nextPageToken.value, importTemplateId());
    emails.value = [...emails.value, ...result.emails];
    nextPageToken.value = result.nextPageToken;
  } catch {
    message.error("שגיאה בטעינת עמוד נוסף");
  } finally {
    loadingMore.value = false;
  }
}

async function disconnect() {
  await api.gmail.disconnect();
  connected.value = false;
  emails.value = [];
  message.success("Gmail נותק");
}

async function importAttachment(messageId: string, att: GmailAttachment) {
  importing.value = { ...importing.value, [att.attachmentId]: true };
  try {
    await api.gmail.importAttachment(messageId, att.attachmentId, att.filename, importTemplateId());
    message.success(`${att.filename} יובא בהצלחה`);
    loadHistory();
  } catch (err: any) {
    message.error(gmailErrorMessage(err));
  } finally {
    const next = { ...importing.value };
    delete next[att.attachmentId];
    importing.value = next;
  }
}

async function importAllNew() {
  importingAll.value = true;
  lastImportJob.value = null;
  try {
    const started = await api.gmail.importAll(searchQuery.value || undefined, undefined, importTemplateId());
    if (!started.jobId) throw new Error("gmail_import_job_missing");
    activeImportJob.value = started;
    message.info("ייבוא מ-Gmail התחיל ברקע");
    const result = await waitForGmailImportJob(started.jobId);
    lastImportJob.value = result;
    const errors = result.results.filter(r => r.error).length;
    importResults.value = {
      show: true,
      imported: result.imported,
      skipped: result.skipped,
      errors,
      results: result.results,
    };
    loadHistory();
  } catch (err: any) {
    message.error(`שגיאה בייבוא: ${gmailErrorMessage(err)}`);
  } finally {
    activeImportJob.value = null;
    importingAll.value = false;
  }
}

async function retryGmailImports(mode: "failed" | "rejected" | "retryable") {
  importingAll.value = true;
  lastImportJob.value = null;
  try {
    const started = await api.gmail.importRetry(mode, searchQuery.value || undefined, importTemplateId());
    if (!started.jobId) {
      message.info("אין כרגע קבצים שמתאימים לניסיון חוזר");
      lastImportJob.value = started;
      return;
    }
    activeImportJob.value = started;
    message.info("ניסיון חוזר לייבוא Gmail התחיל ברקע");
    const result = await waitForGmailImportJob(started.jobId);
    lastImportJob.value = result;
    importResults.value = {
      show: true,
      imported: result.imported,
      skipped: result.skipped,
      errors: result.results.filter(r => r.error).length,
      results: result.results,
    };
    loadHistory();
  } catch (err: any) {
    message.error(`שגיאה בניסיון חוזר: ${gmailErrorMessage(err)}`);
  } finally {
    activeImportJob.value = null;
    importingAll.value = false;
  }
}

async function waitForGmailImportJob(jobId: string): Promise<GmailImportJob> {
  let last: GmailImportJob | null = null;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    last = await api.gmail.importJob(jobId);
    activeImportJob.value = last;
    if (last.status === "completed") return last;
    if (last.status === "failed") throw new Error(last.error || "gmail_import_failed");
    await delay(2000);
  }
  throw new Error("gmail_import_timeout");
}

function delay(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function loadHistory() {
  try {
    const { history } = await api.gmail.importHistory();
    historyItems.value = history;
  } catch {}
}

onMounted(async () => {
  const setupPromise = Promise.all([
    api.docTemplates.list(),
    api.gmail.searchProviders(),
  ]).then(([rows, providerResult]) => {
    templates.value = rows;
    templateOptions.value = rows.map(t => ({
      label: `${t.name} (${t.document_kind})`,
      value: t.id,
    }));
    senderProviders.value = providerResult.providers;
  }).catch(() => {});

  // Handle OAuth callback with error
  const error = route.query.error as string | undefined;
  if (error) {
    if (error === "gmail_already_connected") {
      message.error("כתובת Gmail זו כבר מחוברת לחשבון אחר במערכת");
    } else {
      message.error(`שגיאת Gmail: ${error}`);
    }
    return;
  }

  loading.value = true;
  try {
    const status = await api.gmail.status();
    connected.value = status.connected;
    connectionSource.value = status.source;
    connectedEmail.value = status.email ?? null;
    if (status.connected) {
      await setupPromise;
      const requestedFlow = requestedGuidedFlow();
      if (requestedFlow) {
        configureGuidedFlow(requestedFlow);

        await Promise.all([loadInbox(), loadHistory()]);
      } else if (isAdmin.value) {
        buildSearchQuery();
        await Promise.all([loadInbox(), loadHistory()]);
      } else {
        configureGuidedFlow("invoice");

        await Promise.all([loadInbox(), loadHistory()]);
      }
    }
  } catch (err: any) {
    if (err?.message?.includes("gmail_auth_invalid")) {
      connected.value = false;
      message.error("ההרשאה ל-Gmail פגה או לא תקינה. חבר Gmail מחדש.");
    } else if (err?.status === 403 || err?.message === "forbidden") {
      message.error("גישה ל-Gmail זמינה למשתמשי Pro ומנהלים בלבד");
    }
  } finally {
    loading.value = false;
  }
});

function gmailErrorMessage(err: unknown): string {
  const messageText = err instanceof Error ? err.message : String(err ?? "");
  if (messageText.includes("gmail_auth_invalid")) {
    return "ההרשאה ל-Gmail פגה או לא תקינה. חבר Gmail מחדש.";
  }
  if (messageText.includes("gmail_scope_missing")) {
    return "חסרה הרשאת Gmail. חבר Gmail מחדש ואשר את ההרשאות.";
  }
  if (messageText.includes("gmail_permission_denied")) {
    return "אין הרשאה לגשת ל-Gmail.";
  }
  if (messageText.includes("gmail_rate_limited")) {
    return "Gmail מגביל כרגע את כמות הבקשות. נסה שוב בעוד רגע.";
  }
  if (messageText.includes("monthly_report_not_imported")) {
    return "דוח חודשי לא מיובא במסלול תסקיר בדיקה.";
  }
  return messageText || "שגיאת Gmail";
}

function importTemplateId(): string | undefined {
  if (selectedGuidedFlow.value) return guidedTemplateId(selectedGuidedFlow.value) ?? undefined;
  return selectedTemplateId.value ?? searchTemplateId.value ?? undefined;
}

function uniqueOptions(values: Array<string | null | undefined>, labeler?: (value: string) => string): SelectOption[] {
  const seen = new Set<string>();
  return values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .sort((a, b) => a.localeCompare(b, "he"))
    .map((value) => ({ label: labeler ? labeler(value) : value, value }));
}

function importedField(doc: ImportedDocumentCard, keys: string[]): string | null {
  for (const key of keys) {
    const value = doc.extracted_fields?.[key];
    if (value === undefined || value === null || value === "") continue;
    return String(value).trim() || null;
  }
  return null;
}

function importedSupplier(doc: ImportedDocumentCard): string {
  return importedField(doc, ["supplier_name", "vendor_name", "counterparty", "issuer_name", "company_name", "client_company"]) ?? "ספק לא מזוהה";
}

function importedProviderCategory(doc: ImportedDocumentCard): GmailSearchProvider["category"] | null {
  const provider = matchImportedProvider(doc);
  return provider?.category ?? null;
}

function importedProviderCategoryLabel(doc: ImportedDocumentCard): string {
  const category = importedProviderCategory(doc);
  return category ? providerCategoryLabel(category) : "לא מסווג";
}

function matchImportedProvider(doc: ImportedDocumentCard): GmailSearchProvider | null {
  const haystack = [
    importedSupplier(doc),
    doc.sourceSubject,
    doc.sourceFilename,
    doc.file_name,
    importedField(doc, ["supplier_id", "customer_number", "account_number", "service_address"]),
  ].join(" ").toLowerCase();
  let best: GmailSearchProvider | null = null;
  let bestScore = 0;
  for (const provider of senderProviders.value) {
    const terms = [provider.label, ...provider.terms].map((term) => term.trim()).filter((term) => term.length >= 2);
    for (const term of terms) {
      const needle = term.toLowerCase();
      if (!needle || !haystack.includes(needle)) continue;
      if (needle.length > bestScore) {
        best = provider;
        bestScore = needle.length;
      }
    }
  }
  return best;
}

function providerCategoryLabel(category: string): string {
  const labels: Record<string, string> = l.value.providerCategory;
  return labels[category] ?? category;
}

function importedDocType(doc: ImportedDocumentCard): string {
  const value = importedField(doc, ["document_subtype", "invoice_type", "receipt_type"]) ?? doc.document_type ?? doc.document_kind ?? "מסמך";
  const normalized = value.toLowerCase();
  if (/receipt|קבלה/.test(normalized)) return "קבלה";
  if (/order|הזמנה/.test(normalized)) return "אישור הזמנה";
  if (/payment|תשלום/.test(normalized)) return "אישור תשלום";
  if (/invoice|bill|חשבונית|חיוב/.test(normalized)) return "חשבונית";
  return value;
}

function documentMatchesFlow(doc: GmailImportedDocument, flow: "invoice" | "inspection"): boolean {
  const kind = String(doc.document_kind ?? "").toLowerCase();
  const type = String(doc.document_type ?? "").toLowerCase();
  const extractedType = String(doc.extracted_fields?.document_subtype ?? doc.extracted_fields?.invoice_type ?? doc.extracted_fields?.receipt_type ?? "").toLowerCase();
  const text = `${kind} ${type} ${extractedType}`;
  if (flow === "inspection") {
    return /inspection|תסקיר|בדיקה|ציוד|הרמה/.test(text);
  }
  return Boolean(doc.invoice_id) || /invoice|receipt|bill|חשבונית|קבלה|חיוב|דרישת\s*תשלום/.test(text);
}

function importedBusiness(doc: ImportedDocumentCard): string {
  return doc.business ?? importedField(doc, ["business", "business_name", "expense_business", "client_company", "client_name"]) ?? "Business";
}

function importedAmount(doc: ImportedDocumentCard): string {
  const raw = importedField(doc, ["amount", "total_amount", "amount_due", "total_to_pay", "total"]);
  if (!raw) return "—";
  const numeric = Number(String(raw).replace(/[₪$€£,\s]/g, ""));
  if (Number.isFinite(numeric)) {
    const currency = normalizeCurrencyCode(importedField(doc, ["currency"]) ?? raw);
    try {
      return new Intl.NumberFormat("he-IL", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(numeric);
    } catch {
      return `${numeric.toLocaleString("he-IL")} ${currency}`;
    }
  }
  return raw;
}

function normalizeCurrencyCode(value: unknown): string {
  const text = String(value ?? "").trim().toUpperCase();
  if (!text || /₪|ש"?ח|שקל|NIS|ILS/.test(text)) return "ILS";
  if (/\$|USD|DOLLAR/.test(text)) return "USD";
  if (/€|EUR/.test(text)) return "EUR";
  if (/£|GBP/.test(text)) return "GBP";
  if (/₽|RUB|RUR|РУБ/.test(text)) return "RUB";
  return /^[A-Z]{3}$/.test(text) ? text : "ILS";
}

function importedDateValue(doc: ImportedDocumentCard): string | null {
  return importedField(doc, ["issue_date", "invoice_date", "receipt_date", "date"]) ?? doc.import_date ?? doc.created_at ?? doc.sourceDate;
}

function importedDocumentTime(doc: ImportedDocumentCard): number | null {
  const value = importedDateValue(doc);
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function importedDisplayDate(doc: ImportedDocumentCard): string {
  const ts = importedDocumentTime(doc);
  return ts ? new Date(ts).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

function importedImportDate(doc: ImportedDocumentCard): string {
  const raw = doc.import_date ?? doc.created_at ?? doc.sourceDate;
  if (!raw) return "—";
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? new Date(ts).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

function importedStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    queued: "בתור",
    processing: "בעיבוד",
    done: "חדש",
    error: "שגיאה",
  };
  return labels[status] ?? status;
}

function importStatusLabel(status: string | null | undefined): string {
  const labels: Record<string, string> = {
    imported: "יובא",
    failed: "נכשל",
    rejected: "נדחה",
    skipped: "דולג",
    quota_limited: "מגבלה",
    missing_document: "חסר מסמך",
  };
  return labels[String(status ?? "imported")] ?? String(status ?? "יובא");
}

function importedDocPreviewSrc(doc: ImportedDocumentCard): string {
  return `${api.documents.downloadUrl(doc.id)}?raw=1`;
}

function importedDocThumbnailSrc(doc: ImportedDocumentCard): string | null {
  return doc.thumbnail_url ?? null;
}

function isPdfDoc(doc: ImportedDocumentCard): boolean {
  return doc.mime_type === "application/pdf" || doc.file_name.toLowerCase().endsWith(".pdf");
}

function isImageDoc(doc: ImportedDocumentCard): boolean {
  return Boolean(doc.mime_type?.startsWith("image/"));
}

function openImportedDocument(doc: ImportedDocumentCard) {
  window.open(`/documents/${doc.id}`, "_blank");
}

function downloadImportedDocument(doc: ImportedDocumentCard) {
  window.open(`${api.documents.downloadUrl(doc.id)}?dl=1`, "_blank");
}

function renderActionIcon(icon: Component) {
  return () => h(NIcon, { component: icon });
}

function importedDocActionOptions(doc: ImportedDocumentCard) {
  const c = l.value;
  return [
    { label: c.common.openDocument, key: "open", icon: renderActionIcon(EyeOutline) },
    { label: c.common.exportDocument, key: "download", icon: renderActionIcon(DownloadOutline) },
    { type: "divider", key: "d1" },
    {
      label: c.gmail.assignBusiness,
      key: "business",
      disabled: !doc.invoice_id,
      icon: renderActionIcon(BriefcaseOutline),
      children: [
        { label: "Business", key: "business:Business" },
        { label: `${c.gmail.assignBusiness}...`, key: "business:custom" },
      ],
    },
    {
      label: "הגדר קטגוריית הוצאה",
      key: "category",
      disabled: !doc.invoice_id,
      icon: renderActionIcon(PricetagOutline),
      children: [
        { label: "חשבוניות", key: "category:חשבוניות" },
        { label: "קבלות", key: "category:קבלות" },
      ],
    },
    { type: "divider", key: "d2" },
    {
      label: c.common.archive,
      key: "archive",
      disabled: !doc.invoice_id,
      icon: renderActionIcon(ArchiveOutline),
      props: { style: "color: var(--color-error, #d03050)" },
    },
    {
      label: c.common.deleteDocument,
      key: "delete",
      icon: renderActionIcon(TrashOutline),
      props: { style: "color: var(--color-error, #d03050)" },
    },
  ];
}

async function handleImportedDocAction(key: string, doc: ImportedDocumentCard) {
  if (key === "open") return openImportedDocument(doc);
  if (key === "download") return downloadImportedDocument(doc);
  if (key === "archive") return updateImportedInvoiceStatus(doc, "archived");
  if (key === "delete") return deleteImportedDocuments([doc]);
  if (key === "business:custom") return openImportedBusinessModal(doc);
  if (key.startsWith("business:")) return updateImportedInvoiceMeta(doc, { business: key.slice("business:".length) });
  if (key.startsWith("category:")) return updateImportedInvoiceMeta(doc, { expense_category: key.slice("category:".length) });
}

async function deleteSelectedImportedDocuments() {
  const selected = new Set(selectedImportedDocumentIds.value);
  const docs = importedDocuments.value.filter((doc) => selected.has(doc.id));
  await deleteImportedDocuments(docs);
}

async function deleteImportedDocuments(docs: ImportedDocumentCard[]) {
  if (!docs.length || deletingImportedDocuments.value) return;
  deletingImportedDocuments.value = true;
  try {
    const messageIds = [...new Set(docs.map((doc) => doc.sourceMessageId).filter(Boolean))];
    for (const doc of docs) {
      await api.documents.delete(doc.id);
    }
    for (const messageId of messageIds) {
      await api.gmail.deleteImportHistory(messageId);
    }
    removeImportedDocumentsFromHistory(new Set(docs.map((doc) => doc.id)), new Set(messageIds));
    message.success(docs.length === 1 ? "המסמך נמחק" : `${docs.length} מסמכים נמחקו`);
  } catch {
    message.error("שגיאה במחיקת המסמכים");
  } finally {
    deletingImportedDocuments.value = false;
  }
}

function removeImportedDocumentsFromHistory(documentIds: Set<string>, messageIds: Set<string>) {
  historyItems.value = historyItems.value
    .filter((item) => !messageIds.has(item.message_id))
    .map((item) => ({
      ...item,
      files: item.files?.filter((file) => !file.document?.id || !documentIds.has(file.document.id)),
    }))
    .filter((item) => (item.files ?? []).length > 0);
  selectedImportedDocumentIds.value = new Set([...selectedImportedDocumentIds.value].filter((id) => !documentIds.has(id)));
}

function openImportedBusinessModal(doc: ImportedDocumentCard) {
  importedBusinessModal.value = {
    show: true,
    doc,
    value: importedBusiness(doc) === "Business" ? "" : importedBusiness(doc),
  };
}

async function saveImportedBusinessModal() {
  const doc = importedBusinessModal.value.doc;
  const value = importedBusinessModal.value.value.trim();
  if (!doc || !value) return;
  await updateImportedInvoiceMeta(doc, { business: value });
  importedBusinessModal.value.show = false;
}

async function updateImportedInvoiceStatus(doc: ImportedDocumentCard, status: string) {
  if (!doc.invoice_id) return;
  try {
    const updated = await api.invoices.update(doc.invoice_id, { status });
    patchImportedInvoice(doc.id, updated);
    message.success("הסטטוס עודכן");
  } catch {
    message.error("שגיאה בעדכון הסטטוס");
  }
}

async function updateImportedInvoiceMeta(doc: ImportedDocumentCard, body: { business?: string; expense_category?: string }) {
  if (!doc.invoice_id) return;
  try {
    const updated = await api.invoices.update(doc.invoice_id, body);
    patchImportedInvoice(doc.id, updated);
    message.success("המסמך עודכן");
  } catch {
    message.error("שגיאה בעדכון המסמך");
  }
}

function patchImportedInvoice(documentId: string, invoice: Awaited<ReturnType<typeof api.invoices.update>>) {
  historyItems.value = historyItems.value.map((item) => ({
    ...item,
    files: item.files?.map((file) => file.document?.id === documentId
      ? {
          ...file,
          document: {
            ...file.document,
            invoice_id: invoice.id,
            invoice_status: invoice.status,
            possible_not_invoice: invoice.possible_not_invoice,
            invoice_validation_status: invoice.invoice_validation_status,
            missing_required_fields: invoice.missing_required_fields,
            business: invoice.business,
            expense_category: invoice.expense_category,
          },
        }
      : file),
  }));
}
</script>

<style scoped>
.gmail-page {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gmail-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}

.gmail-actions__select {
  min-width: 180px;
  width: 200px;
}

.rbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  line-height: 1;
  transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
  white-space: nowrap;
}

.rbtn:hover:not(.rbtn--primary):not(.rbtn--danger):not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}

.rbtn:active {
  transform: scale(0.97);
}

.rbtn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.rbtn--primary {
  background: var(--brand-color);
  border-color: var(--brand-color);
  color: var(--text-inverse, #fff);
  font-weight: 600;
}

.rbtn--primary:hover:not(:disabled) {
  background: var(--brand-color-hover);
  border-color: var(--brand-color-hover);
  color: var(--text-inverse, #fff);
}

.rbtn--primary:active:not(:disabled) {
  background: var(--brand-color-pressed);
  border-color: var(--brand-color-pressed);
}

.rbtn--danger {
  border-color: rgba(208, 48, 80, 0.35);
  color: #d03050;
}

.rbtn--danger:hover {
  background: rgba(208, 48, 80, 0.1);
  border-color: #d03050;
}

.rbtn--ghost-active {
  background: var(--bg-elevated);
  border-color: var(--brand-color);
  color: var(--brand-color);
}

.rbtn--loading {
  opacity: 0.75;
  pointer-events: none;
}

.rbtn--loading::before {
  content: "";
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-inline-start-color: transparent;
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
  flex: 0 0 auto;
}

.rbtn--icon {
  justify-content: center;
}

.refresh-icon--spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.filterbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 6px;
  background: var(--bg-elevated);
  border-radius: 14px;
  border: 1px solid var(--border-color);
}

.filterbar--compact {
  margin-top: -8px;
  padding: 5px;
  background: transparent;
  border: none;
}

.pill {
  padding: 8px 18px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.pill--compact {
  padding: 6px 13px;
  font-size: 12px;
}

.pill:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.pill--active {
  color: var(--brand-color);
  font-weight: 700;
  background: var(--bg-card);
  border: 2px solid var(--brand-color);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--brand-color) 55%, transparent);
}

.pill--active .pill__badge {
  background: color-mix(in srgb, var(--brand-color) 22%, transparent);
  color: inherit;
}

.pill__badge {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-hover);
  padding: 1px 6px;
  border-radius: 999px;
}

.gmail-section-nav {
  position: static;
  flex-direction: row;
  width: auto;
  min-width: 0;
  box-shadow: none;
}

.gmail-flow-tabs {
  max-width: 760px;
  margin: 0 auto 12px;
}

.toolbar,
.gmail-filter-bar,
.gmail-doc-filters {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.gmail-search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  width: 100%;
}
.gmail-search-bar__label {
  flex: 0 0 auto;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}
.gmail-search-bar .file-type-checks {
  margin: 0;
}
.gmail-search-bar__submit {
  margin-inline-start: auto;
}

.toolbar__search {
  flex: 1 1 260px;
  min-width: 220px;
}

.toolbar__type {
  width: 200px;
}

.toolbar__type--sm {
  width: 150px;
}

.toolbar__supplier {
  width: 260px;
}

.toolbar__dates {
  width: 260px;
}

.toolbar__view-toggle {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  margin-inline-start: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.toolbar__view-toggle .rbtn {
  min-height: 32px;
  min-width: 32px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
}

.toolbar__view-toggle .rbtn:hover {
  background: var(--bg-hover);
  border-color: transparent;
}

.toolbar__view-toggle .rbtn--ghost-active {
  background: var(--bg-card);
  border-color: transparent;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.link-only-notice {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  margin-bottom: 16px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
}

.link-only-notice__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--text-secondary);
}

.link-only-notice__text strong {
  color: var(--text-primary);
  font-size: 14px;
}

.link-only-notice__list {
  margin: 4px 0 0;
  padding-inline-start: 20px;
  font-size: 12px;
  max-height: 280px;
  overflow: auto;
}

.link-only-notice__list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 0;
}

.empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
  font-size: 14px;
}

.empty__icon {
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.mt-3 {
  margin-top: 12px;
}

.file-type-checks {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.guided-flow-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--brand-color) 32%, var(--border-color));
  border-radius: 12px;
  background: color-mix(in srgb, var(--brand-color) 7%, var(--bg-card));
}

.guided-flow-bar__label {
  display: block;
  margin-bottom: 2px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.guided-flow-bar__query {
  min-width: 0;
  max-width: 55%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: 12px;
  direction: ltr;
}

.gmail-search-section,
.gmail-docs-section {
  scroll-margin-top: 86px;
}

.inbox-table-block {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.inbox-cards {
  display: none;
}

.inbox-card {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.inbox-card__head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.inbox-card__from {
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inbox-card__date {
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.inbox-card__subject {
  color: var(--text-primary);
  font-size: 13px;
}

.inbox-card__file {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--border-color);
}

.inbox-card__file .inbox-file {
  min-width: 0;
  flex: 1 1 auto;
}

.load-more-wrap {
  display: flex;
  justify-content: center;
  padding: 10px 0;
}

.inbox-table-wrap {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  overflow: auto;
  max-height: min(53vh, 760px);
}

.inbox-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
}

.inbox-table th,
.inbox-table td {
  padding: 6px 8px;
  text-align: right;
  vertical-align: middle;
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
  line-height: 1.3;
}

.inbox-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  padding: 6px 8px;
}

.inbox-table tbody tr:last-child td {
  border-bottom: none;
}

.inbox-row:hover td {
  background: color-mix(in srgb, var(--brand-color) 5%, var(--bg-card));
}

.col-from { width: 34%; }
.col-subject { width: 18%; }
.col-date {
  width: 88px;
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: 12px;
}
.col-file { width: 16%; }
.col-actions {
  width: 108px;
  white-space: nowrap;
}

.col-from,
.col-subject,
.col-file {
  overflow: hidden;
}

.inbox-from,
.inbox-subject,
.inbox-file__name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inbox-from {
  font-weight: 600;
  font-size: 12px;
  color: var(--text-primary);
}

.inbox-subject {
  color: var(--text-primary);
  font-size: 12px;
}

.inbox-file {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.inbox-file__icon {
  flex: 0 0 auto;
  color: var(--brand-color);
}

.inbox-file__name {
  min-width: 0;
  flex: 1;
  font-size: 12px;
  font-weight: 600;
}

.inbox-row-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 2px;
}

.icon-btn {
  padding: 2px;
  min-width: 26px;
  min-height: 26px;
  justify-content: center;
}

.inbox-row-actions__tip {
  display: inline-flex;
}

.import-results__summary {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.import-results__stat {
  font-size: 15px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 8px;
}

.import-results__stat--ok {
  background: color-mix(in srgb, var(--brand-color) 15%, transparent);
  color: var(--brand-color);
}

.import-results__stat--skip {
  background: color-mix(in srgb, var(--text-secondary) 10%, transparent);
  color: var(--text-secondary);
}

.import-results__stat--err {
  background: color-mix(in srgb, #e74c3c 15%, transparent);
  color: #e74c3c;
}

.import-results__table {
  width: 100%;
  border-collapse: collapse;
}

.import-results__table th,
.import-results__table td {
  padding: 8px 10px;
  text-align: right;
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
}

.import-results__table th {
  font-weight: 700;
  color: var(--text-secondary);
}

.import-results__file {
  max-width: 350px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gmail-docs-section {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--border-color);
}

.gmail-docs-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.gmail-docs-title {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary);
}

.gmail-docs-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.gmail-docs-delete-selected {
  color: var(--color-error, #d03050);
}

.gmail-doc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.gmail-doc-card {
  min-width: 0;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.gmail-doc-card:hover {
  border-color: var(--brand-color);
  box-shadow: 0 10px 28px color-mix(in srgb, var(--text-primary) 10%, transparent);
  transform: translateY(-1px);
}

.gmail-doc-card__preview {
  position: relative;
  height: 220px;
  background: color-mix(in srgb, var(--bg-elevated) 82%, var(--bg-card));
  border-bottom: 1px solid var(--border-color);
  overflow: hidden;
}

.gmail-doc-card__preview img,
.gmail-doc-card__preview iframe {
  width: 100%;
  height: 100%;
  border: 0;
  object-fit: contain;
  background: var(--bg-card);
}

.gmail-doc-card__fallback {
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--text-secondary);
}

.gmail-doc-card__status {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 9px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--brand-color) 13%, var(--bg-card));
  color: var(--brand-color);
  font-size: 12px;
  font-weight: 700;
}

.gmail-doc-card__body {
  padding: 12px 14px 14px;
  min-width: 0;
}

.gmail-doc-card__supplier,
.gmail-doc-card__source,
.gmail-doc-table__file {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gmail-doc-card__supplier {
  font-size: 14px;
  font-weight: 800;
  color: var(--text-primary);
}

.gmail-doc-card__amount {
  margin-top: 4px;
  font-size: 20px;
  line-height: 1.2;
  font-weight: 800;
  color: var(--text-primary);
}

.gmail-doc-card__meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 9px;
  padding-top: 9px;
  border-top: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 12px;
}

.gmail-doc-card__category,
.gmail-doc-category {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 2px 8px;
  border: 1px solid color-mix(in srgb, var(--brand-color) 28%, var(--border-color));
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand-color) 8%, transparent);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.5;
  white-space: nowrap;
}

.gmail-doc-card__category {
  margin-top: 8px;
}

.gmail-doc-card__explain,
.gmail-import-explain {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-height: 23px;
  padding: 2px 8px;
  border-radius: 7px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.45;
}

.gmail-doc-card__explain {
  margin-top: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gmail-import-explain {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gmail-doc-card__explain--imported,
.gmail-import-explain--imported {
  background: color-mix(in srgb, var(--brand-color) 10%, var(--bg-card));
  color: var(--brand-color);
}

.gmail-doc-card__explain--failed,
.gmail-doc-card__explain--rejected,
.gmail-doc-card__explain--missing_document,
.gmail-import-explain--failed,
.gmail-import-explain--rejected,
.gmail-import-explain--missing_document {
  background: color-mix(in srgb, #d03050 12%, var(--bg-card));
  color: #d03050;
}

.gmail-doc-card__explain--quota_limited,
.gmail-doc-card__explain--skipped,
.gmail-import-explain--quota_limited,
.gmail-import-explain--skipped {
  background: color-mix(in srgb, #f0a020 13%, var(--bg-card));
  color: #c4841d;
}

.gmail-doc-card__source {
  margin-top: 8px;
  color: var(--text-muted);
  font-size: 12px;
}

.gmail-doc-table-wrap {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  overflow: auto;
}

.gmail-doc-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

.gmail-doc-table th,
.gmail-doc-table td {
  padding: 10px 12px;
  text-align: right;
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
  vertical-align: middle;
}

.gmail-doc-table__select-head,
.gmail-doc-table__select {
  width: 42px;
  text-align: center;
}

.gmail-doc-table th {
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.gmail-doc-table tbody tr:last-child td {
  border-bottom: none;
}

.gmail-doc-table-row {
  cursor: pointer;
}

.gmail-doc-table-row:hover td {
  background: color-mix(in srgb, var(--brand-color) 5%, var(--bg-card));
}

.gmail-doc-table-row:focus-visible td {
  outline: 2px solid color-mix(in srgb, var(--brand-color) 55%, transparent);
  outline-offset: -2px;
}

.cell-strong {
  font-weight: 700;
  color: var(--text-primary);
}

.gmail-doc-table__amount {
  font-weight: 700;
  white-space: nowrap;
}

.gmail-doc-table__actions-head,
.gmail-doc-table__actions {
  width: 56px;
  text-align: center;
}

.gmail-doc-status-select {
  min-width: 110px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 8px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 700;
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

.status-pill--queued,
.status-pill--processing {
  background: color-mix(in srgb, #f0a020 16%, var(--bg-card));
  color: #c4841d;
}

.status-pill--done {
  background: color-mix(in srgb, var(--brand-color) 13%, var(--bg-card));
  color: var(--brand-color);
}

.status-pill--error {
  background: color-mix(in srgb, #d03050 14%, var(--bg-card));
  color: #d03050;
}

.gmail-doc-pagination {
  display: flex;
  justify-content: center;
  padding-top: 16px;
}

.gmail-business-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.gmail-business-form__actions {
  display: flex;
  justify-content: flex-start;
  gap: 8px;
}

@media (max-width: 1480px) {
  .gmail-section-nav {
    overflow-x: auto;
  }
}

@media (max-width: 640px) {
  .gmail-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    width: 100%;
  }

  .gmail-actions__select,
  .gmail-actions__btn--full,
  .rbtn--danger {
    grid-column: 1 / -1;
    width: 100%;
  }

  .gmail-section-nav {
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
    padding-bottom: 2px;
  }

  .gmail-section-nav::-webkit-scrollbar {
    display: none;
  }

  .gmail-flow-tabs {
    max-width: none;
    width: 100%;
  }

  .guided-flow-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .guided-flow-bar__query {
    max-width: none;
  }

  .gmail-filter-bar,
  .gmail-doc-filters,
  .gmail-search-bar,
  .toolbar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
    gap: 8px;
  }

  .gmail-search-bar__label {
    grid-column: 1 / -1;
  }

  .file-type-checks {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 10px;
  }

  .toolbar__search,
  .toolbar__type,
  .toolbar__supplier,
  .toolbar__dates,
  .gmail-filter-bar > .rbtn,
  .gmail-filter-bar > .toolbar__dates,
  .gmail-search-bar > .rbtn,
  .gmail-search-bar > .toolbar__dates {
    width: 100%;
    min-width: 0;
  }

  .toolbar__search,
  .toolbar__dates,
  .gmail-filter-bar > .rbtn,
  .gmail-search-bar__submit {
    grid-column: 1 / -1;
    margin-inline-start: 0;
  }

  .gmail-doc-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 420px) {
  .gmail-actions {
    grid-template-columns: 1fr;
  }
}
</style>
