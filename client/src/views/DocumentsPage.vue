<template>
  <div class="page2" :dir="dir">
    <PageHeader
      :count="store.total"
      :title="l.documents.title"
      :subtitle="l.documents.subtitle"
    >
      <template #hero>
        <n-tooltip :disabled="!createLocked">
          <template #trigger>
            <span class="locked-action" @click="createLocked && goToSubscription()">
              <button
                  :disabled="createLocked"
                  class="rbtn rbtn--primary"
                  type="button"
                  @click="openNewInspection"
              >
                <n-icon :component="AddOutline" class="btn-icon"/>
                {{ l.documents.newInspection }}
              </button>
            </span>
          </template>
          {{ l.profile.upgradePlan }}
        </n-tooltip>
        <n-tooltip :disabled="!importLocked">
          <template #trigger>
            <span class="locked-action" @click="importLocked && goToSubscription()">
              <button
                  :class="{ 'rbtn--loading': uploading }"
                  :disabled="importLocked || uploading"
                  class="rbtn rbtn--primary"
                  type="button"
                  @click="openUploadModal()"
              >
                <n-icon :component="CloudUploadOutline" class="btn-icon"/>
                {{ l.common.upload }}
              </button>
            </span>
          </template>
          {{ l.profile.upgradePlan }}
        </n-tooltip>
        <n-tooltip :disabled="!importLocked">
          <template #trigger>
            <span class="locked-action" @click="importLocked && goToSubscription()">
              <button
                  :class="{ 'rbtn--loading': importingFromGmail }"
                  :disabled="importLocked || importingFromGmail"
                  class="rbtn rbtn--ghost"
                  type="button"
                  @click="handleGmailImport"
              >
                <GmailLogo :size="16" class="btn-icon"/>
                {{ l.documents.gmailImport }}
              </button>
            </span>
          </template>
          {{ l.profile.upgradePlan }}
        </n-tooltip>
        <button
            :class="{ 'rbtn--loading': exportingToDrive }"
            :disabled="!driveAllowed || exportingToDrive"
            class="rbtn rbtn--ghost"
            type="button"
            @click="handleDriveExport"
        >
          <GoogleDriveLogo :size="16" />
          {{ l.documents.driveExport }}
        </button>
        <button class="rbtn rbtn--ghost" type="button" :disabled="!exportAllowed" @click="openMonthlyReport">
          <n-icon :component="DocumentTextOutline" class="btn-icon"/>
          {{ l.documents.monthlyReport }}
        </button>
      </template>
      <template #tools>
        <n-tooltip placement="bottom">
          <template #trigger>
            <button
                :disabled="store.loading"
                class="rbtn rbtn--ghost rbtn--icon"
                type="button"
                :aria-label="l.common.refresh"
                @click="store.fetch(undefined, true)"
            >
              <n-icon :class="{ 'refresh-icon--spin': store.loading }" :component="RefreshOutline" :size="18"/>
            </button>
          </template>
          {{ l.common.refresh }}
        </n-tooltip>
        <n-tooltip v-if="rescanStore.hasSession" placement="bottom">
          <template #trigger>
            <button class="rbtn rbtn--ghost rbtn--icon" type="button" :aria-label="rescanStore.kind === 'upload' ? l.documents.lastUpload : l.documents.lastRescan" @click="openRescanModal">
              <n-icon :component="TimeOutline" :size="18"/>
            </button>
          </template>
          {{ rescanStore.kind === "upload" ? l.documents.lastUpload : l.documents.lastRescan }}
        </n-tooltip>
        <n-tooltip v-if="authStore.isAdmin" placement="bottom">
          <template #trigger>
            <button
                :disabled="rescanningAll"
                class="rbtn rbtn--ghost rbtn--warning rbtn--icon"
                type="button"
                :aria-label="l.documents.rescanAll"
                @click="showRescanAllConfirm = true"
            >
              <n-icon :class="{ 'refresh-icon--spin': rescanningAll }" :component="RefreshOutline" :size="18"/>
            </button>
          </template>
          {{ l.documents.rescanAll }}
        </n-tooltip>
        <n-tooltip v-if="authStore.isAdmin" placement="bottom">
          <template #trigger>
            <button
                :class="{ 'rbtn--loading': deletingAll }"
                :disabled="deletingAll"
                class="rbtn rbtn--danger rbtn--icon"
                type="button"
                :aria-label="l.common.deleteAll"
                @click="confirmDeleteAll"
            >
              <n-icon :component="TrashOutline" :size="18"/>
            </button>
          </template>
          {{ l.common.deleteAll }}
        </n-tooltip>
        <n-tooltip v-if="store.rows.length" placement="bottom">
          <template #trigger>
            <button
                :class="{ 'rbtn--ghost-active': bulkMode }"
                class="rbtn rbtn--ghost rbtn--icon"
                type="button"
                :aria-label="l.documents.multiSelect"
                @click="toggleBulkMode"
            >
              <n-icon :component="CheckboxOutline" :size="18"/>
            </button>
          </template>
          {{ l.documents.multiSelect }}<span v-if="selectedIds.size"> ({{ selectedIds.size }})</span>
        </n-tooltip>
        <n-popover :width="320" placement="bottom-end" trigger="click">
          <template #trigger>
            <button class="rbtn rbtn--ghost rbtn--icon" type="button" :aria-label="l.documents.processingSettings">
              <n-icon :component="SettingsOutline" :size="18"/>
            </button>
          </template>
          <div class="settings-pop">
            <div class="settings-pop__title">{{ l.documents.processingServices }}</div>
            <n-space size="small" vertical>
              <n-tooltip placement="left">
                <template #trigger><n-checkbox v-model:checked="flagOcr">{{ l.documents.ocrLabel }}</n-checkbox></template>
                {{ l.documents.ocrHint }}
              </n-tooltip>
              <n-tooltip placement="left">
                <template #trigger><n-checkbox v-model:checked="flagAi">{{ l.documents.aiLabel }}</n-checkbox></template>
                {{ l.documents.aiHint }}
              </n-tooltip>
              <n-tooltip placement="left">
                <template #trigger><n-checkbox v-model:checked="flagS3">{{ l.documents.s3Label }}</n-checkbox></template>
                {{ l.documents.s3Hint }}
              </n-tooltip>
              <n-tooltip placement="left">
                <template #trigger><n-checkbox v-model:checked="flagEntities">{{ l.documents.entitiesLabel }}</n-checkbox></template>
                {{ l.documents.entitiesHint }}
              </n-tooltip>
            </n-space>
          </div>
        </n-popover>
      </template>
      <template #actions>
        <div v-if="bulkMode && store.rows.length" class="documents-actions">
          <div class="bulk-action-anchor">
            <div class="bulk-action-anchor__row">
              <button
                  v-if="filteredRows.length"
                  class="rbtn rbtn--ghost"
                  type="button"
                  @click="selectAll"
              >
                {{ selectedIds.size === filteredRows.length ? l.common.deselectAll : l.common.selectAll }}
              </button>
            </div>
            <div v-if="selectedIds.size > 0" class="bulk-action-anchor__actions">
              <button
                  :class="{ 'bulk-action-item--loading': bulkDownloading }"
                  :disabled="bulkDownloading"
                  class="bulk-action-item bulk-action-item--primary"
                  type="button"
                  @click="bulkDownload"
              >
                <n-icon :component="DownloadOutline" class="bulk-action-item__icon"/>
                <span class="bulk-action-item__text">{{ l.common.downloadSelected }}</span>
                <span class="bulk-action-item__count">{{ selectedIds.size }}</span>
              </button>
              <button
                  :class="{ 'bulk-action-item--loading': bulkMerging }"
                  :disabled="bulkMerging"
                  class="bulk-action-item"
                  type="button"
                  @click="bulkMergePdf"
              >
                <n-icon :component="DocumentTextOutline" class="bulk-action-item__icon"/>
                <span class="bulk-action-item__text">{{ l.common.mergePdf }}</span>
                <span class="bulk-action-item__count">{{ selectedIds.size }}</span>
              </button>
              <button
                  :class="{ 'bulk-action-item--loading': bulkExtracting }"
                  :disabled="bulkExtracting || selectedExtractableIds.length === 0"
                  class="bulk-action-item bulk-action-item--primary"
                  type="button"
                  @click="bulkExtractAi"
              >
                <n-icon :component="FlashOutline" class="bulk-action-item__icon"/>
                <span class="bulk-action-item__text">{{ l.documents.extractAi }}</span>
                <span class="bulk-action-item__count">{{ selectedExtractableIds.length }}</span>
              </button>
              <button
                  :class="{ 'bulk-action-item--loading': bulkDeleting }"
                  :disabled="bulkDeleting"
                  class="bulk-action-item bulk-action-item--danger"
                  type="button"
                  @click="confirmBulkDelete"
              >
                <n-icon :component="TrashOutline" class="bulk-action-item__icon"/>
                <span class="bulk-action-item__text">{{ l.common.deleteSelected }}</span>
                <span class="bulk-action-item__count">{{ selectedIds.size }}</span>
              </button>
            </div>
          </div>
        </div>
      </template>
    </PageHeader>

    <DriveExportJobStatus
      v-if="visibleDriveExportJob"
      :job="visibleDriveExportJob"
      :dismissible="!exportingToDrive"
      @dismiss="lastDriveExportJob = null"
    />

    <!-- Quota bar (role = user only) -->
    <div v-if="isRegularUser" class="quota-bar">
      <div class="quota-bar__text">
        <span>מסמכים: {{ store.documentQuotaUsed }} / {{ store.documentLimit ?? "∞" }}</span>
        <span v-if="importLocked" class="quota-bar__limit">{{ importLockLabel }}</span>
      </div>
      <n-progress
        type="line"
        :percentage="quotaPercent"
        :color="quotaPercent >= 100 ? '#e88080' : quotaPercent >= 80 ? '#f0a020' : 'var(--brand-color)'"
        :height="6"
        :show-indicator="false"
        rail-color="rgba(128,128,128,0.15)"
      />
    </div>

    <!-- Drop strip with inline upload + results modal -->
    <div v-if="importLocked" class="drop-strip drop-strip--disabled">
      <span>{{ importLockLabel }}</span>
      <button class="btn btn--ghost btn--xs" type="button" @click="goToSubscription">
        {{ l.profile.upgradePlan }}
      </button>
    </div>
    <DocumentDropStrip v-else @quota-reached="onQuotaReached" @uploaded="store.fetch(undefined, true)" />

    <n-alert
      v-if="rescanStore.hasSession && !showUploadModal"
      type="info"
      class="mb-3"
      :title="rescanAlertTitle"
      closable
      @close="rescanStore.clear()"
    />

    <!-- ── Unified filter bar ─────────────────────────────────────────── -->
    <div class="filterbar filterbar--compact">
      <button
        v-for="f in combinedFilters"
        :key="f.key"
        class="pill pill--compact"
        :class="{ 'pill--active': activeFilterKey === f.key }"
        @click="applyFilter(f)"
      >
        {{ f.label }}
        <span class="pill__badge">{{ f.count }}</span>
      </button>
    </div>

    <!-- ── Toolbar ─────────────────────────────────────────────────────── -->
    <div class="toolbar">
      <n-input
        v-model:value="search"
        clearable
        :placeholder="l.documents.searchPlaceholder"
        class="toolbar__search"
        @update:value="currentPage = 1"
      />
      <n-select
        v-model:value="filterClientId"
        :options="[{ label: l.documents.allClients, value: null }, ...clientOptions]"
        :virtual-scroll="false"
        class="toolbar__client"
        clearable
        filterable
        :placeholder="l.documents.filterByClient"
        @update:value="currentPage = 1"
      />
      <n-select
        v-if="inspectionTypeOptions.length"
        v-model:value="filterInspectionType"
        :options="[{ label: l.documents.allTypes, value: null }, ...inspectionTypeOptions]"
        :virtual-scroll="false"
        class="toolbar__type"
        clearable
        filterable
        :placeholder="l.documents.filterByType"
        @update:value="currentPage = 1"
      />
      <n-date-picker
        v-model:value="filterDateRange"
        class="toolbar__dates"
        clearable
        :placeholder="l.documents.filterByImportDate"
        type="daterange"
        @update:value="currentPage = 1"
      />
