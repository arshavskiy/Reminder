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
      <div class="admin-sidebar__brand" @click="router.push('/')">
        <n-icon :component="BriefcaseOutline" :size="20" />
        <span>RemindOCR</span>
      </div>

      <nav class="admin-sidebar__nav">
        <button
          v-for="item in sidebarItems"
          :key="item.key"
          class="admin-sidebar__item"
          :class="{ 'admin-sidebar__item--active': activeSection === item.key }"
          type="button"
          @click="switchSection(item.key)"
        >
          <n-icon :component="item.icon" :size="18" />
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <div class="admin-sidebar__footer">
        <div class="admin-env-badge" :class="`admin-env-badge--${appEnv}`">
          <span class="admin-env-badge__dot" />
          <span>{{ appEnv === 'production' ? 'PRODUCTION' : appEnv.toUpperCase() }}</span>
          <span v-if="dbName" class="admin-env-badge__db">{{ dbName }}</span>
        </div>
        <button class="admin-sidebar__item" type="button" @click="router.push('/')">
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
          <n-button size="small" :loading="sectionLoading" @click="reloadSection">↻ Refresh</n-button>
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
          :users="users"
          :loading="usersLoading"
          @refresh="loadUsers"
          @open-doc="openDocModal"
          @open-report="openReportModal"
          @user-updated="onFocusedUserUpdated"
        />
      </section>

      <!-- ── Documents & Extraction ── -->
      <section v-if="activeSection === 'documents'" class="admin-section">
        <n-spin v-if="sectionLoading" style="display:flex;justify-content:center;padding:40px" />
        <template v-else-if="docMonitor">
          <!-- Pipeline Summary Cards -->
          <div class="admin-stats-grid">
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

          <!-- Storage per user -->
          <div class="monitor-block" style="margin-top: 20px">
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

          <!-- Per-user status matrix -->
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

          <!-- Failed extractions -->
          <div class="monitor-block" v-if="docMonitor.failed.length > 0">
            <div class="monitor-block__title">
              Failed Extraction
              <n-tag v-if="docMonitor.failed.length" type="error" size="small" round style="margin-right:8px">{{ docMonitor.failed.length }}</n-tag>
            </div>
            <n-data-table
              :columns="failedDocsColumns"
              :data="docMonitor.failed"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              size="small"
              style="margin-top:10px"
              :row-class-name="() => 'row-error'"
            />
          </div>

          <!-- Stuck documents -->
          <div class="monitor-block" v-if="docMonitor.stuck.length > 0">
            <div class="monitor-block__title">
              Stuck Documents (Queued > 10 min)
              <n-tag type="warning" size="small" round style="margin-right:8px">{{ docMonitor.stuck.length }}</n-tag>
            </div>
            <n-data-table
              :columns="stuckDocsColumns"
              :data="docMonitor.stuck"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              :max-height="300"
              size="small"
              style="margin-top:10px"
            />
          </div>

          <!-- Extracted field values per document -->
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

          <!-- Pipeline Gaps -->
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
        </template>
      </section>

      <!-- ── Extraction Quality ── -->
      <section v-if="activeSection === 'extraction_quality'" class="admin-section">
        <n-spin v-if="sectionLoading" style="display:flex;justify-content:center;padding:40px" />
        <template v-else-if="extractionQuality">
          <!-- Summary cards -->
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

          <!-- By Backend -->
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

          <!-- Recent parse failures -->
          <div class="monitor-block" v-if="extractionQuality.recent_failures.length > 0">
            <div class="monitor-block__title">
              Recent Parse Failures
              <n-tag type="error" size="small" round style="margin-right:8px">{{ extractionQuality.recent_failures.length }}</n-tag>
            </div>
            <n-data-table
              :columns="parseFailureColumns"
              :data="extractionQuality.recent_failures"
              :bordered="false"
              :pagination="{ pageSize: 15 }"
              size="small"
              style="margin-top:10px"
              :row-class-name="() => 'row-error'"
            />
          </div>

          <!-- Slow runs -->
          <div class="monitor-block" v-if="extractionQuality.slow_runs.length > 0">
            <div class="monitor-block__title">
              Slow Runs (&gt;30s)
              <n-tag type="warning" size="small" round style="margin-right:8px">{{ extractionQuality.slow_runs.length }}</n-tag>
            </div>
            <n-data-table
              :columns="slowRunColumns"
              :data="extractionQuality.slow_runs"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              :max-height="300"
              size="small"
              style="margin-top:10px"
            />
          </div>

          <div v-if="extractionQuality.recent_failures.length === 0 && extractionQuality.slow_runs.length === 0"
               style="text-align:center;padding:40px;color:var(--text-secondary)">
            ✅ No parse failures or slow runs detected
          </div>
        </template>
        <div v-else style="text-align:center;padding:60px;color:var(--text-secondary)">
          Click Refresh to load extraction quality data
        </div>
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

          <!-- ⚠️ CRITICAL: Failed Sends (at top for visibility) -->
          <div class="monitor-block" style="margin-top: 20px; border-color: rgba(208, 48, 80, 0.3); background: rgba(208, 48, 80, 0.02)">
            <div class="monitor-block__title" style="color: #d03050">
              🔴 Failed Email Deliveries
              <n-tag v-if="reminderMonitor.failedSends.length" type="error" size="small" round style="margin-right:8px">{{ reminderMonitor.failedSends.length }}</n-tag>
            </div>
            <div v-if="reminderMonitor.failedSends.length === 0" style="padding: 20px; text-align: center; color: var(--text-secondary)">
              ✅ No failed sends detected
            </div>
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

          <!-- Status counts per user -->
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

          <!-- Pending reminders (those about to trigger) -->
          <div class="monitor-block">
            <div class="monitor-block__title">
              Pending Reminders (Waiting to Send)
              <n-tag v-if="reminderMonitor.pending.length" type="warning" size="small" round style="margin-right:8px">{{ reminderMonitor.pending.length }}</n-tag>
            </div>
            <n-data-table
              :columns="pendingReminderColumns"
              :data="reminderMonitor.pending"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              size="small"
              style="margin-top:10px"
            />
          </div>

          <!-- Failed Escalations -->
          <div class="monitor-block" v-if="(reminderMonitor.failedEscalations ?? []).length > 0"
               style="border-color:rgba(208,48,80,0.3);background:rgba(208,48,80,0.02)">
            <div class="monitor-block__title" style="color:#d03050">
              🔴 Failed Escalations
              <n-tag type="error" size="small" round style="margin-right:8px">{{ reminderMonitor.failedEscalations.length }}</n-tag>
            </div>
            <n-data-table
              :columns="failedEscalationColumns"
              :data="reminderMonitor.failedEscalations"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              size="small"
              style="margin-top:10px"
              :row-class-name="() => 'row-error'"
            />
          </div>

          <!-- Contract Auto-Advances -->
          <div class="monitor-block" v-if="contractAdvances.length > 0">
            <div class="monitor-block__title">
              Contract Auto-Advances
              <n-tag size="small" round style="margin-right:8px">{{ contractAdvances.length }}</n-tag>
            </div>
            <n-data-table
              :columns="contractAdvanceColumns"
              :data="contractAdvances"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              size="small"
              style="margin-top:10px"
            />
          </div>
        </template>
      </section>

      <!-- ── Scheduler ── -->
      <section v-if="activeSection === 'scheduler'" class="admin-section">
        <n-spin v-if="sectionLoading" style="display:flex;justify-content:center;padding:40px" />
        <template v-else-if="schedulerMonitor">
          <!-- Scheduler Health Summary Cards -->
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
          </div>

          <!-- Per-job health table -->
          <div class="monitor-block" style="margin-top: 20px">
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
        </template>
      </section>

      <!-- ── Monthly Reports ── -->
      <section v-if="activeSection === 'monthly'" class="admin-section">
        <n-spin v-if="sectionLoading" style="display:flex;justify-content:center;padding:40px" />
        <template v-else-if="monthlyMonitor">
          <div class="monitor-block">
            <div class="monitor-block__title">Monthly Report Configuration by User</div>
            <n-data-table
              :columns="monthlyScheduleDetailColumns"
              :data="monthlyMonitor.schedules"
              :bordered="false"
              :pagination="{ pageSize: 15 }"
              size="small"
              style="margin-top:10px"
            />
          </div>

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

          <div v-if="badEmailsData.bad_clients.length" class="monitor-block">
            <div class="monitor-block__title">
              Bad Client Emails
              <n-tag type="error" size="small" round style="margin-right:8px">{{ badEmailsData.bad_clients.length }}</n-tag>
            </div>
            <n-data-table
              :columns="badClientEmailColumns"
              :data="badEmailsData.bad_clients"
              :bordered="false"
              :pagination="{ pageSize: 15 }"
              size="small"
              style="margin-top:10px"
            />
          </div>

          <div v-if="badEmailsData.bad_reminders.length" class="monitor-block">
            <div class="monitor-block__title">
              Bad Reminder Emails
              <n-tag type="warning" size="small" round style="margin-right:8px">{{ badEmailsData.bad_reminders.length }}</n-tag>
            </div>
            <n-data-table
              :columns="badReminderEmailColumns"
              :data="badEmailsData.bad_reminders"
              :bordered="false"
              :pagination="{ pageSize: 15 }"
              size="small"
              style="margin-top:10px"
            />
          </div>

          <div v-if="badEmailsData.bad_doc_emails.length" class="monitor-block">
            <div class="monitor-block__title">
              Bad Extracted Emails (from documents)
              <n-tag type="warning" size="small" round style="margin-right:8px">{{ badEmailsData.bad_doc_emails.length }}</n-tag>
            </div>
            <n-data-table
              :columns="badDocEmailColumns"
              :data="badEmailsData.bad_doc_emails"
              :bordered="false"
              :pagination="{ pageSize: 15 }"
              size="small"
              style="margin-top:10px"
            />
          </div>

          <div v-if="badEmailsData.bounced.length" class="monitor-block">
            <div class="monitor-block__title">
              Bounced Emails
              <n-tag type="error" size="small" round style="margin-right:8px">{{ badEmailsData.bounced.length }}</n-tag>
            </div>
            <n-data-table
              :columns="bouncedEmailColumns"
              :data="badEmailsData.bounced"
              :bordered="false"
              :pagination="{ pageSize: 15 }"
              size="small"
              style="margin-top:10px"
            />
          </div>

          <div v-if="!badEmailsData.bad_clients.length && !badEmailsData.bad_reminders.length && !badEmailsData.bad_doc_emails.length && !badEmailsData.bounced.length" class="monitor-block">
            <n-empty description="No bad emails found" />
          </div>
        </template>
      </section>

      <!-- ── System Health ── -->
      <section v-if="activeSection === 'system_health'" class="admin-section">
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

          <div class="monitor-block">
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
        </template>
      </section>

      <!-- ── S3 Storage Browser ── -->
      <section v-if="activeSection === 's3_storage'" class="admin-section">
        <n-spin :show="sectionLoading">
          <div class="s3-browser" dir="ltr">
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
              <button
                class="btn btn--ghost"
                type="button"
                :disabled="!s3BrowseUserId || sectionLoading"
                @click="loadS3Files"
              >
                <n-icon :component="RefreshOutline" :size="16" :class="{ 's3-spin': sectionLoading }" class="btn-icon" />
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
                    <th class="s3-col-status">Status</th>
                    <th class="s3-col-key">S3 Key</th>
                    <th class="s3-col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in pagedS3Files" :key="row.key" class="s3-row" :class="{ 's3-row--orphan': !row.in_db }">
                    <td class="s3-col-file">
                      <div class="s3-file">
                        <n-icon :component="DocumentOutline" :size="14" class="s3-file__icon" />
                        <span class="s3-file__name" :title="row.file_name">{{ row.file_name || "—" }}</span>
                      </div>
                    </td>
                    <td class="s3-col-size">{{ formatBytes(row.size) }}</td>
                    <td class="s3-col-date">{{ row.last_modified ? new Date(row.last_modified).toLocaleString("en-US") : "—" }}</td>
                    <td class="s3-col-db">
                      <span class="s3-badge" :class="row.in_db ? 's3-badge--ok' : 's3-badge--err'">
                        {{ row.in_db ? "Linked" : "Orphan" }}
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

            <div v-else-if="s3BrowseUserId && !sectionLoading && !s3Files.length" class="s3-empty">
              <n-icon :component="CloudUploadOutline" :size="36" class="s3-empty__icon" />
              <h3 class="s3-empty__title">No files for this user</h3>
              <p class="s3-empty__desc">Nothing under <code>documents/{{ s3BrowseUserId }}/</code></p>
            </div>

            <div v-else-if="s3BrowseUserId && s3Files.length && !filteredS3Files.length" class="s3-empty">
              <n-icon :component="SearchOutline" :size="36" class="s3-empty__icon" />
              <h3 class="s3-empty__title">No matches</h3>
              <p class="s3-empty__desc">Try clearing the search or status filter</p>
            </div>

            <div v-else-if="!s3BrowseUserId && !sectionLoading" class="s3-empty">
              <n-icon :component="CloudUploadOutline" :size="36" class="s3-empty__icon" />
              <h3 class="s3-empty__title">Browse object storage</h3>
              <p class="s3-empty__desc">Select a user to list files in their S3 prefix and cross-check DB links</p>
            </div>
          </div>
        </n-spin>
      </section>

      <!-- ── Settings ── -->
      <section v-if="activeSection === 'settings'" class="admin-section">
        <n-spin v-if="sectionLoading" style="display:flex;justify-content:center;padding:40px" />
        <template v-else-if="adminSettings">
          <!-- Push notifications -->
          <div class="monitor-block">
            <div class="monitor-block__title">Admin Push Notifications</div>
            <p style="font-size:13px;color:var(--text-secondary);margin:4px 0 12px">
              Get OS notifications for failed sends, extraction failures, new uploads and pipeline gaps — even when this tab is closed.
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

          <!-- Config grid -->
          <div class="monitor-block" style="margin-top:14px">
            <div class="monitor-block__title">Application Configuration</div>
            <div class="admin-settings-grid" style="margin-top:12px">
              <div class="admin-setting-row"><span class="admin-setting-key">Environment</span><span class="admin-setting-val">{{ adminSettings.appEnv }}</span></div>
              <div class="admin-setting-row"><span class="admin-setting-key">Database</span><span class="admin-setting-val">{{ adminSettings.dbName || '—' }}</span></div>
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

          <!-- Manual report trigger -->
          <div class="monitor-block" style="margin-top:14px">
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
import {useRouter} from "vue-router";
import type {DataTableColumns} from "naive-ui";
import {
  NButton,
  NDataTable,
  NIcon,
  NInput,
  NModal,
  NSelect,
  NSpin,
  NSwitch,
  NTag,
  NTooltip,
  useMessage,
} from "naive-ui";
import {useAdminPush} from "../composables/useAdminPush";
import {
  ArrowBackOutline,
  BriefcaseOutline,
  CalendarOutline,
  ChevronBackOutline,
  ChevronForwardOutline,
  CloseOutline,
  CloudUploadOutline,
  DocumentOutline,
  DownloadOutline,
  EyeOutline,
  FlashOutline,
  MailOutline,
  MenuOutline,
  PulseOutline,
  NotificationsOutline,
  PeopleOutline,
  RefreshOutline,
  SearchOutline,
  SettingsOutline,
  TimerOutline,
  TrashOutline,
} from "@vicons/ionicons5";
import {api} from "../services/apiService.js";
import DocumentDetailPage from "./DocumentDetailPage.vue";
import AdminStatCard from "../components/AdminStatCard.vue";
import AdminReportModal from "../components/AdminReportModal.vue";
import AdminUserFocus from "../components/AdminUserFocus.vue";

