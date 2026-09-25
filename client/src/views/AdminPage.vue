<template>
  <div
    dir="ltr"
    class="admin-shell"
    :class="{
      'admin-shell--sidebar-collapsed': !isMobileViewport && !showDesktopSidebar,
      'admin-shell--mobile-sidebar-open': isMobileViewport && showMobileNav,
    }"
  >
    <!-- ── Sidebar ──────────────────────────────────────────────────────── -->
    <aside
      id="admin-sidebar-panel"
      class="admin-sidebar"
      :class="{
        'admin-sidebar--open': showMobileNav,
        'admin-sidebar--collapsed': !isMobileViewport && !showDesktopSidebar,
      }"
    >
      <div class="admin-sidebar__brand" @click="router.push('/dashboard')">
        <n-icon :component="BriefcaseOutline" :size="20" />
        <span>RemindOCR</span>
      </div>

      <nav class="admin-sidebar__nav">
        <div v-for="group in sidebarGroups" :key="group.key" class="admin-sidebar__group">
          <button
            class="admin-sidebar__group-header"
            type="button"
            :aria-expanded="group.open"
            @click="toggleNavGroup(group.key)"
          >
            <span>{{ group.label }}</span>
            <span class="admin-sidebar__group-count">{{ group.items.length }}</span>
            <n-icon :component="group.open ? ChevronDownOutline : ChevronForwardOutline" :size="12" />
          </button>
          <template v-if="group.open">
            <button
              v-for="item in group.items"
              :key="item.key"
              class="admin-sidebar__item"
              :class="{ 'admin-sidebar__item--active': activeSection === item.key }"
              type="button"
              @click="switchSection(item.key)"
            >
              <n-icon :component="item.icon" :size="18" />
              <span>{{ item.label }}</span>
            </button>
          </template>
        </div>
      </nav>

      <div class="admin-sidebar__footer">
        <div class="admin-db-switch" title="Admin data source (Mongo)">
          <span class="admin-db-switch__label">DB</span>
          <n-select
            size="tiny"
            :value="adminDbTarget"
            :options="adminDbTargetOptions"
            :disabled="dbTargetSwitching"
            @update:value="onAdminDbTargetChange"
          />
        </div>
        <div class="admin-env-badge" :class="`admin-env-badge--${adminDbTarget === 'production' ? 'production' : appEnv}`">
          <span class="admin-env-badge__dot" />
          <span>{{ adminDbTarget === 'production' ? 'PROD DATA' : 'LOCAL DATA' }}</span>
          <span v-if="dbName" class="admin-env-badge__db">{{ dbName }}</span>
        </div>
        <button class="admin-sidebar__item" type="button" @click="router.push('/dashboard')">
          <n-icon :component="ArrowBackOutline" :size="18" />
          <span>Back to App</span>
        </button>
      </div>
    </aside>

    <button
      class="admin-sidebar-toggle"
      type="button"
      :aria-controls="'admin-sidebar-panel'"
      :aria-expanded="isSidebarVisible"
      :aria-label="sidebarToggleLabel"
      @click="toggleSidebar"
    >
      <n-icon :component="sidebarToggleIcon" :size="20" />
    </button>

    <!-- ── Main content ─────────────────────────────────────────────────── -->
    <div class="admin-main">
      <AdminHealthStrip v-if="activeSection !== 'system_health'" :key="`strip-${adminDbTarget}`" @open="switchSection('system_health')" />
      <header class="admin-main__header">
        <div class="admin-main__title-row">
          <h1 class="admin-main__title">{{ currentItem?.label }}</h1>
          <n-button
            size="small"
            :type="activeSection === 'settings' ? 'primary' : 'default'"
            @click="switchSection('settings')"
          >
            <template #icon><n-icon :component="SettingsOutline" /></template>
            Settings
          </n-button>
          <n-button size="small" :loading="sectionLoading || s3Loading" @click="reloadSection">↻ Refresh</n-button>
        </div>
        <div class="admin-main__meta">
          System Admin Dashboard
          <span v-if="activeSection !== 'users'" style="margin-left: 12px; color: var(--text-secondary); font-size: 12px">
            Last updated: {{ getLastRefreshedText(activeSection) }}
          </span>
        </div>
      </header>


      <!-- ── Users ── -->
      <section v-if="activeSection === 'users'" class="admin-section admin-section--users">
        <AdminUserFocus
          :key="adminDbTarget"
          :users="users"
          :loading="usersLoading"
          @refresh="loadUsers"
          @open-doc="openDocModal"
          @open-report="openReportModal"
          @user-updated="onFocusedUserUpdated"
        />
      </section>

      <section v-if="activeSection === 'magic_links'" class="admin-section">
        <AdminMagicLinkPanel :key="adminDbTarget" @created="onMagicLinkUserCreated" />
      </section>

      <section v-if="isSeedSection" class="admin-section admin-section--leads">
        <!-- Shared SEED header: the lead totals stay visible on every SEED page. -->
        <n-spin v-if="sectionLoading && activeSection === 'inspector_leads'" style="display:flex;justify-content:center;padding:40px" />
        <template v-else>
          <div class="admin-stats-grid">
            <AdminStatCard
              title="Total Leads"
              :primary="inspectorLeadsTotal"
              primary-label="Collected"
              :secondary="inspectorLeadsRows.length"
              secondary-label="Shown"
              :icon="PeopleOutline"
            />
            <AdminStatCard
              title="With Email"
              :primary="inspectorLeadEmailCount"
              primary-label="Direct emails"
              :secondary="inspectorLeadPhoneCount"
              secondary-label="Phones"
              :status="inspectorLeadEmailCount > 0 ? 'success' : 'warning'"
              :icon="MailOutline"
            />
            <AdminStatCard
              title="Best Score"
              :primary="inspectorLeadBestScore"
              primary-label="Lead score"
              :secondary="inspectorLeadSummary.bySource.length"
              secondary-label="Sources"
              :status="inspectorLeadBestScore >= 80 ? 'success' : 'default'"
            />
          </div>
          <n-alert v-if="inspectorSeedError" type="error" style="margin-bottom:12px">{{ inspectorSeedError }}</n-alert>
          <div v-else-if="inspectorSeedDb" class="seed-db-note">
            SEED data: {{ inspectorSeedDb.dbName }}<span v-if="inspectorSeedDb.host"> · {{ inspectorSeedDb.host }}</span>
            · shared by local, dev and production, independent of the DB switch
          </div>

          <div v-if="activeSection === 'inspector_leads'" class="monitor-block">
            <div class="monitor-block__title">Inspector Leads</div>
            <div class="admin-section__toolbar leads-toolbar">
              <n-input
                v-model:value="inspectorLeadSearch"
                clearable
                size="small"
                placeholder="Search name, email, phone, website..."
                style="max-width: 320px"
                @keyup.enter="loadInspectorLeads(1)"
              >
                <template #prefix><n-icon :component="SearchOutline" /></template>
              </n-input>
              <n-select
                v-model:value="inspectorLeadSourceFilter"
                clearable
                size="small"
                placeholder="Source"
                :options="inspectorLeadSourceOptions"
                style="width: 160px"
                @update:value="loadInspectorLeads(1)"
              />
              <n-select
                v-model:value="inspectorLeadStatusFilter"
                clearable
                size="small"
                placeholder="Status"
                :options="inspectorLeadStatusOptions"
                style="width: 170px"
                @update:value="loadInspectorLeads(1)"
              />
              <n-select
                v-model:value="inspectorLeadUnsubFilter"
                clearable
                size="small"
                placeholder="Unsubscribed"
                :options="inspectorLeadUnsubOptions"
                style="width: 170px"
                @update:value="loadInspectorLeads(1)"
              />
              <n-button size="small" :loading="inspectorLeadsLoading" @click="loadInspectorLeads(1)">
                <template #icon><n-icon :component="RefreshOutline" /></template>
                Refresh
              </n-button>
              <template v-if="inspectorLeadSelected.length">
                <n-button size="small" type="primary" @click="switchSection('seed_campaigns')">
                  <template #icon><n-icon :component="MailOutline" /></template>
                  Email selected ({{ inspectorLeadSelected.length }})
                </n-button>
                <n-button size="small" quaternary @click="inspectorLeadSelected = []">Clear selection</n-button>
              </template>
            </div>

            <n-data-table
              :columns="inspectorLeadColumns"
              :data="inspectorLeadsRows"
              :row-key="(row: InspectorLead) => row.id"
              v-model:checked-row-keys="inspectorLeadSelected"
              :bordered="false"
              :loading="inspectorLeadsLoading"
              :pagination="false"
              :max-height="560"
              size="small"
              style="margin-top:12px"
            />
            <div class="leads-pagination">
              <span>{{ inspectorLeadRangeText }}</span>
              <div class="leads-pagination__actions">
                <n-button size="tiny" :disabled="inspectorLeadPage <= 1 || inspectorLeadsLoading" @click="loadInspectorLeads(inspectorLeadPage - 1)">Prev</n-button>
                <n-button size="tiny" :disabled="inspectorLeadPage * inspectorLeadLimit >= inspectorLeadsTotal || inspectorLeadsLoading" @click="loadInspectorLeads(inspectorLeadPage + 1)">Next</n-button>
              </div>
            </div>
          </div>

        </template>

        <!-- Mounted on first visit and kept, so a half-edited campaign survives switching sections. -->
        <AdminCampaignsPanel
          v-if="visitedSeedSections.has('seed_campaigns')"
          v-show="activeSection === 'seed_campaigns'"
          :key="`campaigns-${adminDbTarget}`"
          :lead-filter="{ source: inspectorLeadSourceFilter, status: inspectorLeadStatusFilter, q: inspectorLeadSearch.trim() || null }"
          :selected-lead-ids="inspectorLeadSelected"
          @leads-imported="loadInspectorLeads(1)"
        />
        <AdminOutreachPanel
          v-if="visitedSeedSections.has('seed_outreach')"
          v-show="activeSection === 'seed_outreach'"
          :key="`outreach-${adminDbTarget}`"
        />
        <WhatsAppCampaignPanel
          v-if="visitedSeedSections.has('seed_whatsapp')"
          v-show="activeSection === 'seed_whatsapp'"
          :key="adminDbTarget"
          :leads="inspectorLeadsRows"
        />
      </section>

      <section v-if="activeSection === 'gmail'" class="admin-section admin-section--gmail">
        <GmailInboxPage />
      </section>

      <!-- ── Documents & Extraction ── -->
      <section v-if="activeSection === 'documents'" class="admin-section">
        <n-spin v-if="sectionLoading" style="display:flex;justify-content:center;padding:40px" />
        <template v-else>
          <!-- Pipeline Summary Cards -->
          <div v-if="docMonitor" class="admin-stats-grid">
            <AdminStatCard
              title="Total Processed"
              :primary="pipelineStats.total"
              primary-label="Documents"
              :secondary="pipelineStats.processing"
              secondary-label="Processing"
              :status="pipelineStats.total === 0 ? 'default' : 'success'"
              :icon="DocumentOutline"
            />
            <AdminStatCard
              title="Success Rate"
              :primary="pipelineStats.successRate"
              primary-label="Completion %"
              :secondary="pipelineStats.done"
              secondary-label="Completed"
              :status="pipelineStats.successRate >= 80 ? 'success' : pipelineStats.successRate >= 50 ? 'warning' : 'error'"
              format="percent"
            />
            <AdminStatCard
              title="S3 Storage"
              :primary="pipelineStats.storage"
              :primary-label="`${docMonitor.storage.length} users`"
              format="bytes"
              :status="pipelineStats.storage > 5 * 1024 * 1024 * 1024 ? 'warning' : 'default'"
              :icon="CloudUploadOutline"
            />
            <AdminStatCard
              title="Failed Documents"
              :primary="pipelineStats.failed"
              primary-label="Extraction Errors"
              :secondary="pipelineStats.stuck"
              secondary-label="Stuck (>10min)"
              :status="pipelineStats.failed > 0 || pipelineStats.stuck > 0 ? 'error' : 'success'"
            />
          </div>

          <n-tabs :value="pageTab" type="line" animated class="admin-page-tabs" @update:value="onPageTab">
            <n-tab-pane v-if="docMonitor" name="storage" tab="S3 Storage">
          <div class="monitor-block">
            <div class="monitor-block__title">S3 Storage by User</div>
            <div class="admin-stats-grid" style="margin-top:10px">
              <div v-for="s in docMonitor.storage" :key="s.user_id" class="admin-stat-card">
                <n-icon :component="CloudUploadOutline" :size="24" class="admin-stat-card__icon" />
                <div class="admin-stat-card__body">
                  <div class="admin-stat-card__num">{{ formatBytes(s.total_bytes) }}</div>
                  <div class="admin-stat-card__label">{{ resolveUserEmail(s.user_id) }} · {{ s.doc_count }} files</div>
                </div>
              </div>
            </div>
          </div>

            </n-tab-pane>
            <n-tab-pane v-if="docMonitor" name="status" tab="Status by User">
          <div class="monitor-block">
            <div class="monitor-block__title">Document Status by User</div>
            <n-data-table
              :columns="docStatusColumns"
              :data="docStatusRows"
              :bordered="false"
              :pagination="{ pageSize: 15 }"
              :max-height="350"
              size="small"
              style="margin-top:10px"
            />
          </div>

            </n-tab-pane>
            <n-tab-pane v-if="docMonitor" name="failed" :tab="`Failed (${docMonitor.failed.length})`">
          <div class="monitor-block">
            <div class="monitor-block__title">
              Failed Extraction
              <n-tag v-if="docMonitor.failed.length" type="error" size="small" round style="margin-right:8px">{{ docMonitor.failed.length }}</n-tag>
            </div>
            <div v-if="docMonitor.failed.length === 0" class="admin-tab-empty">No failed extractions</div>
            <n-data-table
              v-else
              :columns="failedDocsColumns"
              :data="docMonitor.failed"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              size="small"
              style="margin-top:10px"
              :row-class-name="() => 'row-error'"
            />
          </div>

            </n-tab-pane>
            <n-tab-pane v-if="docMonitor" name="stuck" :tab="`Stuck (${docMonitor.stuck.length})`">
          <div class="monitor-block">
            <div class="monitor-block__title">
              Stuck Documents (Queued > 10 min)
              <n-tag v-if="docMonitor.stuck.length" type="warning" size="small" round style="margin-right:8px">{{ docMonitor.stuck.length }}</n-tag>
            </div>
            <div v-if="docMonitor.stuck.length === 0" class="admin-tab-empty">No documents stuck in the queue</div>
            <n-data-table
              v-else
              :columns="stuckDocsColumns"
              :data="docMonitor.stuck"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              :max-height="300"
              size="small"
              style="margin-top:10px"
            />
          </div>

            </n-tab-pane>
            <n-tab-pane v-if="docMonitor" name="fields" :tab="`Fields (${extractionsTotal})`">
          <div class="monitor-block">
            <div class="monitor-block__title">Extracted Field Values</div>
            <div style="display:flex;gap:10px;margin-top:10px;align-items:center;flex-wrap:wrap">
              <n-select
                v-model:value="extractionUserId"
                :options="userSelectOptions"
                placeholder="All Users"
                clearable
                style="width:220px; direction: rtl"
                @update:value="loadExtractions(1)"
              />
              <span style="font-size:12px;color:var(--text-secondary)">{{ extractionsTotal }} documents</span>
            </div>

            <n-data-table
              :columns="extractionColumns"
              :data="extractionTreeData"
              :loading="extractionsLoading"
              :bordered="false"
              size="small"
              style="margin-top:12px"
              :row-key="(row: any) => row._rowKey"
              default-expand-all
            />

            <div v-if="extractionsTotal > extractionLimit" style="display:flex;justify-content:center;gap:8px;margin-top:12px">
              <n-button
                size="small"
                :disabled="extractionPage <= 1"
                @click="loadExtractions(extractionPage - 1)"
              >Previous</n-button>
              <span style="font-size:12px;line-height:28px;color:var(--text-secondary)">
                Page {{ extractionPage }} / {{ Math.ceil(extractionsTotal / extractionLimit) }}
              </span>
              <n-button
                size="small"
                :disabled="extractionPage >= Math.ceil(extractionsTotal / extractionLimit)"
                @click="loadExtractions(extractionPage + 1)"
              >Next</n-button>
            </div>
          </div>

            </n-tab-pane>
            <n-tab-pane v-if="docMonitor" name="gaps" tab="Pipeline Gaps">
          <div v-if="pipelineGaps" class="monitor-block" style="border-color:rgba(208,48,80,0.25)">
            <div class="monitor-block__title">Pipeline Gaps</div>

            <div v-if="pipelineGaps.stuck_processing.length > 0" style="margin-top:14px">
              <div style="font-size:13px;font-weight:600;color:#d03050;margin-bottom:6px">
                Stuck in Processing
                <n-tag type="error" size="small" round style="margin-right:6px">{{ pipelineGaps.stuck_processing.length }}</n-tag>
              </div>
              <n-data-table :columns="stuckDocsColumns" :data="pipelineGaps.stuck_processing" :bordered="false" size="small" :pagination="{ pageSize: 10 }" :max-height="300" />
            </div>

            <div v-if="pipelineGaps.no_s3.length > 0" style="margin-top:14px">
              <div style="font-size:13px;font-weight:600;color:#f0a020;margin-bottom:6px">
                No S3 File (upload failed silently)
                <n-tag type="warning" size="small" round style="margin-right:6px">{{ pipelineGaps.no_s3.length }}</n-tag>
              </div>
              <n-data-table :columns="noS3Columns" :data="pipelineGaps.no_s3" :bordered="false" size="small" :pagination="{ pageSize: 10 }" />
            </div>

            <div v-if="pipelineGaps.skipped_reminders.length > 0" style="margin-top:14px">
              <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:6px">
                Skipped Reminders (no recipient email)
                <n-tag size="small" round style="margin-right:6px">{{ pipelineGaps.skipped_reminders.length }}</n-tag>
              </div>
              <n-data-table :columns="skippedReminderColumns" :data="pipelineGaps.skipped_reminders" :bordered="false" size="small" :pagination="{ pageSize: 10 }" />
            </div>

            <div v-if="(pipelineGaps.missing_emails ?? []).length > 0" style="margin-top:14px">
              <div style="font-size:13px;font-weight:600;color:#f0a020;margin-bottom:6px">
                Missing Emails by Document
                <n-tag type="warning" size="small" round style="margin-right:6px">{{ (pipelineGaps.missing_emails ?? []).length }}</n-tag>
              </div>
              <n-data-table
                :columns="missingEmailColumns"
                :data="pipelineGaps.missing_emails ?? []"
                :bordered="false"
                size="small"
                :pagination="{ pageSize: 10 }"
                :max-height="360"
              />
            </div>

            <div v-if="pipelineGaps.scanned_without_reminder.length > 0" style="margin-top:14px">
              <div style="font-size:13px;font-weight:600;color:#d03050;margin-bottom:6px">
                Scanned Documents Without Reminder
                <n-tag type="error" size="small" round style="margin-right:6px">{{ pipelineGaps.scanned_without_reminder.length }}</n-tag>
              </div>
              <n-data-table
                :columns="scannedWithoutReminderColumns"
                :data="pipelineGaps.scanned_without_reminder"
                :bordered="false"
                size="small"
                :pagination="{ pageSize: 10 }"
                :max-height="360"
              />
            </div>

            <div v-if="pipelineGaps.stuck_processing.length === 0 && pipelineGaps.no_s3.length === 0 && pipelineGaps.skipped_reminders.length === 0 && (pipelineGaps.missing_emails ?? []).length === 0 && pipelineGaps.scanned_without_reminder.length === 0"
                 style="padding:20px;text-align:center;color:var(--text-secondary)">
              ✅ No pipeline gaps detected
            </div>
          </div>
          <div v-else class="admin-tab-empty">Pipeline gap data is not loaded</div>
            </n-tab-pane>
<n-tab-pane name="backends" tab="By Backend">
<div class="admin-stats-grid">
            <AdminStatCard
              title="Total AI Runs"
              :primary="extractionQuality.summary.total_runs"
              primary-label="Extraction Attempts"
              :status="'default'"
              :icon="FlashOutline"
            />
            <AdminStatCard
              title="Parse Success Rate"
              :primary="extractionQuality.summary.parse_success_rate"
              primary-label="Parsed OK %"
              :secondary="extractionQuality.summary.parsed_ok"
              secondary-label="Successful Parses"
              :status="extractionQuality.summary.parse_success_rate >= 80 ? 'success' : extractionQuality.summary.parse_success_rate >= 50 ? 'warning' : 'error'"
              format="percent"
            />
            <AdminStatCard
              title="Avg Exec Time"
              :primary="extractionQuality.summary.avg_exec_ms ? (extractionQuality.summary.avg_exec_ms / 1000).toFixed(1) : '0'"
              primary-label="Seconds per Run"
              :status="extractionQuality.summary.avg_exec_ms > 30000 ? 'warning' : 'default'"
            />
            <AdminStatCard
              title="Parse Failures"
              :primary="extractionQuality.summary.total_runs - extractionQuality.summary.parsed_ok"
              primary-label="Failed Parses"
              :secondary="extractionQuality.recent_failures.length"
              secondary-label="Recent (last 50)"
              :status="(extractionQuality.summary.total_runs - extractionQuality.summary.parsed_ok) > 0 ? 'error' : 'success'"
            />
          </div>

          
          <div class="monitor-block">
            <div class="monitor-block__title">Success Rate by Backend</div>
            <n-data-table
              :columns="backendQualityColumns"
              :data="Object.entries(extractionQuality.summary.by_backend).map(([backend, data]: [string, any]) => ({ backend, ...data }))"
              :bordered="false"
              :max-height="300"
              size="small"
              style="margin-top:10px"
            />
          </div>
            </n-tab-pane>
            <n-tab-pane name="parse_failures" :tab="`Parse failures (${extractionQuality.recent_failures.length})`">
          <div class="monitor-block">
            <div class="monitor-block__title">
              Recent Parse Failures
              <n-tag v-if="extractionQuality.recent_failures.length" type="error" size="small" round style="margin-right:8px">{{ extractionQuality.recent_failures.length }}</n-tag>
            </div>
            <div v-if="extractionQuality.recent_failures.length === 0" class="admin-tab-empty">No recent parse failures</div>
            <n-data-table
              v-else
              :columns="parseFailureColumns"
              :data="extractionQuality.recent_failures"
              :bordered="false"
              :pagination="{ pageSize: 15 }"
              size="small"
              style="margin-top:10px"
              :row-class-name="() => 'row-error'"
            />
          </div>
            </n-tab-pane>
            <n-tab-pane name="slow" :tab="`Slow (${extractionQuality.slow_runs.length})`">
          <div class="monitor-block">
            <div class="monitor-block__title">
              Slow Runs (&gt;30s)
              <n-tag v-if="extractionQuality.slow_runs.length" type="warning" size="small" round style="margin-right:8px">{{ extractionQuality.slow_runs.length }}</n-tag>
            </div>
            <div v-if="extractionQuality.slow_runs.length === 0" class="admin-tab-empty">No slow runs</div>
            <n-data-table
              v-else
              :columns="slowRunColumns"
              :data="extractionQuality.slow_runs"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              :max-height="300"
              size="small"
              style="margin-top:10px"
            />
          </div>
            </n-tab-pane>
          <n-tab-pane name="iq_health" tab="Queue Health">