<!--      <div class="toolbar__view-toggle">-->
<!--        <n-tooltip placement="top">-->
<!--          <template #trigger>-->
<!--            <button-->
<!--              :class="{ 'rbtn&#45;&#45;ghost-active': viewMode === 'grid' }"-->
<!--              :aria-label="'אריחים'"-->
<!--              class="rbtn rbtn&#45;&#45;ghost rbtn&#45;&#45;icon"-->
<!--              type="button"-->
<!--              @click="viewMode = 'grid'"-->
<!--            >-->
<!--              <n-icon :component="GridOutline" :size="16" class="btn-icon"/>-->
<!--            </button>-->
<!--          </template>-->
<!--          אריחים-->
<!--        </n-tooltip>-->
<!--        <n-tooltip placement="top">-->
<!--          <template #trigger>-->
<!--            <button-->
<!--              :class="{ 'rbtn&#45;&#45;ghost-active': viewMode === 'list' }"-->
<!--              :aria-label="'טבלה'"-->
<!--              class="rbtn rbtn&#45;&#45;ghost rbtn&#45;&#45;icon"-->
<!--              type="button"-->
<!--              @click="viewMode = 'list'"-->
<!--            >-->
<!--              <n-icon :component="ListOutline" :size="16" class="btn-icon"/>-->
<!--            </button>-->
<!--          </template>-->
<!--          טבלה-->
<!--        </n-tooltip>-->
<!--      </div>-->
    </div>


    <!-- ── Tile grid ──────────────────────────────────────────────────── -->
    <n-spin :show="store.loading">
      <div v-if="pagedRows.length && viewMode === 'grid'" class="tile-grid">
        <article
          v-for="row in pagedRows"
          :key="row.id"
          :class="{
            [`tile--${fileKind(row.mime_type)}`]: true,
            'tile--selected': selectedIds.has(String(row.id)),
            'tile--selectable': bulkMode,
          }"
          class="tile"
          @click="onDocumentClick(row)"
        >
          <div class="tile__head">
            <n-checkbox
              v-if="bulkMode"
              :checked="selectedIds.has(String(row.id))"
              class="tile__check"
              @click.stop
              @update:checked="toggleSelect(String(row.id))"
            />
            <StatusBadge :status="row.processing_status" />
            <div class="tile__actions" @click.stop>
              <StorageSyncIcons
                compact
                :in-s3="documentInS3(row)"
                :drive-synced="Boolean(documentDriveId(row))"
                :drive-busy="exportingToDrive && !documentDriveId(row)"
                :drive-link="documentDriveLink(row)"
                :download-url="documentDownloadUrl(row)"
                :from-gmail="isGmailImported(row)"
              />
              <n-dropdown
                :options="rowActionsFor(row)"
                placement="bottom-end"
                trigger="click"
                @select="(k: string) => handleRowAction(k, row)"
              >
                <button class="btn btn--ghost btn--xs icon-btn" type="button" :aria-label="l.common.actions">
                  <n-icon :component="EllipsisVerticalOutline" class="btn-icon"/>
                </button>
              </n-dropdown>
            </div>
          </div>
          <div class="tile__thumb">
            <n-icon
              :component="fileTypeIcon(row.mime_type)"
              :size="40"
              class="tile__file-icon"
            />
          </div>
          <div class="tile__body">
            <div :title="row.file_name" class="tile__name">{{ row.file_name }}</div>
            <div class="tile__meta">
              <span v-if="documentReportNumberLabel(row)" class="tile__meta-item tile__meta-item--num">
                {{ documentReportNumberLabel(row) }}
              </span>
              <span v-if="documentHasClient(row)" class="tile__meta-item">
                {{ documentClientName(row) }}
                <template v-if="documentContactPerson(row)"> · {{ documentContactPerson(row) }}</template>
              </span>
              <span v-if="documentTypeLabel(row)" class="tile__meta-item">{{ documentTypeLabel(row) }}</span>
              <span v-if="inspectionTypeLabel(row)" class="tile__meta-item tile__meta-item--inspection">{{ inspectionTypeLabel(row) }}</span>
            </div>
            <div class="tile__pills">
              <n-tag
                v-if="shouldShowReminderBadge(row)"
                :type="reminderTagType((row as any).reminder_status)"
                round
                size="small"
              >
                {{ reminderStatusLabel((row as any).reminder_status) }}
              </n-tag>
              <n-tag
                v-for="issue in documentIssues(row)"
                :key="issue.kind"
                round
                size="small"
                :type="issue.tagClass === 'tag--bad' ? 'error' : 'warning'"
                :title="issue.kind === 'email_bounced' ? emailDeliveryTitle(row) : undefined"
              >
                {{ issue.label }}
              </n-tag>
            </div>
            <div class="tile__date">
              {{ formatDate(row.import_date) }}
              <span v-if="documentImportSourceLabel(row)" class="tile__import-source">{{ documentImportSourceLabel(row) }}</span>
            </div>
          </div>
        </article>
      </div>

      <div v-else-if="pagedRows.length && viewMode === 'list'" class="document-table-wrap">
        <table class="document-table">
          <colgroup>
            <col class="document-table__col document-table__col--select" />
            <col class="document-table__col document-table__col--file" />
            <col class="document-table__col document-table__col--type"/>
            <col class="document-table__col document-table__col--date" />
            <col class="document-table__col document-table__col--import" />
            <col class="document-table__col document-table__col--client" />
            <col class="document-table__col document-table__col--number" />
            <col class="document-table__col document-table__col--actions" />
          </colgroup>
          <thead>
            <tr>
              <th class="document-col document-col--select" @click.stop>
                <n-checkbox
                  :checked="allVisibleSelected"
                  :indeterminate="someVisibleSelected && !allVisibleSelected"
                  :aria-label="l.documents.selectAllOnPage"
                  @update:checked="toggleSelectVisible"
                />
              </th>
              <th class="document-col document-col--file">
                <button class="document-sort-button" type="button" :aria-label="documentSortAriaLabel('file')" @click="setDocumentSort('file')">
                  <span>{{ l.common.file }}</span>
                  <n-icon :component="documentSortIcon('file')" :size="14" />
                </button>
              </th>
              <th class="document-col document-col--type">
                <button :aria-label="documentSortAriaLabel('type')" class="document-sort-button" type="button"
                        @click="setDocumentSort('type')">
                  <span>{{ l.documents.typeColumn }}</span>
                  <n-icon :component="documentSortIcon('type')" :size="14"/>
                </button>
              </th>
              <th class="document-col document-col--date">
                <button class="document-sort-button" type="button" :aria-label="documentSortAriaLabel('date')" @click="setDocumentSort('date')">
                  <span>{{ l.common.validUntil }}</span>
                  <n-icon :component="documentSortIcon('date')" :size="14" />
                </button>
              </th>
              <th class="document-col document-col--import">
                <button class="document-sort-button" type="button" :aria-label="documentSortAriaLabel('import')" @click="setDocumentSort('import')">
                  <span>{{ l.common.importCol }}</span>
                  <n-icon :component="documentSortIcon('import')" :size="14" />
                </button>
              </th>
              <th class="document-col document-col--client">
                <button class="document-sort-button" type="button" :aria-label="documentSortAriaLabel('client')" @click="setDocumentSort('client')">
                  <span>{{ l.common.client }}</span>
                  <n-icon :component="documentSortIcon('client')" :size="14" />
                </button>
              </th>
              <th class="document-col document-col--number">
                <button class="document-sort-button" type="button" :aria-label="documentSortAriaLabel('number')" @click="setDocumentSort('number')">
                  <span>{{ l.common.number }}</span>
                  <n-icon :component="documentSortIcon('number')" :size="14" />
                </button>
              </th>
              <th class="document-col document-col--actions actions-title">{{ l.common.actions }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in pagedRows"
              :key="row.id"
              class="document-table-row"
              tabindex="0"
              role="button"
              @click="openDocumentRow(row)"
              @keydown.enter.prevent="openDocumentRow(row)"
              @keydown.space.prevent="openDocumentRow(row)"
            >
              <td class="document-col document-col--select" @click.stop>
                <n-checkbox
                  :checked="selectedIds.has(String(row.id))"
                  :aria-label="`בחר ${row.file_name}`"
                  @update:checked="(checked: boolean) => setRowSelected(String(row.id), checked)"
                />
              </td>
              <td class="cell-strong document-col document-col--file">
                <span class="document-file-cell">
                  <span class="document-file-cell__text">
                    <span class="document-cell-truncate" dir="auto" :title="row.file_name">{{ row.file_name }}</span>
                  </span>
                  <!-- Moved off the removed status column: a bounced reminder is a
                       delivery failure the user has to act on, not processing
                       state, so it outlives the column it happened to live in. -->
                  <n-tag
                    v-for="issue in documentIssues(row)"
                    :key="issue.kind"
                    round
                    size="small"
                    :type="issue.tagClass === 'tag--bad' ? 'error' : 'warning'"
                    :title="issue.kind === 'email_bounced' ? emailDeliveryTitle(row) : undefined"
                  >
                    {{ issue.label }}
                  </n-tag>
                </span>
              </td>
              <td class="document-col document-col--type">
                <span :title="inspectionTypeLabel(row) ?? undefined"
                      class="document-cell-truncate">{{ inspectionTypeLabel(row) || "—" }}</span>
              </td>
              <td class="document-col document-col--date">
                <span v-if="documentExpiryDate(row)" class="document-expiry">
                  <span :class="expiryClass(documentExpiryDate(row))">{{ formatExpiryDate(documentExpiryDate(row)) }}</span>
                </span>
                <span v-else>—</span>
              </td>
              <td class="document-col document-col--import">
                <span class="document-import">
                  <span>{{ formatDate(row.import_date) }}</span>
                  <span v-if="documentImportSourceLabel(row)" class="document-import__source">{{ documentImportSourceLabel(row) }}</span>
                </span>
              </td>
              <td class="document-col document-col--client">
                <span class="document-client">
                  <router-link
                    v-if="documentClientId(row)"
                    class="document-cell-truncate client-link"
                    dir="auto"
                    :title="documentClientName(row)"
                    :to="href(`/clients/${documentClientId(row)}`)"
                    @click.stop
                  >{{ documentClientName(row) }}</router-link>
                  <span v-else class="document-cell-truncate" dir="auto" :title="documentClientName(row)">{{ documentClientName(row) }}</span>
                  <span v-if="documentContactPerson(row)" class="document-client__contact">{{ documentContactPerson(row) }}</span>
                </span>
              </td>
              <td class="document-col document-col--number">
                <span class="document-cell-truncate">{{ documentReportNumberLabel(row) || "—" }}</span>
              </td>
              <td class="cell-actions document-col document-col--actions" @click.stop>
                <div class="row-actions">
                  <StorageSyncIcons
                    compact
                    :in-s3="documentInS3(row)"
                    :drive-synced="Boolean(documentDriveId(row))"
                    :drive-busy="exportingToDrive && !documentDriveId(row)"
                    :drive-link="documentDriveLink(row)"
                    :download-url="documentDownloadUrl(row)"
                    :from-gmail="isGmailImported(row)"
                  />
                  <n-tooltip v-if="row.quote_id">
                    <template #trigger>
                      <button class="btn btn--ghost btn--xs icon-btn document-row-action document-row-action--quote" type="button" :aria-label="l.documents.openQuote" @click="router.push(href(`/quotes/${row.quote_id}`))">
                        <n-icon :component="DocumentTextOutline" class="btn-icon" />
                      </button>
                    </template>
                    {{ l.documents.openQuote }} {{ row.quote_number || "" }}
                  </n-tooltip>
                  <n-dropdown
                    :options="rowActionsFor(row)"
                    class="document-row-actions-menu"
                    placement="bottom-start"
                    trigger="click"
                    @select="(key: string) => handleRowAction(key, row)"
                  >
                    <button class="btn btn--ghost btn--xs icon-btn document-row-action" type="button" :aria-label="l.common.actions">
                      <n-icon :component="EllipsisVerticalOutline" class="btn-icon" />
                    </button>
                  </n-dropdown>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else-if="!store.loading" class="empty">
        <p>{{ l.documents.empty }}</p>
        <button :disabled="limitReached" class="rbtn rbtn--primary mt-3" type="button" @click="openUploadModal()">
          <n-icon :component="CloudUploadOutline" class="btn-icon"/>
          {{ l.documents.firstUpload }}
        </button>
      </div>
    </n-spin>

    <PaginationBar
      v-if="filteredRows.length"
      v-model:page="currentPage"
      v-model:page-size="pageSize"
      :item-count="filteredRows.length"
    />

    <!-- ── Document limit modal ────────────────────────────────────────── -->
    <n-modal
      v-model:show="showLimitModal"
      :class="confirmDialogClass"
      :negative-button-props="confirmCancelButtonProps"
      :positive-button-props="confirmActionButtonProps('success')"
      :show-icon="false"
      negative-text="סגור"
      positive-text="שדרג ל-Business "
      preset="dialog"
      type="warning"
      @positive-click="showLimitModal = false"
      @negative-click="showLimitModal = false"
    >
      <template #header>
        <ConfirmDialogHead title="הגעת למגבלת המסמכים" type="warning"/>
      </template>
      <p>הגעת למגבלת <strong>{{ store.documentLimit }}</strong> המסמכים בחשבון החינמי.</p>
      <p class="text-sm text-[var(--text-secondary)]">שדרג לחשבון Business להעלאה בלתי מוגבלת.</p>
    </n-modal>

    <n-modal
      v-model:show="showRescanAllConfirm"
      :class="confirmDialogClass"
      :negative-button-props="confirmCancelButtonProps"
      :positive-button-props="confirmActionButtonProps('warning')"
      :show-icon="false"
      negative-text="ביטול"
      positive-text="סרוק הכל מחדש"
      preset="dialog"
      type="warning"
      @positive-click="doRescanAll"
      @negative-click="showRescanAllConfirm = false"
    >
      <template #header>
        <ConfirmDialogHead title="סריקה מחדש לכל המסמכים" type="warning"/>
      </template>
      <div class="rescan-confirm" dir="rtl">
        <p>
          הפעולה תסרוק מחדש את כל המסמכים הזמינים ותיצור מחדש את הנתונים שנוצרו מהם.
        </p>
        <ul>
          <li>חוזים ותסקירים שנוצרו מהמסמך ייבנו מחדש.</li>
          <li>תזכורות שנוצרו מהמסמך יימחקו ויחושבו מחדש.</li>
          <li>הפעולה מיועדת לתיקוני מערכת כמו חישוב הפרש חודשים.</li>
        </ul>
      </div>
    </n-modal>

    <!-- ── Clone & renew contract modal ────────────────────────────────── -->
    <n-modal
      v-model:show="showCloneConfirm"
      :class="confirmDialogClass"
      :negative-button-props="{ ...confirmCancelButtonProps, disabled: cloningContract }"
      :positive-button-props="{ ...confirmActionButtonProps('primary'), loading: cloningContract, disabled: cloningContract }"
      :show-icon="false"
      negative-text="ביטול"
      positive-text="שכפל"
      preset="dialog"
      type="info"
      @positive-click="doCloneContract"
      @negative-click="showCloneConfirm = false"
    >
      <template #header>
        <ConfirmDialogHead title="שכפול תסקיר" type="info"/>
      </template>
      <div v-if="cloneCandidate" class="rescan-confirm" dir="rtl">
        <p>
          האם אתה בטוח שברצונך לשכפל את התסקיר
          <bdi class="confirm-dialog__bidi" dir="ltr">"{{ cloneCandidate.contract_number || "ללא מספר" }}"</bdi>?
        </p>
        <p>תסקיר חדש ייווצר עם:</p>
        <ul>
          <li>תאריך בדיקה: {{ formatDate(cloneCandidate.newStartDate) }}</li>
          <li>תאריך בדיקה הבאה: {{ formatDate(cloneCandidate.newExpiryDate) }} ({{ cloneCandidate.shiftMonths }} חודשים)</li>
          <li>מספר תסקיר: יישאר ריק למילוי</li>
        </ul>
      </div>
    </n-modal>

    <!-- ── Upload modal ───────────────────────────────────────────────── -->
    <UploadModal
      ref="uploadModalRef"
      v-model="showUploadModal"
      :rescan="rescanModalState"
      :uploading="uploading"
      @upload="onModalUpload"
      @view-document="openDocumentFromModal"
      @create-template="onCreateTemplate"
    />
    <HydraulicCheckModal
      ref="newInspectionModalRef"
      v-model:show="showNewInspection"
      @created="handleInspectionCreated"
      @updated="handleInspectionCreated"
    />
    <CreateQuoteModal
      v-model:show="showCreateQuote"
      :row="createQuoteRow"
      @created="onQuoteCreated"
    />
    <MonthlyReportModal v-model:show="showMonthlyReport"/>
    <ReminderPreviewModal
      v-model:show="showReminderPreview"
      :reminder-id="previewReminderId"
      :reminder-title="previewReminderTitle"
    />
  </div>
</template>

<script setup lang="ts">
import {computed, h, nextTick, onMounted, onUnmounted, ref, watch, type Component} from "vue";
import {useRouter} from "vue-router";
import {
  NAlert,
  NCheckbox,
  NDatePicker,
  NDropdown,
  NIcon,
  NInput,
  NModal,
  NPopover,
  NProgress,
  NSelect,
  NSpace,
  NSpin,
  NTag,
  NTooltip,
  useMessage,
} from "naive-ui";
import {
  ArrowDownOutline,
  ArrowUpOutline,
  AddOutline,
  CloudUploadOutline,
  DocumentOutline,
  CopyOutline,
  DocumentTextOutline,
  DownloadOutline,
  EllipsisVerticalOutline,
  EyeOutline,
  FlashOutline,
  GridOutline,
  ImageOutline,
  ListOutline,
  RefreshOutline,
  TimeOutline,
  CheckboxOutline,
  SettingsOutline,
  SwapVerticalOutline,
  TrashOutline,
} from "@vicons/ionicons5";
import {useDocumentsStore} from "../stores/documents.js";
import {useAuthStore} from "../stores/auth.js";
import {useRescanModalStore} from "../stores/rescanModal.js";
import {api, type DriveExportJob} from "../services/apiService.js";
import {INSPECTION_PRINT_TEMPLATE_PRESETS} from "@shared/printTemplateLayout.js";
import {featureFlagsForUser, planAllowsDocumentImport, planAllowsGoogleDrive, PLAN_GATE_MESSAGES, resolveUserPlan} from "../shared/pricingPlans.js";
import StatusBadge from "../components/StatusBadge.vue";
import PageHeader from "../components/PageHeader.vue";
import PaginationBar from "../components/PaginationBar.vue";
import UploadModal from "../components/UploadModal.vue";
import DocumentDropStrip from "../components/DocumentDropStrip.vue";
import GmailLogo from "../components/GmailLogo.vue";
import GoogleDriveLogo from "../components/GoogleDriveLogo.vue";
import DriveExportJobStatus from "../components/DriveExportJobStatus.vue";
import StorageSyncIcons from "../components/StorageSyncIcons.vue";
import MonthlyReportModal from "../components/MonthlyReportModal.vue";
import ReminderPreviewModal from "../components/modals/ReminderPreviewModal.vue";
import type {DocTemplate, Document} from "@shared/types.js";
import {
  countDuplicateReportRows,
  documentReportNumber,
  documentReportNumberLabel,
  duplicateReportNumberSet,
  isDuplicateReportNumber,
  listDocumentRowIssues,
} from "@shared/rowIssues.js";
import {
  documentTypeFromTemplate,
  pickBestTemplateForExtraction,
} from "@shared/missingDocumentFields.js";
import {readRememberedFilter, writeRememberedFilter} from "@shared/rememberedUi.js";
import {confirmActionButtonProps, confirmCancelButtonProps, CONFIRM_DIALOG_CLASS, useConfirm} from "../composables/useConfirm.js";
import ConfirmDialogHead from "../components/ConfirmDialogHead.vue";
import HydraulicCheckModal from "../components/contracts/HydraulicCheckModal.vue";
import CreateQuoteModal from "../components/documents/CreateQuoteModal.vue";
import {useI18n} from "../composables/useI18n.js";
import {useDevModal} from "../composables/useDevModal.js";

const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

const store = useDocumentsStore();
const {l, href, t, dir} = useI18n();
const authStore = useAuthStore();
const rescanStore = useRescanModalStore();
const router = useRouter();
const message = useMessage();
const {confirm} = useConfirm();
const confirmDialogClass = CONFIRM_DIALOG_CLASS;

const isRegularUser = computed(() => authStore.user?.role === "user");
const planUser = computed(() => authStore.actingAs ?? authStore.user);
const currentPlan = computed(() => {
  const local = resolveUserPlan(planUser.value);
  if (local === "expired") return "expired";
  return store.plan || local;
});
const createLocked = computed(() => currentPlan.value === "expired");
const driveAllowed = computed(() => planAllowsGoogleDrive(currentPlan.value));

function goToSubscription() {
  router.push({path: href("/profile"), query: {section: "subscription"}});
}

const exportAllowed = computed(() => featureFlagsForUser(planUser.value).excelExport);
const quotaPercent = computed(() => {
  const limit = store.documentLimit;
  if (limit === null || limit <= 0) return currentPlan.value === "expired" ? 100 : 0;
  return Math.min(100, Math.round((store.documentQuotaUsed / limit) * 100));
});
const limitReached = computed(() =>
    store.documentLimit !== null && store.documentQuotaUsed >= store.documentLimit,
);
const importLocked = computed(() =>
    createLocked.value
    || store.documentImportAllowed === false
    || !planAllowsDocumentImport(currentPlan.value)
    || limitReached.value,
);
const importLockLabel = computed(() => {
  if (createLocked.value || store.documentImportAllowed === false || !planAllowsDocumentImport(currentPlan.value)) {
    return PLAN_GATE_MESSAGES.documentImport;
  }
  return `הגעת למגבלת ${store.documentLimit} סריקות`;
});

const uploading = ref(false);
const importingFromGmail = ref(false);
const exportingToDrive = ref(false);
const activeDriveExportJob = ref<DriveExportJob | null>(null);
const lastDriveExportJob = ref<DriveExportJob | null>(null);
const visibleDriveExportJob = computed(() => activeDriveExportJob.value ?? lastDriveExportJob.value);
const showMonthlyReport = ref(false);
const showReminderPreview = ref(false);
const previewReminderId = ref<number | string | null>(null);
const previewReminderTitle = ref<string | null>(null);
let rescanPollTimer: ReturnType<typeof setInterval> | null = null;
const rescanningAll = ref(false);
const deletingAll = ref(false);
const bulkMode = ref(false);
const selectedIds = ref(new Set<string>());
const bulkDeleting = ref(false);
const bulkDownloading = ref(false);
const bulkMerging = ref(false);
const bulkExtracting = ref(false);
const showRescanAllConfirm = ref(false);
const showLimitModal = ref(false);
useDevModal("documents.rescanAll", showRescanAllConfirm);
useDevModal("documents.limit", showLimitModal);

function onQuotaReached() {
  showLimitModal.value = true;
  store.fetch(undefined, true);
}
const viewMode = ref<"grid" | "list">("list");
const rescanAlertTitle = computed(() => {
  const action = rescanStore.kind === "upload" ? "העלאה" : "סריקה מחדש";
  if (rescanStore.remaining > 0) {
    return `${action} פעילה: ${rescanStore.remaining} מתוך ${rescanStore.queued} עדיין בעיבוד`;
  }
  return `${rescanStore.queued} מסמכים נשלחו ל${rescanStore.kind === "upload" ? "עיבוד" : "סריקה מחדש"}`;
});
const rescanRows = computed(() =>
  rescanStore.ids
    .map((id) => store.rows.find((row) => String(row.id) === id))
    .filter((row): row is Document => Boolean(row))
);
const rescanModalState = computed(() => ({
  queued: rescanStore.queued,
  remaining: rescanStore.remaining,
  done: rescanStore.done,
  kind: rescanStore.kind,
  rows: rescanStore.rows,
}));

// ── Upload modal ───────────────────────────────────────────────────────────────
const showUploadModal = ref(false);
useDevModal("documents.upload", showUploadModal);
const uploadModalRef = ref<InstanceType<typeof UploadModal> | null>(null);
const showNewInspection = ref(false);
const newInspectionModalRef = ref<InstanceType<typeof HydraulicCheckModal> | null>(null);

function openNewInspection() {
  if (createLocked.value) return;
  newInspectionModalRef.value?.open();
}

async function handleInspectionCreated() {
  await store.fetch(undefined, true);
}

function openUploadModal() {
  if (importLocked.value) return;
  showUploadModal.value = true;
}

async function handleGmailImport() {
  if (importLocked.value) return;
  importingFromGmail.value = true;
  try {
    const status = await api.gmail.status();
    if (!status.connected) {
      const { url } = await api.gmail.authUrl();
      window.location.assign(url);
      return;
    }
    const template = docTemplates.value.find(
      (t) => t.document_kind === "inspection_report" || /תסקיר|בדיקה|ציוד|הרמה/i.test(t.name)
    ) ?? null;
    const templateId = template?.id ? String(template.id) : undefined;
    const result = await api.gmail.importAll(undefined, undefined, templateId);
    const failed = result.results.filter((r) => r.error).length;
    const imported = result.imported ?? 0;
    if (imported) {
      message.success(`יובאו ${imported} תסקירים מ-Gmail`);
    } else if (failed) {
      message.warning("לא יובאו מסמכים. חלק מהקבצים נכשלו בעיבוד.");
    } else {
      message.info("לא נמצאו תסקירים חדשים לייבוא");
    }
    await store.fetch(undefined, true);
  } catch (err: any) {
    const code = String(err?.message ?? "");
    if (code.includes("gmail_not_connected")) {
      message.error("Gmail לא מחובר. לחץ שוב כדי להתחבר.");
    } else if (
        code.includes("document_monthly_limit_reached")
        || code.includes("document_monthly_quota_exceeded")
    ) {
      message.error("הגעת למגבלת הייבוא החודשית של המנוי.");
    } else {
      message.error("שגיאה בייבוא מ-Gmail");
    }
  } finally {
    importingFromGmail.value = false;
  }
}

async function handleDriveExport() {
  if (!driveAllowed.value) {
    message.warning("ייצוא ל-Google Drive זמין במסלולים בסיסי ועסקי בלבד");
    return;
  }
  try {
    const status = await api.drive.status();
    if (!status.allowed) {
      message.warning("ייצוא ל-Google Drive זמין במסלולים בסיסי ועסקי בלבד");
      return;
    }
    if (!status.syncEnabled) {
      message.warning("יש להפעיל סנכרון Drive בהגדרות הפרופיל לפני ייצוא");
      return;
    }
    const folderGone = status.folderState === "missing" || status.folderState === "trashed";
    if (folderGone) {
      const count = status.syncedFileCount ?? 0;
      confirm({
        title: status.folderState === "trashed" ? "תיקיית Drive בפח" : "תיקיית Drive נמחקה",
        content: count
          ? `${count} מסמכים סומנו כמסונכרנים אבל הם כבר לא בתיקייה. ליצור תיקייה חדשה ולהעלות מחדש?`
          : "תיקיית Google Drive נמחקה. ליצור תיקייה חדשה ולהעלות את המסמכים?",
        confirmText: "העלה מחדש",
        type: "warning",
        onConfirm: runDriveExport,
      });
      return;
    }
    await runDriveExport();
  } catch (err: any) {
    if (String(err?.message ?? "").includes("drive_plan_required")) {
      message.warning("ייצוא ל-Google Drive זמין במסלולים בסיסי ועסקי בלבד");
    } else {
      message.error("שגיאה בייצוא ל-Drive");
    }
  }
}

function openMonthlyReport() {
  if (!exportAllowed.value) {
    message.warning("ייצוא דוחות זמין במסלולים בסיסי ועסקי בלבד");
    return;
  }
  showMonthlyReport.value = true;
}

async function runDriveExport() {
  exportingToDrive.value = true;
  lastDriveExportJob.value = null;
  try {
    const started = await api.drive.exportAll();
    activeDriveExportJob.value = started;
    message.info("ייצוא ל-Drive התחיל ברקע");
    const result = await waitForDriveExportJob(started.jobId);
    lastDriveExportJob.value = result;
    const folderHint = result.folderName ? ` לתיקיית "${result.folderName}"` : "";
    if (result.recreated) {
      message.success(`נוצרה תיקייה חדשה והועלו ${result.uploaded} מסמכים${folderHint}${result.failed > 0 ? ` (${result.failed} נכשלו)` : ""}`);
    } else if (result.total === 0) {
      message.info("כל המסמכים כבר מסונכרנים ל-Drive");
    } else {
      message.success(`הועלו ${result.uploaded} מסמכים${folderHint} ב-Google Drive${result.failed > 0 ? ` (${result.failed} נכשלו)` : ""}`);
    }
    if (result.folderUrl) {
      window.open(result.folderUrl, "_blank", "noopener,noreferrer");
    }
    await store.fetch(undefined, true);
  } catch (err: any) {
    if (String(err?.message ?? "").includes("drive_plan_required")) {
      message.warning("ייצוא ל-Google Drive זמין במסלולים בסיסי ועסקי בלבד");
    } else if (String(err?.message ?? "").includes("drive_scope_missing")) {
      message.warning("יש להתחבר מחדש ל-Gmail כדי לאשר גישה ל-Drive");
    } else {
      message.error("שגיאה בייצוא ל-Drive");
    }
  } finally {
    activeDriveExportJob.value = null;
    exportingToDrive.value = false;
  }
}

async function waitForDriveExportJob(jobId: string | null): Promise<DriveExportJob> {
  if (!jobId) throw new Error("drive_export_missing_job");
  let last: DriveExportJob | null = null;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    last = await api.drive.exportJob(jobId);
    activeDriveExportJob.value = last;
    if (last.status === "completed") return last;
    if (last.status === "failed") throw new Error(last.error || "drive_export_failed");
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
  }
  throw new Error("drive_export_timeout");
}