const router = useRouter();
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

// ── Sidebar ────────────────────────────────────────────────────────────────
const adminSections = [
  { key: "users",              label: "Users",                  icon: PeopleOutline },
  { key: "documents",          label: "Documents & Extraction", icon: DocumentOutline },
  { key: "extraction_quality", label: "Extraction Quality",     icon: FlashOutline },
  { key: "reminders",          label: "Reminders",              icon: NotificationsOutline },
  { key: "scheduler",          label: "Scheduler",              icon: TimerOutline },
  { key: "monthly",            label: "Monthly Reports",        icon: CalendarOutline },
  { key: "bad_emails",         label: "Bad Emails",             icon: MailOutline },
  { key: "system_health",     label: "System Health",          icon: PulseOutline },
  { key: "s3_storage",        label: "S3 Storage",             icon: CloudUploadOutline },
  { key: "settings",           label: "Settings",               icon: SettingsOutline },
];
const sidebarItems = adminSections.filter((item) => item.key !== "settings");
const activeSection = ref("users");
const currentItem = computed(() => adminSections.find((i) => i.key === activeSection.value));
const sectionLoading = ref(false);

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

function resolveUserEmail(userId: string) {
  return users.value.find((u) => u.id === userId)?.email ?? userId?.slice(-6) ?? "—";
}