<n-alert
            v-if="importQueue.worker.stalled"
            type="error"
            title="Worker appears stalled"
            style="margin-bottom:14px"
          >
            {{ importQueue.jobs.claimable_now }} job(s) are claimable but nothing has completed in
            {{ importQueue.worker.minutes_since_last_completion }} minutes.
          </n-alert>
          <n-alert
            v-if="importQueue.documents.stuck_without_job > 0"
            type="warning"
            title="Documents with no processing job"
            style="margin-bottom:14px"
          >
            {{ importQueue.documents.stuck_without_job }} document(s) are queued but have no job row,
            so nothing will process them.
          </n-alert>

          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:12px;margin-bottom:16px">
            <AdminStatCard title="Queued" :primary="importQueue.jobs.by_status.queued ?? 0" primary-label="Waiting" />
            <AdminStatCard title="Running" :primary="importQueue.jobs.by_status.running ?? 0" primary-label="In flight" />
            <AdminStatCard title="Retry Wait" :primary="importQueue.jobs.by_status.retry_wait ?? 0" primary-label="Backing off" />
            <AdminStatCard title="Completed" :primary="importQueue.jobs.by_status.completed ?? 0" primary-label="Done" />
          </div>

          
          <div class="monitor-block">
            <div class="monitor-block__title">Queue Health</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:8px;margin-top:10px;font-size:13px">
              <div><span style="color:var(--text-secondary)">Claimable now:</span> {{ importQueue.jobs.claimable_now }}</div>
              <div><span style="color:var(--text-secondary)">Stale locks:</span> {{ importQueue.jobs.stale_running }}</div>
              <div><span style="color:var(--text-secondary)">Docs without job:</span> {{ importQueue.documents.stuck_without_job }}</div>
              <div><span style="color:var(--text-secondary)">Jobs without doc:</span> {{ importQueue.integrity.jobs_without_document }}</div>
              <div>
                <span style="color:var(--text-secondary)">Last completion:</span>
                {{ importQueue.worker.minutes_since_last_completion != null
                  ? importQueue.worker.minutes_since_last_completion + "m ago"
                  : "—" }}
              </div>
            </div>
          </div>
            </n-tab-pane>
            <n-tab-pane name="iq_reasons" :tab="`Reasons (${importQueue.failure_reasons.length})`">
          <div class="monitor-block">
            <div class="monitor-block__title">Failure Reasons</div>
            <div v-if="!importQueue.failure_reasons.length" class="admin-tab-empty">No failure reasons</div>
            <div v-else style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
              <n-tag v-for="r in importQueue.failure_reasons" :key="r.reason" type="warning" size="small">
                {{ r.reason }} · {{ r.count }}
              </n-tag>
            </div>
          </div>
            </n-tab-pane>
            <n-tab-pane name="iq_failures" :tab="`Failures (${importQueue.recent_failures.length})`">
          <div class="monitor-block">
            <div class="monitor-block__title">Recent Failures &amp; Retries</div>
            <div v-if="!importQueue.recent_failures.length" class="admin-tab-empty">No recent failures</div>
            <n-data-table
              v-else
              :columns="queueFailureColumns"
              :data="importQueue.recent_failures"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              size="small"
              style="margin-top:10px"
            />
          </div>
            </n-tab-pane>
          <n-tab-pane v-if="storageDrive" name="st_overview" tab="Object Storage">
<n-alert
            v-if="!storageDrive.object_storage.configured"
            type="warning"
            title="Object storage is not configured"
            style="margin-bottom:14px"
          >
            Local files are the only copy in this environment.
          </n-alert>
          <n-alert
            v-if="storageDrive.object_storage.stale_cached_urls > 0"
            type="warning"
            title="Stale cached URLs"
            style="margin-bottom:14px"
          >
            {{ storageDrive.object_storage.stale_cached_urls }} document(s) hold a signed URL pointing at a
            pre-migration key.
          </n-alert>

          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:12px;margin-bottom:16px">
            <AdminStatCard title="With Storage Key" :primary="storageDrive.object_storage.with_spaces_key" primary-label="In object storage" />
            <AdminStatCard title="Missing Key" :primary="storageDrive.object_storage.without_spaces_key" primary-label="No key" />
            <AdminStatCard title="Legacy Layout" :primary="storageDrive.object_storage.legacy_layout_keys" primary-label="Pre-migration keys" />
            <AdminStatCard title="Drive Synced" :primary="storageDrive.drive.synced" primary-label="Uploaded to Drive" />
          </div>

          <div class="monitor-block">
            <div class="monitor-block__title">Object Storage</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:8px;margin-top:10px;font-size:13px">
              <div><span style="color:var(--text-secondary)">Configured:</span> {{ storageDrive.object_storage.configured ? "yes" : "no" }}</div>
              <div><span style="color:var(--text-secondary)">Documents:</span> {{ storageDrive.object_storage.documents_total }}</div>
              <div><span style="color:var(--text-secondary)">Flagged missing:</span> {{ storageDrive.object_storage.flagged_file_missing }}</div>
              <div><span style="color:var(--text-secondary)">Stale URLs:</span> {{ storageDrive.object_storage.stale_cached_urls }}</div>
            </div>
          </div>

            </n-tab-pane>
            <n-tab-pane v-if="storageDrive" name="st_sources" tab="Import Sources">
          <div class="monitor-block">
            <div class="monitor-block__title">Import Sources</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
              <n-tag v-for="(n, k) in storageDrive.import_sources" :key="k" size="small">
                {{ k }} · {{ n }}
              </n-tag>
            </div>
          </div>

            </n-tab-pane>
            <n-tab-pane v-if="storageDrive" name="st_drive" tab="Google Drive">
          <div class="monitor-block">
            <div class="monitor-block__title">Google Drive</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:8px;margin-top:10px;font-size:13px">
              <div><span style="color:var(--text-secondary)">Synced:</span> {{ storageDrive.drive.synced }} / {{ storageDrive.drive.documents_total }}</div>
              <div><span style="color:var(--text-secondary)">Not synced:</span> {{ storageDrive.drive.not_synced }}</div>
            </div>
            <div v-if="Object.keys(storageDrive.drive.jobs_by_status).length" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
              <n-tag v-for="(n, k) in storageDrive.drive.jobs_by_status" :key="k" size="small">
                {{ k }} · {{ n }}
              </n-tag>
            </div>
            <div v-else style="margin-top:10px;font-size:13px;color:var(--text-secondary)">
              No bulk export jobs have run. Documents above were synced individually after processing.
            </div>
            <n-data-table
              v-if="storageDrive.drive.recent_jobs.length"
              :columns="driveJobColumns"
              :data="storageDrive.drive.recent_jobs"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              size="small"
              style="margin-top:10px"
            />
          </div>
            </n-tab-pane>
            <n-tab-pane name="temp" tab="Temp Files">
          <div class="monitor-block">
            <div class="monitor-block__toolbar">
              <div class="monitor-block__title">Temp Directories</div>
              <n-button
                size="small"
                secondary
                :loading="sweepRunning"
                @click="runTempSweep"
              >
                Sweep now
              </n-button>
            </div>
            <n-data-table
              :columns="tempDirColumns"
              :data="processMonitor.temp_files.directories"
              :bordered="false"
              :pagination="false"
              size="small"
              style="margin-top:10px"
            />
            <p class="process-note">
              Files here are scratch copies — the real document lives in object storage. Anything older
              than {{ processMonitor.temp_files.sweeper.retention_hours }}h is swept automatically.
            </p>
          </div>

            </n-tab-pane>
            <n-tab-pane name="st_browser" tab="Browser">
        <div class="monitor-block">
          <div class="monitor-block__title">Object Storage Browser</div>
          <p class="s3-browser__intro">
            List files in a user's S3 prefix and cross-check database links, orphans, and legacy keys.
          </p>
          <n-spin :show="s3Loading">
            <div class="s3-browser" dir="ltr">
              <div class="s3-folders">
                <div class="s3-folders__head">
                  <span class="s3-folders__title">Bucket folders</span>
                  <button class="btn btn--ghost btn--xs" type="button" :disabled="foldersLoading" @click="loadStorageFolders">
                    <n-icon :component="RefreshOutline" :size="14" class="btn-icon" />
                    {{ storageFolders.length ? "Refresh" : "Load" }}
                  </button>
                  <span v-if="storageFoldersTruncated" class="s3-folders__warn">
                    listing truncated — counts are partial
                  </span>
                </div>
                <table v-if="storageFolders.length" class="s3-table">
                  <thead>
                    <tr>
                      <th>Prefix</th>
                      <th style="text-align:right">Objects</th>
                      <th style="text-align:right">Size</th>
                      <th style="text-align:right">Linked</th>
                      <th style="text-align:right">Unreferenced</th>
                      <th style="text-align:right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="f in storageFolders" :key="f.prefix">
                      <td>
                        <code class="s3-key">{{ f.prefix }}</code>
                        <span v-if="f.owner_email" class="s3-muted"> — {{ f.owner_email }}</span>
                        <span v-else-if="f.looks_like_user_id" class="s3-folders__warn"> — unknown user id</span>
                      </td>
                      <td style="text-align:right">{{ f.objects }}</td>
                      <td style="text-align:right">{{ formatBytes(f.bytes) }}</td>
                      <td style="text-align:right">
                        <span class="s3-badge" :class="f.referenced ? 's3-badge--ok' : 's3-badge--err'">{{ f.referenced }}</span>
                      </td>
                      <td style="text-align:right">{{ f.unreferenced }}</td>
                      <td style="text-align:right">
                        <button
                          class="btn btn--danger btn--xs"
                          type="button"
                          :disabled="deletingFolder === f.prefix"
                          @click="confirmDeleteFolder(f)"
                        >
                          <n-icon :component="TrashOutline" :size="14" class="btn-icon" />
                          Delete folder
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p v-else-if="!foldersLoading" class="s3-muted" style="margin:8px 0 0">
                  Load to see every top-level prefix in the bucket and how much of it is still referenced.
                </p>
              </div>

              <div class="s3-browser__toolbar">
                <n-select
                  v-model:value="s3BrowseUserId"
                  :options="userSelectOptions"
                  placeholder="Select user to browse"
                  clearable
                  filterable
                  class="s3-browser__user"
                  @update:value="loadS3Files"
                />
                <n-input
                  v-model:value="s3FileSearch"
                  placeholder="Filter by file name or key..."
                  clearable
                  class="s3-browser__search"
                  :disabled="!s3Files.length"
                >
                  <template #prefix><n-icon :component="SearchOutline" :size="16" /></template>
                </n-input>
                <n-select
                  v-model:value="s3StatusFilter"
                  :options="s3StatusOptions"
                  placeholder="Status"
                  clearable
                  class="s3-browser__status"
                  :disabled="!s3Files.length"
                />
                <n-select
                  v-model:value="s3AreaFilter"
                  :options="s3AreaOptions"
                  placeholder="Area"
                  clearable
                  class="s3-browser__status"
                  :disabled="!s3Files.length"
                />
                <button
                  class="btn btn--ghost"
                  type="button"
                  :disabled="!s3BrowseUserId || s3Loading"
                  @click="loadS3Files"
                >
                  <n-icon :component="RefreshOutline" :size="16" :class="{ 's3-spin': s3Loading }" class="btn-icon" />
                  Refresh
                </button>
              </div>

              <div v-if="s3BrowseUserId && s3Files.length" class="s3-stats">
                <div class="s3-stat">
                  <span class="s3-stat__num">{{ s3Stats.total }}</span>
                  <span class="s3-stat__label">Files</span>
                </div>
                <div class="s3-stat">
                  <span class="s3-stat__num">{{ formatBytes(s3Stats.bytes) }}</span>
                  <span class="s3-stat__label">Total size</span>
                </div>
                <div class="s3-stat s3-stat--ok">
                  <span class="s3-stat__num">{{ s3Stats.inDb }}</span>
                  <span class="s3-stat__label">In DB</span>
                </div>
                <div class="s3-stat" :class="{ 's3-stat--warn': s3Stats.orphan > 0 }">
                  <span class="s3-stat__num">{{ s3Stats.orphan }}</span>
                  <span class="s3-stat__label">Orphan</span>
                </div>
                <div class="s3-stat" :class="{ 's3-stat--warn': s3Stats.legacy > 0 }">
                  <span class="s3-stat__num">{{ s3Stats.legacy }}</span>
                  <span class="s3-stat__label">Legacy key</span>
                </div>
                <div class="s3-stat">
                  <span class="s3-stat__num">{{ s3Stats.thumbnails }}</span>
                  <span class="s3-stat__label">Thumbnails</span>
                </div>
                <div class="s3-stat">
                  <span class="s3-stat__num">{{ filteredS3Files.length }}</span>
                  <span class="s3-stat__label">Showing</span>
                </div>
                <n-tag v-if="s3Truncated" type="warning" size="small" round>List truncated — more files exist</n-tag>
              </div>

              <div v-if="filteredS3Files.length" class="s3-table-wrap">
                <table class="s3-table">
                  <thead>
                    <tr>
                      <th class="s3-col-file">File</th>
                      <th class="s3-col-size">Size</th>
                      <th class="s3-col-date">Modified</th>
                      <th class="s3-col-db">DB</th>
                      <th class="s3-col-status">Area</th>
                      <th class="s3-col-status">Status</th>
                      <th class="s3-col-key">S3 Key</th>
                      <th class="s3-col-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in pagedS3Files"
                      :key="row.key"
                      class="s3-row"
                      :class="{ 's3-row--orphan': !row.in_db && row.kind !== 'thumbnail' }"
                    >
                      <td class="s3-col-file">
                        <div class="s3-file">
                          <n-icon :component="DocumentOutline" :size="14" class="s3-file__icon" />
                          <span class="s3-file__name" :title="row.file_name">{{ row.file_name || "—" }}</span>
                        </div>
                      </td>
                      <td class="s3-col-size">{{ formatBytes(row.size) }}</td>
                      <td class="s3-col-date">{{ row.last_modified ? new Date(row.last_modified).toLocaleString("en-US") : "—" }}</td>
                      <td class="s3-col-db">
                        <span
                          class="s3-badge"
                          :class="row.kind === 'thumbnail' ? 's3-badge--ok' : (row.in_db ? 's3-badge--ok' : 's3-badge--err')"
                        >
                          {{ row.kind === "thumbnail" ? "Thumbnail" : (row.in_db ? "Linked" : "Orphan") }}
                        </span>
                      </td>
                      <td class="s3-col-status">
                        <span class="s3-badge" :class="row.layout === 'legacy' ? 's3-badge--err' : 's3-badge--ok'">
                          {{ row.area || "—" }}
                        </span>
                      </td>
                      <td class="s3-col-status">
                        <span v-if="row.status" class="s3-badge" :class="`s3-badge--${row.status}`">{{ row.status }}</span>
                        <span v-else class="s3-muted">—</span>
                      </td>
                      <td class="s3-col-key">
                        <code class="s3-key" :title="row.key">{{ row.key }}</code>
                      </td>
                      <td class="s3-col-actions">
                        <div class="s3-actions">
                          <n-tooltip placement="top">
                            <template #trigger>
                              <button
                                class="btn btn--ghost btn--xs icon-btn"
                                type="button"
                                @click="windowOpenStorage(row.key)"
                              >
                                <n-icon :component="DownloadOutline" :size="14" class="btn-icon" />
                              </button>
                            </template>
                            Download
                          </n-tooltip>
                          <n-tooltip v-if="row.doc_id" placement="top">
                            <template #trigger>
                              <button
                                class="btn btn--ghost btn--xs icon-btn"
                                type="button"
                                @click="openDocModal(row.doc_id)"
                              >
                                <n-icon :component="EyeOutline" :size="14" class="btn-icon" />
                              </button>
                            </template>
                            Open document
                          </n-tooltip>
                          <n-tooltip v-if="!row.in_db" placement="top">
                            <template #trigger>
                              <button
                                class="btn btn--ghost btn--xs icon-btn"
                                type="button"
                                style="color: var(--error-color)"
                                @click="deleteOrphanFile(row.key)"
                              >
                                <n-icon :component="TrashOutline" :size="14" class="btn-icon" />
                              </button>
                            </template>
                            Delete orphan
                          </n-tooltip>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div v-if="filteredS3Files.length > s3PageSize" class="s3-pager">
                <button class="btn btn--ghost btn--xs" type="button" :disabled="s3Page <= 1" @click="s3Page--">Prev</button>
                <span class="s3-pager__label">Page {{ s3Page }} / {{ s3PageCount }}</span>
                <button class="btn btn--ghost btn--xs" type="button" :disabled="s3Page >= s3PageCount" @click="s3Page++">Next</button>
              </div>

              <div v-else-if="s3BrowseUserId && !s3Loading && !s3Files.length" class="s3-empty">
                <n-icon :component="CloudUploadOutline" :size="36" class="s3-empty__icon" />
                <h3 class="s3-empty__title">No files for this user</h3>
                <p class="s3-empty__desc">Nothing under <code>documents/{{ s3BrowseUserId }}/</code></p>
              </div>

              <div v-else-if="s3BrowseUserId && s3Files.length && !filteredS3Files.length" class="s3-empty">
                <n-icon :component="SearchOutline" :size="36" class="s3-empty__icon" />
                <h3 class="s3-empty__title">No matches</h3>
                <p class="s3-empty__desc">Try clearing the search or status filter</p>
              </div>

              <div v-else-if="!s3BrowseUserId && !s3Loading" class="s3-empty">
                <n-icon :component="CloudUploadOutline" :size="36" class="s3-empty__icon" />
                <h3 class="s3-empty__title">Browse object storage</h3>
                <p class="s3-empty__desc">Select a user to list files in their S3 prefix and cross-check DB links</p>
              </div>
            </div>
          </n-spin>
        </div>
            </n-tab-pane>
                    </n-tabs>
        </template>
      </section>

      <!-- ── Reminders ── -->
      <section v-if="activeSection === 'reminders'" class="admin-section">
        <n-spin v-if="sectionLoading" style="display:flex;justify-content:center;padding:40px" />
        <template v-else-if="reminderMonitor">
          <!-- Email Delivery Summary Cards (MOST IMPORTANT) -->
          <div class="admin-stats-grid">
            <AdminStatCard
              title="Email Delivery Success"
              :primary="emailStats.successRate"
              primary-label="Success Rate %"
              :secondary="emailStats.sent"
              secondary-label="Sent Successfully"
              :status="emailStats.successRate >= 90 ? 'success' : emailStats.successRate >= 70 ? 'warning' : 'error'"
              format="percent"
            />
            <AdminStatCard
              title="Failed Email Sends"
              :primary="emailStats.failed"
              primary-label="Failed Attempts"
              :secondary="reminderMonitor.failedSends?.length ?? 0"
              secondary-label="Recent Failures"
              :status="emailStats.failed > 0 ? 'error' : 'success'"
            />
            <AdminStatCard
              title="Pending Reminders"
              :primary="emailStats.pending"
              primary-label="Waiting to Send"
              :secondary="reminderMonitor.pending?.length ?? 0"
              secondary-label="Upcoming Soon"
              :status="emailStats.pending > 100 ? 'warning' : 'default'"
            />
            <AdminStatCard
              title="Total Reminders"
              :primary="emailStats.total"
              primary-label="Sent + Failed"
              :status="'default'"
            />
          </div>

          <n-tabs :value="pageTab" type="line" animated class="admin-page-tabs" @update:value="onPageTab">
            <n-tab-pane name="failed" :tab="`Failed (${reminderMonitor.failedSends.length})`">
          <div class="monitor-block" style="border-color: rgba(208, 48, 80, 0.3); background: rgba(208, 48, 80, 0.02)">
            <div class="monitor-block__title" style="color: #d03050">
              Failed Email Deliveries
              <n-tag v-if="reminderMonitor.failedSends.length" type="error" size="small" round style="margin-right:8px">{{ reminderMonitor.failedSends.length }}</n-tag>
            </div>
            <div v-if="reminderMonitor.failedSends.length === 0" class="admin-tab-empty">No failed sends</div>
            <n-data-table
              v-else
              :columns="failedSendsColumns"
              :data="reminderMonitor.failedSends"
              :bordered="false"
              :pagination="{ pageSize: 15 }"
              :max-height="350"
              size="small"
              style="margin-top:10px"
              :row-class-name="() => 'row-error'"
            />
          </div>
            </n-tab-pane>
            <n-tab-pane name="status" tab="By User">
          <div class="monitor-block">
            <div class="monitor-block__title">Reminder Status by User</div>
            <n-data-table
              :columns="reminderStatusColumns"
              :data="reminderStatusRows"
              :bordered="false"
              :pagination="{ pageSize: 15 }"
              :max-height="350"
              size="small"
              style="margin-top:10px"
            />
          </div>
            </n-tab-pane>
            <n-tab-pane name="pending" :tab="`Pending (${reminderMonitor.pending.length})`">
          <div class="monitor-block">
            <div class="monitor-block__title">
              Pending Reminders (Waiting to Send)
              <n-tag v-if="reminderMonitor.pending.length" type="warning" size="small" round style="margin-right:8px">{{ reminderMonitor.pending.length }}</n-tag>
            </div>
            <div v-if="reminderMonitor.pending.length === 0" class="admin-tab-empty">No reminders waiting to send</div>
            <n-data-table
              v-else
              :columns="pendingReminderColumns"
              :data="reminderMonitor.pending"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              size="small"
              style="margin-top:10px"
            />
          </div>
            </n-tab-pane>
            <n-tab-pane name="escalations" :tab="`Escalations (${(reminderMonitor.failedEscalations ?? []).length})`">
          <div class="monitor-block" style="border-color:rgba(208,48,80,0.3);background:rgba(208,48,80,0.02)">
            <div class="monitor-block__title" style="color:#d03050">
              Failed Escalations
              <n-tag v-if="(reminderMonitor.failedEscalations ?? []).length" type="error" size="small" round style="margin-right:8px">{{ reminderMonitor.failedEscalations.length }}</n-tag>
            </div>
            <div v-if="(reminderMonitor.failedEscalations ?? []).length === 0" class="admin-tab-empty">No failed escalations</div>
            <n-data-table
              v-else
              :columns="failedEscalationColumns"
              :data="reminderMonitor.failedEscalations"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              size="small"
              style="margin-top:10px"
              :row-class-name="() => 'row-error'"
            />
          </div>
            </n-tab-pane>
            <n-tab-pane name="advances" :tab="`Advances (${contractAdvances.length})`">
          <div class="monitor-block">
            <div class="monitor-block__title">
              Contract Auto-Advances
              <n-tag v-if="contractAdvances.length" size="small" round style="margin-right:8px">{{ contractAdvances.length }}</n-tag>
            </div>
            <div v-if="contractAdvances.length === 0" class="admin-tab-empty">No contract auto-advances</div>
            <n-data-table
              v-else
              :columns="contractAdvanceColumns"
              :data="contractAdvances"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              size="small"
              style="margin-top:10px"
            />
          </div>
            </n-tab-pane>
          </n-tabs>
        </template>
      </section>

      <!-- ── Monthly Reports ── -->

      <!-- Background processes & temp-file disk usage -->
      <section v-if="activeSection === 'processes'" class="admin-section">
        <n-spin v-if="sectionLoading" style="display:flex;justify-content:center;padding:40px" />
        <template v-else-if="processMonitor">
          <n-alert v-if="pausedProcessCount > 0" type="warning" :bordered="false" style="margin-bottom:16px">
            {{ pausedProcessCount }} background {{ pausedProcessCount === 1 ? 'process is' : 'processes are' }}
            paused. Paused work stays queued and resumes where it left off.
          </n-alert>

          <div class="admin-stats-grid">
            <AdminStatCard
              title="Background Processes"
              :primary="processMonitor.processes.length - pausedProcessCount"
              primary-label="Running"
              :secondary="pausedProcessCount"
              secondary-label="Paused"
              :status="pausedProcessCount === 0 ? 'success' : 'warning'"
            />
            <AdminStatCard
              title="Queued Work"
              :primary="totalQueuedJobs"
              primary-label="Jobs Waiting"
              :secondary="totalRunningJobs"
              secondary-label="In Flight"
              :status="totalStaleJobs > 0 ? 'warning' : 'default'"
            />
            <AdminStatCard
              title="Temp Files On Disk"
              :primary="formatBytes(tempTotalBytes)"
              primary-label="Total Size"
              :secondary="tempTotalFiles"
              secondary-label="Files"
              :status="tempStaleBytes > 0 ? 'warning' : 'success'"
            />
            <AdminStatCard
              title="Sweeper"
              :primary="processMonitor.temp_files.sweeper.running ? 'Running' : 'Stopped'"
              :primary-label="`Every ${processMonitor.temp_files.sweeper.interval_minutes}m`"
              :secondary="formatDate(processMonitor.temp_files.sweeper.last_run_at)"
              secondary-label="Last Sweep"
              :status="processMonitor.temp_files.sweeper.running ? 'success' : 'warning'"
            />
            <AdminStatCard
              title="This Container"
              :primary="formatInterval(processMonitor.container.uptime_seconds)"
              primary-label="Uptime"
              :secondary="formatBytes(processMonitor.container.memory_rss_bytes)"
              secondary-label="Memory (RSS)"
              :status="'default'"
            />
          </div>

          <n-tabs :value="pageTab" type="line" animated class="admin-page-tabs" @update:value="onPageTab">
            <n-tab-pane name="workers" tab="Processes">
          <div class="monitor-block">
            <div class="monitor-block__title">Background Processes</div>
            <n-data-table
              :columns="processColumns"
              :data="processMonitor.processes"
              :bordered="false"
              :pagination="false"
              size="small"
              style="margin-top:10px"
            />
            <p class="process-note">
              Pausing is stored in the database, so it survives a redeploy and applies to every
              container. A job already in flight is allowed to finish — only the next one is held back.
            </p>
          </div>

            </n-tab-pane>
            <n-tab-pane name="work" tab="Work by User">
          <div class="monitor-block">
            <div class="monitor-block__toolbar">
              <div class="monitor-block__title">Outstanding Work By User</div>
              <n-select
                v-model:value="selectedQueueProcess"
                :options="queueProcessOptions"
                size="small"
                style="width:220px"
                @update:value="loadProcessJobs"
              />
            </div>
            <n-data-table
              v-if="selectedProcessUserLoad.length"
              :columns="userLoadColumns"
              :data="selectedProcessUserLoad"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              :max-height="320"
              size="small"
              style="margin-top:10px"
            />
            <p v-else class="process-note">No outstanding jobs for this worker.</p>
            <p v-if="selectedProcessUserLoad.length" class="process-note">
              Completed jobs are left out — this is work still queued, running, retrying or failed,
              so a single account's stuck batch does not read as a system-wide outage.
            </p>
          </div>

            </n-tab-pane>
            <n-tab-pane name="jobs" tab="Recent Jobs">
          <div class="monitor-block">
            <div class="monitor-block__toolbar">
              <div class="monitor-block__title">Recent Jobs</div>
              <div class="queue-filter">
                <n-select
                  v-model:value="queueUserFilter"
                  :options="userSelectOptions"
                  size="small"
                  clearable
                  filterable
                  placeholder="All users"
                  style="width:260px"
                  @update:value="loadProcessJobs"
                />
              </div>
            </div>
            <n-data-table
              :columns="queueJobColumns"
              :data="processJobs"
              :loading="jobsLoading"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              :max-height="400"
              size="small"
              style="margin-top:10px"
            />
          </div>
            </n-tab-pane>