function openDocumentFromModal(id: string) {
  showUploadModal.value = false;
  router.push(`/documents/${id}`);
}

function onCreateTemplate(file: File) {
  // Store the file in sessionStorage key so DocTemplatesPage can pick it up
  // We navigate there; the page reads the flag and auto-opens the generator
  sessionStorage.setItem("doc_templates_pending_file_name", file.name);
  sessionStorage.setItem("doc_templates_pending_file_size", String(file.size));
  // Store the actual file in a module-level variable (same session)
  (window as any).__pendingTemplateFile = file;
  router.push("/settings/doc-templates");
}

async function openRescanModal() {
  showUploadModal.value = true;
  await nextTick();
  uploadModalRef.value?.openRescan();
}

async function onModalUpload(
  files: File[],
  fields: { key: string; label_he: string; type: string }[],
  options: { doAi: boolean; doEntities: boolean; doReminders: boolean; templateId?: string }
) {
  await uploadFiles(files, options);
  showUploadModal.value = false;
}

// ── Filters ───────────────────────────────────────────────────────────────────
type DocumentStatusFilter = "all" | "in_progress" | "error" | "no_reminder" | "no_email" | "email_bounced" | "contract_expired" | "duplicate_report_number";

const DOCUMENT_FILTER_KEYS = new Set<DocumentStatusFilter>([
  "all", "in_progress", "error", "no_reminder", "no_email", "email_bounced", "contract_expired", "duplicate_report_number",
]);
function initialDocumentFilter(): DocumentStatusFilter {
  const stored = readRememberedFilter("documents");
  return DOCUMENT_FILTER_KEYS.has(stored as DocumentStatusFilter) ? stored as DocumentStatusFilter : "all";
}