const showDocModal = ref(false);
const docModalId = ref<string | null>(null);
const showErrorModal = ref(false);
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
  users.value.map((u) => ({ label: u.email ?? u.id, value: u.id })),
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
    title: "Action", key: "action", align: "center", width: 100,
    render: (row) => h("n-button", {
      text: true,
      type: "primary",
      size: "small",
      onClick: () => openErrorModal(row),
    }, "View Error"),
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

const REMINDER_STATUSES = ["pending", "sent", "snoozed", "dismissed", "error"];
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
    title: "Type", key: "doc_type", align: "left", width: 110,
    render: (row) => h("span", { style: "font-size:12px" }, row.doc_type ?? "—"),
  },
  {
    title: "Note", key: "note", align: "left", minWidth: 220, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, row.note ?? "—"),
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

const collectionStatsColumns: DataTableColumns<any> = [
  { title: "Collection", key: "collection", minWidth: 180 },
  {
    title: "Documents", key: "count", width: 140, align: "right",
    render: (row) => h("span", { style: "font-size:13px;font-variant-numeric:tabular-nums" },
      row.count >= 0 ? row.count.toLocaleString() : "—"),
    sorter: (a: any, b: any) => a.count - b.count,
  },
];

// ── S3 Storage Browser ──────────────────────────────────────────────────
const s3Files = ref<any[]>([]);
const s3BrowseUserId = ref<string | null>(null);
const s3Truncated = ref(false);
const s3FileSearch = ref("");
const s3StatusFilter = ref<string | null>(null);
const s3Page = ref(1);
const s3PageSize = 25;