<n-tab-pane name="cron" tab="Cron Jobs">
<div class="admin-stats-grid">
            <AdminStatCard
              title="Scheduler Health"
              :primary="schedulerMonitor.jobs.filter((j: any) => !j.last_error && (j.consecutive_failures ?? 0) === 0).length"
              :primary-label="`Healthy Jobs`"
              :secondary="schedulerMonitor.jobs.length"
              secondary-label="Total Jobs"
              :status="schedulerMonitor.jobs.some((j: any) => j.last_error || (j.consecutive_failures ?? 0) > 0) ? 'warning' : 'success'"
            />
            <AdminStatCard
              title="Emails Sent (Last Hour)"
              :primary="schedulerMonitor.sentLastHour"
              primary-label="Successful Sends"
              :secondary="schedulerMonitor.failedLastHour"
              secondary-label="Failed Attempts"
              :status="schedulerMonitor.failedLastHour === 0 ? 'success' : 'warning'"
            />
            <AdminStatCard
              title="Last Run"
              :primary="formatDate(schedulerMonitor.lastRunTime)"
              primary-label="Most Recent Tick"
              :secondary="formatDate(schedulerMonitor.nextRunTime)"
              secondary-label="Next Scheduled"
              :status="'default'"
            />
            <AdminStatCard
              title="Check Interval"
              :primary="formatInterval(schedulerMonitor.intervalSeconds)"
              primary-label="Scheduler Period"
              :status="'default'"
            />
            <AdminStatCard
              v-if="schedulerMonitor.backup"
              title="Database Backup"
              :primary="formatDate(schedulerMonitor.backup.last_run_at)"
              primary-label="Last Backup"
              :secondary="formatBytes(schedulerMonitor.backup.size_bytes)"
              secondary-label="Volume"
              :status="backupStatus(schedulerMonitor.backup.last_run_at)"
            />
            <AdminStatCard
              v-else
              title="Database Backup"
              primary="No backups yet"
              :status="'warning'"
            />
          </div>

          
          <div class="monitor-block">
            <div class="monitor-block__title">Cron Job Health</div>
            <n-data-table
              :columns="cronJobColumns"
              :data="schedulerMonitor.jobs ?? []"
              :bordered="false"
              :pagination="{ pageSize: 15 }"
              :max-height="350"
              size="small"
              style="margin-top:10px"
            />
          </div>
            </n-tab-pane>
            <n-tab-pane name="monthly" tab="Monthly Schedule">
          <div class="monitor-block">
            <div class="monitor-block__title">Monthly Report Schedule by User</div>
            <n-data-table
              :columns="monthlyScheduleColumns"
              :data="schedulerMonitor.monthlySchedule"
              :bordered="false"
              :pagination="{ pageSize: 15 }"
              :max-height="350"
              size="small"
              style="margin-top:10px"
            />
          </div>
            </n-tab-pane>
                    </n-tabs>
        </template>
      </section>

      <section v-if="activeSection === 'monthly'" class="admin-section">
        <n-spin v-if="sectionLoading" style="display:flex;justify-content:center;padding:40px" />
        <template v-else-if="monthlyMonitor">
          <n-tabs :value="pageTab" type="line" animated class="admin-page-tabs" @update:value="onPageTab">
            <n-tab-pane name="config" tab="Configuration">
          <div class="monitor-block">
            <div class="monitor-block__title">
              Monthly Report Configuration by User
              <span style="font-size:12px;font-weight:400;color:var(--text-secondary)">
                {{ filteredMonthlySchedules.length }} of {{ monthlyMonitor.schedules.length }}
              </span>
            </div>
            <div class="admin-section__toolbar" style="margin-top:8px">
              <n-input v-model:value="monthlyFilter.q" clearable size="small" placeholder="Search user or recipient..." style="max-width: 260px">
                <template #prefix><n-icon :component="SearchOutline" /></template>
              </n-input>
              <n-select v-model:value="monthlyFilter.enabled" clearable size="small" placeholder="Enabled" :options="monthlyEnabledOptions" style="width: 130px" />
              <n-select v-model:value="monthlyFilter.day" clearable size="small" placeholder="Day" :options="monthlyDayOptions" style="width: 110px" />
              <n-select v-model:value="monthlyFilter.status" clearable size="small" placeholder="Status" :options="monthlyStatusOptions" style="width: 150px" />
            </div>
            <n-data-table
              :columns="monthlyScheduleDetailColumns"
              :data="filteredMonthlySchedules"
              :bordered="false"
              :pagination="{ pageSize: 15 }"
              size="small"
              style="margin-top:10px"
            />
          </div>

            </n-tab-pane>
            <n-tab-pane name="failures" :tab="`Failures (${monthlyMonitor.failedDeliveries.length})`">
          <div class="monitor-block">
            <div class="monitor-block__title">
              Monthly Report Send Failures
              <n-tag v-if="monthlyMonitor.failedDeliveries.length" type="error" size="small" round style="margin-right:8px">{{ monthlyMonitor.failedDeliveries.length }}</n-tag>
            </div>
            <n-data-table
              :columns="failedSendsColumns"
              :data="monthlyMonitor.failedDeliveries"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              size="small"
              style="margin-top:10px"
            />
          </div>
            </n-tab-pane>
          </n-tabs>
        </template>
      </section>
      <!-- ── Bad Emails ── -->
      <section v-if="activeSection === 'bad_emails'" class="admin-section">
        <n-spin v-if="sectionLoading" style="display:flex;justify-content:center;padding:40px" />
        <template v-else-if="badEmailsData">
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
            <n-tag :type="badEmailsData.summary.total_bad_clients ? 'error' : 'success'" round>
              Bad client emails: {{ badEmailsData.summary.total_bad_clients }}
            </n-tag>
            <n-tag :type="badEmailsData.summary.total_bad_reminders ? 'warning' : 'success'" round>
              Bad reminder emails: {{ badEmailsData.summary.total_bad_reminders }}
            </n-tag>
            <n-tag :type="badEmailsData.summary.total_bad_doc_emails ? 'warning' : 'success'" round>
              Bad extracted emails: {{ badEmailsData.summary.total_bad_doc_emails }}
            </n-tag>
            <n-tag :type="badEmailsData.summary.total_bounced ? 'error' : 'success'" round>
              Bounced: {{ badEmailsData.summary.total_bounced }}
            </n-tag>
          </div>

          <n-tabs :value="pageTab" type="line" animated class="admin-page-tabs" @update:value="onPageTab">
            <n-tab-pane name="clients" :tab="`Clients (${badEmailsData.bad_clients.length})`">
          <div class="monitor-block">
            <div class="monitor-block__title">
              Bad Client Emails
              <n-tag v-if="badEmailsData.bad_clients.length" type="error" size="small" round style="margin-right:8px">{{ badEmailsData.bad_clients.length }}</n-tag>
            </div>
            <div v-if="!badEmailsData.bad_clients.length" class="admin-tab-empty">No bad client emails</div>
            <n-data-table
              v-else
              :columns="badClientEmailColumns"
              :data="badEmailsData.bad_clients"
              :bordered="false"
              :pagination="{ pageSize: 15 }"
              size="small"
              style="margin-top:10px"
            />
          </div>
            </n-tab-pane>
            <n-tab-pane name="reminders" :tab="`Reminders (${badEmailsData.bad_reminders.length})`">
          <div class="monitor-block">
            <div class="monitor-block__title">
              Bad Reminder Emails
              <n-tag v-if="badEmailsData.bad_reminders.length" type="warning" size="small" round style="margin-right:8px">{{ badEmailsData.bad_reminders.length }}</n-tag>
            </div>
            <div v-if="!badEmailsData.bad_reminders.length" class="admin-tab-empty">No bad reminder emails</div>
            <n-data-table
              v-else
              :columns="badReminderEmailColumns"
              :data="badEmailsData.bad_reminders"
              :bordered="false"
              :pagination="{ pageSize: 15 }"
              size="small"
              style="margin-top:10px"
            />
          </div>
            </n-tab-pane>
            <n-tab-pane name="extracted" :tab="`Extracted (${badEmailsData.bad_doc_emails.length})`">
          <div class="monitor-block">
            <div class="monitor-block__title">
              Bad Extracted Emails (from documents)
              <n-tag v-if="badEmailsData.bad_doc_emails.length" type="warning" size="small" round style="margin-right:8px">{{ badEmailsData.bad_doc_emails.length }}</n-tag>
            </div>
            <div v-if="!badEmailsData.bad_doc_emails.length" class="admin-tab-empty">No bad extracted emails</div>
            <n-data-table
              v-else
              :columns="badDocEmailColumns"
              :data="badEmailsData.bad_doc_emails"
              :bordered="false"
              :pagination="{ pageSize: 15 }"
              size="small"
              style="margin-top:10px"
            />
          </div>
            </n-tab-pane>
            <n-tab-pane name="bounced" :tab="`Bounced (${badEmailsData.bounced.length})`">
          <div class="monitor-block">
            <div class="monitor-block__title">
              Bounced Emails
              <n-tag v-if="badEmailsData.bounced.length" type="error" size="small" round style="margin-right:8px">{{ badEmailsData.bounced.length }}</n-tag>
            </div>
            <div v-if="!badEmailsData.bounced.length" class="admin-tab-empty">No bounced emails</div>
            <n-data-table
              v-else
              :columns="bouncedEmailColumns"
              :data="badEmailsData.bounced"
              :bordered="false"
              :pagination="{ pageSize: 15 }"
              size="small"
              style="margin-top:10px"
            />
          </div>
            </n-tab-pane>
          </n-tabs>
        </template>
      </section>

      <!-- ── System Health ── -->
      <!-- ── Invoices ── -->
<!--      <section v-if="activeSection === 'invoices'" class="admin-section">-->
<!--        <n-spin v-if="sectionLoading" style="display:flex;justify-content:center;padding:40px" />-->
<!--        <template v-else-if="invoiceMonitor">-->
<!--          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:12px;margin-bottom:16px">-->
<!--            <AdminStatCard title="Invoices" :primary="invoiceMonitor.totals.invoices" primary-label="Saved rows" />-->
<!--            <AdminStatCard title="With Amount" :primary="invoiceMonitor.totals.with_amount" primary-label="Have a total" />-->
<!--            <AdminStatCard-->
<!--              title="Save Rate"-->
<!--              :primary="invoiceMonitor.totals.save_rate != null ? Math.round(invoiceMonitor.totals.save_rate * 100) + '%' : '—'"-->
<!--              primary-label="Processed → saved"-->
<!--              format="custom"-->
<!--            />-->
<!--            <AdminStatCard title="Not Saved" :primary="invoiceMonitor.processed_not_saved.reduce((s: number, r: any) => s + r.count, 0)" primary-label="Processed, skipped" />-->
<!--          </div>-->

<!--          <div class="monitor-block">-->
<!--            <div class="monitor-block__title">By Document Subtype</div>-->
<!--            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">-->
<!--              <n-tag v-for="r in invoiceMonitor.by_subtype" :key="r.subtype" size="small">-->
<!--                {{ r.subtype }} · {{ r.count }}-->
<!--              </n-tag>-->
<!--            </div>-->
<!--          </div>-->

<!--          <div class="monitor-block">-->
<!--            <div class="monitor-block__title">Cash Flow</div>-->
<!--            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">-->
<!--              <n-tag v-for="(n, k) in invoiceMonitor.by_cash_flow" :key="k" size="small" :type="k === 'income' ? 'success' : 'default'">-->
<!--                {{ k }} · {{ n }}-->
<!--              </n-tag>-->
<!--            </div>-->
<!--          </div>-->

<!--          <div v-if="invoiceMonitor.known_extractor_providers.length" class="monitor-block">-->
<!--            <div class="monitor-block__title">Matched Vendors (deterministic extractors)</div>-->
<!--            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">-->
<!--              <n-tag v-for="r in invoiceMonitor.known_extractor_providers" :key="r.provider" size="small" type="info">-->
<!--                {{ r.provider }} · {{ r.count }}-->
<!--              </n-tag>-->
<!--            </div>-->
<!--          </div>-->

<!--          <div v-if="invoiceMonitor.processed_not_saved.length" class="monitor-block">-->
<!--            <div class="monitor-block__title">Processed But Not Saved (by classified kind)</div>-->
<!--            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">-->
<!--              <n-tag v-for="r in invoiceMonitor.processed_not_saved" :key="r.document_kind" size="small" type="warning">-->
<!--                {{ r.document_kind }} · {{ r.count }}-->
<!--              </n-tag>-->
<!--            </div>-->
<!--          </div>-->

