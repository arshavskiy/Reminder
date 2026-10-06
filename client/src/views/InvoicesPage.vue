<template>
  <div class="page2 invoices-page" :dir="dir">
    <PageHeader
      :title="l.invoices.tabLabel"
      :subtitle="l.invoices.subtitle"
    >
      <template #title-extra>
        <n-spin v-if="loading" :size="18" class="title-loader" />
      </template>
      <template #hero>
        <input
          ref="invoiceUploadInput"
          class="sr-only"
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          @change="onInvoiceUploadInputChange"
        />
        <MobileActionButton
          v-if="selectedInvoiceCount > 0"
          :disabled="loading || deletingSelected || batchEdit.saving"
          class="rbtn rbtn--ghost"
          type="button"
          @click="openBatchEdit"
          :label="l.invoicesMsg.edit">
          <template #icon>
            <n-icon :component="CreateOutline" class="btn-icon"/>
          </template>

          {{ l.invoicesMsg.edit }} ({{ selectedInvoiceCount }})
        </MobileActionButton>
        <MobileActionButton
          v-if="selectedInvoiceCount > 0"
          :class="{ 'rbtn--loading': deletingSelected }"
          :disabled="loading || deletingSelected"
          class="rbtn rbtn--danger"
          type="button"
          @click="confirmDeleteSelected"
          :label="t(&quot;common.deleteN&quot;, {n: selectedInvoiceCount})">
          <template #icon>
            <n-icon :component="TrashOutline" class="btn-icon"/>
          </template>

          {{ t("common.deleteN", {n: selectedInvoiceCount}) }}
        </MobileActionButton>
        <button
          :class="{ 'rbtn--loading': importingFromGmail }"
          :disabled="loading || importingFromGmail"
          class="rbtn rbtn--primary gmail-import-btn"
          type="button"
          @click="handleGmailImportButton"
        >
          <GmailLogo :size="16" class="btn-icon" />
          <span class="gmail-import-btn__label">{{ gmailImportButtonLabel }}</span>
        </button>
        <n-tooltip placement="top">
          <template #trigger>
            <button class="rbtn rbtn--ghost rbtn--icon" type="button" @click="showAlertsModal = true">
              <n-icon :component="NotificationsSharp" :size="16" class="alerts-bell-icon" />
            </button>
          </template>
          {{ l.expensesMsg.spendingAlerts }}
        </n-tooltip>
        <n-dropdown :options="heroMoreOptions" trigger="click" placement="bottom-end" @select="handleHeroMoreSelect">
          <button class="rbtn rbtn--ghost rbtn--icon" type="button">
            <n-icon :component="EllipsisVerticalOutline" :size="18" class="btn-icon" />
          </button>
        </n-dropdown>
      </template>
    </PageHeader>

    <SpendingAlertsModal v-model:show="showAlertsModal" :categories="[]" />

    <InvoiceSectionNav />

    <div v-if="gmailInvoiceScanAllowed" class="import-panel">
      <label class="import-panel__scan" :title="gmailConnected === false ? l.invoicesMsg.dailyScanNeedsGmail : undefined">
        <n-switch :value="invoicesAutoScan" :loading="invoicesAutoScanSaving" :disabled="gmailConnected === false" @update:value="setInvoicesAutoScan" />
        <span>
          <strong>{{ l.invoicesMsg.dailyScan }}</strong>
          <small>{{ gmailConnected === false ? l.invoicesMsg.dailyScanNeedsGmail : l.invoicesMsg.dailyScanHint }}</small>
        </span>
      </label>
    </div>

    <div
      v-if="isDigitalPlan && !warrantyNudgeDismissed"
      class="warranty-nudge"
      role="alert"
    >
      <n-icon :component="ShieldCheckmarkOutline" :size="18" class="warranty-nudge__icon" />
      <span>{{ l.invoicesMsg.warrantyNudge }}</span>
      <router-link :to="href('/discover-reminders')" class="rbtn rbtn--ghost rbtn--xs warranty-nudge__cta">
        {{ l.invoicesMsg.warrantyNudgeCta }}
      </router-link>
      <button class="btn btn--ghost btn--xs icon-btn warranty-nudge__close" type="button" @click="dismissWarrantyNudge">
        <n-icon :component="CloseOutline" :size="14" />
      </button>
    </div>

    <GmailImportJobStatus
      v-if="visibleGmailImportJob"
      :job="visibleGmailImportJob"
      :dismissible="!importingFromGmail"
      @dismiss="lastGmailImportJob = null"
    />
    <div
      v-if="(inlineOnlyLoading || inlineOnlyEmails.length) && !inlineOnlyDismissed"
      class="link-only-notice"
      :class="{ 'link-only-notice--pending': inlineOnlyLoading }"
      role="status"
      aria-live="polite"
    >
      <div class="link-only-notice__text">
        <strong class="link-only-notice__title">
          <n-spin v-if="inlineOnlyLoading" :size="18" />
          <n-icon v-else :component="MailOutline" :size="20" />
          <span v-if="inlineOnlyLoading">{{ l.invoicesMsg.inlineSearching }}</span>
          <span v-else>{{ t("invoicesMsg.inlineFound", {count: inlineOnlyEmails.length}) }}</span>
        </strong>
        <span v-if="inlineOnlyLoading">{{ l.invoicesMsg.inlineStillRunning }}</span>
        <span v-else>{{ l.invoicesMsg.inlineHint }}</span>
      </div>
      <button
        v-if="!inlineOnlyLoading"
        class="rbtn rbtn--primary"
        :class="{ 'rbtn--loading': importingFromGmail }"
        type="button"
        :disabled="importingFromGmail"
        @click="handleImportInlineAll"
      >
        <GmailLogo :size="16" class="btn-icon" />
        {{ importingFromGmail ? l.invoicesMsg.importing : l.invoicesMsg.importAll }}
      </button>
    </div>

    <div class="filterbar filterbar--compact">
      <ResponsiveFilterButton
        v-for="option in visibleDocumentCategoryPills"
        :key="option.value"
        type="button"
        class="pill pill--compact pill--soft"
        :class="{ 'pill--active': (filters.documentCategory ?? '') === option.value }"
        @click="setDocumentCategory(option.value)"

        :aria-pressed="(filters.documentCategory ?? '') === option.value"
        :count="option.count"
        :filter-key="option.value"
        :label="option.label"
      />
      <ResponsiveFilterButton
        v-if="unpaidDueCount > 0 || filters.unpaidOnly"
        type="button"
        class="pill pill--compact"
        :class="{ 'pill--active': filters.unpaidOnly }"
        @click="toggleUnpaid"
        :aria-pressed="filters.unpaidOnly"
        :count="unpaidDueCount"
        :label="l.invoicesMsg.toPay"
        filter-key="unpaid"
      />
      <ResponsiveFilterButton
        v-if="duplicatesCount > 0"
        type="button"
        class="pill pill--compact pill--warn"
        :class="{ 'pill--active': filters.duplicatesOnly }"
        @click="toggleDuplicates"
        :aria-pressed="filters.duplicatesOnly"
        :count="duplicatesCount"
        :label="l.common.duplicates"
        filter-key="duplicates"
      />
      <div class="filterbar__controls">
        <div class="toolbar__view-toggle">
          <n-tooltip placement="top">
            <template #trigger>
              <button
                :class="{ 'rbtn--ghost-active': viewMode === 'cards' }"
                :aria-label="l.common.cards"
                class="rbtn rbtn--ghost rbtn--icon"
                type="button"
                @click="viewMode = 'cards'"
              >
                <n-icon :component="GridOutline" :size="16" class="btn-icon"/>
              </button>
            </template>
            {{ l.common.cards }}
          </n-tooltip>
          <n-tooltip placement="top">
            <template #trigger>
              <button
                :class="{ 'rbtn--ghost-active': viewMode === 'table' }"
                :aria-label="l.common.tableView"
                class="rbtn rbtn--ghost rbtn--icon"
                type="button"
                @click="viewMode = 'table'"
              >
                <n-icon :component="ListOutline" :size="16" class="btn-icon"/>
              </button>
            </template>
            {{ l.common.tableView }}
          </n-tooltip>
        </div>
      </div>
    </div>

    <div class="presets-and-dates-row">
      <DateRangePresets v-model="dateRange" @change="load(true)" />
      <n-select
        v-model:value="filters.suppliers"
        :options="supplierOptions"
        clearable
        filterable
        multiple
        max-tag-count="responsive"
        :placeholder="l.invoices.supplierName"
        class="toolbar__supplier"
        @update:value="load(true)"
      />
      <n-date-picker
        v-model:value="dateRange"
        type="daterange"
        clearable
        class="toolbar__dates"
        @update:value="load(true)"
      />
    </div>

    <MobileFilterPanel :active-count="[filters.type, filters.category, filters.currency, filters.suppliers?.length, dateRange].filter(Boolean).length"
                       class="toolbar">
      <template #search>
        <n-input
        v-model:value="filters.q"
        clearable
        :placeholder="l.invoices.searchPlaceholder"
        class="toolbar__search"
        @keydown.enter="load(true)"
      />
      </template>
      <n-select
        v-model:value="filters.type"
        :options="typeOptions"
        clearable
        filterable
        :placeholder="l.gmail.docType"
        class="toolbar__type"
        @update:value="load(true)"
      />
      <n-select
        v-model:value="filters.category"
        :options="categoryOptions"
        clearable
        filterable
        :placeholder="l.common.category"
        class="toolbar__type"
        @update:value="load(true)"
      />
      <n-select
        v-if="currencyOptions.length > 1 || filters.currency"
        v-model:value="filters.currency"
        :options="currencyOptions"
        clearable
        :placeholder="l.invoicesMsg.currency"
        class="toolbar__currency"
        @update:value="load(true)"
      />
      <button
        v-if="suppliers.length >= 2"
        class="rbtn rbtn--ghost"
        type="button"
        @click="openVendorMergeModal"
      >
        <n-icon :component="BriefcaseOutline" class="btn-icon" />
        {{ l.invoices.mergeSuppliers }}
      </button>
      <!-- mobile-only: suppliers + dates inside panel -->
      <n-select
        v-model:value="filters.suppliers"
        :options="supplierOptions"
        clearable
        filterable
        multiple
        max-tag-count="responsive"
        :placeholder="l.invoices.supplierName"
        class="toolbar__supplier toolbar__supplier--mobile"
        @update:value="load(true)"
      />
      <n-date-picker
        v-model:value="dateRange"
        type="daterange"
        clearable
        class="toolbar__dates toolbar__dates--mobile"
        @update:value="load(true)"
      />
    </MobileFilterPanel>

    <DriveExportJobStatus
      v-if="visibleDriveExportJob"
      :job="visibleDriveExportJob"
      :dismissible="!exportingToDrive"
      @dismiss="lastDriveExportJob = null"
    />

    <div>
      <div v-if="!rows.length && !loading" class="empty">
        <n-icon :component="DocumentTextOutline" :size="48" class="empty__icon" />
        <p>{{ l.invoices.empty }}</p>
      </div>

      <div v-else-if="rows.length && viewMode === 'cards'" class="invoice-grid">
        <article
          v-for="row in rows"
          :key="row.id"
          class="invoice-card"
          @click="openDocument(row)"
        >
          <div class="invoice-card__preview">
            <img v-if="thumbnailSrc(row)" :src="thumbnailSrc(row)" :alt="row.file_name" loading="lazy" />
            <img v-else-if="isImage(row)" :src="previewSrc(row)" :alt="row.file_name" loading="lazy" />
            <iframe v-else-if="isPdf(row)" :src="previewSrc(row)" :title="row.file_name" loading="lazy" />
            <div v-else class="invoice-card__fallback">
              <n-icon :component="row.inline_no_file ? MailOutline : DocumentTextOutline" :size="42" />
              <span v-if="row.inline_no_file">{{ l.invoicesMsg.noFile }}</span>
            </div>
            <span class="invoice-card__status">{{ statusLabel(row.status) }}</span>
            <StorageSyncIcons
              class="invoice-card__storage"
              :in-s3="row.in_s3"
              :drive-synced="Boolean(row.drive_file_id)"
              :drive-busy="exportingToDrive && !row.drive_file_id"
              :drive-link="row.drive_web_link"
              :download-url="row.download_url"
            />
          </div>
          <div class="invoice-card__body">
            <div class="invoice-card__supplier" :title="row.supplier_name">
              {{ row.supplier_name }}
              <span v-if="row.inline_no_file" class="invoice-nofile-flag">{{ l.invoicesMsg.noFile }}</span>
            </div>
            <div class="invoice-card__amount">
              {{ row.currency !== 'ILS' && row.amount_ils !== null ? formatIlsAmount(row.amount_ils) : row.amount_display }}
              <span v-if="row.currency !== 'ILS' && row.amount_ils !== null" class="invoice-card__amount-ils">
                ({{ row.amount_display }})
              </span>
            </div>
            <div class="invoice-card__line">
              <span class="invoice-type-cell">
                <MobileMappedValue :label="invoiceTypeLabel(row)" :value="row.document_category || row.type"/>
                <MobileMappedValue :label="cashFlowLabel(row)" :value="row.cash_flow || 'expense'"
                                   class="invoice-type-cell__flow"/>
              </span>
              <span>{{ displayDate(row) }}</span>
            </div>
            <div class="invoice-card__line invoice-card__line--muted">
              <span>{{ l.common.category }}</span>
              <span class="invoice-category-chip" :title="row.provider_label || undefined">{{ invoiceProviderCategoryLabel(row) }}</span>
            </div>
            <div class="invoice-card__line invoice-card__line--muted">
              <span>{{ row.invoice_number || l.common.noNumber }}</span>
              <span>{{ row.billing_period || "" }}</span>
            </div>
          </div>
        </article>
      </div>

      <div v-else-if="rows.length && viewMode === 'table'" class="invoice-table-wrap">
        <table class="invoice-table">
          <colgroup>
            <col class="invoice-table__col invoice-table__col--select" />
            <col class="invoice-table__col invoice-table__col--supplier" />
            <col class="invoice-table__col invoice-table__col--date" />
            <col class="invoice-table__col invoice-table__col--client" />
            <col class="invoice-table__col invoice-table__col--category" />
            <col class="invoice-table__col invoice-table__col--type" />
            <col class="invoice-table__col invoice-table__col--amount" />
            <col class="invoice-table__col invoice-table__col--actions" />
          </colgroup>
          <thead>
            <tr>
              <th class="invoice-col invoice-col--select" @click.stop>
                <n-checkbox
                  :checked="allVisibleSelected"
                  :indeterminate="someVisibleSelected && !allVisibleSelected"
                  :aria-label="l.common.selectAllInvoices"
                  @update:checked="toggleSelectVisible"
                />
              </th>
              <th class="invoice-col invoice-col--supplier">
                <button class="invoice-sort-button" type="button" :aria-label="sortAriaLabel('supplier')" @click="setSort('supplier')">
                  <span>{{ l.common.supplier }}</span>
                  <n-icon :component="sortIcon('supplier')" :size="14" />
                </button>
              </th>
              <th class="invoice-col invoice-col--date">
                <button class="invoice-sort-button" type="button" :aria-label="sortAriaLabel('date')" @click="setSort('date')">
                  <span>{{ l.common.date }}</span>
                  <n-icon :component="sortIcon('date')" :size="14" />
                </button>
              </th>
              <th class="invoice-col invoice-col--client">
                <button class="invoice-sort-button" type="button" :aria-label="sortAriaLabel('client')" @click="setSort('client')">
                  <span>{{ l.common.client }}</span>
                  <n-icon :component="sortIcon('client')" :size="14" />
                </button>
              </th>
              <th class="invoice-col invoice-col--category">
                <button class="invoice-sort-button" type="button" :aria-label="sortAriaLabel('category')" @click="setSort('category')">
                  <span>{{ l.common.category }}</span>
                  <n-icon :component="sortIcon('category')" :size="14" />
                </button>
              </th>
              <th class="invoice-col invoice-col--type">
                <button class="invoice-sort-button" type="button" :aria-label="sortAriaLabel('type')" @click="setSort('type')">
                  <span>{{ l.common.type }}</span>
                  <n-icon :component="sortIcon('type')" :size="14" />
                </button>