const search = ref("");
const filterClientId = ref<string | null>(null);
const filterInspectionType = ref<string | null>(null);
const filterDateRange = ref<[number, number] | null>(null);
const statusFilter = ref<DocumentStatusFilter>(initialDocumentFilter());
type DocumentSortKey = "file" | "type" | "date" | "import" | "client" | "number";
const documentSortBy = ref<DocumentSortKey>("import");
const documentSortDir = ref<"asc" | "desc">("desc");

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  inspection_report: "תסקיר בדיקה",
  contract: "חוזה / הסכם",
  invoice: "חשבונית",
  certificate: "תעודה / הסמכה",
  unknown: "לא ידוע",
  "חוזה שירות": "חוזה / הסכם",
  חשבונית: "חשבונית",
  "תסקיר בדיקה": "תסקיר בדיקה",
};

function formatDocumentTypeLabel(raw: string): string {
  return DOCUMENT_TYPE_LABELS[raw] ?? raw;
}

const INSPECTION_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  INSPECTION_PRINT_TEMPLATE_PRESETS.map((p) => [p.key, p.name]),
);

function inspectionTypeLabel(row: Document): string | null {
  const key = row.inspection_type;
  return key ? (INSPECTION_TYPE_LABELS[key] ?? key) : null;
}

// Built from the server-side aggregate (counts across the whole filtered
// dataset) rather than the currently-loaded page, so a type that has documents
// outside the current page/filter still shows up with an accurate count.
const inspectionTypeOptions = computed(() => {
  const counts = new Map(store.inspectionTypeCounts.map((c) => [c.type, c.count]));
  const keys = new Set<string>([
    ...INSPECTION_PRINT_TEMPLATE_PRESETS.map((p) => p.key),
    ...counts.keys(),
  ]);
  return [...keys]
      .map((type) => ({
        label: `${INSPECTION_TYPE_LABELS[type] ?? type} (${counts.get(type) ?? 0})`,
        value: type,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "he"));
});

type CombinedFilter = {
  key: string;
  label: string;
  count: number;
  statusValue?: DocumentStatusFilter;
};

const combinedFilters = computed<CombinedFilter[]>(() => {
  const c = store.counts;
  const rows = store.rows ?? [];
  const duplicateCount = countDuplicateReportRows(rows, documentReportNumber);
  return [
    { key: "all",         label: l.value.common.all,         count: c.all,          statusValue: "all" },
    { key: "in_progress", label: l.value.documents.inProgress,      count: c.in_progress,  statusValue: "in_progress" },
    { key: "error",       label: l.value.common.error,       count: c.error,        statusValue: "error" },
    { key: "no_reminder",       label: l.value.documents.noReminder, count: rows.filter((row) => (row as any).reminder_status === "missing" && !isPayslipDocument(row)).length, statusValue: "no_reminder" },
    { key: "no_email",          label: l.value.common.missingEmail, count: rows.filter((row) => !documentHasEmail(row)).length, statusValue: "no_email" },
    { key: "email_bounced",     label: l.value.documents.bounced, count: rows.filter((row) => Boolean((row as any).email_delivery)).length, statusValue: "email_bounced" },
    { key: "contract_expired",  label: l.value.common.expired,   count: rows.filter((row) => (row as any).contract_status === "expired" || (row as any).contract_status === "overdue").length, statusValue: "contract_expired" },
    { key: "duplicate_report_number", label: l.value.documents.duplicateNumber, count: duplicateCount, statusValue: "duplicate_report_number" },
  ];
});

const duplicateDocumentNumbers = computed(() =>
  duplicateReportNumberSet(store.rows ?? [], documentReportNumber),
);

function documentIssues(row: Document) {
  return listDocumentRowIssues(row as Document & { reminder_status?: string; contract_status?: string }, duplicateDocumentNumbers.value);
}

const activeFilterKey = ref(statusFilter.value);

function applyFilter(f: CombinedFilter) {
  activeFilterKey.value = f.key;
  statusFilter.value = f.statusValue ?? "all";
  currentPage.value = 1;
  writeRememberedFilter("documents", f.key);
}

const clientOptions = ref<{ label: string; value: string }[]>([]);
async function loadClients() {
  try {
    // Only the names and ids feed the client filter dropdown; doc_count is not
    // rendered here and costs three extra collection scans server-side.
    const r = await api.clients.list({ limit: 0 });
    clientOptions.value = r.rows.map((c) => ({ label: c.display_name, value: String(c.id) }));
  } catch { /* non-fatal */ }
}

// ── Pagination ─────────────────────────────────────────────────────────────────
const pageSize = ref(20);
const currentPage = ref(1);
watch([search, filterClientId, filterInspectionType, filterDateRange, statusFilter, pageSize, documentSortBy, documentSortDir], () => {
  currentPage.value = 1;
});

// Refetch from server whenever the client filter changes (so we always get
// the canonical client→document mapping rather than relying on cached rows).
watch(filterClientId, (cid) => {
  store.fetch({ clientId: cid ?? undefined, limit: 0 }, true);
});

const filteredRows = computed(() => {
  let rows = store.rows ?? [];
  if (statusFilter.value !== "all") {
    rows = rows.filter((row) => matchesStatusFilter(row, statusFilter.value));
  }
  if (filterInspectionType.value) {
    rows = rows.filter((row) => row.inspection_type === filterInspectionType.value);
  }
  const q = search.value.trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
      (r.file_name ?? "").toLowerCase().includes(q) ||
      (documentReportNumber(r)?.includes(q) ?? false),
    );
  }
  if (filterDateRange.value) {
    const [from, to] = filterDateRange.value;
    rows = rows.filter((r) => {
      if (!r.import_date) return false;
      const d = new Date(r.import_date).getTime();
      return d >= from && d <= to;
    });
  }
  return rows;
});