<!--          <div v-if="invoiceMonitor.missing_required_fields.length" class="monitor-block">-->
<!--            <div class="monitor-block__title">Missing Required Fields</div>-->
<!--            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">-->
<!--              <n-tag v-for="r in invoiceMonitor.missing_required_fields" :key="r.field" size="small" type="error">-->
<!--                {{ r.field }} · {{ r.count }}-->
<!--              </n-tag>-->
<!--            </div>-->
<!--          </div>-->
<!--        </template>-->
<!--      </section>-->

      <!-- ── Storage & Drive ── -->
      <section v-if="activeSection === 'system_health'" class="admin-section">
        <n-tabs :value="pageTab" type="line" animated class="admin-page-tabs" @update:value="onPageTab">
          <n-tab-pane name="live" tab="Live">
            <AdminServerLivePanel :key="`live-${adminDbTarget}`" />
          </n-tab-pane>
          <n-tab-pane name="process" tab="Process">
            <n-spin v-if="sectionLoading" style="display:flex;justify-content:center;padding:40px" />
            <template v-else-if="systemHealth">
              <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:12px;margin-bottom:16px">
                <AdminStatCard title="Uptime" :primary="systemHealth.server.uptime_human" primary-label="Server" format="custom" />
                <AdminStatCard title="Node.js" :primary="systemHealth.server.node_version" primary-label="Runtime" format="custom" />
                <AdminStatCard title="Memory (RSS)" :primary="systemHealth.server.memory.rss_mb + ' MB'" primary-label="Resident Set" format="custom" />
                <AdminStatCard title="Active Sessions" :primary="systemHealth.active_sessions" primary-label="Open" />
              </div>
              <div class="monitor-block">
                <div class="monitor-block__title">Server Process</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:8px;margin-top:10px;font-size:13px">
                  <div><span style="color:var(--text-secondary)">PID:</span> {{ systemHealth.server.pid }}</div>
                  <div><span style="color:var(--text-secondary)">Platform:</span> {{ systemHealth.server.platform }}</div>
                  <div><span style="color:var(--text-secondary)">Heap Used:</span> {{ systemHealth.server.memory.heap_used_mb }} MB</div>
                  <div><span style="color:var(--text-secondary)">Heap Total:</span> {{ systemHealth.server.memory.heap_total_mb }} MB</div>
                  <div><span style="color:var(--text-secondary)">External:</span> {{ systemHealth.server.memory.external_mb }} MB</div>
                </div>
              </div>
            </template>
          </n-tab-pane>
          <n-tab-pane name="database" tab="Database">
            <n-spin v-if="sectionLoading" style="display:flex;justify-content:center;padding:40px" />
            <div v-else-if="systemHealth" class="monitor-block">
              <div class="monitor-block__title">
                Database: {{ systemHealth.database.name }}
                <span v-if="systemHealth.database.size_mb != null" style="font-weight:400;font-size:12px;color:var(--text-secondary);margin-right:8px">
                  ({{ systemHealth.database.size_mb }} MB data / {{ systemHealth.database.storage_mb }} MB storage)
                </span>
              </div>
              <n-data-table
                :columns="collectionStatsColumns"
                :data="systemHealth.database.collections"
                :bordered="false"
                :pagination="false"
                size="small"
                style="margin-top:10px"
              />
            </div>
          </n-tab-pane>
        </n-tabs>
      </section>

      <!-- ── Settings ── -->
      <section v-if="activeSection === 'settings'" class="admin-section">
        <n-spin v-if="sectionLoading" style="display:flex;justify-content:center;padding:40px" />
        <template v-else-if="adminSettings">
          <n-tabs :value="pageTab" type="line" animated class="admin-page-tabs" @update:value="onPageTab">
            <n-tab-pane name="push" tab="Notifications">
          <div class="monitor-block">
            <div class="monitor-block__title">Admin Push Notifications</div>
            <p style="font-size:13px;color:var(--text-secondary);margin:4px 0 12px">
              Get OS notifications for failed sends, extraction failures, new uploads, pipeline gaps and server alerts (CPU, memory, latency, errors, timeouts) — even when this tab is closed. Turn it on separately on each device, including your phone (on iPhone, add the app to the Home Screen first).
            </p>
            <div v-if="!pushSupported" style="font-size:13px;color:var(--text-secondary)">
              Push isn't available here (needs HTTPS + a browser that supports notifications).
            </div>
            <div v-else style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              <n-switch :value="pushSubscribed" :loading="pushBusy" @update:value="onTogglePush" />
              <span style="font-size:13px">{{ pushSubscribed ? 'Enabled' : 'Disabled' }}</span>
              <n-button v-if="pushSubscribed" size="small" tertiary :loading="pushBusy" @click="onTestPush">Send test</n-button>
              <n-tag v-if="pushPermission === 'denied'" type="error" size="small" round>Blocked in browser</n-tag>
            </div>
          </div>

            </n-tab-pane>
            <n-tab-pane name="config" tab="Configuration">
          <div class="monitor-block">
            <div class="monitor-block__title">Application Configuration</div>
            <div class="admin-settings-grid" style="margin-top:12px">
              <div class="admin-setting-row"><span class="admin-setting-key">Environment</span><span class="admin-setting-val">{{ adminSettings.appEnv }}</span></div>
              <div class="admin-setting-row"><span class="admin-setting-key">Active DB target</span><span class="admin-setting-val">{{ adminDbTarget }}</span></div>
              <div class="admin-setting-row"><span class="admin-setting-key">Database</span><span class="admin-setting-val">{{ adminSettings.dbName || '—' }}</span></div>
              <div class="admin-setting-row"><span class="admin-setting-key">Local Mongo</span><span class="admin-setting-val">{{ adminSettings.dbTargets?.local?.host || '—' }}</span></div>
              <div class="admin-setting-row"><span class="admin-setting-key">Production Mongo</span>
                <span class="admin-setting-val">
                  {{ adminSettings.dbTargets?.production?.connected
                    ? (adminSettings.dbTargets.production.host || 'connected')
                    : (adminSettings.dbTargets?.production?.configured ? 'configured (offline)' : 'not configured') }}
                </span>
              </div>
              <div class="admin-setting-row"><span class="admin-setting-key">Auto Extract</span>
                <n-tag :type="adminSettings.autoExtract ? 'default' : 'error'" size="small" round>{{ adminSettings.autoExtract ? 'Enabled' : 'Disabled' }}</n-tag>
              </div>
              <div class="admin-setting-row"><span class="admin-setting-key">Reminders</span>
                <n-tag :type="adminSettings.reminderEnabled ? 'default' : 'error'" size="small" round>{{ adminSettings.reminderEnabled ? 'Enabled' : 'Disabled' }}</n-tag>
              </div>
              <div class="admin-setting-row"><span class="admin-setting-key">Check Interval</span><span class="admin-setting-val">{{ formatInterval(adminSettings.reminderCheckIntervalMs / 1000) }}</span></div>
              <div class="admin-setting-row"><span class="admin-setting-key">Escalation Email</span><span class="admin-setting-val">{{ adminSettings.escalationEmail || '—' }}</span></div>
              <div class="admin-setting-row"><span class="admin-setting-key">Escalation Threshold</span><span class="admin-setting-val">{{ adminSettings.escalationThresholdDays }} days</span></div>
              <div class="admin-setting-row"><span class="admin-setting-key">SMTP Host</span><span class="admin-setting-val">{{ adminSettings.smtpHost || '—' }}</span></div>
              <div class="admin-setting-row"><span class="admin-setting-key">SMTP Port</span><span class="admin-setting-val">{{ adminSettings.smtpPort }}</span></div>
              <div class="admin-setting-row"><span class="admin-setting-key">Email From</span><span class="admin-setting-val">{{ adminSettings.smtpFrom || '—' }}</span></div>
              <div class="admin-setting-row"><span class="admin-setting-key">AI Backend</span><span class="admin-setting-val">{{ adminSettings.aiBackend }} / {{ adminSettings.openAiModel }}</span></div>
              <div class="admin-setting-row"><span class="admin-setting-key">OpenAI Key</span>
                <n-tag :type="adminSettings.openAiKeyPresent ? 'default' : 'error'" size="small" round>{{ adminSettings.openAiKeyPresent ? '✅ Present' : '❌ Missing' }}</n-tag>
              </div>
              <div class="admin-setting-row"><span class="admin-setting-key">S3 Bucket</span>
                <n-tag :type="adminSettings.s3BucketPresent ? 'default' : 'error'" size="small" round>{{ adminSettings.s3BucketPresent ? '✅ Configured' : '❌ Not set' }}</n-tag>
              </div>
              <div class="admin-setting-row"><span class="admin-setting-key">Doc Limit / User</span><span class="admin-setting-val">{{ adminSettings.userDocumentLimit }}</span></div>
            </div>
          </div>

            </n-tab-pane>
            <n-tab-pane name="reports" tab="Monthly Reports">
          <div class="monitor-block">
            <div class="monitor-block__title">Manual Monthly Report Trigger</div>
            <p style="font-size:13px;color:var(--text-secondary);margin:4px 0 12px">
              Send this month's report immediately for any user, regardless of their schedule.
            </p>
            <n-data-table
              :columns="monthlyTriggerColumns"
              :data="monthlyMonitor?.schedules ?? []"
              :bordered="false"
              :pagination="{ pageSize: 15 }"
              size="small"
            />
          </div>
            </n-tab-pane>
          </n-tabs>
        </template>
        <div v-else style="text-align:center;padding:60px;color:var(--text-secondary)">
          Click Refresh to load settings
        </div>
      </section>
    </div>

    <!-- Document preview modal -->
    <n-modal
      v-model:show="showDocModal"
      :mask-closable="true"
      title="Document Details"
      :show-icon="true"
      preset="card"
      size="huge"
      style="width:92vw;max-width:1200px"
      dir="rtl"
      @after-leave="docModalId = null"
    >
      <div style="max-height:76vh;overflow-y:auto;padding:0 8px 8px">
        <DocumentDetailPage v-if="docModalId" :doc-id="docModalId" />
      </div>
    </n-modal>

    <!-- Error Detail Modal -->
    <n-modal v-model:show="showErrorModal" preset="dialog" title="Error Details" style="width: 500px; max-width:90vw" dir="ltr">
      <div v-if="errorDetail" style="padding: 12px 0">
        <div style="margin-bottom: 16px">
          <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px">EMAIL / RECIPIENT</div>
          <div style="font-size: 13px; font-family: monospace; padding: 8px; background: var(--bg-elevated); border-radius: 6px">
            {{ errorDetail.recipient || errorDetail.email || "—" }}
          </div>
        </div>

        <div style="margin-bottom: 16px">
          <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px">ERROR MESSAGE</div>
          <div style="font-size: 13px; padding: 10px; background: rgba(208, 48, 80, 0.05); border-left: 3px solid #d03050; border-radius: 4px; overflow-x: auto">
            {{ errorDetail.error || errorDetail.error_message || errorDetail.last_error || "Unknown error" }}
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px">
          <div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px">TIMESTAMP</div>
            <div style="font-size: 13px">
              {{ errorDetail.sent_at || errorDetail.created_at ? new Date(errorDetail.sent_at || errorDetail.created_at).toLocaleString("en-US") : "—" }}
            </div>
          </div>
          <div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px">USER</div>
            <div style="font-size: 13px">
              {{ resolveUserEmail(errorDetail.user_id) }}
            </div>
          </div>
        </div>

        <div v-if="errorDetail.reminder_id || errorDetail.filename" style="margin-bottom: 16px">
          <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px">CONTEXT</div>
          <div style="font-size: 13px; color: var(--text-secondary)">
            {{ errorDetail.reminder_id ? `Reminder: ${errorDetail.reminder_id.slice(-6)}` : "" }}
            {{ errorDetail.filename ? `Document: ${errorDetail.filename}` : "" }}
          </div>
        </div>
      </div>
      <template #action>
        <n-button @click="showErrorModal = false">Close</n-button>
      </template>
    </n-modal>

    <!-- Report modal -->
    <AdminReportModal
      v-if="reportModalUser"
      v-model:show="showReportModal"
      :user-id="reportModalUser.id"
      :user-name="reportModalUser.name"
    />
  </div>
</template>

<script setup lang="ts">
import {computed, h, onMounted, onUnmounted, ref, watch} from "vue";
import {useRoute, useRouter} from "vue-router";
import type {DataTableColumns} from "naive-ui";
import {
  NAlert,
  NButton,
  NDataTable,
  NIcon,
  NInput,
  NModal,
  NSelect,
  NSpin,
  NSwitch,
  NTabPane,
  NTabs,
  NTag,
  NCheckbox,
  NTooltip,
  useMessage,
} from "naive-ui";
import {useAdminPush} from "../composables/useAdminPush";
import {useDevModal} from "../composables/useDevModal.js";
import {
  ArrowBackOutline,
  BriefcaseOutline,
  CalendarOutline,
  ChatbubblesOutline,
  ChevronBackOutline,
  ChevronDownOutline,
  ChevronForwardOutline,
  CloseOutline,
  CloudUploadOutline,
  DocumentOutline,
  DownloadOutline,
  EyeOutline,
  FlashOutline,
  KeyOutline,
  MailOutline,
  MailUnreadOutline,
  MenuOutline,
  PulseOutline,
  NotificationsOutline,
  PeopleOutline,
  ReceiptOutline,
  RefreshOutline,
  SearchOutline,
  SendOutline,
  SettingsOutline,
  TrashOutline,
} from "@vicons/ionicons5";
import {api, getAdminDbTarget, setAdminDbTarget, type AdminDbTarget, type InspectorLead, type InspectorLeadStatus, type InspectorLeadsResponse} from "../services/apiService.js";
import DocumentDetailPage from "./DocumentDetailPage.vue";
import AdminStatCard from "../components/AdminStatCard.vue";
import AdminReportModal from "../components/AdminReportModal.vue";
import AdminUserFocus from "../components/AdminUserFocus.vue";
import AdminMagicLinkPanel from "../components/AdminMagicLinkPanel.vue";
import WhatsAppCampaignPanel from "../components/WhatsAppCampaignPanel.vue";
import AdminOutreachPanel from "../components/AdminOutreachPanel.vue";
import AdminCampaignsPanel from "../components/AdminCampaignsPanel.vue";
import AdminServerLivePanel from "../components/AdminServerLivePanel.vue";
import AdminHealthStrip from "../components/AdminHealthStrip.vue";
import GmailInboxPage from "./GmailInboxPage.vue";

const router = useRouter();
const route = useRoute();
const message = useMessage();

// ── Admin push notifications ──
const {
  supported: pushSupported,
  permission: pushPermission,
  subscribed: pushSubscribed,
  busy: pushBusy,
  refreshState: refreshPushState,
  enablePush,
  disablePush,
} = useAdminPush();

async function onTogglePush(next: boolean) {
  try {
    if (next) {
      await enablePush();
      message.success("התראות אדמין הופעלו");
    } else {
      await disablePush();
      message.info("התראות אדמין בוטלו");
    }
  } catch (err: any) {
    message.error(err?.message ?? "פעולת ההתראות נכשלה");
  }
}

async function onTestPush() {
  try {
    await api.admin.pushTest();
    message.success("נשלחה התראת בדיקה");
  } catch (err: any) {
    message.error(err?.message ?? "שליחת בדיקה נכשלה");
  }
}

const appEnv = ref("development");
const dbName = ref("");
const adminDbTarget = ref<AdminDbTarget>(getAdminDbTarget());
const dbTargetSwitching = ref(false);
const adminDbTargetOptions = [
  { label: "Local", value: "local" },
  { label: "Production", value: "production" },
];
const productionDbAvailable = ref(true);

async function refreshDbTargetMeta() {
  try {
    const status = await api.admin.getDbTargets();
    productionDbAvailable.value = Boolean(status.production?.connected);
    dbName.value = adminDbTarget.value === "production"
      ? (status.production?.dbName || dbName.value)
      : (status.local?.dbName || dbName.value);
  } catch {
    /* non-critical */
  }
}

async function onAdminDbTargetChange(next: AdminDbTarget) {
  if (!next || next === adminDbTarget.value) return;
  if (next === "production" && !productionDbAvailable.value) {
    message.warning("Production Mongo is not configured. Set MONGODB_URI (+ MONGODB_LOCAL_URI) or MONGODB_PRODUCTION_URI.");
    return;
  }
  dbTargetSwitching.value = true;
  try {
    setAdminDbTarget(next);
    adminDbTarget.value = next;
    users.value = [];
    docMonitor.value = null;
    inspectorLeadsRows.value = [];
    inspectorLeadsTotal.value = 0;
    await refreshDbTargetMeta();
    await loadSectionData(activeSection.value);
    message.success(next === "production" ? "Admin data: production Mongo" : "Admin data: local Mongo");
  } catch (err: any) {
    message.error(err?.message ?? "Failed to switch database target");
  } finally {
    dbTargetSwitching.value = false;
  }
}
// ── Sidebar ────────────────────────────────────────────────────────────────
type AdminGroupKey = "ops" | "users" | "seed";

/** Sidebar groups, in display order. */
const adminGroups: { key: AdminGroupKey; label: string }[] = [
  { key: "ops",   label: "Operations" },
  { key: "users", label: "Users" },
  { key: "seed",  label: "SEED" },
];

const adminSections: { key: string; label: string; icon: any; group?: AdminGroupKey }[] = [
  // Operations — is the system healthy
  { key: "system_health",      label: "System Health",          icon: PulseOutline,         group: "ops" },
  { key: "processes",          label: "Processes",              icon: PulseOutline,         group: "ops" },
  { key: "documents",          label: "Documents & Extraction", icon: DocumentOutline,      group: "ops" },
  { key: "gmail",              label: "Gmail Inbox",            icon: MailOutline,          group: "ops" },
  // Users — customer accounts and their data
  { key: "users",              label: "Users",                  icon: PeopleOutline,        group: "users" },
  { key: "magic_links",        label: "Magic Links",            icon: KeyOutline,           group: "users" },
  { key: "monthly",            label: "Monthly Reports",        icon: CalendarOutline,      group: "users" },
  { key: "bad_emails",         label: "Bad Emails",             icon: MailOutline,          group: "users" },
  { key: "reminders",          label: "Reminders",              icon: NotificationsOutline, group: "users" },
  // SEED — leads and outreach. "inspector_leads" keeps its key so old links still work.
  { key: "inspector_leads",    label: "Leads",                  icon: SearchOutline,        group: "seed" },
  { key: "seed_campaigns",     label: "Email campaigns",        icon: SendOutline,          group: "seed" },
  { key: "seed_outreach",      label: "Sent & unsubscribes",    icon: MailUnreadOutline,    group: "seed" },
  { key: "seed_whatsapp",      label: "WhatsApp",               icon: ChatbubblesOutline,   group: "seed" },
  // { key: "invoices",          label: "Invoices",               icon: ReceiptOutline },
  { key: "settings",           label: "Settings",               icon: SettingsOutline },
];
const sidebarItems = adminSections.filter((item) => item.key !== "settings");

const SEED_SECTION_KEYS = ["inspector_leads", "seed_campaigns", "seed_outreach", "seed_whatsapp"];
const isSeedSection = computed(() => SEED_SECTION_KEYS.includes(activeSection.value));
/** SEED panels mount on first visit and then stay mounted (hidden) so their state survives navigation. */
const visitedSeedSections = ref(new Set<string>());