<!--                <n-select-->
<!--                  :value="filters.documentCategory"-->
<!--                  :options="documentCategoryFilterOptions"-->
<!--                  clearable-->
<!--                  size="small"-->
<!--                  class="invoice-col-filter"-->
<!--                  placeholder="סינון סוג"-->
<!--                  @click.stop-->
<!--                  @mousedown.stop-->
<!--                  @update:value="setColumnDocumentCategory"-->
<!--                />-->
              </th>
              <th class="invoice-col invoice-col--amount">
                <button class="invoice-sort-button invoice-sort-button--amount" type="button" :aria-label="sortAriaLabel('amount')" @click="setSort('amount')">
                  <span>{{ l.common.amount }}</span>
                  <n-icon :component="sortIcon('amount')" :size="14" />
                </button>
              </th>
              <th class="invoice-col invoice-col--actions">{{ l.common.actions }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.id"
              class="invoice-table-row"
              tabindex="0"
              role="button"
              @click="openDocument(row)"
              @keydown.enter.prevent="openDocument(row)"
              @keydown.space.prevent="openDocument(row)"
            >
              <td class="invoice-col invoice-col--select" @click.stop>
                <n-checkbox
                  :checked="selectedInvoiceIds.has(row.id)"
                  :aria-label="t('invoicesMsg.selectInvoice', {supplier: row.supplier_name})"
                  @update:checked="(checked) => toggleSelectInvoice(row.id, checked)"
                />
              </td>
              <td class="cell-strong invoice-col invoice-col--supplier">
                <span class="invoice-supplier-cell">
                  <n-tooltip v-if="paymentVendorName(row)" placement="top">
                    <template #trigger>
                      <span class="invoice-vendor-mark" :aria-label="paymentVendorName(row) ?? undefined">
                        <svg v-if="paymentVendorKey(paymentVendorName(row)!) === 'play'" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                          <path fill="#4285F4" d="M1.2 2.1c0-.7.8-1.1 1.4-.7l5.2 3.1L4.2 8 1.2 2.1z"/>
                          <path fill="#34A853" d="M4.2 8 1.2 13.9c-.2.4-.2.9 0 1.2.3.4.8.6 1.3.3L8 12.1 4.2 8z"/>
                          <path fill="#FBBC04" d="M4.2 8 8 12.1l3.1-1.8L7.8 8 4.2 8z"/>
                          <path fill="#EA4335" d="M7.8 3.9 11.1 5.7c.6.3.6 1.2 0 1.6L8 9.1 4.2 8l3.6-4.1z"/>
                        </svg>
                        <svg v-else-if="paymentVendorKey(paymentVendorName(row)!) === 'paypal'" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                          <rect width="16" height="16" rx="4" fill="#003087"/>
                          <path fill="#009cde" d="M6.4 2.6h3c1.7 0 2.7.9 2.4 2.4-.3 1.6-1.6 2.4-3.2 2.4H7.4l-.5 2.8H5.3L6.4 2.6z"/>
                          <path fill="#fff" d="M5.6 3.2h2.7c1.4 0 2.2.7 2 1.9-.3 1.3-1.3 2-2.6 2H6.6l-.4 2.5H4.8L5.6 3.2z"/>
                        </svg>
                        <svg v-else-if="paymentVendorKey(paymentVendorName(row)!) === 'meta'" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                          <rect width="16" height="16" rx="4" fill="#0668E1"/>
                          <path fill="#fff" d="M3.2 10.6c.8-2.2 1.8-4.4 2.6-4.4.6 0 1 .8 1.6 2.2.5-1.2 1-2.2 1.6-2.2.9 0 1.8 2.2 2.6 4.4h-1.5c-.5-1.4-1-2.6-1.3-2.6-.3 0-.7.9-1.2 2.2l-.4.9-.4-.9C6.5 8.9 6.1 8 5.8 8c-.3 0-.8 1.2-1.3 2.6H3.2z"/>
                        </svg>
                        <svg v-else-if="paymentVendorKey(paymentVendorName(row)!) === 'hyp'" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                          <rect width="16" height="16" rx="4" fill="#0f766e"/>
                          <path fill="#fff" d="M4.2 3.4h1.6v3.4h3.2V3.4h1.6v9.2h-1.6V8.2H5.8v4.4H4.2V3.4z"/>
                        </svg>
                        <svg v-else viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                          <rect width="16" height="16" rx="4" fill="#64748b"/>
                          <text x="8" y="12" text-anchor="middle" font-size="10" font-weight="700" fill="#fff" font-family="Segoe UI, Arial">{{ paymentVendorName(row)?.slice(0, 1) }}</text>
                        </svg>
                      </span>
                    </template>
                    {{ paymentVendorName(row) }}
                  </n-tooltip>
                  <span class="invoice-cell-truncate" dir="auto" :title="row.supplier_name">{{ row.supplier_name }}</span>
                  <n-tooltip v-if="row.paired_with" placement="top">
                    <template #trigger>
                      <span class="invoice-pair-tag">{{ row.pair_role === 'receipt' ? l.invoicesMsg.receiptOfInvoice : l.invoicesMsg.paidByReceipt }}</span>
                    </template>
                    {{ l.invoicesMsg.pairedTooltip }}
                  </n-tooltip>
                  <span v-if="row.inline_no_file" class="invoice-nofile-flag">
                    <n-icon :component="MailOutline" :size="14" />
                  </span>
                  <span class="invoice-supplier-cell__meta">
                    <span class="invoice-supplier-cell__client invoice-cell-truncate" dir="auto" :title="clientLabel(row)">{{ clientLabel(row) }}</span>
                  </span>
                </span>
              </td>
              <td class="invoice-col invoice-col--date">{{ isMobile ? formatDateShort(row.issue_date) : formatDate(row.issue_date) }}</td>
              <td class="invoice-col invoice-col--client">
                <span class="invoice-cell-truncate" dir="auto" :title="clientLabel(row)">{{ clientLabel(row) }}</span>
              </td>
              <td class="invoice-col invoice-col--category">
                <div class="category-desktop">
                  <n-select
                      :options="providerCategoryOptions"
                      :placeholder="l.common.uncategorized"
                      :value="row.provider_category"
                      class="invoice-category-select"
                      clearable
                      filterable
                      size="small"
                      @click.stop
                      @update:value="(value) => updateInvoiceProviderCategory(row, value)"
                  />
                </div>
                <n-popover placement="bottom" trigger="click">
                  <template #trigger>
                    <button :aria-label="invoiceProviderCategoryLabel(row)" class="btn btn--ghost btn--xs icon-btn category-mobile"
                            type="button" @click.stop>
                      <MobileMappedValue :focusable="false" :label="invoiceProviderCategoryLabel(row)"
                                         :value="row.provider_category"/>
                    </button>
                  </template>
                  <div style="width: 220px">
                    <n-select
                  :options="providerCategoryOptions"
                  :placeholder="l.common.uncategorized"
                  :value="row.provider_category"
                  class="invoice-category-select"
                  clearable
                  filterable
                  size="small"
                  @click.stop
                  @update:value="(value) => updateInvoiceProviderCategory(row, value)"
                    />
                  </div>
                </n-popover>
              </td>
              <td class="invoice-col invoice-col--type">
                <span class="invoice-type-cell">
                  <MobileMappedValue :label="invoiceTypeLabel(row)" :value="row.document_category || row.type"/>
                  <MobileMappedValue v-if="!isMobile" :label="cashFlowLabel(row)" :value="row.cash_flow || 'expense'"
                                     class="invoice-type-cell__flow"/>
                </span>
              </td>
              <td class="cell-amount invoice-col invoice-col--amount">
                {{ row.currency !== 'ILS' && row.amount_ils !== null ? (isMobile ? formatIlsAmountPlain(row.amount_ils) : formatIlsAmount(row.amount_ils)) : row.amount_display }}
                <span v-if="row.currency !== 'ILS' && row.amount_ils !== null" class="cell-amount__ils">
                  ({{ row.amount_display }})
                </span>
              </td>
              <td class="cell-actions invoice-col invoice-col--actions" @click.stop>
                <div class="row-actions">
                  <StorageSyncIcons
                    compact
                    :in-s3="row.in_s3"
                    :drive-synced="Boolean(row.drive_file_id)"
                    :drive-busy="exportingToDrive && !row.drive_file_id"
                    :drive-link="row.drive_web_link"
                    :download-url="row.download_url"
                  />
                  <n-dropdown
                    :options="invoiceActionOptions(row)"
                    placement="bottom-start"
                    trigger="click"
                    @select="(key: string) => handleInvoiceAction(key, row)"
                  >
                    <button class="btn btn--ghost btn--xs icon-btn invoice-row-action" type="button" :aria-label="l.common.actions">
                      <n-icon :component="EllipsisVerticalOutline" class="btn-icon" />
                    </button>
                  </n-dropdown>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="total > pageSize" class="invoice-pagination">
        <n-pagination
          v-model:page="page"
          v-model:page-size="pageSize"
          :item-count="total"
          :page-sizes="[10, 20, 50, 100]"
          :show-size-picker="!isMobile"
          :page-slot="isMobile ? 5 : 9"
          :simple="isMobile"
          @update:page="() => load(false)"
          @update:page-size="() => load(true)"
        />
      </div>
    </div>

    <n-modal
      v-model:show="businessModal.show"
      preset="card"
      :title="l.invoices.assignClient"
      class="invoice-business-modal"
      :style="{ width: '460px', maxWidth: 'calc(100vw - 32px)' }"
    >
      <div class="invoice-business-form" :dir="dir">
        <n-input
          v-model:value="businessModal.value"
          clearable
          :placeholder="l.common.clientName"
          @keydown.enter="saveBusinessModal"
        />
        <div class="invoice-business-form__actions">
          <n-button @click="businessModal.show = false">{{ l.common.cancel }}</n-button>
          <n-button type="primary" :disabled="!businessModal.value.trim()" @click="saveBusinessModal">
            {{ l.common.save }}
          </n-button>
        </div>
      </div>
    </n-modal>

    <n-modal
      v-model:show="vendorMergeModal.show"
      preset="card"
      :title="l.invoices.mergeSuppliers"
      class="invoice-vendor-merge-modal"
      :style="{ width: '560px', maxWidth: 'calc(100vw - 32px)' }"
    >
      <div class="invoice-business-form" :dir="dir">
        <label class="invoice-form-label">
          {{ l.invoices.mergeNames }}
          <n-select
            v-model:value="vendorMergeModal.sourceNames"
            :options="supplierOptions"
            clearable
            filterable
            multiple
            max-tag-count="responsive"
            :placeholder="l.invoices.pickSuppliers"
          />
        </label>
        <label class="invoice-form-label">
          {{ l.invoices.unifiedName }}
          <n-select
            v-model:value="vendorMergeModal.canonicalName"
            :options="supplierOptions"
            clearable
            filterable
            tag
            :placeholder="l.invoices.unifiedName"
          />
        </label>
        <p class="invoice-form-hint">
          {{ l.invoices.mergeHint }}
        </p>
        <div class="invoice-business-form__actions">
          <n-button @click="vendorMergeModal.show = false">{{ l.common.cancel }}</n-button>
          <n-button
            type="primary"
            :loading="vendorMergeModal.saving"
            :disabled="vendorMergeModal.sourceNames.length < 2 || !String(vendorMergeModal.canonicalName ?? '').trim()"
            @click="saveVendorMerge"
          >
            {{ l.invoices.mergeSave }}
          </n-button>
        </div>
      </div>
    </n-modal>
    <n-modal
      v-model:show="batchEdit.show"
      preset="card"
      :title="l.invoicesMsg.batchTitle"
      class="invoice-business-modal"
      :closable="!batchEdit.saving"
      :mask-closable="!batchEdit.saving"
    >
      <div class="invoice-business-form">
        <p class="invoice-form-hint">{{ t("invoicesMsg.batchHint", {count: selectedInvoiceCount}) }}</p>
        <label class="invoice-form-label">
          <span>{{ l.invoicesMsg.docType }}</span>
          <n-select
            v-model:value="batchEdit.documentCategory"
            :options="documentCategoryFilterOptions"
            clearable
            :placeholder="l.invoicesMsg.noChange"
          />
        </label>
        <label class="invoice-form-label">
          <span>{{ l.invoicesMsg.cashFlow }}</span>
          <n-select
            v-model:value="batchEdit.cashFlow"
            :options="cashFlowFilterOptions"
            clearable
            :placeholder="l.invoicesMsg.noChange"
          />
        </label>
        <label class="invoice-form-label">
          <span>{{ l.invoicesMsg.category }}</span>
          <n-select
            v-model:value="batchEdit.providerCategory"
            :options="providerCategoryOptions"
            clearable
            filterable
            :placeholder="l.invoicesMsg.noChange"
          />
        </label>
        <div class="invoice-business-form__actions">
          <n-button :disabled="batchEdit.saving" @click="batchEdit.show = false">{{ l.common.cancel }}</n-button>
          <n-button
            type="primary"
            :loading="batchEdit.saving"
            :disabled="!batchEdit.documentCategory && !batchEdit.cashFlow && !batchEdit.providerCategory"
            @click="saveBatchEdit"
          >
            {{ l.invoicesMsg.update }}
          </n-button>
        </div>
      </div>
    </n-modal>
    <MonthlyReportModal v-model:show="showMonthlyReport"/>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: "InvoicesPage" });