const sortedRows = computed(() => {
  return [...filteredRows.value].sort((a, b) => compareDocuments(a, b, documentSortBy.value, documentSortDir.value));
});

const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return sortedRows.value.slice(start, start + pageSize.value);
});

function setDocumentSort(key: DocumentSortKey) {
  if (documentSortBy.value === key) {
    documentSortDir.value = documentSortDir.value === "asc" ? "desc" : "asc";
  } else {
    documentSortBy.value = key;
    documentSortDir.value = key === "date" || key === "import" ? "desc" : "asc";
  }
}

function documentSortIcon(key: DocumentSortKey): Component {
  if (documentSortBy.value !== key) return SwapVerticalOutline;
  return documentSortDir.value === "asc" ? ArrowUpOutline : ArrowDownOutline;
}

function documentSortAriaLabel(key: DocumentSortKey): string {
  const labels: Record<DocumentSortKey, string> = {
    file: l.value.common.file,
    type: l.value.documents.typeColumn,
    date: l.value.common.validUntil,
    import: l.value.common.importCol,
    client: l.value.common.client,
    number: l.value.common.number,
  };
  const nextDirection = documentSortBy.value === key && documentSortDir.value === "asc"
    ? l.value.common.sortDesc
    : l.value.common.sortAsc;
  return t("common.sortBy", {col: labels[key], dir: nextDirection});
}

function compareDocuments(a: Document, b: Document, key: DocumentSortKey, dir: "asc" | "desc"): number {
  const direction = dir === "asc" ? 1 : -1;
  const result = key === "date"
    ? compareNullableNumbers(documentDateSortValue(a), documentDateSortValue(b))
    : key === "import"
      ? compareNullableNumbers(documentImportSortValue(a), documentImportSortValue(b))
      : compareNullableText(documentSortText(a, key), documentSortText(b, key));
  if (result !== 0) return result * direction;
  return compareNullableText(a.file_name ?? "", b.file_name ?? "");
}

function documentSortText(row: Document, key: DocumentSortKey): string | null {
  if (key === "file") return row.file_name ?? "";
  if (key === "type") return inspectionTypeLabel(row) ?? "";
  if (key === "client") return documentClientName(row);
  if (key === "number") return documentReportNumberLabel(row) || documentReportNumber(row) || "";
  return "";
}

function documentDateSortValue(row: Document): number | null {
  const raw = documentExpiryDate(row) ?? row.import_date ?? null;
  if (!raw) return null;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : null;
}

function documentImportSortValue(row: Document): number | null {
  if (!row.import_date) return null;
  const time = new Date(row.import_date).getTime();
  return Number.isFinite(time) ? time : null;
}

function documentImportSourceLabel(row: Document | Record<string, unknown>): string {
  const source = String((row as any).import_source ?? "").trim();
  if (source === "gmail" || isGmailImported(row)) return "Gmail";
  if (source === "drive") return "Drive";
  if (source === "upload") return "העלאה";
  if (String((row as any).document_source ?? "") === "generated") return "נוצר";
  return "";
}

function compareNullableNumbers(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function compareNullableText(a: string | null, b: string | null): number {
  const aa = String(a ?? "").trim();
  const bb = String(b ?? "").trim();
  if (!aa && !bb) return 0;
  if (!aa || aa === "—") return 1;
  if (!bb || bb === "—") return -1;
  return aa.localeCompare(bb, "he", { numeric: true, sensitivity: "base" });
}

const allVisibleSelected = computed(() =>
  pagedRows.value.length > 0 && pagedRows.value.every((row) => selectedIds.value.has(String(row.id))),
);
const someVisibleSelected = computed(() =>
  pagedRows.value.some((row) => selectedIds.value.has(String(row.id))),
);

const allSelected = computed(() =>
  bulkMode.value && selectedIds.value.size > 0 && selectedIds.value.size === filteredRows.value.length
);
const selectedExtractableIds = computed(() =>
  filteredRows.value
    .filter((row) => selectedIds.value.has(String(row.id)) && canExtractDocument(row))
    .map((row) => String(row.id)),
);

watch(filteredRows, (rows, oldRows) => {
  const count = Math.max(1, Math.ceil(rows.length / pageSize.value));
  if (currentPage.value > count) currentPage.value = count;
  if (bulkMode.value && selectedIds.value.size > 0) {
    const wasAllSelected = oldRows && selectedIds.value.size === oldRows.length;
    if (wasAllSelected) {
      selectedIds.value = new Set(rows.map((r) => String(r.id)));
    } else {
      const visible = new Set(rows.map((r) => String(r.id)));
      selectedIds.value = new Set([...selectedIds.value].filter((id) => visible.has(id)));
    }
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("he-IL");
}
function formatExpiryDate(d: string | null | undefined) {
  if (!d) return "—";
  const iso = String(d).slice(0, 10);
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return formatDate(d);
}
function documentExpiryDate(row: Document): string | null {
  const reminderDate = (row as any).reminder_date;
  if (reminderDate) return String(reminderDate);
  return row.expiry_date ?? null;
}
function expiryClass(date: string | null | undefined) {
  if (!date) return "";
  const diff = (new Date(date).getTime() - Date.now()) / 86400000;
  if (diff < 0) return "expiry expiry--expired";
  if (diff < 30) return "expiry expiry--warn";
  return "expiry expiry--ok";
}
function reminderStatusLabel(status: string | null | undefined) {
  if (status === "assigned") return "תזכורת נקבעה";
  if (status === "missing") return "אין תזכורת";
  if (status === "error") return "שגיאת סריקה";
  if (status === "not_applicable") return "";
  return "ממתין";
}
function reminderTagType(status: string | null | undefined): "success" | "warning" | "error" | "info" | "default" {
  if (status === "assigned") return "success";
  if (status === "missing") return "warning";
  if (status === "error") return "error";
  return "info";
}

/** Salary / payslip docs — no reminder workflow. */
function isPayslipDocument(row: Document | Record<string, unknown>): boolean {
  const type = `${(row as any).document_type ?? ""} ${(row as any).document_kind ?? ""}`;
  if (/תלוש/.test(type)) return true;
  if ((row as any).reminder_status === "not_applicable") return true;
  try {
    const fields = typeof (row as any).extracted_fields === "string"
      ? JSON.parse((row as any).extracted_fields)
      : (row as any).extracted_fields ?? {};
    return Boolean(
      fields.payroll_month ||
      fields.employee_name ||
      fields.net_payment ||
      fields.base_salary,
    );
  } catch {
    return false;
  }
}

function shouldShowReminderBadge(row: Document): boolean {
  if (isPayslipDocument(row)) return false;
  const status = (row as any).reminder_status;
  return status !== "not_applicable";
}

/** Prefer the linked/matched template's document_kind (e.g. תלוש משכורת). */
function documentTypeLabel(row: Document | Record<string, unknown>): string {
  if (isInvoiceLikeDocument(row)) return "חשבונית";
  let extracted: Record<string, unknown> = {};
  try {
    const raw = (row as any).extracted_fields;
    extracted = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw ?? {});
  } catch {
    extracted = {};
  }
  const preferredId = (row as any).template_id != null ? String((row as any).template_id) : null;
  const matched =
    pickBestTemplateForExtraction(docTemplates.value, extracted, preferredId) ||
    (preferredId
      ? docTemplates.value.find((t) => String(t.id) === preferredId) ?? null
      : null);
  const fromTemplate = documentTypeFromTemplate(matched);
  if (fromTemplate) return formatDocumentTypeLabel(fromTemplate);

  const kind = String((row as any).document_kind ?? "").trim();
  const type = String((row as any).document_type ?? "").trim();
  const builtins = new Set([
    "inspection_report",
    "contract",
    "invoice",
    "certificate",
    "unknown",
    "חשבונית",
    "חוזה שירות",
    "תסקיר בדיקה",
  ]);
  if (kind && !builtins.has(kind)) return formatDocumentTypeLabel(kind);
  if (type && !builtins.has(type)) return formatDocumentTypeLabel(type);
  if (type) return formatDocumentTypeLabel(type);
  if (kind && kind !== "unknown") return formatDocumentTypeLabel(kind);
  return "";
}

function isGmailImported(row: Document | Record<string, unknown>): boolean {
  // import_source is authoritative for anything imported after it was added.
  // gmail_provider_id covers older rows the backfill could not reach: only the
  // Gmail import path ever sets it.
  if ((row as any).import_source === "gmail") return true;
  return Boolean((row as any).gmail_provider_id);
}

function isInvoiceLikeDocument(row: Document | Record<string, unknown>): boolean {
  if ((row as any).invoice_saved === true || (row as any).invoice_rejected === true) return true;
  if (String((row as any).invoice_rejection_reason ?? "").trim()) return true;
  // Legacy `gmail/invoices/...` and tenant-first `{user_id}/invoices/...` keys.
  if (/(^gmail\/invoices\/|^[^/]+\/invoices\/)/.test(String((row as any).spaces_key ?? ""))) return true;
  const type = `${(row as any).document_type ?? ""} ${(row as any).document_kind ?? ""}`;
  if (/חשבונית|קבלה|invoice|receipt|bill/i.test(type)) return true;
  try {
    const raw = (row as any).extracted_fields;
    const fields = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw ?? {});
    return Boolean(fields.invoice_number || fields.receipt_number || fields.supplier_name || fields.payment_due_date);
  } catch {
    return false;
  }
}

function documentHasEmail(row: Document): boolean {
  try {
    const fields = typeof (row as any).extracted_fields === "string"
      ? JSON.parse((row as any).extracted_fields)
      : (row as any).extracted_fields ?? {};
    return !!(fields.client_email || fields.contact_email || fields.email);
  } catch { return false; }
}

function emailDelivery(row: Document) {
  return (row as any).email_delivery ?? null;
}

function emailDeliveryTitle(row: Document): string {
  const delivery = emailDelivery(row);
  const recipient = delivery?.recipient ? `: ${delivery.recipient}` : "";
  const reason = delivery?.reason ? ` - ${delivery.reason}` : "";
  return `אימייל חזר${recipient}${reason}`;
}

function matchesStatusFilter(row: Document, filter: DocumentStatusFilter) {
  if (filter === "all") return true;
  if (filter === "in_progress") return row.processing_status === "queued" || row.processing_status === "processing";
  if (filter === "error") return row.processing_status === "error";
  if (filter === "no_reminder") {
    return (row as any).reminder_status === "missing" && !isPayslipDocument(row);
  }
  if (filter === "no_email") return !documentHasEmail(row);
  if (filter === "email_bounced") return Boolean((row as any).email_delivery);
  if (filter === "contract_expired") return (row as any).contract_status === "expired" || (row as any).contract_status === "overdue";
  if (filter === "duplicate_report_number") {
    return isDuplicateReportNumber(documentReportNumber(row), duplicateDocumentNumbers.value);
  }
  return true;
}
function fileKind(mime: string | null | undefined) {
  if (!mime) return "other";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("word") || mime.includes("docx")) return "doc";
  if (mime.includes("sheet") || mime.includes("xlsx")) return "xls";
  if (mime.includes("image")) return "img";
  return "other";
}