const NAV_COLLAPSED_KEY = "admin.nav.collapsed";
function readCollapsedGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(NAV_COLLAPSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
const collapsedGroups = ref(readCollapsedGroups());
const activeGroup = computed(() => adminSections.find((item) => item.key === activeSection.value)?.group ?? null);
const sidebarGroups = computed(() => adminGroups.map((group) => ({
  ...group,
  items: sidebarItems.filter((item) => item.group === group.key),
  // The active section's group always stays open so the current item is never hidden.
  open: !collapsedGroups.value.has(group.key) || activeGroup.value === group.key,
})));
function toggleNavGroup(key: string) {
  const next = new Set(collapsedGroups.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsedGroups.value = next;
  try {
    localStorage.setItem(NAV_COLLAPSED_KEY, JSON.stringify([...next]));
  } catch { /* per-browser convenience only */ }
}
const activeSection = ref("system_health");
/** Sections inside one sidebar page. The first entry is the default tab. */
const PAGE_TABS: Record<string, readonly string[]> = {
  documents: ["storage", "status", "failed", "stuck", "fields", "gaps", "backends", "parse_failures", "slow", "iq_health", "iq_reasons", "iq_failures", "st_overview", "st_sources", "st_drive", "st_browser", "temp"],
  reminders: ["failed", "status", "pending", "escalations", "advances"],
  processes: ["workers", "work", "jobs", "cron", "monthly"],
  monthly: ["config", "failures"],
  bad_emails: ["clients", "reminders", "extracted", "bounced"],
  system_health: ["live", "process", "database"],
  settings: ["push", "config", "reports"],
};
const pageTab = ref("live");
const currentItem = computed(() => adminSections.find((i) => i.key === activeSection.value));
const sectionLoading = ref(false);

function allowedPageTabs(section: string): readonly string[] {
  return PAGE_TABS[section] ?? [];
}

function queryValue(key: "section" | "tab"): string {
  const raw = route.query[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value : "";
}

/** Old sidebar pages now live as tabs. Map a bookmarked section + tab onto the new page. */
function canonicalSection(key: string): string {
  if (key === "s3_storage" || key === "storage_drive" || key === "import_queue" || key === "extraction_quality") return "documents";
  if (key === "scheduler") return "processes";
  if (key === "processes" && queryValue("tab") === "temp") return "documents";
  return key;
}

function legacyTab(section: string): string | null {
  const rawSection = queryValue("section");
  const tab = queryValue("tab");
  if (rawSection === "scheduler") return tab === "monthly" ? "monthly" : "cron";
  if (rawSection === "processes" && tab === "temp") return "temp";
  if (rawSection === "import_queue") {
    if (tab === "reasons") return "iq_reasons";
    if (tab === "failures") return "iq_failures";
    return "iq_health";
  }
  if (rawSection === "extraction_quality") {
    if (tab === "failures") return "parse_failures";
    if (tab === "slow") return "slow";
    return "backends";
  }
  if (rawSection === "storage_drive" || rawSection === "s3_storage") {
    if (rawSection === "s3_storage" || tab === "browser") return "st_browser";
    if (tab === "sources") return "st_sources";
    if (tab === "drive") return "st_drive";
    return "st_overview";
  }
  if (section === "documents" && tab === "temp") return "temp";
  return null;
}

function tabFromQuery(section: string): string {
  const allowed = allowedPageTabs(section);
  if (!allowed.length) return "";
  const mapped = legacyTab(section);
  if (mapped && allowed.includes(mapped)) return mapped;
  const value = queryValue("tab");
  if (value && allowed.includes(value)) return value;
  return allowed[0];
}

function onPageTab(tab: string) {
  if (!allowedPageTabs(activeSection.value).includes(tab) || tab === pageTab.value) return;
  pageTab.value = tab;
  const current = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab;
  if (current === tab) return;
  void router.replace({query: {...route.query, tab}});
}

// ── Users ──────────────────────────────────────────────────────────────────
const users = ref<any[]>([]);
const usersLoading = ref(false);

async function loadUsers() {
  usersLoading.value = true;
  try {
    users.value = await api.admin.listUsers();
  } catch {
    message.error("Error loading users");
  } finally {
    usersLoading.value = false;
  }
}

function onFocusedUserUpdated(updated: any) {
  users.value = users.value.map((u) => (u.id === updated.id ? { ...u, ...updated } : u));
}

function onMagicLinkUserCreated(user: any) {
  if (!user?.id) {
    void loadUsers();
    return;
  }
  const idx = users.value.findIndex((u) => u.id === user.id);
  if (idx >= 0) {
    users.value[idx] = { ...users.value[idx], ...user };
  } else {
    users.value = [user, ...users.value];
  }
}

function resolveUserEmail(userId: string) {
  return users.value.find((u) => u.id === userId)?.email
    ?? users.value.find((u) => u.id === userId)?.username
    ?? userId?.slice(-6)
    ?? "—";
}

// ── Inspector leads ───────────────────────────────────────────────────────
const inspectorLeadsRows = ref<InspectorLead[]>([]);
/** Lead ids ticked in the table (kept across pages) for "Email selected". */
const inspectorLeadSelected = ref<string[]>([]);
/** Where SEED data is read from (always the production DB), shown under the SEED stat cards. */
const inspectorSeedDb = ref<{ mode: string; dbName: string | null; host: string | null } | null>(null);
const inspectorSeedError = ref<string | null>(null);
const inspectorLeadUnsubFilter = ref<"hide" | "only" | null>(null);
const inspectorLeadUnsubOptions = [
  { label: "Hide unsubscribed", value: "hide" },
  { label: "Only unsubscribed", value: "only" },
];
const inspectorLeadsTotal = ref(0);
const inspectorLeadsLoading = ref(false);
const inspectorLeadPage = ref(1);
const inspectorLeadLimit = 50;
const inspectorLeadSearch = ref("");
const inspectorLeadSourceFilter = ref<string | null>(null);
const inspectorLeadStatusFilter = ref<InspectorLeadStatus | null>(null);
const inspectorLeadSummary = ref<InspectorLeadsResponse["summary"]>({ bySource: [], byStatus: [] });

const inspectorLeadStatuses: InspectorLeadStatus[] = ["NEW", "CONTACTED", "DEMO", "TRIAL", "CUSTOMER", "NOT_RELEVANT"];
const inspectorLeadStatusOptions = inspectorLeadStatuses.map((status) => ({
  label: leadStatusLabel(status),
  value: status,
}));
const inspectorLeadSourceOptions = computed(() =>
  inspectorLeadSummary.value.bySource.map((row) => ({
    label: `${row.source} (${row.count})`,
    value: row.source,
  })),
);
const inspectorLeadEmailCount = computed(() => inspectorLeadSummary.value.withEmail ?? 0);
const inspectorLeadPhoneCount = computed(() => inspectorLeadSummary.value.withPhone ?? 0);
const inspectorLeadBestScore = computed(() => inspectorLeadSummary.value.bestScore ?? 0);
const inspectorLeadRangeText = computed(() => {
  if (!inspectorLeadsTotal.value) return "No leads";
  const start = (inspectorLeadPage.value - 1) * inspectorLeadLimit + 1;
  const end = Math.min(inspectorLeadPage.value * inspectorLeadLimit, inspectorLeadsTotal.value);
  return `${start}-${end} of ${inspectorLeadsTotal.value}`;
});

const inspectorLeadColumns: DataTableColumns<InspectorLead> = [
  { type: "selection", disabled: (row) => !row.email || Boolean(row.unsubscribed) },
  {
    title: "Lead", key: "name", align: "left", minWidth: 260, ellipsis: { tooltip: true },
    render: (row) => h("div", { class: "lead-cell" }, [
      h("span", { class: "lead-cell__name" }, row.name || row.company || "—"),
      h("span", { class: "lead-cell__meta" }, [row.certificationType, row.city].filter(Boolean).join(" · ") || row.source || "—"),
    ]),
  },
  {
    title: "בעל מקצוע", key: "professionType", align: "left", minWidth: 180, ellipsis: { tooltip: true },
    render: (row) => Array.isArray(row.professionType)
      ? row.professionType.join(" · ") || "—"
      : row.professionType || "—",
  },
  {
    title: "Score", key: "leadScore", align: "center", width: 82,
    render: (row) => h("span", {
      class: `lead-status-label lead-status-label--${row.leadScore >= 80 ? "success" : row.leadScore >= 60 ? "warning" : "default"}`,
    }, String(row.leadScore ?? 0)),
  },
  {
    title: "Status", key: "contactStatus", align: "left", width: 175,
    render: (row) => h(NSelect, {
      size: "tiny",
      class: "lead-status-select",
      value: row.contactStatus ?? "NEW",
      options: inspectorLeadStatusOptions,
      consistentMenuWidth: false,
      renderLabel: (option: any) => h("span", {
        class: `lead-status-label lead-status-label--${leadStatusTagType(String(option.value))}`,
      }, option.label),
      onUpdateValue: (value: InspectorLeadStatus) => updateInspectorLeadStatus(row, value),
    }),
  },
  {
    title: "Unsubscribed", key: "unsubscribed", align: "left", width: 150,
    render: (row) => h("div", { class: "lead-unsub-cell" }, [
      h(NCheckbox, {
        checked: Boolean(row.unsubscribed),
        onUpdateChecked: (checked: boolean) => setInspectorLeadUnsubscribed(row, checked),
      }),
      row.unsubscribed
        ? h(NTooltip, null, {
          trigger: () => h("span", { class: "lead-unsubscribed" }, row.unsubscribedAt ? new Date(row.unsubscribedAt).toLocaleDateString("en-GB") : "—"),
          default: () => row.unsubscribeSource === "admin"
            ? "Marked unsubscribed by an admin — skipped by email campaigns"
            : "Asked to be removed by email reply — skipped by email campaigns",
        })
        : null,
    ]),
  },
  {
    title: "Phone", key: "phone", align: "left", width: 130,
    render: (row) => leadContactLink("phone", row.phone || row.whatsapp),
  },
  {
    title: "Email", key: "email", align: "left", minWidth: 210, ellipsis: { tooltip: true },
    render: (row) => leadContactLink("email", row.email),
  },
  {
    title: "Website", key: "website", align: "left", minWidth: 260, ellipsis: { tooltip: true },
    render: (row) => leadContactLink("website", row.website),
  },
  {
    title: "Source", key: "source", align: "left", width: 170,
    render: (row) => h(NTooltip, null, {
      trigger: () => h(NTag, { size: "small", round: true, class: "lead-source-tag" }, { default: () => row.source || "—" }),
      default: () => row.source || "—",
    }),
  },
  {
    title: "Updated", key: "updated_at", align: "left", width: 120,
    render: (row) => h("span", { style: "font-size:12px;color:var(--text-secondary)" }, formatDate(row.updated_at ?? row.foundAt ?? row.created_at ?? null)),
  },
];

async function loadInspectorLeads(page = inspectorLeadPage.value) {
  inspectorLeadsLoading.value = true;
  try {
    const res = await api.admin.listInspectorLeads({
      page,
      limit: inspectorLeadLimit,
      source: inspectorLeadSourceFilter.value,
      status: inspectorLeadStatusFilter.value,
      unsubscribed: inspectorLeadUnsubFilter.value,
      q: inspectorLeadSearch.value.trim() || null,
    });
    inspectorLeadsRows.value = res.rows;
    inspectorLeadsTotal.value = res.total;
    inspectorLeadPage.value = res.page;
    inspectorLeadSummary.value = res.summary;
    inspectorSeedDb.value = (res as any).seedDb ?? null;
    inspectorSeedError.value = null;
    lastRefreshed.value.set("inspector_leads", new Date());
  } catch (err: any) {
    if (err?.status === 503) {
      inspectorSeedError.value = "SEED data lives in the production database, which this server can't reach. Set SEED_MONGODB_URI (or MONGODB_PRODUCTION_URI) in the server environment.";
    } else {
      message.error(err?.message ?? "Error loading inspector leads");
    }
  } finally {
    inspectorLeadsLoading.value = false;
  }
}

async function setInspectorLeadUnsubscribed(lead: InspectorLead, unsubscribed: boolean) {
  try {
    const updated = await api.admin.setInspectorLeadUnsubscribed(lead.id, unsubscribed);
    inspectorLeadsRows.value = inspectorLeadsRows.value.map((row) => row.id === updated.id ? updated : row);
    message.success(unsubscribed ? "Marked unsubscribed" : "Unsubscribe removed");
  } catch (err: any) {
    message.error(err?.message ?? "Failed to update lead");
  }
}

async function updateInspectorLeadStatus(lead: InspectorLead, contactStatus: InspectorLeadStatus) {
  try {
    const updated = await api.admin.updateInspectorLeadStatus(lead.id, contactStatus);
    inspectorLeadsRows.value = inspectorLeadsRows.value.map((row) => row.id === updated.id ? updated : row);
    message.success("Lead status updated");
  } catch (err: any) {
    message.error(err?.message ?? "Failed to update lead");
  }
}

function leadStatusLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    NEW: "New",
    CONTACTED: "Contacted",
    DEMO: "Demo",
    TRIAL: "Trial",
    CUSTOMER: "Customer",
    NOT_RELEVANT: "Not relevant",
  };
  return labels[status || ""] ?? "New";
}

function leadStatusTagType(status: string | null | undefined) {
  if (status === "CUSTOMER") return "success";
  if (status === "DEMO" || status === "TRIAL") return "info";
  if (status === "NOT_RELEVANT") return "default";
  if (status === "CONTACTED") return "warning";
  return "default";
}

function leadContactLink(kind: "email" | "phone" | "website", value: string | null | undefined) {
  if (!value) return "—";
  const href = kind === "email"
    ? `mailto:${value}`
    : kind === "phone"
      ? `tel:${value}`
      : value;
  return h("a", {
    href,
    target: kind === "website" ? "_blank" : undefined,
    rel: kind === "website" ? "noopener noreferrer" : undefined,
    class: "admin-link",
  }, value);
}

const showDocModal = ref(false);
const docModalId = ref<string | null>(null);
const showErrorModal = ref(false);
useDevModal("admin.document", showDocModal);
useDevModal("admin.error", showErrorModal);
const errorDetail = ref<any>(null);

function openDocModal(id: string) {
  docModalId.value = id;
  showDocModal.value = true;
}

function openErrorModal(error: any) {
  errorDetail.value = error;
  showErrorModal.value = true;
}

// Mobile nav
const MOBILE_BREAKPOINT = 768;
const showMobileNav = ref(false);
const showDesktopSidebar = ref(true);
const isMobileViewport = ref(false);

const isSidebarVisible = computed(() => (
  isMobileViewport.value ? showMobileNav.value : showDesktopSidebar.value
));

const sidebarToggleIcon = computed(() => {
  if (isMobileViewport.value) {
    return showMobileNav.value ? CloseOutline : MenuOutline;
  }
  return showDesktopSidebar.value ? ChevronBackOutline : ChevronForwardOutline;
});

const sidebarToggleLabel = computed(() => {
  if (isMobileViewport.value) {
    return showMobileNav.value ? "Close navigation panel" : "Open navigation panel";
  }
  return showDesktopSidebar.value ? "Collapse navigation panel" : "Expand navigation panel";
});

function updateViewportState() {
  isMobileViewport.value = window.innerWidth <= MOBILE_BREAKPOINT;
  if (!isMobileViewport.value) {
    showMobileNav.value = false;
  }
}

function toggleSidebar() {
  if (isMobileViewport.value) {
    showMobileNav.value = !showMobileNav.value;
    return;
  }
  showDesktopSidebar.value = !showDesktopSidebar.value;
}

// ── Documents monitor ──────────────────────────────────────────────────────
const docMonitor = ref<any>(null);

// Extractions sub-section
const extractionDocs = ref<any[]>([]);
const extractionsTotal = ref(0);
const extractionPage = ref(1);
const extractionLimit = 50;
const extractionUserId = ref<string | null>(null);
const extractionsLoading = ref(false);
const userSelectOptions = computed(() =>
  users.value.map((u) => ({ label: u.email || u.username || u.id, value: u.id })),
);


async function loadExtractions(page = 1) {
  extractionsLoading.value = true;
  try {
    const res = await api.admin.monitorExtractions({
      user_id: extractionUserId.value ?? undefined,
      page,
      limit: extractionLimit,
    });
    extractionDocs.value = res.docs;
    extractionsTotal.value = res.total;
    extractionPage.value = res.page;
  } catch {
    message.error("Error loading extractions");
  } finally {
    extractionsLoading.value = false;
  }
}

// Group extraction docs by user for tree-table display
const extractionTreeData = computed(() => {
  const groups: Record<string, any[]> = {};
  for (const doc of extractionDocs.value) {
    const uid = doc.user_id ?? "unknown";
    if (!groups[uid]) groups[uid] = [];
    groups[uid].push(doc);
  }
  return Object.entries(groups).map(([uid, docs]) => ({
    _rowKey: `user-${uid}`,
    _isGroup: true,
    user_id: uid,
    filename: `${resolveUserEmail(uid)} (${docs.length})`,
    document_type: null,
    created_at: null,
    id: null,
    children: docs.map((d) => ({ ...d, _rowKey: d.id })),
  }));
});

const extractionColumns: DataTableColumns<any> = [
  {
    title: "File / User", key: "filename", align: "left", minWidth: 260, ellipsis: { tooltip: true },
    render: (row) => row._isGroup
      ? h("span", { style: "font-size:12px;font-weight:600;color:var(--text-primary)" }, row.filename)
      : h("span", { style: "font-size:12px" }, row.filename ?? "—"),
  },
  {
    title: "Document Type", key: "document_type", align: "left", width: 140,
    render: (row) => h("span", { style: "font-size:12px" }, row._isGroup ? "" : (row.document_type ?? "—")),
  },
  {
    title: "Date", key: "created_at", align: "left", width: 110,
    render: (row) => h("span", { style: "font-size:12px;color:var(--text-secondary)" },
      row._isGroup ? "" : (row.created_at ? new Date(row.created_at).toLocaleDateString("en-US") : "—")),
  },
  {
    title: "View", key: "actions", align: "center", width: 90,
    render: (row) => row._isGroup ? null : h(NButton, {
      size: "tiny",
      onClick: () => openDocModal(row.id),
    }, { default: () => "Open" }),
  },
];

const DOC_STATUSES = ["queued", "processing", "done", "error"];
const STATUS_HE: Record<string, string> = {
  queued: "Queued", processing: "Processing", done: "Completed", error: "Error",
};

const docStatusRows = computed(() => {
  if (!docMonitor.value) return [];
  return Object.entries(docMonitor.value.byUserStatus).map(([userId, counts]: [string, any]) => ({
    user: resolveUserEmail(userId),
    ...counts,
  }));
});

// Pipeline statistics for summary cards
const pipelineStats = computed(() => {
  if (!docMonitor.value) return {
    total: 0, done: 0, failed: 0, stuck: 0, processing: 0,
    successRate: 0, storage: 0, storageUsage: "0 B",
  };

  const counts = Object.entries(docMonitor.value.byUserStatus).reduce(
    (acc, [_, statuses]: [string, any]) => {
      acc.done += statuses.done ?? 0;
      acc.failed += statuses.error ?? 0;
      acc.processing += statuses.processing ?? 0;
      acc.queued += statuses.queued ?? 0;
      return acc;
    },
    { done: 0, failed: 0, processing: 0, queued: 0 }
  );

  const total = counts.done + counts.failed + counts.processing + counts.queued;
  const storageBytes = docMonitor.value.storage.reduce((sum: number, s: any) => sum + (s.total_bytes ?? 0), 0);
  
  return {
    total,
    done: counts.done,
    failed: counts.failed,
    processing: counts.processing,
    stuck: docMonitor.value.stuck?.length ?? 0,
    successRate: total > 0 ? Math.round((counts.done / total) * 100) : 0,
    storage: storageBytes,
    storageUsage: formatBytes(storageBytes),
  };
});

// Email delivery statistics
const emailStats = computed(() => {
  if (!reminderMonitor.value) return {
    total: 0, sent: 0, failed: 0, successRate: 0, pending: 0,
  };

  const statuses = Object.entries(reminderMonitor.value.byUserStatus).reduce(
    (acc, [_, counts]: [string, any]) => {
      acc.sent += counts.sent ?? 0;
      acc.failed += counts.error ?? 0;
      acc.pending += counts.pending ?? 0;
      return acc;
    },
    { sent: 0, failed: 0, pending: 0 }
  );

  const total = statuses.sent + statuses.failed;
  return {
    total,
    sent: statuses.sent,
    failed: statuses.failed,
    pending: statuses.pending,
    successRate: total > 0 ? Math.round((statuses.sent / total) * 100) : 0,
  };
});

const docStatusColumns: DataTableColumns<any> = [
  { title: "User", key: "user", align: "left", minWidth: 220, ellipsis: { tooltip: true } },
  ...DOC_STATUSES.map((s) => ({
    title: STATUS_HE[s] ?? s,
    key: s,
    align: "center" as const,
    width: 110,
    render: (row: any) => h("span", { style: row[s] ? "font-weight:600" : "color:var(--text-secondary)" }, row[s] ?? "0"),
  })),
];

const failedDocsColumns: DataTableColumns<any> = [
  {
    title: "User", key: "user_id", align: "left", width: 220, minWidth: 200, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "File", key: "filename", align: "left", minWidth: 220, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, row.filename ?? "—"),
  },
  {
    title: "Error", key: "error", align: "left", minWidth: 180, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px; color: var(--error-color,#d03050)" }, row.error ?? "—"),
  },
  {
    title: "Date", key: "created_at", align: "left", width: 110,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.created_at ? new Date(row.created_at).toLocaleDateString("en-US") : "—"),
  },
  {
    title: "Action", key: "action", align: "center", width: 110,
    render: (row) => row.id ? h(NButton, {
      size: "tiny",
      type: "primary",
      ghost: true,
      loading: reprocessingIds.value.has(row.id),
      onClick: () => reprocessDoc(row.id),
    }, { default: () => "AI Rescan" }) : h(NButton, {
      text: true,
      type: "primary",
      size: "small",
      onClick: () => openErrorModal(row),
    }, { default: () => "View Error" }),
  },
];

const stuckDocsColumns: DataTableColumns<any> = [
  {
    title: "User", key: "user_id", align: "left", width: 220, minWidth: 200, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "File", key: "filename", align: "left", minWidth: 220, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, row.filename ?? "—"),
  },
  {
    title: "Upload Date", key: "created_at", align: "left", width: 160,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.created_at ? new Date(row.created_at).toLocaleString("en-US") : "—"),
  },
];

// ── Extraction quality columns ─────────────────────────────────────────────
const backendQualityColumns: DataTableColumns<any> = [
  { title: "Backend", key: "backend", align: "left", render: (row) => h("span", { style: "font-size:13px;font-weight:500" }, row.backend ?? "—") },
  { title: "Runs", key: "runs", align: "center", width: 80, render: (row) => h("span", { style: "font-size:13px" }, row.runs) },
  {
    title: "Success Rate", key: "success_rate", align: "center", width: 120,
    render: (row) => {
      const ok = row.success_rate >= 80;
      return h(NTag, { type: ok ? "default" : "error", size: "small", round: true }, { default: () => `${row.success_rate}%` });
    },
  },
  { title: "Avg Time", key: "avg_exec_ms", align: "center", width: 100, render: (row) => h("span", { style: "font-size:12px;color:var(--text-secondary)" }, row.avg_exec_ms ? `${(row.avg_exec_ms / 1000).toFixed(1)}s` : "—") },
];

const parseFailureColumns: DataTableColumns<any> = [
  { title: "User", key: "user_id", align: "left", width: 220, minWidth: 200, ellipsis: { tooltip: true }, render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)) },
  { title: "Backend", key: "backend", align: "left", width: 110, render: (row) => h("span", { style: "font-size:12px" }, row.backend ?? "—") },
  { title: "Model", key: "model", align: "left", width: 120, render: (row) => h("span", { style: "font-size:12px" }, row.model ?? "—") },
  { title: "Error", key: "error", align: "left", minWidth: 180, ellipsis: { tooltip: true }, render: (row) => h("span", { style: "font-size:12px;color:var(--error-color,#d03050)" }, row.error ?? "—") },
  { title: "Date", key: "created_at", align: "left", width: 110, render: (row) => h("span", { style: "font-size:12px;color:var(--text-secondary)" }, row.created_at ? new Date(row.created_at).toLocaleDateString("en-US") : "—") },
  {
    title: "Action", key: "action", align: "center", width: 110,
    render: (row) => row.document_id ? h(NButton, {
      size: "tiny", loading: reprocessingIds.value.has(row.document_id),
      onClick: () => reprocessDoc(row.document_id),
    }, { default: () => "Reprocess" }) : null,
  },
];

const slowRunColumns: DataTableColumns<any> = [
  { title: "Backend", key: "backend", align: "left", width: 120, render: (row) => h("span", { style: "font-size:12px" }, row.backend ?? "—") },
  { title: "Model", key: "model", align: "left", width: 130, render: (row) => h("span", { style: "font-size:12px" }, row.model ?? "—") },
  { title: "Exec Time", key: "exec_ms", align: "center", width: 110, render: (row) => h("span", { style: "font-size:13px;font-weight:600;color:#f0a020" }, row.exec_ms ? `${(row.exec_ms / 1000).toFixed(1)}s` : "—") },
  { title: "Date", key: "created_at", align: "left", width: 110, render: (row) => h("span", { style: "font-size:12px;color:var(--text-secondary)" }, row.created_at ? new Date(row.created_at).toLocaleDateString("en-US") : "—") },
  {
    title: "View", key: "action", align: "center", width: 80,
    render: (row) => row.document_id ? h(NButton, { size: "tiny", onClick: () => openDocModal(row.document_id) }, { default: () => "Open" }) : null,
  },
];