import MobileMappedValue from "../components/MobileMappedValue.vue";
import ResponsiveFilterButton from "../components/ResponsiveFilterButton.vue";
import MobileFilterPanel from "../components/MobileFilterPanel.vue";
import MobileActionButton from "../components/MobileActionButton.vue";
import { computed, h, onMounted, onUnmounted, reactive, ref, watch, type Component } from "vue";
import { useRouter } from "vue-router";
import {
  NPopover,
  NButton,
  NCheckbox,
  NDatePicker,
  NDropdown,
  NIcon,
  NInput,
  NModal,
  NPagination,
  NSelect,
  NSpin,
  NSwitch,
  NTooltip,
  useMessage,
  type SelectOption
} from "naive-ui";
import {
  ArchiveOutline,
  ArrowDownOutline,
  ArrowUpOutline,
  BriefcaseOutline,
  CloudUploadOutline,
  CreateOutline,
  DocumentTextOutline,
  DownloadOutline,
  CloseOutline,
  EllipsisVerticalOutline,
  EyeOutline,
  GridOutline,
  ListOutline,
  MailOutline,
  NotificationsSharp,
  PricetagOutline,
  RefreshOutline,
  ShieldCheckmarkOutline,
  SwapVerticalOutline,
  TrashOutline,
} from "@vicons/ionicons5";
import PageHeader from "../components/PageHeader.vue";
import {useI18n} from "../composables/useI18n.js";
import {useDevModal} from "../composables/useDevModal.js";
import InvoiceSectionNav from "../components/InvoiceSectionNav.vue";
import SpendingAlertsModal from "../components/SpendingAlertsModal.vue";
import DateRangePresets from "../components/DateRangePresets.vue";
import GmailLogo from "../components/GmailLogo.vue";
import GoogleDriveLogo from "../components/GoogleDriveLogo.vue";
import StorageSyncIcons from "../components/StorageSyncIcons.vue";
import MonthlyReportModal from "../components/MonthlyReportModal.vue";
import GmailImportJobStatus from "../components/GmailImportJobStatus.vue";
import DriveExportJobStatus from "../components/DriveExportJobStatus.vue";
import { api, type DriveExportJob, type GmailImportJob, type GmailLinkOnlyEmail, type ImportedInvoice } from "../services/apiService.js";
import type { DocTemplate } from "../shared/types.js";
import {useAuthStore} from "../stores/auth.js";
import {userAllowsGmailInvoiceImport, featureFlagsForUser, planAllowsGoogleDrive, planAllowsExcelExport, resolveUserPlan, PLAN_GATE_MESSAGES} from "../shared/pricingPlans.js";
import {useConfirm} from "../composables/useConfirm.js";
import {usePersistedTableState} from "../composables/useTableState.js";
import {useUserSettingsStore} from "../stores/userSettings.js";
import {resolveDateRangePreset} from "../shared/dateRangePresets";
import {asString, asStringArray, decodeDateRange, encodeDateRange, pickOne} from "../shared/tableState";

const router = useRouter();
const {l, dir, t, locale, intl} = useI18n();
const intlLocale = computed(() => (intl.value));
const message = useMessage();
const {confirm} = useConfirm();
const authStore = useAuthStore();
const userSettingsStore = useUserSettingsStore();
const driveAllowed = computed(() => planAllowsGoogleDrive(resolveUserPlan(authStore.user)));
const excelAllowed = computed(() => planAllowsExcelExport(resolveUserPlan(authStore.user)));
const isDigitalPlan = computed(() => resolveUserPlan(authStore.user) === "digital");
const warrantyNudgeDismissed = ref((() => { try { return localStorage.getItem("invoices:warrantyNudgeDismissed") === "1"; } catch { return false; } })());
function dismissWarrantyNudge() { warrantyNudgeDismissed.value = true; try { localStorage.setItem("invoices:warrantyNudgeDismissed", "1"); } catch {} }
const exportAllowed = computed(() => featureFlagsForUser(authStore.user).excelExport);
const excelExportLockedMessage = PLAN_GATE_MESSAGES.excelExport;