function fileTypeIcon(mime: string | null | undefined) {
  const kind = fileKind(mime);
  if (kind === "pdf") return DocumentTextOutline;
  if (kind === "xls") return GridOutline;
  if (kind === "img") return ImageOutline;
  return DocumentOutline;
}

function documentExtractedFields(row: Document | Record<string, unknown>): Record<string, unknown> {
  try {
    const raw = (row as any).extracted_fields;
    if (!raw) return {};
    return typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
  } catch {
    return {};
  }
}

function documentClientName(row: Document): string {
  const linked = String(row.client_name ?? "").trim();
  if (linked) return linked;
  const fields = documentExtractedFields(row);
  for (const key of ["client_company", "client_name", "company", "counterparty", "contact_person"]) {
    const text = String(fields[key] ?? "").trim();
    if (text) return text;
  }
  return "—";
}
function documentHasClient(row: Document): boolean {
  return documentClientName(row) !== "—";
}

function documentContactPerson(row: Document): string | null {
  const contact = String(documentExtractedFields(row).contact_person ?? "").trim();
  if (!contact) return null;
  const client = documentClientName(row);
  if (client !== "—" && contact.localeCompare(client, "he", {sensitivity: "base"}) === 0) return null;
  return contact;
}
function documentClientId(row: Document): string | null {
  const id = String(row.client_id ?? "").trim();
  return id || null;
}

function documentInS3(row: Document): boolean {
  return Boolean(row.in_s3 || row.spaces_key);
}

function documentDriveId(row: Document): string | null {
  return row.drive_file_id || null;
}

function documentDriveLink(row: Document): string | null {
  return row.drive_web_link || null;
}

function documentDownloadUrl(row: Document): string {
  return row.download_url || `${SERVER}/api/documents/${row.id}/download?dl=1`;
}

function renderActionIcon(icon: Component) {
  return () => h(NIcon, {component: icon});
}
function rowActions() {
  const c = l.value;
  return [
    {label: c.common.view, key: "view", icon: renderActionIcon(EyeOutline)},
    {label: c.common.download, key: "download", icon: renderActionIcon(DownloadOutline)},
    {label: c.documents.extractAi, key: "extract", icon: renderActionIcon(FlashOutline)},
    {label: c.documents.previewReminder, key: "preview-reminder", icon: renderActionIcon(EyeOutline)},
    {label: c.documents.createQuote, key: "create-quote", icon: renderActionIcon(DocumentTextOutline)},
    {label: c.documents.cloneRenew, key: "clone-contract", icon: renderActionIcon(CopyOutline)},
    { type: "divider", key: "d1" },
    {
      label: c.common.delete,
      key: "delete",
      icon: renderActionIcon(TrashOutline),
      props: {style: "color: var(--color-error, #d03050)"},
    },
  ];
}
function rowActionsFor(row: Document) {
  const c = l.value;
  return rowActions()
    .filter((action) => action.key !== "extract" || canExtractDocument(row))
    .map((action) => {
      if (action.key === "clone-contract") {
        if (row.contract_id) return action;
        return {
          ...action,
          disabled: true,
          props: {title: c.documents.noContractClone},
        };
      }
      if (action.key !== "create-quote") return action;
      const hasContract = Boolean(row.contract_id);
      const alreadyQuoted = Boolean(row.quote_id);
      if (hasContract && !alreadyQuoted) return action;
      return {
        ...action,
        disabled: true,
        props: {
          title: alreadyQuoted ? c.documents.alreadyQuoted : c.documents.noContractQuote,
        },
      };
    });
}
function handleRowAction(key: string, row: Document) {
  if (key === "view") router.push(href(`/documents/${row.id}`));
  if (key === "download") openDownload(row);
  if (key === "extract") openExtractModal(String(row.id));
  if (key === "preview-reminder") openDocumentReminderPreview(row);
  if (key === "create-quote") openCreateQuote(row);
  if (key === "clone-contract") confirmCloneContract(row);
  if (key === "delete") confirmDeleteDocument(row);
}

const showCloneConfirm = ref(false);
const cloningContract = ref(false);
const cloneCandidate = ref<{
  contractId: string;
  contract_number: string | null;
  newStartDate: string | null;
  newExpiryDate: string | null;
  shiftMonths: number;
} | null>(null);

// Mirrors the server's clamp in POST /contracts/:id/clone so the preview matches
// what will actually be created (day 0 of the target month rolls Feb 29 back
// instead of overflowing into March).
function shiftDate(value: string | null | undefined, shiftMonths: number): string | null {
  const raw = typeof value === "string" ? value.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split("-").map(Number);
  const target = new Date(Date.UTC(y!, m! - 1 + shiftMonths, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d!, lastDay));
  return target.toISOString().slice(0, 10);
}

async function confirmCloneContract(row: Document) {
  if (!row.contract_id) return;
  try {
    const contract = await api.contracts.get(String(row.contract_id));
    const shiftMonths = 12;
    cloneCandidate.value = {
      contractId: String(row.contract_id),
      contract_number: contract.contract_number,
      newStartDate: shiftDate(contract.start_date, shiftMonths),
      newExpiryDate: shiftDate(contract.expiry_date, shiftMonths),
      shiftMonths,
    };
    showCloneConfirm.value = true;
  } catch (err) {
    message.error(err instanceof Error ? err.message : "טעינת התסקיר נכשלה");
  }
}

async function doCloneContract() {
  if (!cloneCandidate.value) return;
  cloningContract.value = true;
  try {
    const created = await api.contracts.clone(cloneCandidate.value.contractId, {
      shift_months: cloneCandidate.value.shiftMonths,
    });
    showCloneConfirm.value = false;
    if (created.print_template_id) {
      message.success("התסקיר שוכפל");
      router.push(`/contracts/${created.id}/draft`);
    } else {
      message.warning("התסקיר שוכפל, אך אין לו תבנית הדפסה מקושרת — לא ניתן לפתוח את מסך המילוי");
    }
  } catch (err) {
    message.error(err instanceof Error ? err.message : "שכפול התסקיר נכשל");
  } finally {
    cloningContract.value = false;
  }
}

async function openDocumentReminderPreview(row: Document) {
  try {
    const result = await api.reminders.list({documentId: String(row.id), limit: 1}, true);
    const reminder = result.rows[0];
    if (!reminder) {
      message.info("לא נמצאה תזכורת למסמך הזה");
      return;
    }
    previewReminderId.value = reminder.id;
    previewReminderTitle.value = reminder.title ?? row.file_name ?? null;
    showReminderPreview.value = true;
  } catch {
    message.error("שגיאה בטעינת התזכורת של המסמך");
  }
}

function canExtractDocument(row: Document): boolean {
  return row.document_source !== "generated";
}

// ── Re-extract existing doc (row action ✨) ────────────────────────────────────
const extracting = ref(false);

async function openExtractModal(docId: string) {
  extracting.value = true;
  try {
    await api.documents.extract(docId);
    message.success("חילוץ AI הושלם");
    await store.fetch(undefined, true);
  } catch (e) {
    message.error(String(e));
  } finally {
    extracting.value = false;
  }
}

// ── Pipeline feature flags ────────────────────────────────────────────────────
const flagOcr = ref(true);
const flagAi = ref(true);
const flagS3 = ref(true);
const flagEntities = ref(true);
let saveFlagsTimer: ReturnType<typeof setTimeout> | null = null;

async function loadPipelineFlags() {
  try {
    const s = await api.userSettings.get();
    flagOcr.value = s.pipeline_ocr ?? flagOcr.value;
    flagAi.value = s.pipeline_ai ?? flagAi.value;
    flagS3.value = s.pipeline_s3 ?? flagS3.value;
    flagEntities.value = s.pipeline_entities ?? flagEntities.value;
  } catch { /* ignore */ }
}
function savePipelineFlags() {
  if (saveFlagsTimer) clearTimeout(saveFlagsTimer);
  saveFlagsTimer = setTimeout(async () => {
    try {
      await api.userSettings.save({
        pipeline_ocr: flagOcr.value, pipeline_ai: flagAi.value,
        pipeline_s3: flagS3.value, pipeline_entities: flagEntities.value,
      });
    } catch { /* ignore */ }
  }, 600);
}
watch([flagOcr, flagAi, flagS3, flagEntities], savePipelineFlags);

const docTemplates = ref<DocTemplate[]>([]);

async function loadDocTemplates() {
  try {
    docTemplates.value = await api.docTemplates.list();
  } catch {
    docTemplates.value = [];
  }
}

const showCreateQuote = ref(false);
const createQuoteRow = ref<Document | null>(null);

function openCreateQuote(row: Document) {
  createQuoteRow.value = row;
  showCreateQuote.value = true;
}

async function onQuoteCreated() {
  // Refresh the tab so it appears for an account whose first quote this is, and
  // refetch the list so the row swaps its menu action for the quote link.
  await refreshQuotesTab();
  await store.fetch(undefined, true);
}

onMounted(() => {
  store.fetch(undefined, true);
  loadPipelineFlags();
  loadClients();
  void loadDocTemplates();
});
onUnmounted(() => {
  if (saveFlagsTimer) clearTimeout(saveFlagsTimer);
  stopRescanPolling();
});


// ── File handling ─────────────────────────────────────────────────────────────
async function uploadFiles(
  files: File[],
  options?: { doAi: boolean; doEntities: boolean; doReminders: boolean; templateId?: string }
) {
  uploading.value = true;
  try {
    const {ids, duplicates} = await api.documents.upload(files, options, options?.templateId);
    const newCount = ids.length - (duplicates?.length ?? 0);
    if (newCount > 0) message.info(`${newCount} מסמכים נוספו לתור עיבוד`);
    if (duplicates?.length) message.warning(`${duplicates.length} קובץ/ים כבר קיים/ים: ${duplicates.join(", ")}`);
    rescanStore.start({ queued: ids.length, ids, duplicates, kind: "upload" });
    await store.fetch(undefined, true);
    updateRescanRowsFromDocuments();
    await openRescanModal();
    startBatchPolling(ids);
  } catch (e: any) {
    if (
        e?.message === "document_limit_reached"
        || e?.message === "document_monthly_limit_reached"
    ) {
      showLimitModal.value = true;
      store.fetch(undefined, true);
    } else {
      message.error(String(e));
    }
  } finally {
    uploading.value = false;
  }
}
async function doRescanAll() {
  showRescanAllConfirm.value = false;
  rescanningAll.value = true;
  try {
    await runRescan(true);
  } catch {
    message.error("שגיאה בסריקה מחדש של כל המסמכים");
  } finally {
    rescanningAll.value = false;
  }
}