const noS3Columns: DataTableColumns<any> = [
  { title: "User", key: "user_id", align: "left", width: 220, minWidth: 200, ellipsis: { tooltip: true }, render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)) },
  { title: "File", key: "filename", align: "left", minWidth: 220, ellipsis: { tooltip: true }, render: (row) => h("span", { style: "font-size:12px" }, row.filename ?? "—") },
  { title: "Date", key: "created_at", align: "left", width: 110, render: (row) => h("span", { style: "font-size:12px;color:var(--text-secondary)" }, row.created_at ? new Date(row.created_at).toLocaleDateString("en-US") : "—") },
];

const skippedReminderColumns: DataTableColumns<any> = [
  { title: "User", key: "user_id", align: "left", width: 220, minWidth: 200, ellipsis: { tooltip: true }, render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)) },
  { title: "Note", key: "note", align: "left", minWidth: 220, ellipsis: { tooltip: true }, render: (row) => h("span", { style: "font-size:12px;color:var(--text-secondary)" }, row.note ?? "—") },
  { title: "Date", key: "created_at", align: "left", width: 110, render: (row) => h("span", { style: "font-size:12px;color:var(--text-secondary)" }, row.created_at ? new Date(row.created_at).toLocaleDateString("en-US") : "—") },
];

const missingEmailColumns: DataTableColumns<any> = [
  { title: "User", key: "user_id", align: "left", width: 220, minWidth: 200, ellipsis: { tooltip: true }, render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)) },
  { title: "File", key: "filename", align: "left", minWidth: 220, ellipsis: { tooltip: true }, render: (row) => h("span", { style: "font-size:12px" }, row.filename ?? "—") },
  { title: "Doc ID", key: "id", align: "left", width: 90, render: (row) => h("span", { style: "font-size:11px;font-family:monospace;color:var(--text-secondary)" }, row.id ? row.id.slice(-8) : "—") },
  { title: "Type", key: "document_type", align: "left", width: 120, render: (row) => h("span", { style: "font-size:12px" }, row.document_type ?? "—") },
  { title: "Reminder Date", key: "reminder_date", align: "left", width: 120, render: (row) => h("span", { style: "font-size:12px;color:#f0a020;font-weight:600" }, row.reminder_date ?? "—") },
  { title: "Uploaded", key: "created_at", align: "left", width: 110, render: (row) => h("span", { style: "font-size:12px;color:var(--text-secondary)" }, row.created_at ? new Date(row.created_at).toLocaleDateString("en-US") : "—") },
  {
    title: "Action", key: "action", align: "center", width: 140,
    render: (row) => h("div", { style: "display:flex;gap:6px;justify-content:center" }, [
      h(NButton, { size: "tiny", onClick: () => openDocModal(row.id) }, { default: () => "Open" }),
      h(NButton, {
        size: "tiny",
        type: "primary",
        ghost: true,
        loading: reprocessingIds.value.has(row.id),
        onClick: () => reprocessDoc(row.id),
      }, { default: () => "Rescan" }),
    ]),
  },
];

const scannedWithoutReminderColumns: DataTableColumns<any> = [
  { title: "User", key: "user_id", align: "left", width: 220, minWidth: 200, ellipsis: { tooltip: true }, render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)) },
  { title: "File", key: "filename", align: "left", minWidth: 220, ellipsis: { tooltip: true }, render: (row) => h("span", { style: "font-size:12px" }, row.filename ?? "—") },
  { title: "Type", key: "document_type", align: "left", width: 130, render: (row) => h("span", { style: "font-size:12px" }, row.document_type ?? "—") },
  { title: "Reminder Date", key: "reminder_date", align: "left", width: 120, render: (row) => h("span", { style: "font-size:12px;color:var(--text-secondary)" }, row.reminder_date ?? "—") },
  { title: "Uploaded", key: "created_at", align: "left", width: 110, render: (row) => h("span", { style: "font-size:12px;color:var(--text-secondary)" }, row.created_at ? new Date(row.created_at).toLocaleDateString("en-US") : "—") },
  {
    title: "View", key: "action", align: "center", width: 80,
    render: (row) => h(NButton, { size: "tiny", onClick: () => openDocModal(row.id) }, { default: () => "Open" }),
  },
];

const contractAdvanceColumns: DataTableColumns<any> = [
  { title: "User", key: "user_id", align: "left", width: 220, minWidth: 200, ellipsis: { tooltip: true }, render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)) },
  { title: "Previous Expiry", key: "previous_expiry", align: "left", width: 130, render: (row) => h("span", { style: "font-size:12px" }, row.previous_expiry ?? "—") },
  { title: "New Expiry", key: "new_expiry", align: "left", width: 120, render: (row) => h("span", { style: "font-size:12px;font-weight:600;color:#18a058" }, row.new_expiry ?? "—") },
  { title: "Interval", key: "interval_months", align: "center", width: 90, render: (row) => h("span", { style: "font-size:12px" }, row.interval_months ? `${row.interval_months}mo` : "—") },
  { title: "Date", key: "advanced_at", align: "left", width: 120, render: (row) => h("span", { style: "font-size:12px;color:var(--text-secondary)" }, row.advanced_at ? new Date(row.advanced_at).toLocaleDateString("en-US") : "—") },
];

const failedEscalationColumns: DataTableColumns<any> = [
  { title: "User", key: "user_id", align: "left", width: 220, minWidth: 200, ellipsis: { tooltip: true }, render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)) },
  { title: "Recipient", key: "recipient", align: "left", minWidth: 200, ellipsis: { tooltip: true }, render: (row) => h("span", { style: "font-size:12px" }, row.recipient ?? "—") },
  { title: "Error", key: "error", align: "left", minWidth: 180, ellipsis: { tooltip: true }, render: (row) => h("span", { style: "font-size:12px;color:var(--error-color,#d03050)" }, row.error ?? "—") },
  { title: "Date", key: "sent_at", align: "left", width: 160, render: (row) => h("span", { style: "font-size:12px;color:var(--text-secondary)" }, row.sent_at ? new Date(row.sent_at).toLocaleString("en-US") : "—") },
  {
    title: "Action", key: "action", align: "center", width: 90,
    render: (row) => h(NButton, {
      size: "tiny", type: "primary", ghost: true,
      loading: row.reminder_id ? retryingIds.value.has(row.reminder_id) : false,
      onClick: () => row.reminder_id && retryEscalation(row.reminder_id),
    }, { default: () => "Retry" }),
  },
];

const monthlyTriggerColumns: DataTableColumns<any> = [
  { title: "User", key: "user_id", align: "left", minWidth: 220, ellipsis: { tooltip: true }, render: (row) => h("span", { style: "font-size:12px;white-space:nowrap" }, resolveUserEmail(row.user_id)) },
  { title: "Enabled", key: "enabled", align: "center", width: 90, render: (row) => h(NTag, { type: row.enabled ? "default" : "error", size: "small", round: true }, { default: () => row.enabled ? "Yes" : "No" }) },
  { title: "Recipients", key: "recipients", align: "left", minWidth: 220, ellipsis: { tooltip: true }, render: (row) => {
    let r = row.recipients ?? [];
    if (typeof r === "string") { try { r = JSON.parse(r); } catch { r = []; } }
    return h("span", { style: "font-size:12px" }, Array.isArray(r) ? r.join(", ") || "—" : "—");
  }},
  { title: "Last Sent", key: "last_sent", align: "left", width: 120, render: (row) => h("span", { style: "font-size:12px;color:var(--text-secondary)" }, row.last_sent ? new Date(row.last_sent).toLocaleDateString("en-US") : "—") },
  {
    title: "Action", key: "action", align: "center", width: 110,
    render: (row) => h(NButton, {
      size: "tiny", type: "primary",
      onClick: () => openReportModal(row),
    }, { default: () => "Send Now" }),
  },
];

// ── Reminders monitor ──────────────────────────────────────────────────────
const reminderMonitor = ref<any>(null);

const REMINDER_STATUSES = ["pending", "sent", "snoozed", "dismissed", "no_email", "error"];
const REMINDER_STATUS_HE: Record<string, string> = {
  pending: "Pending", sent: "Sent", snoozed: "Snoozed", dismissed: "Dismissed", error: "Error",
};
const REMINDER_STATUS_WIDTH: Record<string, number> = {
  pending: 80, sent: 65, snoozed: 80, dismissed: 95, error: 65,
};

const reminderStatusRows = computed(() => {
  if (!reminderMonitor.value) return [];
  return Object.entries(reminderMonitor.value.byUserStatus).map(([userId, counts]: [string, any]) => ({
    user: resolveUserEmail(userId),
    ...counts,
  }));
});

const reminderStatusColumns: DataTableColumns<any> = [
  { title: "User", key: "user", align: "left", minWidth: 220, ellipsis: { tooltip: true } },
  ...REMINDER_STATUSES.map((s) => ({
    title: REMINDER_STATUS_HE[s] ?? s,
    key: s,
    align: "center" as const,
    width: REMINDER_STATUS_WIDTH[s] ?? 80,
    render: (row: any) => h("span", { style: row[s] ? "font-weight:600" : "color:var(--text-secondary)" }, row[s] ?? "0"),
  })),
];

const pendingReminderColumns: DataTableColumns<any> = [
  {
    title: "User", key: "user_id", align: "left", width: 220, minWidth: 200, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "Type", key: "source_type", align: "left", width: 130,
    render: (row) => h("span", { style: "font-size:12px" }, row.source_type ?? row.doc_type ?? "—"),
  },
  {
    title: "Note", key: "note", align: "left", minWidth: 220, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, row.note ?? row.title ?? "—"),
  },
  {
    title: "Trigger Date", key: "trigger_date", align: "left", width: 120,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.trigger_date ? new Date(row.trigger_date).toLocaleDateString("en-US") : "—"),
  },
];

const failedSendsColumns: DataTableColumns<any> = [
  {
    title: "User", key: "user_id", align: "left", width: 220, minWidth: 200, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "Recipient", key: "recipient", align: "left", minWidth: 200, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, row.recipient ?? "—"),
  },
  {
    title: "Error", key: "error", align: "left", minWidth: 180, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px; color: var(--error-color,#d03050)" }, row.error ?? "—"),
  },
  {
    title: "Date", key: "sent_at", align: "left", width: 160,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.sent_at ? new Date(row.sent_at).toLocaleString("en-US") : "—"),
  },
  {
    title: "Action", key: "action", align: "center", width: 100,
    render: (row) => h("n-button", {
      text: true,
      type: "primary",
      size: "small",
      onClick: () => openErrorModal(row),
    }, "View Error"),
  },
];

// ── Scheduler monitor ──────────────────────────────────────────────────────
const schedulerMonitor = ref<any>(null);

const JOB_NAME_HE: Record<string, string> = {
  tick: "Main Loop",
  checkReminders: "Check Reminders",
  checkMonthlyReports: "Monthly Reports",
  checkEscalations: "Escalations",
};

// ── Background processes & temp files ───────────────────────────────────────
const processMonitor = ref<any>(null);
const processJobs = ref<any[]>([]);
const jobsLoading = ref(false);
const sweepRunning = ref(false);
const selectedQueueProcess = ref<string>("documents");
const pausingProcess = ref<string | null>(null);
const queueUserFilter = ref<string | null>(null);

const pausedProcessCount = computed(
  () => (processMonitor.value?.processes ?? []).filter((p: any) => p.paused).length,
);

const totalQueuedJobs = computed(() =>
  (processMonitor.value?.processes ?? [])
    .reduce((sum: number, p: any) => sum + (p.queue?.queued ?? 0), 0),
);

const totalRunningJobs = computed(() =>
  (processMonitor.value?.processes ?? [])
    .reduce((sum: number, p: any) => sum + (p.queue?.running ?? 0), 0),
);

const totalStaleJobs = computed(() =>
  (processMonitor.value?.processes ?? [])
    .reduce((sum: number, p: any) => sum + (p.queue?.stale_running ?? 0), 0),
);

const tempTotalBytes = computed(() =>
  (processMonitor.value?.temp_files?.directories ?? [])
    .reduce((sum: number, d: any) => sum + (d.total_bytes ?? 0), 0),
);

const tempTotalFiles = computed(() =>
  (processMonitor.value?.temp_files?.directories ?? [])
    .reduce((sum: number, d: any) => sum + (d.file_count ?? 0), 0),
);

const tempStaleBytes = computed(() =>
  (processMonitor.value?.temp_files?.directories ?? [])
    .reduce((sum: number, d: any) => sum + (d.stale_bytes ?? 0), 0),
);

const queueProcessOptions = computed(() =>
  (processMonitor.value?.processes ?? [])
    .filter((p: any) => p.jobCollection)
    .map((p: any) => ({ label: p.label, value: p.id })),
);

async function toggleProcessPaused(row: any, paused: boolean) {
  pausingProcess.value = row.id;
  try {
    await api.admin.setProcessPaused(row.id, paused);
    message.success(paused ? `${row.label} paused` : `${row.label} resumed`);
    processMonitor.value = await api.admin.monitorProcesses();
  } catch {
    message.error(`Could not ${paused ? "pause" : "resume"} ${row.label}`);
  } finally {
    pausingProcess.value = null;
  }
}

async function loadProcessJobs() {
  const id = selectedQueueProcess.value;
  if (!id) { processJobs.value = []; return; }
  jobsLoading.value = true;
  try {
    const res = await api.admin.processJobs(id, 50, queueUserFilter.value);
    processJobs.value = res.rows ?? [];
  } catch {
    processJobs.value = [];
  } finally {
    jobsLoading.value = false;
  }
}

async function cancelProcessJob(row: any) {
  try {
    const res = await api.admin.cancelProcessJob(selectedQueueProcess.value, row.id);
    // A running job cannot be interrupted mid-flight, only unlocked so a worker
    // retries it — say which of the two actually happened.
    message.success(res.reason === "released_running_job"
      ? "Running job released — a worker will retry it"
      : "Job cancelled");
    await loadProcessJobs();
    processMonitor.value = await api.admin.monitorProcesses();
  } catch {
    message.error("Could not cancel job");
  }
}

async function runTempSweep() {
  sweepRunning.value = true;
  try {
    const res = await api.admin.sweepTempFiles();
    const deleted = res.result?.deleted_count ?? 0;
    message.success(deleted > 0
      ? `Removed ${deleted} file(s), freed ${formatBytes(res.result.deleted_bytes ?? 0)}`
      : "Nothing past retention — no files removed");
    processMonitor.value = await api.admin.monitorProcesses();
  } catch {
    message.error("Sweep failed");
  } finally {
    sweepRunning.value = false;
  }
}

const processColumns: DataTableColumns<any> = [
  {
    title: "Process", key: "label", align: "left", minWidth: 180,
    render: (row) => h("div", {}, [
      h("div", { style: "font-size:13px; font-weight:600" }, row.label),
      h("div", { style: "font-size:11px; color:var(--text-secondary); margin-top:2px" }, row.description),
    ]),
  },
  {
    title: "Kind", key: "kind", align: "center", width: 120,
    render: (row) => h(NTag, { size: "small", round: true, type: "default" },
      { default: () => row.kind === "queue_worker" ? "Queue" : "Timer" }),
  },
  {
    title: "State", key: "paused", align: "center", width: 120,
    render: (row) => h(
      NTag,
      { size: "small", round: true, type: row.paused ? "warning" : "success" },
      { default: () => row.paused ? "Paused" : "Running" },
    ),
  },
  {
    title: "Queue", key: "queue", align: "left", minWidth: 180,
    render: (row) => {
      if (!row.queue) return h("span", { style: "font-size:12px; color:var(--text-secondary)" }, "—");
      const q = row.queue;
      const parts = [`${q.queued} queued`, `${q.running} running`];
      if (q.retry_wait) parts.push(`${q.retry_wait} retrying`);
      if (q.failed) parts.push(`${q.failed} failed`);
      return h("div", {}, [
        h("div", { style: "font-size:12px" }, parts.join(" · ")),
        q.stale_running
          ? h("div", { style: "font-size:11px; color:var(--error-color,#d03050); margin-top:2px" },
              `${q.stale_running} stuck running`)
          : null,
      ]);
    },
  },
  {
    title: "Last Error", key: "last_error", align: "left", minWidth: 160, ellipsis: { tooltip: true },
    render: (row) => {
      const failing = (row.health ?? []).find((h2: any) => h2.last_error);
      return h("span", { style: "font-size:12px; color:var(--error-color,#d03050)" },
        failing ? `${failing.name}: ${failing.last_error}` : "—");
    },
  },
  {
    title: "Pause", key: "actions", align: "center", width: 100,
    // Keyed on the state it is showing: without this the switch is reused across
    // data refreshes and keeps the position the click left it in, so a failed
    // pause (or a resume made elsewhere) would leave the toggle disagreeing with
    // the State tag next to it.
    render: (row) => h(NSwitch, {
      key: `${row.id}-${row.paused ? "paused" : "running"}`,
      value: !row.paused,
      loading: pausingProcess.value === row.id,
      size: "small",
      onUpdateValue: (running: boolean) => toggleProcessPaused(row, !running),
    }),
  },
];

const tempDirColumns: DataTableColumns<any> = [
  {
    title: "Directory", key: "name", align: "left", minWidth: 140,
    render: (row) => h("span", { style: "font-size:13px; font-weight:500" }, `data/${row.name}`),
  },
  {
    title: "Files", key: "file_count", align: "center", width: 90,
    render: (row) => h("span", { style: "font-size:12px" }, String(row.file_count)),
  },
  {
    title: "Size", key: "total_bytes", align: "right", width: 110,
    render: (row) => h("span", { style: "font-size:12px" }, formatBytes(row.total_bytes)),
  },
  {
    title: "Past Retention", key: "stale_count", align: "center", width: 140,
    render: (row) => row.stale_count
      ? h(NTag, { size: "small", round: true, type: "warning" },
          { default: () => `${row.stale_count} · ${formatBytes(row.stale_bytes)}` })
      : h("span", { style: "font-size:12px; color:var(--text-secondary)" }, "none"),
  },
  {
    title: "Oldest File", key: "oldest_file_age_minutes", align: "left", minWidth: 120,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.oldest_file_age_minutes === null ? "—" : formatInterval(row.oldest_file_age_minutes * 60)),
  },
];

/** Outstanding queue work for the selected process, grouped by owning account. */
const selectedProcessUserLoad = computed(() => {
  const proc = (processMonitor.value?.processes ?? [])
    .find((p: any) => p.id === selectedQueueProcess.value);
  return proc?.user_load ?? [];
});

const userLoadColumns: DataTableColumns<any> = [
  {
    title: "User", key: "user_id", align: "left", minWidth: 200,
    render: (row) => h("span", { style: "font-size:13px; font-weight:500" },
      row.user_id ? resolveUserEmail(row.user_id) : "Unassigned"),
  },
  {
    title: "Queued", key: "queued", align: "center", width: 100,
    render: (row) => h("span", { style: "font-size:12px" }, String(row.queued)),
  },
  {
    title: "Running", key: "running", align: "center", width: 100,
    render: (row) => h("span", { style: "font-size:12px" }, String(row.running)),
  },
  {
    title: "Retrying", key: "retry_wait", align: "center", width: 100,
    render: (row) => h("span", { style: "font-size:12px" }, String(row.retry_wait)),
  },
  {
    title: "Failed", key: "failed", align: "center", width: 100,
    render: (row) => row.failed
      ? h(NTag, { size: "small", round: true, type: "error" }, { default: () => String(row.failed) })
      : h("span", { style: "font-size:12px; color:var(--text-secondary)" }, "0"),
  },
  {
    title: "", key: "view", align: "center", width: 110,
    render: (row) => h(NButton, {
      size: "tiny",
      secondary: true,
      onClick: () => { queueUserFilter.value = row.user_id; void loadProcessJobs(); },
    }, { default: () => "View jobs" }),
  },
];

const queueJobColumns: DataTableColumns<any> = [
  {
    title: "Status", key: "status", align: "center", width: 110,
    render: (row) => {
      const type = row.status === "failed" ? "error"
        : row.status === "running" ? "info"
        : row.status === "completed" ? "success" : "default";
      return h(NTag, { size: "small", round: true, type }, { default: () => row.status });
    },
  },
  {
    // Jobs are per-user, so the owning account is the first thing an operator
    // needs; the raw id is a fallback for a user row that is not loaded.
    title: "User", key: "user_id", align: "left", minWidth: 180,
    render: (row) => h("span", { style: "font-size:12px" },
      row.user_id ? resolveUserEmail(row.user_id) : "—"),
  },
  {
    title: "Document", key: "document_id", align: "left", minWidth: 200,
    render: (row) => h("span", { style: "font-size:11px; font-family:monospace" }, row.document_id ?? "—"),
  },
  {
    title: "Attempts", key: "attempts", align: "center", width: 100,
    render: (row) => h("span", { style: "font-size:12px" },
      row.max_attempts ? `${row.attempts ?? 0}/${row.max_attempts}` : String(row.attempts ?? 0)),
  },
  {
    title: "Created", key: "created_at", align: "left", minWidth: 150,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.created_at ? new Date(row.created_at).toLocaleString("en-US") : "—"),
  },
  {
    title: "Error", key: "error_message", align: "left", minWidth: 180, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px; color:var(--error-color,#d03050)" },
      row.error_message ?? "—"),
  },
  {
    title: "", key: "cancel", align: "center", width: 90,
    render: (row) => ["completed", "failed"].includes(row.status)
      ? null
      : h(NButton, { size: "tiny", secondary: true, onClick: () => cancelProcessJob(row) },
          { default: () => row.status === "running" ? "Release" : "Cancel" }),
  },
];