const rows = ref<ImportedInvoice[]>([]);
const total = ref(0);
const totalAll = ref(0);
const visibleLimit = ref<number | null>(null);
const loading = ref(false);
const exporting = ref(false);
const showAlertsModal = ref(false);
const heroMoreOptions = computed(() => [
  { key: "upload",        label: l.value.common.upload,              icon: () => h(NIcon, { component: CloudUploadOutline }) },
  { key: "refresh",       label: l.value.common.refresh,             icon: () => h(NIcon, { component: RefreshOutline }) },
  { key: "excel",         label: l.value.common.exportExcel,         icon: () => h(NIcon, { component: DownloadOutline }),   disabled: !exportAllowed.value || !excelAllowed.value || total.value === 0 },
  { key: "sixmonth",      label: l.value.invoices.sixMonth,          icon: () => h(NIcon, { component: MailOutline }),        disabled: !exportAllowed.value || !excelAllowed.value },
  { key: "drive",         label: l.value.documents.driveExport,      icon: () => h(NIcon, { component: DownloadOutline }),    disabled: !driveAllowed.value },
  { key: "monthly",       label: l.value.documents.monthlyReport,    icon: () => h(NIcon, { component: DocumentTextOutline }), disabled: !exportAllowed.value },
]);

function handleHeroMoreSelect(key: string) {
  if (key === "upload") openInvoiceUploadPicker();
  else if (key === "refresh") load(true);
  else if (key === "excel") exportInvoicesToExcel();
  else if (key === "sixmonth") sendSixMonthInvoiceReport();
  else if (key === "drive") handleDriveExport();
  else if (key === "monthly") openMonthlyReport();
}
const deletingSelected = ref(false);
const uploadingInvoices = ref(false);
const sendingSixMonthReport = ref(false);
const showMonthlyReport = ref(false);
const exportingToDrive = ref(false);
const importingFromGmail = ref(false);
const activeGmailImportJob = ref<GmailImportJob | null>(null);
const lastGmailImportJob = ref<GmailImportJob | null>(null);
const activeDriveExportJob = ref<DriveExportJob | null>(null);
const lastDriveExportJob = ref<DriveExportJob | null>(null);
const gmailConnected = ref<boolean | null>(null);
const inlineOnlyEmails = ref<GmailLinkOnlyEmail[]>([]);
const inlineOnlyLoading = ref(false);
const inlineOnlyDismissed = ref(false);
const importingInlineId = ref<string | null>(null);
const viewMode = ref<"cards" | "table">("table");
const invoiceUploadInput = ref<HTMLInputElement | null>(null);
const selectedInvoiceIds = ref(new Set<string>());
// Opens on the last three months; a saved choice (including all time) replaces it below.
const dateRange = ref<[number, number] | null>(resolveDateRangePreset("3m"));
const page = ref(1);
const pageSize = ref(20);
type InvoiceSortKey = "supplier" | "status" | "date" | "client" | "category" | "type" | "amount" | "dueDate";
const sortBy = ref<InvoiceSortKey>("date");
const sortDir = ref<"asc" | "desc">("desc");
const counts = ref<Record<string, number>>({});
const documentCategoryCounts = ref<Record<string, number>>({});
const types = ref<string[]>([]);
const categories = ref<string[]>([]);
const suppliers = ref<string[]>([]);
const currencies = ref<string[]>([]);
const duplicatesCount = ref(0);
const unpaidDueCount = ref(0);
const filters = reactive({
  q: "",
  status: null as string | null,
  type: null as string | null,
  documentCategory: null as ImportedInvoice["document_category"] | null,
  category: null as string | null,
  currency: null as string | null,
  suppliers: [] as string[],
  duplicatesOnly: false,
  unpaidOnly: false,
});
// Remember the filters, date range, sort and page size between visits. Free-text
// search is left out on purpose: a forgotten search term makes the list look empty.
const PAGE_SIZES = [10, 20, 50, 100] as const;
const SORT_KEYS: InvoiceSortKey[] = ["supplier", "status", "date", "client", "category", "type", "amount", "dueDate"];
usePersistedTableState("invoices", {
  snapshot: () => ({
    status: filters.status,
    type: filters.type,
    documentCategory: filters.documentCategory,
    category: filters.category,
    currency: filters.currency,
    suppliers: [...filters.suppliers],
    duplicatesOnly: filters.duplicatesOnly,
    unpaidOnly: filters.unpaidOnly,
    dateRange: encodeDateRange(dateRange.value),
    sortBy: sortBy.value,
    sortDir: sortDir.value,
    pageSize: pageSize.value,
  }),
  restore: (saved) => {
    filters.status = asString(saved.status);
    filters.type = asString(saved.type);
    filters.documentCategory = asString(saved.documentCategory) as typeof filters.documentCategory;
    filters.category = asString(saved.category);
    filters.currency = asString(saved.currency);
    filters.suppliers = asStringArray(saved.suppliers);
    filters.duplicatesOnly = saved.duplicatesOnly === true;
    filters.unpaidOnly = saved.unpaidOnly === true;
    const range = decodeDateRange(saved.dateRange);
    if (range !== undefined) dateRange.value = range;
    sortBy.value = pickOne(saved.sortBy, SORT_KEYS, "date");
    sortDir.value = pickOne(saved.sortDir, ["asc", "desc"] as const, "desc");
    pageSize.value = pickOne(saved.pageSize, PAGE_SIZES, 20);
  },
});
const businessModal = reactive({
  show: false,
  row: null as ImportedInvoice | null,
  value: "",
});
const vendorMergeModal = reactive({
  show: false,
  sourceNames: [] as string[],
  canonicalName: "" as string | null,
  saving: false,
});
useDevModal("invoices.assignClient", businessModal);
useDevModal("invoices.mergeSuppliers", vendorMergeModal);

const statusOptions = computed<SelectOption[]>(() => statusStrip.value.map((item) => ({
  label: `${item.label} (${item.count})`,
  value: item.value,
})));
const invoiceStatusOptions = computed<SelectOption[]>(() => [
  { label: l.value.common.statusNew, value: "new" },
  { label: l.value.common.statusReviewed, value: "reviewed" },
  { label: l.value.common.statusOutgoing, value: "outgoing" },
  { label: l.value.common.statusArchived, value: "archived" },
]);
const typeOptions = computed<SelectOption[]>(() => types.value.map((value) => ({ label: value, value })));
const cashFlowFilterOptions = computed<SelectOption[]>(() => [
  { label: l.value.common.expense, value: "expense" },
  { label: l.value.common.income, value: "income" },
]);
const categoryOptions = computed<SelectOption[]>(() => {
  const values = [...PROVIDER_CATEGORIES] as string[];
  for (const value of categories.value) {
    if (value && !values.includes(value)) values.push(value);
  }
  return values.map((value) => ({
    label: providerCategoryLabel(value),
    value,
  }));
});
const CURRENCY_SYMBOLS: Record<string, string> = { ILS: "₪", USD: "$", EUR: "€", GBP: "£", RUB: "₽", THB: "฿", GEL: "₾" };
const currencyOptions = computed<SelectOption[]>(() => currencies.value.map((code) => ({
  label: CURRENCY_SYMBOLS[code] ? `${CURRENCY_SYMBOLS[code]} ${code}` : code,
  value: code,
})));
const providerCategoryOptions = computed<SelectOption[]>(() => PROVIDER_CATEGORIES.map((value) => ({
  label: providerCategoryLabel(value),
  value,
})));
const supplierOptions = computed<SelectOption[]>(() => [
  {label: l.value.common.unidentifiedSupplier, value: "__unidentified__"},
  ...suppliers.value.map((value) => ({label: value, value})),
]);
const gmailImportButtonLabel = computed(() => gmailConnected.value === false ? l.value.common.connectGmail : l.value.common.importAll);
const visibleGmailImportJob = computed(() => activeGmailImportJob.value ?? lastGmailImportJob.value);
const visibleDriveExportJob = computed(() => activeDriveExportJob.value ?? lastDriveExportJob.value);
const selectedInvoiceCount = computed(() => selectedInvoiceIds.value.size);
const visibleRowIds = computed(() => rows.value.map((row) => row.id));
const someVisibleSelected = computed(() => visibleRowIds.value.some((id) => selectedInvoiceIds.value.has(id)));
const allVisibleSelected = computed(() => (
  visibleRowIds.value.length > 0 && visibleRowIds.value.every((id) => selectedInvoiceIds.value.has(id))
));
const statusStrip = computed(() => [
  { label: l.value.common.statusNew, value: "new", count: counts.value.new ?? 0 },
  { label: l.value.common.statusReviewed, value: "reviewed", count: counts.value.reviewed ?? 0 },
  { label: l.value.common.statusOutgoing, value: "outgoing", count: counts.value.outgoing ?? 0 },
  { label: l.value.common.statusArchived, value: "archived", count: counts.value.archived ?? 0 },
]);
const documentCategoryFilterOptions = computed<SelectOption[]>(() =>
  documentCategoryStrip.value
    .filter((option) => option.value)
    .map((option) => ({ label: option.label, value: option.value })),
);
const documentCategoryStrip = computed(() => [
  { label: l.value.common.all, value: "", count: totalAll.value },
  { label: l.value.invoices.title, value: "invoice", count: documentCategoryCounts.value.invoice ?? 0 },
  { label: l.value.common.receipts, value: "receipt", count: documentCategoryCounts.value.receipt ?? 0 },
  { label: l.value.common.bills, value: "bill", count: documentCategoryCounts.value.bill ?? 0 },
  { label: l.value.common.paymentRequests, value: "payment_request", count: documentCategoryCounts.value.payment_request ?? 0 },
  { label: l.value.common.creditNotes, value: "credit_note", count: documentCategoryCounts.value.credit_note ?? 0 },
]);

// Keep the full option lists for column filters; only simplify the quick pills.
const visibleDocumentCategoryPills = computed(() =>
  documentCategoryStrip.value.filter((option) => option.value !== "bill" && option.value !== "payment_request"),
);
const visibleStatusPills = computed(() => statusStrip.value.filter((option) => option.value === "new"));

let searchTimer: number | undefined;
watch(() => filters.q, () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => load(true), 250);
});

const isMobile = ref(false);
function updateIsMobile() {
  isMobile.value = window.innerWidth <= 640;
}

onMounted(() => {
  load();
  void backfillPairsOnce();
  refreshGmailStatus();
  updateIsMobile();
  window.addEventListener("resize", updateIsMobile);
});

onUnmounted(() => {
  window.removeEventListener("resize", updateIsMobile);
});

async function refreshGmailStatus() {
  try {
    const status = await api.gmail.status();
    gmailConnected.value = status.connected;
  } catch {
    gmailConnected.value = false;
  }
}

async function load(force = false) {
  if (force) page.value = 1;
  loading.value = true;
  try {
    const [dateFrom, dateTo] = dateRange.value ?? [];
    const result = await api.invoices.list({
      q: filters.q,
      status: filters.status ?? undefined,
      type: filters.type ?? undefined,
      documentCategory: filters.documentCategory ?? undefined,
      category: filters.category ?? undefined,
      currency: filters.currency ?? undefined,
      supplier: supplierFilterParam(),
      duplicatesOnly: filters.duplicatesOnly ? "1" : undefined,
      unpaidOnly: filters.unpaidOnly ? "1" : undefined,
      sortBy: sortBy.value,
      sortDir: sortDir.value,
      dateFrom: dateFrom ? new Date(dateFrom).toISOString().slice(0, 10) : undefined,
      dateTo: dateTo ? new Date(dateTo).toISOString().slice(0, 10) : undefined,
      limit: pageSize.value,
      offset: (page.value - 1) * pageSize.value,
    }, force);
    rows.value = result.rows;
    total.value = result.total;
    totalAll.value = result.totalAll;
    visibleLimit.value = result.visibleLimit;
    counts.value = result.counts;
    duplicatesCount.value = result.duplicatesCount ?? 0;
    unpaidDueCount.value = result.unpaidDueCount ?? 0;
    documentCategoryCounts.value = result.documentCategoryCounts ?? {};
    types.value = result.types;
    categories.value = result.categories;
    suppliers.value = result.suppliers;
    currencies.value = result.currencies ?? [];
    pruneSelectedInvoices();
  } catch {
    message.error(l.value.invoicesMsg.loadError);
  } finally {
    loading.value = false;
  }
}