async function runRescan(all: boolean) {
  const data = await api.documents.rescan(all ? { all: true } : undefined);
  if (data.queued === 0) {
    message.info(all ? "אין מסמכים זמינים לסריקה מחדש" : "אין מסמכים שצריכים סריקה מחדש");
  } else {
    message.success(`${data.queued} מסמכים נשלחו לסריקה מחדש`);
    rescanStore.start({ queued: data.queued, ids: data.ids ?? [], mode: data.mode, kind: "rescan" });
    await store.fetch(undefined, true);
    updateRescanRowsFromDocuments();
    await openRescanModal();
    startBatchPolling(data.ids ?? []);
  }
  await store.fetch(undefined, true);
}

function stopRescanPolling() {
  if (rescanPollTimer) {
    clearInterval(rescanPollTimer);
    rescanPollTimer = null;
  }
}

function startBatchPolling(ids: string[]) {
  stopRescanPolling();
  const watchIds = new Set(ids.map(String));
  if (!watchIds.size) return;

  let attempts = 0;
  rescanPollTimer = setInterval(async () => {
    attempts += 1;
    try {
      await store.fetch(undefined, true);
      const watchedRows = store.rows.filter((row) => watchIds.has(String(row.id)));
      updateRescanRowsFromDocuments();
      const running = watchedRows.filter((row) => row.processing_status === "queued" || row.processing_status === "processing");
      rescanStore.setRemaining(running.length);

      if (running.length === 0 && watchedRows.length > 0) {
        stopRescanPolling();
        rescanStore.markDone();
        const assigned = watchedRows.filter((row) => (row as any).reminder_status === "assigned").length;
        const missing = watchedRows.filter((row) => (row as any).reminder_status === "missing").length;
        const failed = watchedRows.filter((row) => row.processing_status === "error").length;
        if (rescanStore.kind === "upload") {
          const completed = watchedRows.filter((row) => row.processing_status === "done").length;
          if (failed) {
            message.warning(`העלאה הסתיימה: ${completed} עובדו, ${failed} שגיאות`);
          } else {
            message.success(`העלאה הסתיימה: ${completed} מסמכים עובדו`);
          }
        } else if (missing || failed) {
          message.warning(`סריקה הסתיימה: ${assigned} עם תזכורת, ${missing} ללא תזכורת, ${failed} שגיאות`);
        } else {
          message.success(`סריקה הסתיימה: ${assigned} מסמכים קיבלו תזכורת`);
        }
      } else if (attempts >= 40) {
        stopRescanPolling();
        rescanStore.markBackground();
        message.info("הסריקה עדיין רצה ברקע, הרשימה תתעדכן ברענון הבא");
      }
    } catch {
      if (attempts >= 3) stopRescanPolling();
    }
  }, 3000);
}

function updateRescanRowsFromDocuments() {
  const rows = rescanRows.value.map((row) => ({
    id: row.id,
    file_name: row.file_name,
    processing_status: row.processing_status,
    reminder_status: (row as any).reminder_status ?? null,
    reminder_date: (row as any).reminder_date ?? null,
    document_type: (row as any).document_type ?? null,
    error_message: (row as any).error_message ?? null,
  }));
  rescanStore.updateRows(rows);
}
function confirmDeleteAll() {
  const count = filteredRows.value.length;
  confirm({
    title: "מחיקת מסמכים",
    content: `האם למחוק את ${count} המסמכים המסוננים? פעולה זו אינה הפיכה.`,
    confirmText: "מחק הכל",
    onConfirm: doDeleteAll,
  });
}

function confirmDeleteDocument(row: Document) {
  confirm({
    title: "מחיקת מסמך",
    content: `למחוק את המסמך "${row.file_name}"? פעולה זו אינה הפיכה.`,
    confirmText: "מחק",
    onConfirm: async () => {
      try {
        await store.deleteDoc(row.id);
        message.success("המסמך נמחק");
      } catch (e) {
        message.error(String(e));
      }
    },
  });
}
function toggleBulkMode() {
  bulkMode.value = !bulkMode.value;
  if (!bulkMode.value) selectedIds.value = new Set();
}
function selectAll() {
  if (selectedIds.value.size === filteredRows.value.length) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(filteredRows.value.map((r) => String(r.id)));
  }
}
function toggleSelect(id: string) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

function setRowSelected(id: string, checked: boolean) {
  const next = new Set(selectedIds.value);
  if (checked) next.add(id);
  else next.delete(id);
  selectedIds.value = next;
}

function toggleSelectVisible(checked: boolean) {
  const visible = pagedRows.value.map((row) => String(row.id));
  const next = new Set(selectedIds.value);
  if (checked) {
    for (const id of visible) next.add(id);
  } else {
    for (const id of visible) next.delete(id);
  }
  selectedIds.value = next;
}

function onDocumentClick(row: Document) {
  if (bulkMode.value && viewMode.value === "grid") {
    toggleSelect(String(row.id));
    return;
  }
  router.push(`/documents/${row.id}`);
}

function openDocumentRow(row: Document) {
  router.push(`/documents/${row.id}`);
}
function confirmBulkDelete() {
  const count = selectedIds.value.size;
  if (!count) return;
  confirm({
    title: "מחיקת מסמכים נבחרים",
    content: `האם למחוק ${count} מסמכים נבחרים? פעולה זו אינה הפיכה.`,
    confirmText: "מחק נבחרים",
    onConfirm: doBulkDelete,
  });
}
async function doBulkDelete() {
  const ids = [...selectedIds.value];
  if (!ids.length || bulkDeleting.value) return;
  bulkDeleting.value = true;
  try {
    await Promise.all(ids.map((id) => api.documents.delete(id)));
    message.success(ids.length === 1 ? "המסמך נמחק" : `${ids.length} מסמכים נמחקו`);
    selectedIds.value = new Set();
    bulkMode.value = false;
    await store.fetch(undefined, true);
  } catch {
    message.error("שגיאה במחיקת המסמכים");
  } finally {
    bulkDeleting.value = false;
  }
}
async function doDeleteAll() {
  deletingAll.value = true;
  try {
    const ids = filteredRows.value.map((r) => r.id);
    await Promise.all(ids.map((id) => store.deleteDoc(id)));
    message.success(`${ids.length} מסמכים נמחקו`);
    await store.fetch(undefined, true);
  } catch {
    message.error("שגיאה במחיקת המסמכים");
  } finally {
    deletingAll.value = false;
  }
}
async function openDownload(row: Document) {
  window.open(`${SERVER}/api/documents/${row.id}/download?dl=1`, "_blank", "noopener");
}

async function bulkDownload() {
  const ids = [...selectedIds.value];
  if (!ids.length || bulkDownloading.value) return;
  bulkDownloading.value = true;
  try {
    for (const id of ids) {
      window.open(`${SERVER}/api/documents/${id}/download?dl=1`, "_blank", "noopener");
      await new Promise((r) => setTimeout(r, 400));
    }
    message.success(`${ids.length} קבצים הורדו`);
  } finally {
    bulkDownloading.value = false;
  }
}

async function bulkMergePdf() {
  const ids = [...selectedIds.value];
  if (!ids.length || bulkMerging.value) return;
  bulkMerging.value = true;
  try {
    // The response is the PDF itself, so this goes through fetch rather than the
    // JSON api helper.
    const res = await fetch(`${SERVER}/api/documents/merge-pdf`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      credentials: "include",
      body: JSON.stringify({ids}),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      message.error(payload.error ?? "מיזוג הקבצים נכשל");
      return;
    }

    const merged = Number(res.headers.get("x-merged-count") ?? 0);
    const skipped = Number(res.headers.get("x-skipped-count") ?? 0);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `merged-${new Date().toISOString().slice(0, 10)}.pdf`;
    link.click();
    URL.revokeObjectURL(url);

    message.success(
      skipped > 0
        ? `${merged} קבצים מוזגו, ${skipped} דולגו (לא PDF או קובץ חסר)`
        : `${merged} קבצים מוזגו לקובץ אחד`,
    );
  } catch (err) {
    message.error(err instanceof Error ? err.message : "מיזוג הקבצים נכשל");
  } finally {
    bulkMerging.value = false;
  }
}

async function bulkExtractAi() {
  const ids = selectedExtractableIds.value;
  if (!ids.length || bulkExtracting.value) return;
  bulkExtracting.value = true;
  let failed = 0;
  try {
    for (const id of ids) {
      try {
        await api.documents.extract(id);
      } catch {
        failed += 1;
      }
    }
    const completed = ids.length - failed;
    if (failed) {
      message.warning(`חילוץ AI הסתיים: ${completed} הצליחו, ${failed} נכשלו`);
    } else {
      message.success(`חילוץ AI הושלם עבור ${completed} מסמכים`);
    }
    await store.fetch(undefined, true);
  } finally {
    bulkExtracting.value = false;
  }
}
</script>

<style scoped>
.hidden { display: none; }

.document-row-action--quote {
  color: var(--brand-color);
  border-color: color-mix(in srgb, var(--brand-color) 45%, transparent);
  background: color-mix(in srgb, var(--brand-color) 10%, transparent);
}