const cronJobColumns: DataTableColumns<any> = [
  {
    title: "Service", key: "name", align: "left", minWidth: 150,
    render: (row) => h("span", { style: "font-size:13px; font-weight:500; white-space:nowrap" }, JOB_NAME_HE[row.name] ?? row.name),
  },
  {
    title: "Status", key: "status", align: "center", width: 110,
    render: (row) => {
      const ok = !row.last_error && (row.consecutive_failures ?? 0) === 0;
      return h(NTag, { type: ok ? "default" : "error", size: "small", round: true },
        { default: () => ok ? "Healthy" : `${row.consecutive_failures} failures` });
    },
  },
  {
    title: "Last Run", key: "last_run_at", align: "left", minWidth: 150,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.last_run_at ? new Date(row.last_run_at).toLocaleString("en-US") : "—"),
  },
  {
    title: "Last Success", key: "last_success_at", align: "left", minWidth: 150,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.last_success_at ? new Date(row.last_success_at).toLocaleString("en-US") : "—"),
  },
  {
    title: "Last Error", key: "last_error", align: "left", minWidth: 180, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px; color:var(--error-color,#d03050)" }, row.last_error ?? "—"),
  },
];

const monthlyScheduleColumns: DataTableColumns<any> = [
  {
    title: "User", key: "user_id", align: "left", minWidth: 220, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px; white-space:nowrap" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "Enabled", key: "enabled", align: "center", width: 90,
    render: (row) =>
      h(NTag, { type: row.enabled ? "default" : "error", size: "small", round: true },
        { default: () => row.enabled ? "Yes" : "No" }),
  },
  {
    title: "Day of Month", key: "day", align: "center", width: 100,
    render: (row) => h("span", { style: "font-size:12px" }, row.day ?? "—"),
  },
  {
    title: "Hour", key: "hour", align: "center", width: 90,
    render: (row) => h("span", { style: "font-size:12px" }, row.hour != null ? `${row.hour}:00` : "—"),
  },
  {
    title: "Last Sent", key: "last_sent", align: "left", width: 130,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.last_sent ? new Date(row.last_sent).toLocaleDateString("en-US") : "—"),
  },
  {
    title: "Last Error", key: "last_error", align: "left", minWidth: 180, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px; color: var(--error-color,#d03050)" }, row.last_error ?? "—"),
  },
];

// ── Monthly reports monitor ────────────────────────────────────────────────
const monthlyMonitor = ref<any>(null);

// ── Extraction quality ─────────────────────────────────────────────────────
const extractionQuality = ref<any>(null);

// ── Pipeline gaps ──────────────────────────────────────────────────────────
const pipelineGaps = ref<any>(null);

// ── Bad emails monitor ────────────────────────────────────────────────────
const badEmailsData = ref<any>(null);

// ── System health ─────────────────────────────────────────────────────────
const systemHealth = ref<any>(null);
const importQueue = ref<any>(null);
const invoiceMonitor = ref<any>(null);
const storageDrive = ref<any>(null);

const collectionStatsColumns: DataTableColumns<any> = [
  { title: "Collection", key: "collection", minWidth: 180 },
  {
    title: "Documents", key: "count", width: 140, align: "right",
    render: (row) => h("span", { style: "font-size:13px;font-variant-numeric:tabular-nums" },
      row.count >= 0 ? row.count.toLocaleString() : "—"),
    sorter: (a: any, b: any) => a.count - b.count,
  },
];

const queueFailureColumns: DataTableColumns<any> = [
  {
    title: "Document", key: "document_id", minWidth: 200,
    render: (row) => h("span", { style: "font-family:var(--font-mono,monospace);font-size:12px" },
      String(row.document_id ?? "—")),
  },
  {
    title: "Status", key: "status", width: 110,
    render: (row) => h(NTag, { size: "small", type: row.status === "failed" ? "error" : "warning" },
      { default: () => String(row.status ?? "—") }),
  },
  {
    title: "Attempts", key: "attempts", width: 100, align: "right",
    render: (row) => h("span", { style: "font-size:13px" },
      `${row.attempts ?? 0}/${row.max_attempts ?? 3}`),
  },
  { title: "Reason", key: "error_code", minWidth: 150 },
  {
    title: "Message", key: "error_message", minWidth: 260,
    render: (row) => h("span", { style: "font-size:12px;color:var(--text-secondary)" },
      String(row.error_message ?? "").slice(0, 160) || "—"),
  },
];

const driveJobColumns: DataTableColumns<any> = [
  {
    title: "User", key: "user_id", minWidth: 200,
    render: (row) => h("span", { style: "font-family:var(--font-mono,monospace);font-size:12px" },
      String(row.user_id ?? "—")),
  },
  {
    title: "Status", key: "status", width: 120,
    render: (row) => h(NTag, { size: "small", type: row.status === "failed" ? "error" : "success" },
      { default: () => String(row.status ?? "—") }),
  },
  { title: "Uploaded", key: "uploaded", width: 100, align: "right" },
  { title: "Failed", key: "failed", width: 90, align: "right" },
  { title: "Skipped", key: "skipped", width: 100, align: "right" },
];

// ── S3 Storage Browser ──────────────────────────────────────────────────
const s3Files = ref<any[]>([]);
const s3Loading = ref(false);
const s3BrowseUserId = ref<string | null>(null);
const s3Truncated = ref(false);
const s3FileSearch = ref("");
const s3StatusFilter = ref<string | null>(null);
const s3AreaFilter = ref<string | null>(null);

// ── Bucket folder maintenance ───────────────────────────────────────────
const storageFolders = ref<any[]>([]);
const storageFoldersTruncated = ref(false);
const foldersLoading = ref(false);
const deletingFolder = ref<string | null>(null);

async function loadStorageFolders() {
  foldersLoading.value = true;
  try {
    const res = await api.admin.listStorageFolders();
    if (res?.error) {
      message.error(res.error);
      return;
    }
    storageFolders.value = res.folders ?? [];
    storageFoldersTruncated.value = Boolean(res.truncated);
  } catch {
    message.error("Error loading bucket folders");
  } finally {
    foldersLoading.value = false;
  }
}

/**
 * Two-step confirmation before an irreversible bucket delete: the first dialog
 * states the object count, the second requires the prefix to be typed back.
 * A folder holding referenced objects is refused by the server and reported
 * rather than force-deleted from here.
 */
async function confirmDeleteFolder(folder: any) {
  const linkedNote = folder.referenced > 0
    ? `\n\nWARNING: ${folder.referenced} of these objects are still linked to documents.`
    : "";
  const proceed = window.confirm(
    `Permanently delete every object under "${folder.prefix}"?\n\n` +
    `${folder.objects} objects, ${formatBytes(folder.bytes)}.${linkedNote}\n\n` +
    "This cannot be undone.",
  );
  if (!proceed) return;

  const typed = window.prompt(`Type the folder prefix exactly to confirm:\n${folder.prefix}`);
  if (typed !== folder.prefix) {
    if (typed !== null) message.warning("Prefix did not match — nothing was deleted");
    return;
  }

  deletingFolder.value = folder.prefix;
  try {
    const res = await api.admin.deleteStorageFolder(folder.prefix);
    if (res?.error) {
      // The server refuses linked folders unless force is set; surface that
      // rather than silently retrying with force.
      message.error(
        res.linked_count
          ? `${res.error} (${res.linked_count} linked objects). Delete those documents first.`
          : res.error,
      );
      return;
    }
    message.success(`Deleted ${res.deleted} object(s) from ${res.prefix}`);
    await loadStorageFolders();
    if (s3BrowseUserId.value) await loadS3Files();
  } catch {
    message.error("Error deleting folder");
  } finally {
    deletingFolder.value = null;
  }
}
const s3Page = ref(1);
const s3PageSize = 25;

const s3StatusOptions = [
  { label: "All", value: null },
  { label: "In DB", value: "in_db" },
  { label: "Orphan (not in DB)", value: "not_in_db" },
  { label: "Documents only", value: "documents" },
  { label: "Thumbnails only", value: "thumbnails" },
  { label: "Done", value: "done" },
  { label: "Error", value: "error" },
  { label: "Processing", value: "processing" },
  { label: "Queued", value: "queued" },
];

const filteredS3Files = computed(() => {
  let result = s3Files.value;
  const q = s3FileSearch.value.trim().toLowerCase();
  if (q) result = result.filter((f) => f.file_name?.toLowerCase().includes(q) || f.key?.toLowerCase().includes(q));
  const status = s3StatusFilter.value;
  if (status === "in_db") result = result.filter((f) => f.in_db);
  // Matches the orphan stat: thumbnails are regenerable derivatives, so they
  // are not what someone filtering for orphans is looking for.
  else if (status === "not_in_db") result = result.filter((f) => !f.in_db && f.kind !== "thumbnail");
  else if (status === "thumbnails") result = result.filter((f) => f.kind === "thumbnail");
  else if (status === "documents") result = result.filter((f) => f.kind !== "thumbnail");
  else if (status) result = result.filter((f) => f.status === status);
  if (s3AreaFilter.value) result = result.filter((f) => f.area === s3AreaFilter.value);
  return result;
});

const s3AreaOptions = computed(() => {
  const areas = [...new Set(s3Files.value.map((f) => f.area).filter(Boolean))].sort();
  return [{ label: "All areas", value: null }, ...areas.map((a) => ({ label: a, value: a }))];
});

const s3Stats = computed(() => {
  const files = s3Files.value;
  return {
    total: files.length,
    bytes: files.reduce((sum, f) => sum + (f.size ?? 0), 0),
    inDb: files.filter((f) => f.in_db).length,
    // Thumbnails are generated derivatives, not user data — an unreferenced one
    // is regenerable, so counting it as an orphan overstated the real problem.
    orphan: files.filter((f) => !f.in_db && f.kind !== "thumbnail").length,
    thumbnails: files.filter((f) => f.kind === "thumbnail").length,
    legacy: files.filter((f) => f.layout === "legacy").length,
  };
});

const s3PageCount = computed(() => Math.max(1, Math.ceil(filteredS3Files.value.length / s3PageSize)));

const pagedS3Files = computed(() => {
  const start = (s3Page.value - 1) * s3PageSize;
  return filteredS3Files.value.slice(start, start + s3PageSize);
});

watch([s3FileSearch, s3StatusFilter, s3BrowseUserId], () => {
  s3Page.value = 1;
});

async function loadS3Files() {
  if (!s3BrowseUserId.value) {
    s3Files.value = [];
    s3Truncated.value = false;
    s3Page.value = 1;
    return;
  }
  s3Loading.value = true;
  try {
    const res = await api.admin.browseStorage({ user_id: s3BrowseUserId.value });
    s3Files.value = res.files;
    s3Truncated.value = res.truncated;
    s3Page.value = 1;
    // The previous user's areas do not apply to this listing; a stale value
    // would filter every row away.
    s3AreaFilter.value = null;
  } catch {
    message.error("Error loading S3 files");
    s3Files.value = [];
  } finally {
    s3Loading.value = false;
  }
}

function windowOpenStorage(key: string) {
  window.open(api.admin.storageDownloadUrl(key), "_blank");
}

async function deleteOrphanFile(key: string) {
  const confirmed = window.confirm(`Delete orphan S3 file?\n${key}`);
  if (!confirmed) return;
  try {
    const res = await api.admin.deleteStorageFile(key);
    if (res.ok) {
      message.success("Deleted");
      s3Files.value = s3Files.value.filter((f: any) => f.key !== key);
    } else {
      message.error(res.error ?? "Delete failed");
    }
  } catch {
    message.error("Delete failed");
  }
}
const issueLabel: Record<string, string> = {
  consecutive_dots: "consecutive dots",
  trailing_punctuation: "trailing punctuation",
  invalid_format: "invalid format",
  missing_tld: "missing TLD",
  contains_spaces: "spaces",
  hebrew_chars: "Hebrew chars",
  short_tld: "short TLD",
  empty: "empty",
};