function toggleSelectInvoice(id: string, checked: boolean) {
  const next = new Set(selectedInvoiceIds.value);
  if (checked) {
    next.add(id);
  } else {
    next.delete(id);
  }
  selectedInvoiceIds.value = next;
}

function toggleSelectVisible(checked: boolean) {
  const next = new Set(selectedInvoiceIds.value);
  for (const id of visibleRowIds.value) {
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
  }
  selectedInvoiceIds.value = next;
}

function pruneSelectedInvoices() {
  if (selectedInvoiceIds.value.size === 0) return;
  const visible = new Set(rows.value.map((row) => row.id));
  selectedInvoiceIds.value = new Set([...selectedInvoiceIds.value].filter((id) => visible.has(id)));
}

function confirmDeleteInvoice(row: ImportedInvoice) {
  confirm({
    title: l.value.invoicesMsg.deleteTitle,
    content: t("invoicesMsg.deleteConfirm", {count: 1}),
    confirmText: l.value.fieldPage.delete,
    type: "warning",
    onConfirm: () => deleteSelectedInvoices([row.id]),
  });
}

function confirmDeleteSelected() {
  const ids = [...selectedInvoiceIds.value];
  if (!ids.length) return;
  confirm({
    title: l.value.invoicesMsg.deleteTitle,
    content: t("invoicesMsg.deleteConfirm", {count: ids.length}),
    confirmText: l.value.fieldPage.delete,
    type: "warning",
    onConfirm: () => deleteSelectedInvoices(ids),
  });
}

async function deleteSelectedInvoices(ids: string[]) {
  deletingSelected.value = true;
  try {
    const result = await api.invoices.deleteSelected({ ids });
    selectedInvoiceIds.value = new Set();
    message.success(t("invoicesMsg.deleted", {count: result.deleted}));
    await load(true);
  } catch {
    message.error(l.value.invoicesMsg.deleteError);
  } finally {
    deletingSelected.value = false;
  }
}

function openInvoiceUploadPicker() {
  invoiceUploadInput.value?.click();
}

async function onInvoiceUploadInputChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  if (!files.length) return;
  await uploadInvoiceFiles(files);
}

async function uploadInvoiceFiles(files: File[]) {
  uploadingInvoices.value = true;
  try {
    const template = await findInvoiceTemplate();
    const templateId = template?.id ? String(template.id) : undefined;
    const result = await api.invoices.upload(
      files,
      { doAi: true, doEntities: true, doReminders: false, reprocessDuplicates: true },
      templateId,
    );
    const duplicateCount = result.duplicates?.length ?? 0;
    const queuedCount = Math.max(0, result.ids.length - duplicateCount);
    if (queuedCount > 0) {
      message.success(t("invoicesMsg.queued", {count: queuedCount}));
    }
    if (duplicateCount > 0) {
      message.info(t("invoicesMsg.duplicatesReprocessed", {count: duplicateCount}));
    }
    await load(true);
  } catch (err: any) {
    const code = String(err?.message ?? "");
    if (
        code.includes("document_limit_reached")
        || code.includes("document_monthly_limit_reached")
        || code.includes("document_monthly_quota_exceeded")
    ) {
      message.error(l.value.invoicesMsg.importQuota);
    } else {
      message.error(l.value.invoicesMsg.uploadError);
    }
  } finally {
    uploadingInvoices.value = false;
  }
}

function setStatus(value: string) {
  filters.status = filters.status === value ? null : (value || null);
  load(true);
}

function toggleDuplicates() {
  filters.duplicatesOnly = !filters.duplicatesOnly;
  load(true);
}

// "To pay": unpaid invoices that have a payment date, soonest first.
// Daily unattended Gmail import of new invoices (Pro). The scheduler does the work;
// this only stores the user's choice.
const gmailInvoiceScanAllowed = computed(() => userAllowsGmailInvoiceImport(authStore.user));
const invoicesAutoScan = ref(false);
const invoicesAutoScanSaving = ref(false);
async function setInvoicesAutoScan(value: boolean) {
  invoicesAutoScanSaving.value = true;
  try {
    const row = await userSettingsStore.save({ invoices_auto_scan: value });
    invoicesAutoScan.value = Boolean(row.invoices_auto_scan);
  } catch (err) {
    message.error(err instanceof Error ? err.message : String(err));
  } finally {
    invoicesAutoScanSaving.value = false;
  }
}
void userSettingsStore.load().then((row) => { invoicesAutoScan.value = Boolean(row?.invoices_auto_scan); }).catch(() => undefined);

function toggleUnpaid() {
  filters.unpaidOnly = !filters.unpaidOnly;
  if (filters.unpaidOnly) {
    sortBy.value = "dueDate";
    sortDir.value = "asc";
  }
  load(true);
}

function setDocumentCategory(value: string) {
  filters.documentCategory = isInvoiceDocumentCategory(value) ? value : null;
  load(true);
}

function setColumnDocumentCategory(value: string | null) {
  filters.documentCategory = value && isInvoiceDocumentCategory(value) ? value : null;
  load(true);
}

const batchEdit = reactive({
  show: false,
  saving: false,
  documentCategory: null as ImportedInvoice["document_category"] | null,
  cashFlow: null as ImportedInvoice["cash_flow"] | null,
  providerCategory: null as ImportedInvoice["provider_category"] | null,
});

function openBatchEdit() {
  batchEdit.documentCategory = null;
  batchEdit.cashFlow = null;
  batchEdit.providerCategory = null;
  batchEdit.show = true;
}

async function saveBatchEdit() {
  const ids = [...selectedInvoiceIds.value];
  if (!ids.length || (!batchEdit.documentCategory && !batchEdit.cashFlow && !batchEdit.providerCategory)) return;
  batchEdit.saving = true;
  try {
    await Promise.all(ids.map((id) => api.invoices.update(id, {
      document_category: batchEdit.documentCategory ?? undefined,
      cash_flow: batchEdit.cashFlow ?? undefined,
      provider_category: batchEdit.providerCategory ?? undefined,
    })));
    message.success(t("invoicesMsg.updatedMany", {count: ids.length}));
    batchEdit.show = false;
    await load(true);
  } catch {
    message.error(l.value.invoicesMsg.updateManyError);
  } finally {
    batchEdit.saving = false;
  }
}

function isInvoiceDocumentCategory(value: string): value is ImportedInvoice["document_category"] {
  return value === "invoice" || value === "receipt" || value === "bill"
    || value === "payment_request" || value === "credit_note";
}

function setSort(key: InvoiceSortKey) {
  if (sortBy.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortBy.value = key;
    sortDir.value = key === "date" || key === "amount" ? "desc" : "asc";
  }
  load(true);
}

function sortIcon(key: InvoiceSortKey): Component {
  if (sortBy.value !== key) return SwapVerticalOutline;
  return sortDir.value === "asc" ? ArrowUpOutline : ArrowDownOutline;
}

function sortAriaLabel(key: InvoiceSortKey): string {
  const labels: Record<InvoiceSortKey, string> = {
    supplier: l.value.common.supplier,
    status: l.value.common.status,
    date: l.value.common.date,
    client: l.value.common.client,
    category: l.value.common.category,
    type: l.value.common.type,
    amount: l.value.common.amount,
    dueDate: l.value.invoicesMsg.toPay,
  };
  const nextDirection = sortBy.value === key && sortDir.value === "asc"
    ? l.value.common.sortDesc
    : l.value.common.sortAsc;
  return t("common.sortBy", {col: labels[key], dir: nextDirection});
}

function statusLabel(status: string): string {
  const c = l.value.common;
  const labels: Record<string, string> = {
    new: c.statusNew,
    reviewed: c.statusReviewed,
    outgoing: c.statusOutgoing,
    archived: c.statusArchived,
    done: c.statusNew,
  };
  return labels[status] ?? status;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const ts = Date.parse(value);
  return Number.isFinite(ts)
    ? new Date(ts).toLocaleDateString(intlLocale.value, { day: "numeric", month: "short", year: "numeric" })
    : value;
}

function formatDateShort(value: string | null): string {
  if (!value) return "—";
  const ts = Date.parse(value);
  return Number.isFinite(ts)
    ? new Date(ts).toLocaleDateString(intlLocale.value, { day: "numeric", month: "short" })
    : value;
}

function displayDate(row: ImportedInvoice): string {
  return formatDate(row.issue_date ?? row.import_date);
}

function formatIlsAmount(amount: number): string {
  return new Intl.NumberFormat(intlLocale.value, { style: "currency", currency: "ILS", maximumFractionDigits: 2 }).format(amount);
}

function formatIlsAmountPlain(amount: number): string {
  return new Intl.NumberFormat(intlLocale.value, { maximumFractionDigits: 2 }).format(amount);
}

function isoDate(value: string | null): string {
  if (!value) return "";
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : value;
}

function clientLabel(row: ImportedInvoice): string {
  return row.client_name ?? firstInvoiceField(row, ["client_company", "client_name", "customer_name", "bill_to"]) ?? "—";
}

function paymentVendorName(row: ImportedInvoice): string | null {
  const value = row.fields?.vendor_name;
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name === row.supplier_name) return null;
  return name;
}

function paymentVendorKey(name: string): "play" | "paypal" | "meta" | "hyp" | "other" {
  const key = name.toLowerCase();
  if (key.includes("google play")) return "play";
  if (key.includes("paypal")) return "paypal";
  if (key.includes("meta")) return "meta";
  if (key.includes("hyp") || key.includes("ipos")) return "hyp";
  return "other";
}

function invoiceTypeLabel(row: ImportedInvoice): string {
  if (row.document_category === "receipt") return l.value.invoices.typeReceipt;
  if (row.document_category === "bill") return l.value.invoices.typeBill;
  if (row.document_category === "payment_request") return l.value.invoices.typePaymentRequest;
  const value = String(row.type || firstInvoiceField(row, ["document_subtype", "invoice_type", "receipt_type"]) || "").trim();
  const normalized = value.toLowerCase();
  if (/receipt|קבלה/.test(normalized)) return l.value.invoices.typeReceipt;
  if (/order|הזמנה/.test(normalized)) return value || l.value.invoices.fallbackTitle;
  if (/payment|תשלום/.test(normalized)) return l.value.invoices.typePaymentRequest;
  return l.value.invoices.fallbackTitle;
}

function cashFlowLabel(row: ImportedInvoice): string {
  return row.cash_flow === "income" ? l.value.common.income : l.value.common.expense;
}

function invoiceProviderCategoryLabel(row: ImportedInvoice): string {
  return row.provider_category ? providerCategoryLabel(row.provider_category) : l.value.common.uncategorized;
}

const PROVIDER_CATEGORIES: Array<NonNullable<ImportedInvoice["provider_category"]>> = [
  "household",
  "transport",
  "parking",
  "fuel",
  "tv",
  "marketplace",
  "food",
  "payment",
  "government",
  "insurance",
  "finance",
  "travel",
  "healthcare",
  "education",
  "retail",
  "electronics",
  "nonprofit",
  "digital",
  "development",
  "general",
];

function providerCategoryLabel(category: string | null): string {
  const labels: Record<string, string> = l.value.providerCategory;
  return labels[category] ?? category;
}