const s3StatusOptions = [
  { label: "All", value: null },
  { label: "In DB", value: "in_db" },
  { label: "Orphan (not in DB)", value: "not_in_db" },
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
  else if (status === "not_in_db") result = result.filter((f) => !f.in_db);
  else if (status) result = result.filter((f) => f.status === status);
  return result;
});

const s3Stats = computed(() => {
  const files = s3Files.value;
  return {
    total: files.length,
    bytes: files.reduce((sum, f) => sum + (f.size ?? 0), 0),
    inDb: files.filter((f) => f.in_db).length,
    orphan: files.filter((f) => !f.in_db).length,
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
  sectionLoading.value = true;
  try {
    const res = await api.admin.browseStorage({ user_id: s3BrowseUserId.value });
    s3Files.value = res.files;
    s3Truncated.value = res.truncated;
    s3Page.value = 1;
  } catch {
    message.error("Error loading S3 files");
    s3Files.value = [];
  } finally {
    sectionLoading.value = false;
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

function openReportModal(user: any) {
  reportModalUser.value = { id: user.id ?? user.user_id, name: user.name ?? user.email ?? user.user_id };
  showReportModal.value = true;
}

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

// ── Section switching & loading ────────────────────────────────────────────
async function switchSection(key: string) {
  activeSection.value = key;
  if (isMobileViewport.value) {
    showMobileNav.value = false;
  }
  await loadSectionData(key);
}

async function reloadSection() {
  await loadSectionData(activeSection.value);
}

async function loadSectionData(key: string) {
  if (key === "users" || key === "stats") {
    if (users.value.length === 0) await loadUsers();
    return;
  }
  sectionLoading.value = true;
  try {
    if (key === "documents") {
      const [monitor, gaps] = await Promise.all([api.admin.monitorDocuments(), api.admin.monitorPipelineGaps(), loadExtractions(1)]);
      docMonitor.value = monitor;
      pipelineGaps.value = gaps;
    } else if (key === "extraction_quality") {
      extractionQuality.value = await api.admin.monitorExtractionQuality();
    } else if (key === "reminders") {
      const [rem, advances] = await Promise.all([api.admin.monitorReminders(), api.admin.monitorContractAdvances()]);
      reminderMonitor.value = rem;
      contractAdvances.value = advances;
    } else if (key === "scheduler") {
      schedulerMonitor.value = await api.admin.monitorScheduler();
    } else if (key === "monthly") {
      monthlyMonitor.value = await api.admin.monitorMonthlyReports();
    } else if (key === "bad_emails") {
      badEmailsData.value = await api.admin.monitorBadEmails();
    } else if (key === "system_health") {
      systemHealth.value = await api.admin.monitorSystemHealth();
    } else if (key === "s3_storage") {
      if (users.value.length === 0) await loadUsers();
      if (s3BrowseUserId.value) await loadS3Files();
      else sectionLoading.value = false;
    } else if (key === "settings") {
      adminSettings.value = await api.admin.getAdminSettings();
    }
  } catch {
    message.error("Error loading data");
  } finally {
    sectionLoading.value = false;
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
    if (activeSection.value === "scheduler" && schedulerMonitor.value) {
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

onMounted(async () => {
  updateViewportState();
  window.addEventListener("resize", updateViewportState);
  try {
    const cfg = await api.config.getAdmin();
    appEnv.value = cfg.appEnv ?? "development";
    dbName.value = cfg.dbName ?? "";
  } catch { /* non-critical */ }
  await loadUsers();
  startPolling();
  refreshPushState();
});

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
  padding: 14px 12px;
  gap: 6px;
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

.admin-section__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
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

/* ── S3 Storage Browser ──────────────────────────────────────────────────── */
.s3-browser {
  display: flex;
  flex-direction: column;
  gap: 14px;
  direction: ltr;
  text-align: left;
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