const badClientEmailColumns: DataTableColumns<any> = [
  {
    title: "User", key: "user_id", width: 180, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  { title: "Client", key: "display_name", minWidth: 160, ellipsis: { tooltip: true } },
  {
    title: "Email", key: "email", minWidth: 220, ellipsis: { tooltip: true },
    render: (row) => h("code", { style: "font-size:12px;color:var(--error-color, #e88080)" }, row.email),
  },
  { title: "Phone", key: "phone", width: 140, ellipsis: { tooltip: true } },
  {
    title: "Issues", key: "issues", minWidth: 180,
    render: (row) => row.issues.map((i: string) => h(NTag, { size: "small", type: "error", round: true, style: "margin:2px" }, () => issueLabel[i] ?? i)),
  },
];

const badReminderEmailColumns: DataTableColumns<any> = [
  {
    title: "User", key: "user_id", width: 180, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "Email", key: "email", minWidth: 220, ellipsis: { tooltip: true },
    render: (row) => h("code", { style: "font-size:12px;color:var(--error-color, #e88080)" }, row.email),
  },
  { title: "Status", key: "status", width: 100 },
  {
    title: "Trigger", key: "trigger_date", width: 120,
    render: (row) => row.trigger_date ? new Date(row.trigger_date).toLocaleDateString() : "—",
  },
  {
    title: "Issues", key: "issues", minWidth: 180,
    render: (row) => row.issues.map((i: string) => h(NTag, { size: "small", type: "warning", round: true, style: "margin:2px" }, () => issueLabel[i] ?? i)),
  },
];

const badDocEmailColumns: DataTableColumns<any> = [
  {
    title: "User", key: "user_id", width: 180, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  { title: "File", key: "filename", minWidth: 180, ellipsis: { tooltip: true } },
  {
    title: "Extracted Email", key: "email", minWidth: 220, ellipsis: { tooltip: true },
    render: (row) => h("code", { style: "font-size:12px;color:var(--error-color, #e88080)" }, row.email),
  },
  {
    title: "Issues", key: "issues", minWidth: 180,
    render: (row) => row.issues.map((i: string) => h(NTag, { size: "small", type: "warning", round: true, style: "margin:2px" }, () => issueLabel[i] ?? i)),
  },
];

const bouncedEmailColumns: DataTableColumns<any> = [
  {
    title: "User", key: "user_id", width: 180, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "Email", key: "email", minWidth: 220, ellipsis: { tooltip: true },
    render: (row) => h("code", { style: "font-size:12px;color:var(--error-color, #e88080)" }, row.email),
  },
  { title: "Error", key: "error", minWidth: 200, ellipsis: { tooltip: true } },
  {
    title: "Date", key: "sent_at", width: 140,
    render: (row) => row.sent_at ? new Date(row.sent_at).toLocaleString() : "—",
  },
];

// ── Contract advances ──────────────────────────────────────────────────────
const contractAdvances = ref<any[]>([]);

// ── Admin settings ─────────────────────────────────────────────────────────
const adminSettings = ref<any>(null);

// ── Action loading states ──────────────────────────────────────────────────
const reprocessingIds = ref<Set<string>>(new Set());
const retryingIds = ref<Set<string>>(new Set());
// ── Report modal ───────────────────────────────────────────────────────────
const showReportModal = ref(false);
const reportModalUser = ref<{ id: string; name: string } | null>(null);
useDevModal("admin.report", showReportModal, {
  beforeOpen: () => {
    if (!reportModalUser.value) reportModalUser.value = {id: "dev", name: "DEV"};
  },
});

function openReportModal(user: any) {
  reportModalUser.value = { id: user.id ?? user.user_id, name: user.name ?? user.email ?? user.user_id };
  showReportModal.value = true;
}

const monthlyFilter = ref<{ q: string; enabled: "yes" | "no" | null; day: number | null; status: "error" | "never" | "sent" | null }>({
  q: "", enabled: null, day: null, status: null,
});
const monthlyEnabledOptions = [
  { label: "Enabled", value: "yes" },
  { label: "Disabled", value: "no" },
];
const monthlyStatusOptions = [
  { label: "Has error", value: "error" },
  { label: "Never sent", value: "never" },
  { label: "Sent", value: "sent" },
];
const monthlyDayOptions = computed(() => {
  const days = new Set<number>();
  for (const row of monthlyMonitor.value?.schedules ?? []) if (row.day != null) days.add(Number(row.day));
  return [...days].sort((a, b) => a - b).map((day) => ({ label: `Day ${day}`, value: day }));
});
function listText(value: unknown): string {
  let list = value ?? [];
  if (typeof list === "string") { try { list = JSON.parse(list); } catch { return String(value); } }
  return Array.isArray(list) ? list.join(" ") : "";
}
const filteredMonthlySchedules = computed(() => {
  const f = monthlyFilter.value;
  const q = f.q.trim().toLowerCase();
  return (monthlyMonitor.value?.schedules ?? []).filter((row: any) => {
    if (f.enabled && Boolean(row.enabled) !== (f.enabled === "yes")) return false;
    if (f.day != null && Number(row.day) !== f.day) return false;
    if (f.status === "error" && !row.last_error) return false;
    if (f.status === "never" && row.last_sent) return false;
    if (f.status === "sent" && !row.last_sent) return false;
    if (q && !`${resolveUserEmail(row.user_id)} ${listText(row.recipients)}`.toLowerCase().includes(q)) return false;
    return true;
  });
});

const monthlyScheduleDetailColumns: DataTableColumns<any> = [
  {
    title: "User", key: "user_id", align: "left", minWidth: 220, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px; white-space:nowrap" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "Enabled", key: "enabled", align: "center", width: 90,
    render: (row) =>
      h(NTag, { type: row.enabled ? "default" : "error", size: "small", round: true },
        { default: () => row.enabled ? "Yes" : "No" }),
  },
  {
    title: "Day", key: "day", align: "center", width: 90,
    render: (row) => h("span", { style: "font-size:12px" }, row.day ?? "—"),
  },
  {
    title: "Hour", key: "hour", align: "center", width: 90,
    render: (row) => h("span", { style: "font-size:12px" }, row.hour != null ? `${row.hour}:00` : "—"),
  },
  {
    title: "Formats", key: "formats", align: "left", width: 110,
    render: (row) => {
      let formats = row.formats ?? [];
      if (typeof formats === "string") { try { formats = JSON.parse(formats); } catch { formats = []; } }
      return h("span", { style: "font-size:12px" }, Array.isArray(formats) ? formats.join(", ") || "—" : "—");
    },
  },
  {
    title: "Recipients", key: "recipients", align: "left", minWidth: 220, ellipsis: { tooltip: true },
    render: (row) => {
      let recipients = row.recipients ?? [];
      if (typeof recipients === "string") { try { recipients = JSON.parse(recipients); } catch { recipients = []; } }
      return h("span", { style: "font-size:12px" }, Array.isArray(recipients) ? recipients.join(", ") || "—" : "—");
    },
  },
  {
    title: "Last Sent", key: "last_sent", align: "left", width: 130,
    render: (row) => h("span", { style: "font-size:12px; color:var(--text-secondary)" },
      row.last_sent ? new Date(row.last_sent).toLocaleDateString("en-US") : "—"),
  },
  {
    title: "Error", key: "last_error", align: "left", minWidth: 180, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px; color: var(--error-color,#d03050)" }, row.last_error ?? "—"),
  },
];

// ── Action handlers ────────────────────────────────────────────────────────
async function reprocessDoc(docId: string) {
  reprocessingIds.value = new Set([...reprocessingIds.value, docId]);
  try {
    await api.admin.reprocessDocument(docId);
    message.success("Reprocess queued");
    setTimeout(() => loadSectionData(activeSection.value), 2000);
  } catch {
    message.error("Reprocess failed");
  } finally {
    const s = new Set(reprocessingIds.value);
    s.delete(docId);
    reprocessingIds.value = s;
  }
}

async function retryEscalation(reminderId: string) {
  retryingIds.value = new Set([...retryingIds.value, reminderId]);
  try {
    const res = await api.admin.retryEscalation(reminderId);
    if (res.ok) message.success("Escalation retried successfully");
    else message.error(res.error ?? "Retry failed");
    await loadSectionData("reminders");
  } catch {
    message.error("Retry failed");
  } finally {
    const s = new Set(retryingIds.value);
    s.delete(reminderId);
    retryingIds.value = s;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("he-IL");
}

function formatInterval(seconds: number): string {
  if (!seconds) return "—";
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) {
    const m = Math.round(seconds / 60);
    return m === 1 ? "minute" : `${m} minutes`;
  }
  const h = Math.round(seconds / 3600);
  return h === 1 ? "hour" : `${h} hours`;
}

/** Backup runs every 8 hours — flag it stale past 10h so a missed run shows up. */
function backupStatus(lastRunAt: string | null): "success" | "warning" {
  if (!lastRunAt) return "warning";
  const ageMs = Date.now() - new Date(lastRunAt).getTime();
  return ageMs > 10 * 3600 * 1000 ? "warning" : "success";
}

// ── Section switching & loading ────────────────────────────────────────────
async function switchSection(key: string) {
  key = canonicalSection(key);
  activeSection.value = key;
  if (isMobileViewport.value) {
    showMobileNav.value = false;
  }
  const tab = tabFromQuery(key);
  pageTab.value = tab;
  const nextQuery: Record<string, unknown> = { ...route.query, section: key };
  const currentTab = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab;
  if (tab) nextQuery.tab = tab;
  else delete nextQuery.tab;
  if (route.query.section !== key || (currentTab ?? "") !== tab) {
    await router.replace({ query: nextQuery as any });
  }
  if (SEED_SECTION_KEYS.includes(key) && !visitedSeedSections.value.has(key)) {
    visitedSeedSections.value = new Set([...visitedSeedSections.value, key]);
  }
  await loadSectionData(key);
}

async function reloadSection() {
  await loadSectionData(activeSection.value);
}

async function loadSectionData(key: string) {
  if (key === "users" || key === "stats" || key === "magic_links" || key === "gmail") {
    if (key !== "gmail" && users.value.length === 0) await loadUsers();
    return;
  }
  sectionLoading.value = true;
  try {
    if (key === "documents") {
      if (users.value.length === 0) await loadUsers();
      const [monitor, gaps, quality, queue, storage] = await Promise.all([
        api.admin.monitorDocuments(),
        api.admin.monitorPipelineGaps(),
        api.admin.monitorExtractionQuality(),
        api.admin.monitorImportQueue(),
        api.admin.monitorStorageDrive(),
        loadExtractions(1),
      ]);
      docMonitor.value = monitor;
      pipelineGaps.value = gaps;
      extractionQuality.value = quality;
      importQueue.value = queue;
      storageDrive.value = storage;
      processMonitor.value = await api.admin.monitorProcesses();
    } else if (SEED_SECTION_KEYS.includes(key)) {
      // Every SEED page shows the lead totals, and WhatsApp needs the rows.
      if (key === "inspector_leads" || !inspectorLeadsRows.value.length) await loadInspectorLeads(1);
    } else if (key === "reminders") {
      const [rem, advances] = await Promise.all([api.admin.monitorReminders(), api.admin.monitorContractAdvances()]);
      reminderMonitor.value = rem;
      contractAdvances.value = advances;
    } else if (key === "monthly") {
      monthlyMonitor.value = await api.admin.monitorMonthlyReports();
    } else if (key === "bad_emails") {
      badEmailsData.value = await api.admin.monitorBadEmails();
    } else if (key === "invoices") {
      invoiceMonitor.value = await api.admin.monitorInvoices();
    } else if (key === "system_health") {
      systemHealth.value = await api.admin.monitorSystemHealth();
    } else if (key === "processes") {
      // Job rows carry a user id; the users list is what turns it into an email.
      if (users.value.length === 0) await loadUsers();
      const [processes, scheduler] = await Promise.all([
        api.admin.monitorProcesses(),
        api.admin.monitorScheduler(),
      ]);
      processMonitor.value = processes;
      schedulerMonitor.value = scheduler;
      await loadProcessJobs();
    } else if (key === "settings") {
      adminSettings.value = await api.admin.getAdminSettings();
    }
  } catch {
    message.error("Error loading data");
  } finally {
    sectionLoading.value = false;
  }
  if (key === "documents" && s3BrowseUserId.value) {
    await loadS3Files();
  }
}

// ── Polling / Auto-refresh ────────────────────────────────────────────────────
const lastRefreshed = ref<Map<string, Date>>(new Map());
const pollingIntervals = ref<Map<string, NodeJS.Timeout>>(new Map());
const POLLING_SCHEDULE = {
  scheduler: 30000,    // 30s for scheduler health
  reminders: 60000,    // 60s for email delivery stats
  documents: 90000,    // 90s for extraction pipeline
};

function getLastRefreshedText(section: string): string {
  const last = lastRefreshed.value.get(section);
  if (!last) return "Never";
  const seconds = Math.floor((Date.now() - last.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

async function startPolling() {
  // Scheduler polling (30s)
  if (pollingIntervals.value.has("scheduler")) clearInterval(pollingIntervals.value.get("scheduler")!);
  pollingIntervals.value.set("scheduler", setInterval(async () => {
    if (activeSection.value === "processes" && schedulerMonitor.value) {
      try {
        schedulerMonitor.value = await api.admin.monitorScheduler();
        lastRefreshed.value.set("scheduler", new Date());
      } catch { /* silent fail */ }
    }
  }, POLLING_SCHEDULE.scheduler));

  // Reminders polling (60s)
  if (pollingIntervals.value.has("reminders")) clearInterval(pollingIntervals.value.get("reminders")!);
  pollingIntervals.value.set("reminders", setInterval(async () => {
    if (activeSection.value === "reminders" && reminderMonitor.value) {
      try {
        reminderMonitor.value = await api.admin.monitorReminders();
        lastRefreshed.value.set("reminders", new Date());
      } catch { /* silent fail */ }
    }
  }, POLLING_SCHEDULE.reminders));

  // Documents polling (90s)
  if (pollingIntervals.value.has("documents")) clearInterval(pollingIntervals.value.get("documents")!);
  pollingIntervals.value.set("documents", setInterval(async () => {
    if (activeSection.value === "documents" && docMonitor.value) {
      try {
        docMonitor.value = await api.admin.monitorDocuments();
        lastRefreshed.value.set("documents", new Date());
      } catch { /* silent fail */ }
    }
  }, POLLING_SCHEDULE.documents));
}

function sectionFromQuery(): string | null {
  const raw = route.query.section;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== "string") return null;
  const canonical = canonicalSection(value);
  return adminSections.some((item) => item.key === canonical) ? canonical : null;
}

onMounted(async () => {
  updateViewportState();
  window.addEventListener("resize", updateViewportState);
  try {
    const cfg = await api.config.getAdmin();
    appEnv.value = cfg.appEnv ?? "development";
    dbName.value = cfg.dbName ?? "";
  } catch { /* non-critical */ }
  await loadUsers();
  await refreshDbTargetMeta();
  await switchSection(sectionFromQuery() ?? "system_health");
  startPolling();
  refreshPushState();
});

watch(
  () => route.query.section,
  async () => {
    const next = sectionFromQuery();
    if (next && next !== activeSection.value) {
      await switchSection(next);
    }
  },
);

watch(
  () => route.query.tab,
  () => {
    const next = tabFromQuery(activeSection.value);
    if (next && next !== pageTab.value) pageTab.value = next;
  },
);

onUnmounted(() => {
  window.removeEventListener("resize", updateViewportState);
  pollingIntervals.value.forEach((interval) => clearInterval(interval));
  pollingIntervals.value.clear();
});
</script>

<style scoped>
/* Admin UI is English/LTR. The app root is RTL (Hebrew), and Naive UI renders
   data-table header and body in separate DOM subtrees, so relying on an
   inherited dir="ltr" flips only the header — forcing LTR on the table and both
   its header/body wrappers keeps columns aligned. */
.admin-shell :deep(.n-data-table),
.admin-shell :deep(.n-data-table-base-table),
.admin-shell :deep(.n-data-table-base-table-header),
.admin-shell :deep(.n-data-table-base-table-body),
.admin-shell :deep(.n-data-table-thead),
.admin-shell :deep(.n-data-table-tbody),
.admin-shell :deep(.n-data-table-tr) {
  direction: ltr;
}

/* Keep columns at their natural width instead of squeezing until cells wrap
   one character per line. Overflow scrolls horizontally. */
.admin-shell :deep(.n-data-table-wrapper),
.admin-shell :deep(.n-data-table-base-table-wrapper) {
  overflow-x: auto;
}
.admin-shell :deep(.n-data-table-base-table-body .n-scrollbar-content),
.admin-shell :deep(.n-data-table-base-table-header .n-scrollbar-content) {
  min-width: max-content;
}
.admin-shell :deep(.n-data-table-th),
.admin-shell :deep(.n-data-table-td) {
  white-space: nowrap;
}
.admin-shell :deep(.n-data-table-th__title) {
  overflow: hidden;
  text-overflow: ellipsis;
}
.admin-shell {
  position: relative;
  display: flex;
  height: 100vh;
  background: var(--bg-body);
  overflow: hidden;
  direction: ltr;
  text-align: left;
}

/* ── Sidebar ────────────────────────────────────────────────────────────── */
.admin-sidebar {
  width: 268px;
  flex: 0 0 268px;
  background: var(--bg-card);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s ease, flex-basis 0.2s ease, opacity 0.2s ease, border-color 0.2s ease;
}

.admin-sidebar--collapsed {
  width: 0;
  flex-basis: 0;
  border-right-color: transparent;
  opacity: 0;
  pointer-events: none;
}

.admin-sidebar__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 18px 16px;
  font-family: var(--font-ui);
  font-size: 16px;
  font-weight: 700;
  color: var(--brand-color);
  cursor: pointer;
  border-bottom: 1px solid var(--border-color);
}

.admin-sidebar__nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 10px 12px 14px;
  gap: 10px;
  overflow-y: auto;
}

.seed-db-note {
  margin: -6px 0 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

.admin-sidebar__group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.admin-sidebar__group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 12px 4px;
  border: none;
  background: none;
  cursor: pointer;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
  text-align: left;
}

.admin-sidebar__group-header:hover {
  color: var(--text-primary);
}

.admin-sidebar__group-count {
  margin-inline-start: auto;
  font-weight: 600;
  opacity: 0.7;
}

.admin-sidebar__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 14px;
  line-height: 1.3;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background 0.15s, color 0.15s;
}

.admin-sidebar__item :deep(.n-icon) {
  flex: 0 0 auto;
}

.admin-sidebar__item span {
  min-width: 0;
  white-space: nowrap;
}

.admin-sidebar__item:hover {
  background: var(--bg-hover, rgba(99, 226, 183, 0.08));
  color: var(--text-primary);
}

.admin-sidebar__item--active {
  background: rgba(24, 160, 88, 0.12);
  color: var(--brand-color);
  font-weight: 600;
}

.admin-sidebar__footer {
  padding: 12px;
  border-top: 1px solid var(--border-color);
}

/* ── Main ────────────────────────────────────────────────────────────────── */
.admin-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  direction: ltr;
  transition: margin-left 0.2s ease;
}

.admin-shell--sidebar-collapsed .admin-main {
  margin-left: 40px;
}

.admin-main__header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border-color);
  flex: 0 0 auto;
}

.admin-main__title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.admin-main__title {
  margin: 0 0 2px;
  font-family: var(--font-ui);
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  flex: 1;
}

.admin-main__meta {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 2px;
}

/* ── Section ─────────────────────────────────────────────────────────────── */
.admin-section {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px 32px;
  direction: ltr;
}

.admin-section--users {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}

.admin-section--gmail {
  padding: 0;
  max-width: none;
}

.admin-section--gmail :deep(.page2.gmail-page) {
  padding-top: 0;
  min-height: auto;
}

.admin-section--leads {
  background: color-mix(in srgb, var(--text-primary) 3.5%, var(--bg-app));
}

.admin-section--leads :deep(.stat-card) {
  border-color: var(--border-strong);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
}

.admin-section--leads :deep(.stat-card__title),
.admin-section--leads :deep(.stat-card__num),
.admin-section--leads :deep(.stat-card__num-small) {
  color: var(--text-primary);
}

.admin-section--leads :deep(.stat-card--success .stat-card__num) {
  color: var(--brand-color);
}

.admin-section--leads .monitor-block {
  border-color: var(--border-strong);
}

.admin-page-tabs {
  margin-top: 16px;
}

.admin-page-tabs :deep(.n-tabs-pane-wrapper) {
  padding-top: 12px;
}

.admin-tab-empty {
  padding: 28px 12px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.admin-section__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.leads-toolbar {
  flex-wrap: wrap;
  margin-top: 0;
  margin-bottom: 12px;
  padding: 8px 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.lead-unsub-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lead-status-select {
  width: 150px;
}

.lead-status-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.lead-status-label--success { color: var(--brand-color); }
.lead-status-label--info { color: #2080f0; }
.lead-status-label--warning { color: #d08b1c; }

.lead-unsubscribed {
  font-size: 12px;
  font-weight: 600;
  color: #d03050;
  white-space: nowrap;
}

.lead-source-tag {
  max-width: 158px;
}

.lead-source-tag :deep(.n-tag__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lead-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.lead-cell__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
}

.lead-cell__meta {
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
}

.admin-link {
  color: var(--brand-color);
  text-decoration: none;
  font-size: 12px;
}

.admin-link:hover {
  text-decoration: underline;
}

.leads-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 34px;
  margin-top: 12px;
  color: var(--text-secondary);
  font-size: 12px;
}

.leads-pagination__actions {
  display: flex;
  gap: 8px;
}

/* ── Stats grid ──────────────────────────────────────────────────────────── */
.admin-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.admin-stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 18px 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 92px;
}

.admin-stat-card__icon {
  color: var(--brand-color);
  flex: 0 0 auto;
}

.admin-stat-card__body {
  min-width: 0;
  flex: 1;
}

.admin-stat-card__num {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}

.admin-stat-card__label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Monitor blocks ──────────────────────────────────────────────────────── */
.monitor-block {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 18px 20px;
  margin-bottom: 18px;
}

.monitor-block__title {
  font-family: var(--font-ui);
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.monitor-block__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
}

.monitor-block__toolbar .monitor-block__title {
  margin-bottom: 0;
}

.queue-filter {
  display: flex;
  align-items: center;
  gap: 8px;
}

.process-note {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 10px 0 0;
  line-height: 1.5;
}

/* ── S3 Storage Browser ──────────────────────────────────────────────────── */
.s3-browser__intro {
  font-size: 13px;
  color: var(--text-secondary);
  margin: -4px 0 12px;
}

.s3-browser {
  display: flex;
  flex-direction: column;
  gap: 14px;
  direction: ltr;
  text-align: left;
}

.s3-folders {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md, 8px);
  padding: 12px;
  margin-bottom: 14px;
  background: var(--bg-card);
}

.s3-folders__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.s3-folders__title {
  font-weight: 600;
  font-size: 13px;
}

.s3-folders__warn {
  font-size: 12px;
  color: #f0a020;
}

.s3-browser__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.s3-browser__user {
  width: min(300px, 100%);
}

.s3-browser__search {
  flex: 1 1 220px;
  max-width: 380px;
}

.s3-browser__status {
  width: 180px;
}

.s3-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.s3-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 88px;
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
}

.s3-stat--ok {
  border-color: color-mix(in srgb, #18a058 35%, var(--border-color));
  background: color-mix(in srgb, #18a058 8%, var(--bg-card));
}

.s3-stat--warn {
  border-color: color-mix(in srgb, #f0a020 40%, var(--border-color));
  background: color-mix(in srgb, #f0a020 10%, var(--bg-card));
}

.s3-stat__num {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.s3-stat__label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.s3-table-wrap {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  overflow: auto;
  max-height: min(62vh, 640px);
  direction: ltr;
}

.s3-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  direction: ltr;
}

.s3-table thead,
.s3-table tbody,
.s3-table tr {
  direction: ltr;
}

.s3-table th,
.s3-table td {
  padding: 7px 10px;
  text-align: left;
  vertical-align: middle;
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
  line-height: 1.35;
  direction: ltr;
}

.s3-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.s3-table tbody tr:last-child td {
  border-bottom: none;
}

.s3-row:hover td {
  background: color-mix(in srgb, var(--brand-color) 5%, var(--bg-card));
}

.s3-row--orphan td {
  background: color-mix(in srgb, #d03050 4%, var(--bg-card));
}

.s3-col-file { width: 24%; }
.s3-col-size { width: 88px; white-space: nowrap; color: var(--text-secondary); }
.s3-col-date { width: 150px; white-space: nowrap; color: var(--text-secondary); font-size: 11px; }
.s3-col-db { width: 84px; }
.s3-col-status { width: 100px; }
.s3-col-key { width: 28%; }
.s3-col-actions { width: 88px; white-space: nowrap; text-align: left; }

.s3-file {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.s3-file__icon {
  flex: 0 0 auto;
  color: var(--brand-color);
}

.s3-file__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: var(--text-primary);
}

.s3-key {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--text-secondary);
}

.s3-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

.s3-badge--ok,
.s3-badge--done {
  background: color-mix(in srgb, #18a058 16%, transparent);
  color: #18a058;
}

.s3-badge--err,
.s3-badge--error {
  background: color-mix(in srgb, #d03050 14%, transparent);
  color: #d03050;
}

.s3-badge--processing,
.s3-badge--queued {
  background: color-mix(in srgb, #f0a020 16%, transparent);
  color: #f0a020;
}

.s3-muted {
  color: var(--text-muted);
}

.s3-actions {
  display: flex;
  justify-content: flex-start;
  gap: 2px;
}

.s3-actions .icon-btn {
  padding: 2px;
  min-width: 28px;
  min-height: 28px;
  justify-content: center;
}

.s3-actions .btn-icon {
  margin: 0;
}

.s3-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.s3-pager__label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
}

.s3-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 56px 20px;
  border: 1px dashed var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  text-align: center;
}

.s3-empty__icon {
  color: var(--brand-color);
  opacity: 0.7;
  margin-bottom: 4px;
}

.s3-empty__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.s3-empty__desc {
  margin: 0;
  max-width: 420px;
  font-size: 13px;
  color: var(--text-secondary);
}

.s3-empty__desc code {
  font-size: 12px;
  color: var(--text-muted);
}

.s3-spin {
  animation: s3-spin 0.8s linear infinite;
}

@keyframes s3-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 900px) {
  .s3-col-key,
  .s3-col-date {
    display: none;
  }

  .s3-col-file {
    width: 42%;
  }

  .s3-browser__user,
  .s3-browser__search,
  .s3-browser__status {
    width: 100%;
    max-width: none;
  }
}

/* ── Env badge ───────────────────────────────────────────────────────────── */
.admin-db-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  padding: 0 2px;
}

.admin-db-switch__label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.04em;
}

.admin-db-switch :deep(.n-base-selection) {
  min-width: 118px;
}

.admin-env-badge {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  background: rgba(99, 226, 183, 0.1);
  color: var(--brand-color);
  border: 1px solid rgba(99, 226, 183, 0.25);
}

.admin-env-badge--production {
  background: rgba(208, 48, 80, 0.1);
  color: #d03050;
  border-color: rgba(208, 48, 80, 0.3);
}

.admin-env-badge__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  flex: 0 0 auto;
}


.admin-env-badge__db {
  font-weight: 400;
  opacity: 0.75;
  margin-right: 2px;
}

/* ── Sidebar toggle ──────────────────────────────────────────────────────── */
.admin-sidebar-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  top: 18px;
  left: 252px;
  z-index: 30;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  cursor: pointer;
  color: var(--text-primary);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.16);
  transition: left 0.2s ease, transform 0.2s ease, background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.admin-shell--sidebar-collapsed .admin-sidebar-toggle {
  left: 12px;
}

.admin-sidebar-toggle:hover {
  background: var(--bg-hover, rgba(99, 226, 183, 0.08));
  color: var(--brand-color);
  transform: scale(1.03);
}

.admin-sidebar-toggle:focus-visible {
  outline: 2px solid rgba(24, 160, 88, 0.35);
  outline-offset: 2px;
}

/* ── Data table spacing ──────────────────────────────────────────────────── */
.n-data-table {
  margin-top: 8px !important;
}

/* ── Mobile media query ──────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .admin-shell {
    flex-direction: column;
  }

  .admin-sidebar-toggle {
    top: 14px;
    left: 12px;
  }

  .admin-sidebar {
    width: min(280px, calc(100vw - 24px));
    max-width: min(280px, calc(100vw - 24px));
    height: auto;
    border-right: none;
    border: 1px solid var(--border-color);
    border-left: none;
    border-radius: 0 16px 16px 0;
    position: absolute;
    top: 60px;
    left: 0;
    z-index: 20;
    background: var(--bg-card);
    box-shadow: 0 18px 42px rgba(15, 23, 42, 0.18);
    transform: translateX(-100%);
    opacity: 0;
    pointer-events: none;
    transition: transform 0.2s ease, opacity 0.2s ease;
  }

  .admin-sidebar--open {
    transform: translateX(0);
    opacity: 1;
    pointer-events: auto;
  }

  .admin-shell--mobile-sidebar-open .admin-sidebar-toggle {
    left: min(244px, calc(100vw - 48px));
  }

  .admin-main {
    flex: 1;
    width: 100%;
  }

  .admin-main__header {
    padding: 12px 16px 12px 56px;
  }

  .admin-main__title {
    font-size: 16px;
  }

  .admin-section {
    padding: 16px 12px 24px;
  }

  .admin-data-table {
    font-size: 12px;
  }

}

.admin-stat-pills {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.user-stat-pill {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 20px;
}

.user-stat-pill__num {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.user-stat-pill__label {
  font-size: 12px;
  color: var(--text-secondary);
}

.admin-user-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 0 12px;
}

.admin-user-settings__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.admin-user-settings__role {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-right: auto;
  font-size: 12px;
  color: var(--text-secondary);
}

.admin-user-settings__section {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 16px;
}

.admin-user-settings__title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 10px;
}

.admin-user-settings__subhead {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 10px 0 8px;
}

.admin-user-settings__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.admin-setting-control {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  color: var(--text-secondary);
}

.admin-user-settings__switches {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  margin-top: 10px;
}

.admin-user-settings__switches label,
.admin-feature-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-primary);
}

.admin-feature-scope-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
  margin: 12px 0 6px;
}

.admin-user-settings__checks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
}

.admin-feature-toggle {
  justify-content: flex-start;
  align-items: flex-start;
}

.admin-feature-toggle span {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.admin-feature-toggle small {
  color: var(--text-secondary);
  font-size: 11px;
}

.admin-settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (max-width: 640px) {
  .admin-user-settings__grid,
  .admin-user-settings__checks,
  .admin-settings-grid {
    grid-template-columns: 1fr;
  }
}

.admin-setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: var(--bg-hover);
  border-radius: 8px;
  gap: 12px;
}

.admin-setting-key {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.admin-setting-val {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-user-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.admin-user-stat__value {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.admin-user-stat__label {
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
</style>