function firstInvoiceField(row: ImportedInvoice, keys: string[]): string | null {
  for (const key of keys) {
    const direct = (row as unknown as Record<string, unknown>)[key];
    const nested = row.fields?.[key];
    const value = direct ?? nested;
    if (value === undefined || value === null || value === "") continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function previewSrc(row: ImportedInvoice): string {
  return row.preview_url ?? "";
}

function thumbnailSrc(row: ImportedInvoice): string | null {
  return row.thumbnail_url;
}

function isPdf(row: ImportedInvoice): boolean {
  return row.mime_type === "application/pdf" || row.file_name.toLowerCase().endsWith(".pdf");
}

function isImage(row: ImportedInvoice): boolean {
  return Boolean(row.mime_type?.startsWith("image/"));
}

function openDocument(row: ImportedInvoice) {
  router.push(`/invoices/${row.id}`);
}

function download(row: ImportedInvoice) {
  if (row.download_url) window.open(row.download_url, "_blank");
}

async function exportInvoicesToExcel() {
  if (!exportAllowed.value) {
    message.warning(l.value.invoicesMsg.exportPlanOnly);
    return;
  }
  if (!excelAllowed.value) {
    message.warning(PLAN_GATE_MESSAGES.excelExport);
    return;
  }
  exporting.value = true;
  try {
    const [dateFrom, dateTo] = dateRange.value ?? [];
    const result = await api.invoices.list({
      q: filters.q,
      status: filters.status ?? undefined,
      type: filters.type ?? undefined,
      category: filters.category ?? undefined,
      currency: filters.currency ?? undefined,
      supplier: supplierFilterParam(),
      sortBy: sortBy.value,
      sortDir: sortDir.value,
      dateFrom: dateFrom ? new Date(dateFrom).toISOString().slice(0, 10) : undefined,
      dateTo: dateTo ? new Date(dateTo).toISOString().slice(0, 10) : undefined,
      limit: Math.max(total.value, 1),
      offset: 0,
      export: true,
    }, true);
    const { utils, writeFile } = await import("xlsx");
    const c = l.value.invoiceExport;
    const data = result.rows.map((row) => ({
      [c.supplier]: row.supplier_name,
      [c.status]: statusLabel(row.status),
      [c.issueDate]: isoDate(row.issue_date),
      [c.dueDate]: isoDate(row.payment_due_date),
      [c.client]: clientLabel(row),
      [c.type]: invoiceTypeLabel(row),
      [c.cashFlow]: cashFlowLabel(row),
      [c.amount]: row.amount ?? "",
      [c.currency]: row.currency,
      [c.amountIls]: row.amount_ils ?? "",
      [c.invoiceNumber]: row.invoice_number ?? "",
      [c.customerNumber]: row.customer_number ?? "",
      [c.billingPeriod]: row.billing_period ?? "",
      [c.providerLabel]: row.provider_label ? row.provider_label.replace(/^[^-]+ - /, "") : "",
      [c.category]: row.expense_category ?? "",
      [c.file]: row.file_name,
    }));
    const ws = utils.json_to_sheet(data);
    ws["!cols"] = [
      { wch: 28 },
      { wch: 12 },
      { wch: 16 },
      { wch: 16 },
      { wch: 24 },
      { wch: 18 },
      { wch: 12 },
      { wch: 12 },
      { wch: 10 },
      { wch: 14 },
      { wch: 20 },
      { wch: 16 },
      { wch: 24 },
      { wch: 22 },
      { wch: 16 },
      { wch: 36 },
    ];
    const wb = utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };
    utils.book_append_sheet(wb, ws, c.sheet);
    writeFile(wb, `invoices-${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch {
    message.error(l.value.invoicesMsg.excelError);
  } finally {
    exporting.value = false;
  }
}

async function sendSixMonthInvoiceReport() {
  if (!exportAllowed.value) {
    message.warning(l.value.invoicesMsg.reportSendPlanOnly);
    return;
  }
  if (!excelAllowed.value) {
    message.warning(PLAN_GATE_MESSAGES.excelExport);
    return;
  }
  sendingSixMonthReport.value = true;
  try {
    const result = await api.invoices.sendSixMonthReport();
    const recipient = result.recipients[0] ?? l.value.invoicesMsg.yourEmail;
    message.success(t("invoicesMsg.reportSent", {recipient, count: result.count}));
  } catch (err: any) {
    const code = String(err?.message ?? "");
    if (code.includes("excel_export_plan_required")) {
      message.warning(PLAN_GATE_MESSAGES.excelExport);
    } else if (code.includes("missing_report_recipient")) {
      message.error(l.value.invoicesMsg.noReportEmail);
    } else {
      message.error(l.value.invoicesMsg.reportError);
    }
  } finally {
    sendingSixMonthReport.value = false;
  }
}

function openMonthlyReport() {
  if (!exportAllowed.value) {
    message.warning(l.value.documentsMsg.reportsPlanOnly);
    return;
  }
  showMonthlyReport.value = true;
}

async function handleDriveExport() {
  if (!driveAllowed.value) {
    message.warning(l.value.documentsMsg.drivePlanOnly);
    return;
  }
  try {
    const status = await api.drive.status();
    if (!status.allowed) {
      message.warning(l.value.documentsMsg.drivePlanOnly);
      return;
    }
    if (!status.syncEnabled) {
      message.warning(l.value.documentsMsg.driveSyncOff);
      return;
    }
    const folderGone = status.folderState === "missing" || status.folderState === "trashed";
    if (folderGone) {
      const count = status.syncedFileCount ?? 0;
      confirm({
        title: status.folderState === "trashed" ? l.value.documentsMsg.driveTrashed : l.value.documentsMsg.driveDeleted,
        content: count
          ? t("documentsMsg.driveMissingFiles", {count})
          : l.value.documentsMsg.driveFolderGone,
        confirmText: l.value.documentsMsg.reupload,
        type: "warning",
        onConfirm: runDriveExport,
      });
      return;
    }
    await runDriveExport();
  } catch (err: any) {
    if (String(err?.message ?? "").includes("drive_plan_required")) {
      message.warning(l.value.documentsMsg.drivePlanOnly);
    } else {
      message.error(l.value.documentsMsg.driveExportError);
    }
  }
}

async function runDriveExport() {
  exportingToDrive.value = true;
  lastDriveExportJob.value = null;
  try {
    const started = await api.drive.exportAll();
    activeDriveExportJob.value = started;
    message.info(l.value.documentsMsg.driveStarted);
    const result = await waitForDriveExportJob(started.jobId);
    lastDriveExportJob.value = result;
    const folderHint = result.folderName ? t("documentsMsg.toFolder", {folder: result.folderName}) : "";
    if (result.recreated) {
      message.success(`${t("documentsMsg.newFolderUploaded", {count: result.uploaded})}${folderHint}${result.failed > 0 ? ` ${t("documentsMsg.failedSuffix", {count: result.failed})}` : ""}`);
    } else if (result.total === 0) {
      message.info(l.value.documentsMsg.allSynced);
    } else {
      message.success(`${t("documentsMsg.uploadedToDrive", {count: result.uploaded})}${folderHint}${result.failed > 0 ? ` ${t("documentsMsg.failedSuffix", {count: result.failed})}` : ""}`);
    }
    if (result.folderUrl) {
      window.open(result.folderUrl, "_blank", "noopener,noreferrer");
    }
    await load(true);
  } catch (err: any) {
    if (String(err?.message ?? "").includes("drive_plan_required")) {
      message.warning(l.value.documentsMsg.drivePlanOnly);
    } else if (String(err?.message ?? "").includes("drive_scope_missing")) {
      message.warning(l.value.documentsMsg.reconnectForDrive);
    } else {
      message.error(l.value.documentsMsg.driveExportError);
    }
  } finally {
    activeDriveExportJob.value = null;
    exportingToDrive.value = false;
  }
}

async function handleGmailImportButton() {
  importingFromGmail.value = true;
  lastGmailImportJob.value = null;
  try {
    const status = await api.gmail.status();
    gmailConnected.value = status.connected;
    if (!status.connected) {
      const { url } = await api.gmail.authUrl();
      window.location.assign(url);
      return;
    }
    const template = await findInvoiceTemplate();
    const templateId = template?.id ? String(template.id) : undefined;
    const started = await api.gmail.importAll(undefined, undefined, templateId);
    activeGmailImportJob.value = started;
    message.info(l.value.invoicesMsg.gmailImportStarted);
    const result = await waitForGmailImportJob(started.jobId);
    lastGmailImportJob.value = result;
    loadInlineOnlyEmails(templateId);
    const failed = result.errors || result.results.filter((item) => item.error).length;
    const imported = result.imported ?? 0;
    if (imported) {
      message.success(t("invoicesMsg.gmailImported", {count: imported}));
    } else if (failed) {
      message.warning(l.value.documentsMsg.gmailNoneImported);
    } else {
      message.info(l.value.invoicesMsg.gmailNothingNew);
    }
    await load(true);
  } catch (err: any) {
    const code = String(err?.message ?? "");
    if (code.includes("gmail_not_connected")) {
      gmailConnected.value = false;
      message.error(l.value.documentsMsg.gmailNotConnected);
    } else if (code.includes("document_monthly_quota_exceeded")) {
      message.error(l.value.documentsMsg.monthlyQuota);
    } else {
      message.error(l.value.documentsMsg.gmailError);
    }
  } finally {
    activeGmailImportJob.value = null;
    importingFromGmail.value = false;
  }
}

async function loadInlineOnlyEmails(templateId: string | undefined) {
  inlineOnlyDismissed.value = false;
  inlineOnlyLoading.value = true;
  try {
    const result = await api.gmail.linkOnlyInbox(undefined, undefined, templateId);
    inlineOnlyEmails.value = result.emails;
  } catch {
    inlineOnlyEmails.value = [];
  } finally {
    inlineOnlyLoading.value = false;
  }
}

async function handleImportInlineAll() {
  const messageIds = inlineOnlyEmails.value.map((email) => email.id);
  if (!messageIds.length) return;
  importingFromGmail.value = true;
  lastGmailImportJob.value = null;
  try {
    const template = await findInvoiceTemplate();
    const started = await api.gmail.importInlineAll(messageIds, template?.id ? String(template.id) : undefined);
    activeGmailImportJob.value = started;
    message.info(l.value.invoicesMsg.receiptsImportStarted);
    const result = await waitForGmailImportJob(started.jobId);
    lastGmailImportJob.value = result;
    const savedIds = new Set(result.results.filter((item) => item.import_status === "invoice").map((item) => item.messageId));
    inlineOnlyEmails.value = inlineOnlyEmails.value.filter((email) => !savedIds.has(email.id));
    // The admin acted on the notice; emails left over were not receipts, so don't keep offering them.
    inlineOnlyDismissed.value = true;
    if (result.imported) message.success(t("invoicesMsg.receiptsSaved", {count: result.imported}));
    else if (result.rejected) message.warning(l.value.invoicesMsg.receiptsRejected);
    else message.info(l.value.invoicesMsg.receiptsNothingNew);
    await load(true);
  } catch (err: any) {
    const code = String(err?.message ?? "");
    if (code.includes("gmail_not_connected")) message.error(l.value.documentsMsg.gmailNotConnected);
    else message.error(l.value.invoicesMsg.receiptsError);
  } finally {
    activeGmailImportJob.value = null;
    importingFromGmail.value = false;
  }
}

async function handleImportInline(row: GmailLinkOnlyEmail) {
  importingInlineId.value = row.id;
  try {
    const template = await findInvoiceTemplate();
    const result = await api.gmail.importInline(row.id, template?.id ? String(template.id) : undefined);
    message.success(t("invoicesMsg.receiptImported", {vendor: result.receipt.vendor, amount: result.receipt.amount, currency: result.receipt.currency}));
    inlineOnlyEmails.value = inlineOnlyEmails.value.filter((email) => email.id !== row.id);
    await load(true);
  } catch (err: any) {
    if (String(err?.message ?? "").includes("not_a_recognized_inline_receipt")) {
      message.error(l.value.invoicesMsg.emailNotImportable);
    } else {
      message.error(l.value.invoicesMsg.emailImportError);
    }
  } finally {
    importingInlineId.value = null;
  }
}

async function waitForGmailImportJob(jobId: string): Promise<GmailImportJob> {
  let last: GmailImportJob | null = null;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    last = await api.gmail.importJob(jobId);
    activeGmailImportJob.value = last;
    if (last.status === "completed") return last;
    if (last.status === "failed") throw new Error(last.error || "gmail_import_failed");
    await delay(2000);
  }
  throw new Error("gmail_import_timeout");
}

async function waitForDriveExportJob(jobId: string | null): Promise<DriveExportJob> {
  if (!jobId) throw new Error("drive_export_missing_job");
  let last: DriveExportJob | null = null;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    last = await api.drive.exportJob(jobId);
    activeDriveExportJob.value = last;
    if (last.status === "completed") return last;
    if (last.status === "failed") throw new Error(last.error || "drive_export_failed");
    await delay(2000);
  }
  throw new Error("drive_export_timeout");
}

function delay(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function findInvoiceTemplate(): Promise<DocTemplate | null> {
  const templates = await api.docTemplates.list();
  return templates.find((template) =>
    template.document_kind === "invoice" || /חשבונית|קבלה|דרישת\s*תשלום/i.test(template.name)
  ) ?? null;
}

function renderActionIcon(icon: Component) {
  return () => h(NIcon, { component: icon });
}

function invoiceActionOptions(row: ImportedInvoice) {
  const c = l.value;
  return [
    { label: c.common.openDocument, key: "open", icon: renderActionIcon(EyeOutline) },
    {
      label: c.common.exportDocument,
      key: "download",
      disabled: !row.download_url,
      icon: renderActionIcon(DownloadOutline),
    },
    ...(row.paired_with ? [{ label: c.invoicesMsg.unpair, key: "unpair" }] : []),
    { type: "divider", key: "d1" },
    {
      label: c.invoices.assignClient,
      key: "business",
      icon: renderActionIcon(BriefcaseOutline),
      children: [
        { label: clientLabel(row), key: "business:current", disabled: true },
        { label: `${c.clients.newClient}...`, key: "business:custom" },
      ],
    },
    {
      label: row.cash_flow === "income" ? l.value.invoices.setIncomeCategory : l.value.invoices.setExpenseCategory,
      key: "category",
      icon: renderActionIcon(PricetagOutline),
      children: [
        { label: l.value.invoicesMsg.catInvoices, key: "category:חשבוניות" },
        { label: l.value.invoicesMsg.catReceipts, key: "category:קבלות" },
        { label: l.value.invoicesMsg.catCredits, key: "category:זיכויים" },
      ],
    },
    {
      label: l.value.invoices.cashFlowType,
      key: "cashFlow",
      icon: renderActionIcon(SwapVerticalOutline),
      children: [
        { label: l.value.common.expense, key: "cashFlow:expense" },
        { label: l.value.common.income, key: "cashFlow:income" },
      ],
    },
    { type: "divider", key: "d2" },
    {
      label: c.common.archive,
      key: "archive",
      icon: renderActionIcon(ArchiveOutline),
    },
    {
      label: c.fieldPage.delete,
      key: "delete",
      icon: renderActionIcon(TrashOutline),
      props: { style: "color: var(--color-error, #d03050)" },
    },
  ];
}

async function handleInvoiceAction(key: string, row: ImportedInvoice) {
  if (key === "open") return openDocument(row);
  if (key === "download") return download(row);
  if (key === "unpair") return unpairInvoice(row);
  if (key === "archive") return updateInvoiceStatus(row, "archived");
  if (key === "delete") return confirmDeleteInvoice(row);
  if (key === "business:custom") return openBusinessModal(row);
  if (key.startsWith("business:")) return updateInvoiceMeta(row, { client_name: key.slice("business:".length) });
  if (key.startsWith("category:")) return updateInvoiceMeta(row, { expense_category: key.slice("category:".length) });
  if (key === "cashFlow:income") return updateInvoiceMeta(row, { cash_flow: "income" });
  if (key === "cashFlow:expense") return updateInvoiceMeta(row, { cash_flow: "expense" });
}

async function unpairInvoice(row: ImportedInvoice) {
  try {
    await api.invoices.unpair(row.id);
    message.success(l.value.invoicesMsg.unpaired);
    await load(false);
  } catch (err) {
    message.error(err instanceof Error ? err.message : String(err));
  }
}

// Existing invoices and receipts imported before pairing existed are matched once, quietly,
// the first time this page opens for a user; later imports are paired as they arrive.
async function backfillPairsOnce() {
  const key = `invoices.pairScan.v1.${authStore.user?.id ?? "anon"}`;
  try {
    if (localStorage.getItem(key)) return;
    const result = await api.invoices.pairScan();
    localStorage.setItem(key, String(Date.now()));
    if (result.linked > 0) {
      message.info(t("invoicesMsg.pairsFound", { n: result.linked }));
      await load(false);
    }
  } catch {
    /* try again on the next visit */
  }
}

function openBusinessModal(row: ImportedInvoice) {
  businessModal.row = row;
  businessModal.value = clientLabel(row) === "—" ? "" : clientLabel(row);
  businessModal.show = true;
}

async function saveBusinessModal() {
  const row = businessModal.row;
  const value = businessModal.value.trim();
  if (!row || !value) return;
  await updateInvoiceMeta(row, { client_name: value });
  businessModal.show = false;
}

function supplierFilterParam(): string | undefined {
  return filters.suppliers.length ? filters.suppliers.join("||") : undefined;
}

function openVendorMergeModal() {
  vendorMergeModal.sourceNames = [...filters.suppliers];
  vendorMergeModal.canonicalName = filters.suppliers[0] ?? "";
  vendorMergeModal.show = true;
}

async function saveVendorMerge() {
  const sourceNames = [...new Set(vendorMergeModal.sourceNames.map((name) => name.trim()).filter(Boolean))];
  const canonicalName = String(vendorMergeModal.canonicalName ?? "").trim();
  if (sourceNames.length < 2 || !canonicalName) return;
  vendorMergeModal.saving = true;
  try {
    const result = await api.invoices.mergeVendors({ supplierNames: sourceNames, canonicalName });
    vendorMergeModal.show = false;
    filters.suppliers = [result.supplierName];
    message.success(t("invoicesMsg.suppliersMerged", {count: result.modified, supplier: result.supplierName}));
    await load(true);
  } catch {
    message.error(l.value.invoicesMsg.mergeError);
  } finally {
    vendorMergeModal.saving = false;
  }
}

async function updateInvoiceStatus(row: ImportedInvoice, status: string) {
  if (row.status === status) return;
  try {
    const updated = await api.invoices.update(row.id, { status });
    replaceRow(updated);
    message.success(l.value.invoicesMsg.statusUpdated);
  } catch {
    message.error(l.value.invoicesMsg.statusError);
  }
}

async function updateInvoiceProviderCategory(row: ImportedInvoice, value: string | null) {
  const category = normalizeProviderCategory(value);
  if ((row.provider_category ?? null) === (category ?? null)) return;
  const supplierName = row.supplier_name?.trim();
  if (!supplierName) {
    await updateInvoiceMeta(row, { provider_category: category });
    return;
  }
  try {
    const result = await api.invoices.setSupplierCategory({ supplierName, provider_category: category });
    rows.value = rows.value.map((item) => item.supplier_name === supplierName ? { ...item, provider_category: category } : item);
    message.success(t("invoicesMsg.categoryUpdated", {count: result.modified, supplier: supplierName}));
  } catch {
    message.error(l.value.invoicesMsg.categoryError);
  }
}

function normalizeProviderCategory(value: string | null): ImportedInvoice["provider_category"] | null {
  return PROVIDER_CATEGORIES.includes(value as NonNullable<ImportedInvoice["provider_category"]>)
    ? value as NonNullable<ImportedInvoice["provider_category"]>
    : null;
}

async function updateInvoiceMeta(row: ImportedInvoice, body: { client_name?: string; business?: string; expense_category?: string; cash_flow?: ImportedInvoice["cash_flow"]; provider_category?: ImportedInvoice["provider_category"] | null }) {
  try {
    const updated = await api.invoices.update(row.id, body);
    replaceRow(updated);
    message.success(l.value.invoicesMsg.invoiceUpdated);
  } catch {
    message.error(l.value.invoicesMsg.invoiceUpdateError);
  }
}

function replaceRow(updated: ImportedInvoice) {
  rows.value = rows.value.map((row) => row.id === updated.id ? updated : row);
  const nextCounts: Record<string, number> = {};
  for (const row of rows.value) nextCounts[row.status] = (nextCounts[row.status] ?? 0) + 1;
  counts.value = nextCounts;
}
</script>

<style scoped>
.alerts-bell-icon {
  color: var(--brand-color);
}

.invoices-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  width: 100%;
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
  background: var(--color-error, #d03050);
  border-color: var(--color-error, #d03050);
  color: #fff;
  font-weight: 700;
}

.rbtn--danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-error, #d03050) 88%, #000);
  border-color: color-mix(in srgb, var(--color-error, #d03050) 88%, #000);
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
  margin-top: 10px;
  padding: 5px;
  background: transparent;
}

.invoices-page :deep(.invoice-section-nav) {
  margin-bottom: 12px;
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.pill--compact {
  padding: 6px 13px;
  font-size: 12px;
  flex-shrink: 0;
}

.pill--soft {
  background: color-mix(in srgb, var(--brand-color) 8%, transparent);
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

.pill--warn {
  color: var(--color-warning, #e8a838);
}
.pill--warn.pill--active {
  color: var(--color-warning, #e8a838);
  border-color: var(--color-warning, #e8a838);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-warning, #e8a838) 55%, transparent);
}
.pill--warn.pill--active .pill__badge {
  background: color-mix(in srgb, var(--color-warning, #e8a838) 22%, transparent);
}

.pill__badge {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-hover);
  padding: 1px 6px;
  border-radius: 999px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.toolbar__search {
  flex: 1 1 260px;
  min-width: 220px;
}

.toolbar__type {
  width: 200px;
}

.toolbar__currency {
  width: 130px;
}

.toolbar__supplier {
  width: 260px;
}

.toolbar__dates {
  width: 260px;
}

.presets-and-dates-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.toolbar__supplier--mobile,
.toolbar__dates--mobile {
  display: none;
}

.filterbar__controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-inline-start: auto;
}

.title-loader {
  display: inline-flex;
  align-items: center;
}

@media (max-width: 640px) {
  .gmail-import-btn,
  .hero-action {
    width: 36px;
    min-width: 36px;
    height: 36px;
    min-height: 36px;
    padding: 6px;
    flex: 0 0 auto;
    justify-content: center;
    gap: 0;
  }

  .gmail-import-btn__label,
  .hero-action__label {
    display: none;
  }

  .filterbar.filterbar--compact {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .filterbar.filterbar--compact::-webkit-scrollbar {
    display: none;
  }

  .filterbar__controls {
    flex-shrink: 0;
    width: auto;
    margin-inline-start: 0;
  }
}

.toolbar__view-toggle {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
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

.rbtn--icon {
  justify-content: center;
}

.link-only-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  margin-bottom: 16px;
  border-radius: 12px;
  border: 2px solid var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 16%, var(--bg-card));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-warning) 18%, transparent);
}

.link-only-notice--pending {
  border-color: var(--brand-color);
  background: color-mix(in srgb, var(--brand-color) 14%, var(--bg-card));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand-color) 16%, transparent);
}

.link-only-notice__text {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
  color: var(--text-primary);
}

.link-only-notice__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
  font-size: 17px;
  font-weight: 700;
  line-height: 1.4;
}

.link-only-notice__list {
  margin: 4px 0 0;
  padding-inline-start: 20px;
  font-size: 12px;
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

.invoice-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.invoice-card {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.invoice-card:hover {
  border-color: var(--brand-color);
  box-shadow: 0 10px 28px color-mix(in srgb, var(--text-primary) 10%, transparent);
  transform: translateY(-1px);
}

.invoice-card__preview {
  position: relative;
  height: 220px;
  border-bottom: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-elevated) 82%, var(--bg-card));
  overflow: hidden;
}

.invoice-card__preview img,
.invoice-card__preview iframe {
  width: 100%;
  height: 100%;
  border: 0;
  object-fit: contain;
  background: var(--bg-card);
}

.invoice-card__fallback {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--text-secondary);
}

.invoice-card__status {
  position: absolute;
  top: 10px;
  right: 10px;
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

.invoice-card__storage {
  position: absolute;
  top: 8px;
  left: 8px;
}

.invoice-card__body {
  padding: 12px 14px 14px;
}

.invoice-card__supplier {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 800;
  color: var(--text-primary);
}

.invoice-card__amount {
  margin-top: 4px;
  font-size: 20px;
  font-weight: 800;
  color: var(--text-primary);
}

.invoice-card__amount-ils {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.invoice-card__line {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 9px;
  padding-top: 9px;
  border-top: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 12px;
}

.invoice-card__line--muted {
  margin-top: 4px;
  padding-top: 0;
  border-top: 0;
}

.invoice-supplier-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.invoice-supplier-cell .invoice-cell-truncate {
  flex: 1 1 auto;
  min-width: 0;
}

.invoice-nofile-flag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  padding: 1px 7px;
  border: 1px solid color-mix(in srgb, var(--text-secondary) 35%, var(--border-color));
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.6;
}

.invoice-card__supplier .invoice-nofile-flag {
  margin-inline-start: 6px;
}

.invoice-category-chip {
  display: inline-flex;
  align-items: center;
  max-width: 180px;
  min-height: 24px;
  padding: 3px 9px;
  border: 1px solid color-mix(in srgb, var(--brand-color) 22%, var(--border-color));
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand-color) 7%, var(--bg-card));
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.invoice-table-wrap {
  min-width: 0;
  max-width: 100%;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  overflow: auto;
}

.invoice-table {
  width: 100%;
  min-width: 1020px;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
}

.import-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  margin-bottom: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  flex-wrap: wrap;
}
.import-panel__actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.import-panel__scan {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}
.import-panel__scan span { display: grid; gap: 2px; }
.import-panel__scan small { color: var(--text-secondary); font-size: 12px; }

.warranty-nudge {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--brand-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--brand-color) 30%, transparent);
  font-size: 13px;
  color: var(--text-primary);
}
.warranty-nudge__icon { color: var(--brand-color); flex-shrink: 0; }
.warranty-nudge span { flex: 1; }
.warranty-nudge__cta { flex-shrink: 0; }
.warranty-nudge__close { flex-shrink: 0; margin-inline-start: 2px; }

.invoice-pair-tag {
  flex: none;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 18px;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  background: var(--bg-elevated);
  white-space: nowrap;
}

.invoice-table__col--select {
  width: 46px;
}

.invoice-table__col--supplier {
  width: clamp(180px, 23vw, 280px);
}

.invoice-table__col--date {
  width: 132px;
}

.invoice-table__col--client {
  width: clamp(170px, 22vw, 260px);
}

.invoice-table__col--category {
  width: 144px;
}

.invoice-table__col--type {
  width: 108px;
}

.invoice-table__col--amount {
  width: 128px;
}

.invoice-table__col--actions {
  width: 132px;
}

.invoice-table th,
.invoice-table td {
  padding: 11px 12px;
  border-bottom: 1px solid var(--border-color);
  text-align: start;
  white-space: nowrap;
  vertical-align: middle;
}

.invoice-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-weight: 800;
}

.invoice-sort-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-weight: 800;
}

.invoice-sort-button span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.invoice-sort-button :deep(.n-icon) {
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--text-secondary) 78%, var(--brand-color));
}

.invoice-sort-button:hover,
.invoice-sort-button:focus-visible {
  color: var(--brand-color);
}

.invoice-sort-button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--brand-color) 45%, transparent);
  outline-offset: 3px;
  border-radius: 6px;
}

.invoice-table tbody tr:last-child td {
  border-bottom: none;
}

.invoice-table tbody tr:hover td {
  background: color-mix(in srgb, var(--brand-color) 5%, var(--bg-card));
}

.invoice-table-row {
  cursor: pointer;
  outline: none;
}

.invoice-table-row:focus-visible td {
  background: color-mix(in srgb, var(--brand-color) 8%, var(--bg-card));
  box-shadow: inset 0 0 0 1px var(--brand-color);
}

.invoice-cell-truncate {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.invoice-pagination {
  display: flex;
  justify-content: center;
  padding: 14px 0 4px;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cell-strong,
.cell-amount {
  font-weight: 700;
  color: var(--text-primary);
}

.cell-amount__ils {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
}

.cell-actions {
  width: 132px;
}

.invoice-col--amount {
  text-align: end;
}

.invoice-col--actions {
  text-align: center;
}

.invoice-col--select {
  text-align: center;
}

.invoice-vendor-mark {
  display: inline-flex;
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
}

.invoice-supplier-cell__meta {
  display: none;
}

.invoice-vendor-mark svg {
  display: block;
}

.invoice-col--supplier,
.invoice-col--date,
.invoice-col--client,
.invoice-col--category,
.invoice-col--type {
  text-align: start;
}

.invoice-type-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.25;
}

.invoice-type-cell__flow {
  color: var(--text-secondary);
  font-size: 12px;
}

.invoice-col-filter {
  width: 118px;
  margin-top: 6px;
}

.invoice-row-action {
  color: var(--text-secondary);
}

.invoice-row-action:hover {
  color: var(--brand-color);
}

:global(.invoice-business-modal.n-card),
:global(.invoice-vendor-merge-modal.n-card) {
  max-width: calc(100vw - 32px) !important;
}

:global(.invoice-business-modal.n-card) {
  width: 460px !important;
}

:global(.invoice-vendor-merge-modal.n-card) {
  width: 560px !important;
}

.invoice-business-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.invoice-form-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.invoice-form-hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.invoice-business-form__actions {
  display: flex;
  justify-content: flex-start;
  gap: 8px;
}

@media (max-width: 640px) {
  .invoice-table th,
  .invoice-table td {
    padding: 3px 4px;
    font-size: 10px;
  }
  .invoices-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    width: 100%;
  }

  .invoices-actions > .rbtn {
    width: 100%;
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .presets-and-dates-row {
    display: none;
  }

  .toolbar__supplier--mobile,
  .toolbar__dates--mobile {
    display: block;
  }

  .toolbar__search,
  .toolbar__type,
  .toolbar__supplier,
  .toolbar__dates {
    width: 100%;
    min-width: 0;
    flex-basis: auto;
  }

  .invoice-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 420px) {
  .invoices-actions {
    grid-template-columns: 1fr;
  }
}

.category-mobile {
  display: none;
}

@media (max-width: 640px) {
  .category-desktop {
    display: none;
  }

  .category-mobile {
    display: inline-flex;
  }

  .invoice-table__col--category {
    width: 44px;
  }

  .invoice-table {
    min-width: 320px;
  }

  .invoice-table__col--supplier {
    width: auto;
    min-width: 120px;
  }

  .invoice-col--category,
  .invoice-col--type {
    padding-inline-start: 4px;
    padding-inline-end: 4px;
  }

  .invoice-table__col--select {
    width: 34px;
  }

  .invoice-table__col--amount {
    width: 90px;
  }

  .invoice-table__col--actions {
    width: 60px;
  }

  .invoice-col--select {
    padding-inline-end: 0;
    padding-inline-start: 4px;
  }

  .invoice-table__col--client,
  .invoice-table__col--type,
  .invoice-table__col--category,
  .invoice-col--client,
  .invoice-col--type,
  .invoice-col--category {
    display: none;
  }

  .invoice-table__col--date {
    width: 60px;
  }

  .invoice-col--date {
    white-space: nowrap;
  }

  .invoice-col--amount,
  .invoice-col--actions {
    padding-inline-start: 4px;
    padding-inline-end: 4px;
  }

  .row-actions {
    gap: 4px;
  }

  .invoice-type-cell__flow {
    display: none;
  }

  .invoice-table .invoice-nofile-flag {
    display: none;
  }

  .invoice-table .invoice-vendor-mark {
    display: none;
  }

  .invoice-table .cell-amount__ils {
    font-size: 8px;
  }

  .invoice-table .row-actions {
    gap: 1px;
  }

  .invoice-table :deep(.icon-btn),
  .invoice-table .icon-btn {
    width: 18px;
    height: 18px;
    min-width: 18px;
    padding: 0;
  }

  .invoice-table :deep(.n-icon),
  .invoice-table .btn-icon {
    font-size: 12px;
  }

  .invoice-table :deep(.n-checkbox-box) {
    width: 12px;
    height: 12px;
  }

  .invoice-table .mapped-value {
    min-width: 18px;
    min-height: 18px;
  }

  .invoice-table-row td {
    line-height: 1.1;
  }

  .invoice-table .cell-strong,
  .invoice-table .cell-amount {
    font-weight: 500;
  }

  .invoice-table th {
    font-weight: 600;
  }

  .invoice-supplier-cell__meta {
    font-weight: 400;
  }

  .invoice-table-wrap {
    margin: 0;
  }

  .invoice-pagination {
    padding: 6px 0 0;
    max-width: 100%;
    overflow-x: auto;
  }

  .invoice-pagination :deep(.n-pagination) {
    flex-wrap: wrap;
    justify-content: center;
    gap: 4px;
  }

  .invoice-supplier-cell {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 6px;
    min-width: 0;
  }

  .invoice-supplier-cell .invoice-cell-truncate {
    min-width: 0;
    flex: 1 1 auto;
  }

  .invoice-supplier-cell__meta {
    display: flex;
    flex-basis: 100%;
    gap: 8px;
    min-width: 0;
    font-size: 11px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .invoice-supplier-cell__meta .invoice-cell-truncate {
    min-width: 0;
    flex: 1;
  }

  .invoice-table-wrap {
    max-height: calc(100dvh - 500px);
    overflow-y: auto;
    overflow-x: hidden;
  }

  .import-panel__scan small {
    display: none;
  }
}
</style>