.document-row-action--quote:hover {
  color: var(--text-inverse, #fff);
  border-color: var(--brand-color);
  background: var(--brand-color);
}

.documents-actions {
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

.rbtn--icon {
  width: 36px;
  min-width: 36px;
  height: 36px;
  min-height: 36px;
  padding: 0;
  border-radius: 10px;
}

.rbtn:hover:not(.rbtn--primary):not(.rbtn--danger):not(.rbtn--warning):not(:disabled) {
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
  background: transparent;
  border-color: rgba(208, 48, 80, 0.35);
  color: #d03050;
}

.rbtn--warning {
  background: transparent;
  border-color: rgba(240, 160, 32, 0.45);
  color: #f0a020;
}

.rbtn--warning:hover {
  background: rgba(240, 160, 32, 0.1);
  border-color: #f0a020;
}

.rbtn--ghost-active {
  background: var(--bg-elevated);
  border-color: var(--brand-color);
  color: var(--brand-color);
}

.bulk-action-anchor {
  position: relative;
}

.bulk-action-anchor__row {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.bulk-action-anchor__actions {
  display: grid;
  gap: 8px;
  position: absolute;
  z-index: 20;
  top: calc(100% + 8px);
  right: 0;
  min-width: 210px;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  box-shadow: var(--shadow-lg, 0 14px 32px rgba(15, 23, 42, 0.14));
}

.bulk-action-anchor__actions::before {
  content: "";
  position: absolute;
  top: -6px;
  right: 24px;
  width: 10px;
  height: 10px;
  background: var(--bg-card);
  border-top: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
  transform: rotate(-45deg);
}

.bulk-action-item {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: start;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.bulk-action-item:hover {
  background: var(--bg-hover);
}

.bulk-action-item:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.bulk-action-item--danger {
  color: #d03050;
}

.bulk-action-item__icon {
  display: inline-flex;
  justify-content: center;
  width: 26px;
  font-size: 19px;
  line-height: 1;
}

.bulk-action-item__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bulk-action-item__count {
  min-width: 24px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}

.bulk-action-item--loading .bulk-action-item__icon {
  animation: spin 0.75s linear infinite;
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

.icon-btn {
  padding: 4px 6px;
  min-width: 32px;
  justify-content: center;
}

.icon-btn .btn-icon {
  margin: 0;
}

/* ── Filter bar ──────────────────────────────────────────────────────────── */
.filterbar {
  display: flex;
  flex-wrap: wrap;
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
.pill--compact { padding: 6px 13px; font-size: 12px; }
.pill:hover { background: var(--bg-hover); color: var(--text-primary); }
.pill--active {
  color: var(--brand-color);
  font-weight: 700;
  background: #fff;
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

/* ── Quota bar ───────────────────────────────────────────────────────────── */
.locked-action {
  display: inline-flex;
}

.locked-action button:disabled {
  pointer-events: none;
}
.quota-bar { margin-bottom: 12px; }
.quota-bar__text { display: flex; justify-content: space-between; font-size: 13px; color: var(--text-secondary); margin-bottom: 5px; }
.quota-bar__limit { color: #e88080; font-weight: 600; }

/* ── Drop strip ──────────────────────────────────────────────────────────── */
.drop-strip {
  border: 1px dashed rgba(24, 160, 88, 0.42);
  border-radius: 12px;
  padding: 22px 16px;
  text-align: center;
  margin-bottom: 14px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  background:
    linear-gradient(135deg, rgba(24, 160, 88, 0.10), rgba(32, 128, 240, 0.06)),
    var(--bg-card);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
  transition: border-color 0.2s, background 0.2s, color 0.2s, transform 0.12s;
}
.drop-strip:hover {
  border-color: var(--brand-color);
  color: var(--text-primary);
}
.drop-strip--active {
  border-color: var(--brand-color);
  background:
    linear-gradient(135deg, rgba(99,226,183,0.18), rgba(32,128,240,0.10)),
    var(--bg-card);
  color: var(--text-primary);
  transform: translateY(-1px);
}
.drop-strip--disabled { border-color: #e88080; background: rgba(232,128,128,0.05); color: #e88080; }

/* ── Settings popover ────────────────────────────────────────────────────── */
.settings-pop { padding: 6px 4px; }
.settings-pop__title { font-size: 13px; font-weight: 600; margin-bottom: 10px; color: var(--text-primary); }
.rescan-confirm {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.65;
}
.rescan-confirm p {
  margin: 0 0 10px;
}
.rescan-confirm ul {
  margin: 0;
  padding-inline-start: 20px;
}
.rescan-confirm li + li {
  margin-top: 4px;
}

/* ── Toolbar ─────────────────────────────────────────────────────────────── */
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
.toolbar__client {
  width: 200px;
}
.toolbar__type {
  width: 200px;
}
.toolbar__dates {
  width: 260px;
}
.toolbar__view-toggle {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  margin-right: auto;
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

.status-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: -6px 0 16px;
}
.status-filter__count {
  min-width: 24px;
  height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}
.status-filter__btn--active .status-filter__count {
  background: rgba(255, 255, 255, 0.22);
  color: inherit;
}

/* ── Tile grid ───────────────────────────────────────────────────────────── */
.tile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}
.tile {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  min-width: 0;
  transition: box-shadow 0.15s, border-color 0.15s, transform 0.1s;
}
.tile:hover {
  border-color: var(--brand-color);
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  transform: translateY(-1px);
}
.tile--selected {
  border-color: var(--brand-color);
  box-shadow: 0 0 0 1px var(--brand-color);
}
.tile__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 0;
  min-width: 0;
}
.tile__head :deep(.n-tag) {
  min-width: 0;
  max-width: 100%;
}
.tile__check {
  flex-shrink: 0;
}
.tile__actions {
  margin-inline-start: auto;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}
.tile__thumb {
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-color);
}
.tile__file-icon { color: var(--text-secondary); }
.tile--pdf .tile__file-icon { color: #d03050; }
.tile--doc .tile__file-icon { color: #2080f0; }
.tile--xls .tile__file-icon { color: #1a7951; }
.tile--img .tile__file-icon { color: #b27a02; }
.list-file-icon { flex-shrink: 0; color: var(--text-secondary); }
.file-type-icon--pdf { color: #d03050; }
.file-type-icon--doc { color: #2080f0; }
.file-type-icon--xls { color: #1a7951; }
.file-type-icon--img { color: #b27a02; }
.tile--pdf .tile__thumb { background: linear-gradient(135deg, rgba(208,48,80,0.08), rgba(208,48,80,0.02)); }
.tile--doc .tile__thumb { background: linear-gradient(135deg, rgba(32,128,240,0.08), rgba(32,128,240,0.02)); }
.tile--xls .tile__thumb { background: linear-gradient(135deg, rgba(99,226,183,0.08), rgba(99,226,183,0.02)); }
.tile--img .tile__thumb { background: linear-gradient(135deg, rgba(240,160,32,0.08), rgba(240,160,32,0.02)); }
.tile__body {
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.tile__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.35;
}
.tile__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 11px;
  color: var(--text-primary);
}
.tile__meta-item {
  background: var(--bg-elevated);
  padding: 1px 6px;
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.tile__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}
.tile__pills :deep(.n-tag) {
  max-width: 100%;
}
.tile__date {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: auto;
}

/* ── Document table (aligned with quotes-table) ──────────────────────────── */
.document-table-wrap {
  overflow: auto;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
}

.document-table {
  width: 100%;
  min-width: 980px;
  table-layout: fixed;
  border-collapse: collapse;
}

.document-table__col--select { width: 46px; }
/* The filename is capped rather than left to flex: as the only auto-width column
   it absorbed every spare pixel, pushing בתוקף far from the name it belongs to.
   The slack goes to the client column instead, which holds variable-length
   company names and reads better wide. */
.document-table__col--file {
  width: clamp(220px, 26vw, 360px);
}

.document-table__col--type {
  width: 196px;
}
.document-table__col--date { width: 128px; }
.document-table__col--import { width: 132px; }
.document-table__col--client { width: clamp(160px, 20vw, 280px); }

.document-table__col--number {
  width: 150px;
  min-width: 150px;
}
/* Absorbs the leftover width so no earlier column stretches: the actions cell
   holds fixed-size icon buttons, so extra space there is simply padding rather
   than a gap pushing two related columns apart. */
.document-table__col--actions { width: auto; min-width: 172px; }

.document-table th,
.document-table td {
  padding: 14px 16px;
  text-align: start;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
  white-space: nowrap;
  vertical-align: middle;
}

.document-table th {
  background: var(--bg-muted);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.document-sort-button {
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
  font-weight: 600;
}

.document-sort-button span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-sort-button :deep(.n-icon) {
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--text-secondary) 78%, var(--brand-color));
}

.document-sort-button:hover,
.document-sort-button:focus-visible {
  color: var(--brand-color);
}

.document-sort-button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--brand-color) 45%, transparent);
  outline-offset: 3px;
  border-radius: 6px;
}

.document-table tbody tr:last-child td {
  border-bottom: 0;
}

.document-table-row {
  cursor: pointer;
  outline: none;
  transition: background .15s ease;
}

.document-table-row:hover,
.document-table-row:hover td {
  background: var(--bg-hover);
}

.document-table-row:focus-visible td {
  background: var(--bg-hover);
}

.document-cell-truncate {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.client-link {
  color: var(--brand-color);
  font-weight: 700;
  text-decoration: none;
}

.client-link:hover {
  text-decoration: none;
  opacity: 0.85;
}

.document-file-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.document-file-cell__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.document-file-cell__inspection-type {
  font-size: 11px;
  color: var(--text-secondary);
}

.row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 100%;
  gap: 6px;
  white-space: nowrap;
}

.actions-title {
  text-align: end !important;
}

.cell-strong {
  font-weight: 700;
  color: var(--text-primary);
}

.cell-actions,
.document-col--actions {
  text-align: end;
}

.document-col--select {
  text-align: center;
}

.document-col--type {
  white-space: normal;
  line-height: 1.35;
}

.document-col--number {
  min-width: 150px;
}

.document-col--file,
.document-col--type,
.document-col--date,
.document-col--import,
.document-col--client,
.document-col--number {
  text-align: start;
}

.document-import,
.document-client {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.document-import__source,
.document-client__contact,
.tile__import-source {
  font-size: 11px;
  color: var(--text-secondary);
}

.document-row-action {
  color: var(--text-secondary);
}

.document-row-action:hover {
  color: var(--brand-color);
}

.tag {
  display: inline-flex; align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}
.tag--neutral { background: var(--bg-elevated); color: var(--text-secondary); border: 1px solid var(--border-color); }
.tag--warn { background: rgba(240, 160, 32, 0.14); color: #9a6700; border: 1px solid rgba(240, 160, 32, 0.35); }
.tag--bad { background: rgba(208, 48, 80, 0.12); color: #b42318; border: 1px solid rgba(208, 48, 80, 0.28); }
.tile__meta-item--num { font-family: ui-monospace, monospace; direction: ltr; }
.kv { font-size: 12px; color: var(--text-primary); display: inline-flex; align-items: center; gap: 6px; }
.kv strong { color: var(--text-secondary); font-weight: 600; }
.document-expiry {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.25;
}
.document-expiry__label {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
}
.expiry { font-weight: 600; }
.expiry--ok { color: #1a7951; }
.expiry--warn { color: #b27a02; }
.expiry--expired { color: var(--color-error, #d03050); }

/* ── Empty ───────────────────────────────────────────────────────────────── */
.empty { text-align: center; padding: 60px 20px; color: var(--text-muted); font-size: 14px; }

@media (max-width: 640px) {
  .page2 {
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
  }

  :deep(.page-header) {
    margin-bottom: 18px;
  }

  :deep(.page-header__actions) {
    width: 100%;
  }

  .documents-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    width: 100%;
  }

  .documents-actions > .rbtn--primary {
    grid-column: 1 / -1;
  }

  .documents-actions > .rbtn,
  .documents-actions > .bulk-action-anchor,
  .documents-actions :deep(.n-popover),
  .documents-actions :deep(.n-popover-trigger),
  .documents-actions :deep(.n-popover-trigger) > .rbtn {
    width: 100%;
    min-width: 0;
  }

  .documents-actions > .bulk-action-anchor {
    grid-column: 1 / -1;
  }

  .bulk-action-anchor__row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    width: 100%;
  }

  .bulk-action-anchor__row > .rbtn {
    width: 100%;
  }

  .quota-bar__text {
    flex-direction: column;
    gap: 4px;
  }

  .drop-strip {
    min-height: 86px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px 14px;
    line-height: 1.55;
  }

  .toolbar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
    gap: 8px;
  }

  .toolbar__search {
    grid-column: 1 / -1;
    width: 100%;
    min-width: 0;
  }

  .toolbar__client,
  .toolbar__type,
  .toolbar__dates {
    width: 100%;
    min-width: 0;
    flex-basis: auto;
  }

  .toolbar__dates {
    grid-column: 1 / -1;
  }

  .toolbar__view-toggle {
    grid-column: 1 / -1;
    width: auto;
    margin-right: 0;
    justify-self: end;
  }

  .status-filter {
    gap: 6px;
  }

  :deep(.list-card) {
    border-radius: 12px;
    padding: 12px;
  }

  :deep(.list-card__row) {
    align-items: flex-start;
    gap: 10px;
  }

  :deep(.list-card__title) {
    align-items: flex-start;
    min-width: 0;
  }

  :deep(.list-card__actions) {
    gap: 5px;
  }

  :deep(.list-card__foot) {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .list-file-icon {
    padding-top: 2px;
  }

  .tag {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

@media (max-width: 420px) {
  :deep(.list-card__row) {
    flex-direction: column-reverse;
  }

  :deep(.list-card__actions) {
    align-self: flex-start;
    display: grid;
    grid-template-columns: repeat(3, 34px);
  }

  :deep(.list-card__actions .btn) {
    width: 34px;
  }
}

</style>

<style>
/* Not scoped: n-dropdown teleports its menu to the body, so scoped styles
   never reach it. Scoped to the menu class to avoid touching other dropdowns. */
.document-row-actions-menu.n-dropdown {
  min-width: 190px;
}

.document-row-actions-menu.n-dropdown .n-dropdown-option-body {
  padding-inline: 6px;
}
</style>
