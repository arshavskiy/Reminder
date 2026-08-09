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
        <span>ReminderOCR</span>
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
      <section v-if="activeSection === 'users'" class="admin-section">
        <!-- User stat pills -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
          <div v-for="s in systemStats" :key="s.label" class="user-stat-pill">
            <span class="user-stat-pill__num">{{ s.value }}</span>
            <span class="user-stat-pill__label">{{ s.label }}</span>
          </div>
        </div>

        <div class="admin-section__toolbar">
          <n-input
            v-model:value="userSearch"
            placeholder="Search by name / email..."
            clearable
            style="max-width: 280px; direction: ltr"
          >
            <template #prefix><n-icon :component="SearchOutline" /></template>
          </n-input>
        </div>

        <n-data-table
          :columns="userColumns"
          :data="filteredUsers"
          :loading="usersLoading"
          :bordered="false"
          :pagination="{ pageSize: 20 }"
          :max-height="500"
          size="small"
          style="margin-top: 12px"
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

          <!-- Stuck in queued -->
          <div class="monitor-block">
            <div class="monitor-block__title">
              Stuck in Queue (over 10 minutes)
              <n-tag v-if="docMonitor.stuck.length" type="warning" size="small" round style="margin-right:8px">{{ docMonitor.stuck.length }}</n-tag>
            </div>
            <n-data-table
              :columns="stuckDocsColumns"
              :data="docMonitor.stuck"
              :bordered="false"
              :pagination="{ pageSize: 10 }"
              size="small"
              style="margin-top:10px"
            />
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

    <!-- Role edit modal -->
    <n-modal v-model:show="showRoleModal" preset="dialog" title="Change User Role" style="width: 360px" :mask-closable="false" dir="ltr">
      <div style="padding: 8px 0">
        <p style="margin: 0 0 12px; font-size: 14px">
          <strong>{{ editingUser?.email }}</strong>
        </p>
        <n-select
          v-model:value="editingRole"
          :options="roleOptions"
          placeholder="Select role"
        />
      </div>
      <template #action>
        <n-button @click="showRoleModal = false">Cancel</n-button>
        <n-button type="primary" :loading="savingRole" @click="saveRole">Save</n-button>
      </template>
    </n-modal>

    <!-- User Detail Drawer -->
    <n-drawer v-model:show="showUserDrawer" :width="680" placement="right" dir="ltr">
      <n-drawer-content :title="userDetailUser ? (userDetailUser.email ?? userDetailUser.name ?? 'User Detail') : 'User Detail'" closable>
        <n-spin v-if="userDetailLoading" style="display:flex;justify-content:center;padding:60px" />
        <template v-else-if="userDetailData">
          <!-- Reminder status summary -->
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
            <n-tag v-for="(count, status) in userDetailData.reminderStatus" :key="status"
              :type="status === 'error' ? 'error' : status === 'pending' ? 'warning' : status === 'sent' ? 'success' : 'default'"
              size="small" round>
              {{ status }}: {{ count }}
            </n-tag>
            <span v-if="!Object.keys(userDetailData.reminderStatus).length" style="font-size:12px;color:var(--text-secondary)">No reminders</span>
          </div>

          <n-tabs type="line" size="small" animated>
            <!-- Documents tab -->
            <n-tab-pane name="docs" :tab="`Documents (${userDetailData.documents.length})`">
              <n-data-table
                :columns="userDetailDocColumns"
                :data="userDetailData.documents"
                :bordered="false"
                :pagination="{ pageSize: 15 }"
                :max-height="400"
                size="small"
                style="margin-top:10px"
              />
            </n-tab-pane>

            <!-- Email log tab -->
            <n-tab-pane name="email" :tab="`Emails (${userDetailData.emailLogs.length})`">
              <n-data-table
                :columns="userDetailEmailColumns"
                :data="userDetailData.emailLogs"
                :bordered="false"
                :pagination="{ pageSize: 15 }"
                :max-height="400"
                size="small"
                style="margin-top:10px"
                :row-class-name="(row: any) => row.success ? '' : 'row-error'"
              />
            </n-tab-pane>

            <!-- Extractions tab -->
            <n-tab-pane name="extractions" :tab="`AI Runs (${userDetailData.extractions.length})`">
              <n-data-table
                :columns="userDetailExtractionColumns"
                :data="userDetailData.extractions"
                :bordered="false"
                :pagination="{ pageSize: 15 }"
                :max-height="400"
                size="small"
                style="margin-top:10px"
                :row-class-name="(row: any) => row.parsed_ok ? '' : 'row-error'"
              />
            </n-tab-pane>

            <!-- Failed emails tab -->
            <n-tab-pane name="errors" :tab="`Errors (${userDetailData.failedEmails.length})`">
              <div v-if="userDetailData.failedEmails.length === 0" style="padding:40px;text-align:center;color:var(--text-secondary)">
                ✅ No failed emails
              </div>
              <div v-else>
                <div v-for="err in userDetailData.failedEmails" :key="err.id"
                     style="padding:10px 12px;background:rgba(208,48,80,0.04);border-left:3px solid #d03050;border-radius:4px;margin-bottom:8px">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                    <n-tag type="error" size="small" round>{{ err.log_type }}</n-tag>
                    <span style="font-size:11px;color:var(--text-secondary)">{{ err.sent_at ? new Date(err.sent_at).toLocaleString('en-US') : '—' }}</span>
                  </div>
                  <div style="font-size:12px;color:var(--text-secondary)">{{ err.recipient ?? '—' }}</div>
                  <div style="font-size:12px;color:#d03050;margin-top:2px;font-family:monospace">{{ err.error ?? 'Unknown error' }}</div>
                </div>
              </div>
            </n-tab-pane>

            <!-- Settings tab -->
            <n-tab-pane name="settings" tab="Settings">
              <div v-if="userSettingsForm" class="admin-user-settings">
                <div class="admin-user-settings__actions">
                  <n-button type="primary" size="small" :loading="savingUserSettings" @click="saveUserSettings">Save Settings</n-button>
                </div>

                <div class="admin-user-settings__section">
                  <div class="admin-user-settings__title">General</div>
                  <div class="admin-user-settings__grid">
                    <label class="admin-setting-control">
                      <span>Theme</span>
                      <n-select v-model:value="userSettingsForm.theme" :options="themeOptions" size="small" />
                    </label>
                    <label class="admin-setting-control">
                      <span>Email sender name</span>
                      <n-input v-model:value="userSettingsForm.email_from_name" size="small" placeholder="ReminderOCR" />
                    </label>
                    <label class="admin-setting-control">
                      <span>Reminder advance days</span>
                      <n-input v-model:value="userSettingsForm.reminder_advance_days" size="small" placeholder="[90,60,30]" />
                    </label>
                    <label class="admin-setting-control">
                      <span>OCR language</span>
                      <n-input v-model:value="userSettingsForm.ocr_language" size="small" placeholder="heb+eng" />
                    </label>
                  </div>
                  <div class="admin-user-settings__switches">
                    <label><n-switch v-model:value="userSettingsForm.calendar_next_tests_only" size="small" /> Calendar next tests only</label>
                    <label><n-switch v-model:value="userSettingsForm.pipeline_ocr" size="small" /> OCR</label>
                    <label><n-switch v-model:value="userSettingsForm.pipeline_ai" size="small" /> AI extraction</label>
                    <label><n-switch v-model:value="userSettingsForm.pipeline_s3" size="small" /> S3 upload</label>
                    <label><n-switch v-model:value="userSettingsForm.pipeline_entities" size="small" /> Entity creation</label>
                  </div>
                </div>

                <div class="admin-user-settings__section">
                  <div class="admin-user-settings__title">Monthly reports</div>
                  <div class="admin-user-settings__switches">
                    <label><n-switch v-model:value="userSettingsForm.monthly_report_enabled" size="small" /> Enabled</label>
                  </div>
                  <div class="admin-user-settings__grid">
                    <label class="admin-setting-control">
                      <span>Recipients</span>
                      <n-input v-model:value="userSettingsForm.monthly_report_recipients" size="small" placeholder="email@example.com" />
                    </label>
                    <label class="admin-setting-control">
                      <span>Day</span>
                      <n-input-number v-model:value="userSettingsForm.monthly_report_day" size="small" :min="1" :max="28" />
                    </label>
                    <label class="admin-setting-control">
                      <span>Hour</span>
                      <n-input-number v-model:value="userSettingsForm.monthly_report_hour" size="small" :min="0" :max="23" />
                    </label>
                    <label class="admin-setting-control">
                      <span>Formats</span>
                      <n-checkbox-group v-model:value="userSettingsForm.monthly_report_formats">
                        <n-space size="small">
                          <n-checkbox v-for="format in formatOptions" :key="format.value" :value="format.value">{{ format.label }}</n-checkbox>
                        </n-space>
                      </n-checkbox-group>
                    </label>
                  </div>
                </div>

                <div class="admin-user-settings__section">
                  <div class="admin-user-settings__title">Report fields</div>
                  <div class="admin-user-settings__subhead">All clients report</div>
                  <n-checkbox-group v-model:value="userSettingsForm.report_config.all_fields">
                    <div class="admin-user-settings__checks">
                      <n-checkbox v-for="field in allReportFieldOptions" :key="field.key" :value="field.key">{{ field.label }}</n-checkbox>
                    </div>
                  </n-checkbox-group>
                  <div class="admin-user-settings__subhead">Client report</div>
                  <n-checkbox-group v-model:value="userSettingsForm.report_config.client_fields">
                    <div class="admin-user-settings__checks">
                      <n-checkbox v-for="field in clientReportFieldOptions" :key="field.key" :value="field.key">{{ field.label }}</n-checkbox>
                    </div>
                  </n-checkbox-group>
                </div>

                <div class="admin-user-settings__section">
                  <div class="admin-user-settings__title">Client features</div>
                  <div class="admin-user-settings__checks">
                    <label v-for="feature in featureDefinitions" :key="feature.key" class="admin-feature-toggle">
                      <n-switch v-model:value="userSettingsForm.features[feature.key]" size="small" />
                      <span>
                        <strong>{{ feature.label_he || feature.label_en }}</strong>
                        <small>{{ feature.key }}</small>
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </n-tab-pane>

            <!-- Email Templates tab -->
            <n-tab-pane name="templates" tab="Templates">
              <div style="margin-top:12px">
                <div style="font-size:13px;font-weight:600;margin-bottom:8px">Default Email Template</div>
                <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">
                  Template used when a reminder is created for this user. Overrides the system default.
                </p>
                <div style="display:flex;gap:10px;align-items:center">
                  <n-select
                    v-model:value="userDefaultTemplateId"
                    :options="[{ label: '— System Default —', value: null }, ...emailTemplatesList.map(t => ({ label: t.name, value: t.id }))]"
                    placeholder="System Default"
                    clearable
                    style="flex:1"
                  />
                  <n-button type="primary" size="small" :loading="savingTemplate" @click="saveUserDefaultTemplate">Save</n-button>
                </div>

                <n-divider style="margin:20px 0 14px" />
                <div style="font-size:13px;font-weight:600;margin-bottom:10px">Available Templates ({{ emailTemplatesList.length }})</div>
                <div v-for="tpl in emailTemplatesList" :key="tpl.id"
                     style="padding:10px 12px;background:var(--bg-hover);border-radius:8px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
                  <div>
                    <div style="font-size:13px;font-weight:500">{{ tpl.name }}</div>
                    <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">{{ tpl.subject ?? '—' }}</div>
                  </div>
                  <div style="display:flex;gap:6px;align-items:center">
                    <n-tag v-if="tpl.is_default" type="success" size="small" round>Default</n-tag>
                    <n-tag v-if="userDefaultTemplateId === tpl.id" type="primary" size="small" round>User Default</n-tag>
                    <n-button size="tiny" @click="userDefaultTemplateId = tpl.id">Set</n-button>
                  </div>
                </div>
                <div v-if="emailTemplatesList.length === 0" style="padding:30px;text-align:center;color:var(--text-secondary)">
                  No email templates found
                </div>
              </div>
            </n-tab-pane>
          </n-tabs>
        </template>
      </n-drawer-content>
    </n-drawer>

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
import {computed, h, onMounted, onUnmounted, ref} from "vue";
import {useRouter} from "vue-router";
import type {DataTableColumns} from "naive-ui";
import {
  NButton,
  NCheckbox,
  NCheckboxGroup,
  NDataTable,
  NDivider,
  NDrawer,
  NDrawerContent,
  NIcon,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NSpace,
  NSpin,
  NSwitch,
  NTabPane,
  NTabs,
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
  FlashOutline,
  MenuOutline,
  NotificationsOutline,
  PeopleOutline,
  SearchOutline,
  SettingsOutline,
  TimerOutline,
} from "@vicons/ionicons5";
import {api} from "../services/apiService.js";
import DocumentDetailPage from "./DocumentDetailPage.vue";
import AdminStatCard from "../components/AdminStatCard.vue";
import AdminReportModal from "../components/AdminReportModal.vue";
import type {FeatureDefinition} from "@shared/types.js";

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
const sidebarItems = [
  { key: "users",              label: "Users",                  icon: PeopleOutline },
  { key: "documents",          label: "Documents & Extraction", icon: DocumentOutline },
  { key: "extraction_quality", label: "Extraction Quality",     icon: FlashOutline },
  { key: "reminders",          label: "Reminders",              icon: NotificationsOutline },
  { key: "scheduler",          label: "Scheduler",              icon: TimerOutline },
  { key: "monthly",            label: "Monthly Reports",        icon: CalendarOutline },
  { key: "settings",           label: "Settings",               icon: SettingsOutline },
];
const activeSection = ref("users");
const currentItem = computed(() => sidebarItems.find((i) => i.key === activeSection.value));
const sectionLoading = ref(false);

// ── Users ──────────────────────────────────────────────────────────────────
const users = ref<any[]>([]);
const usersLoading = ref(false);
const userSearch = ref("");

const filteredUsers = computed(() => {
  const q = userSearch.value.trim().toLowerCase();
  if (!q) return users.value;
  return users.value.filter(
    (u) => u.email?.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q),
  );
});

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

function resolveUserEmail(userId: string) {
  return users.value.find((u) => u.id === userId)?.email ?? userId?.slice(-6) ?? "—";
}

const roleOptions = [
  { label: "Regular User", value: "user" },
  { label: "Pro",          value: "pro"  },
  { label: "Admin",        value: "admin"},
];

const roleTagType: Record<string, "default" | "warning" | "error"> = {
  user:  "default",
  pro:   "default",
  admin: "warning",
};
const roleLabel: Record<string, string> = {
  user:  "User",
  pro:   "Pro",
  admin: "Admin",
};

const showRoleModal = ref(false);
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
const editingUser = ref<any>(null);
const editingRole = ref<string>("");
const savingRole = ref(false);

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

function openRoleModal(user: any) {
  editingUser.value = user;
  editingRole.value = user.role;
  showRoleModal.value = true;
}

async function saveRole() {
  if (!editingUser.value) return;
  savingRole.value = true;
  try {
    const updated = await api.admin.updateUser(editingUser.value.id, { role: editingRole.value });
    users.value = users.value.map((u) => (u.id === updated.id ? updated : u));
    showRoleModal.value = false;
    message.success("Role updated");
  } catch {
    message.error("Error updating role");
  } finally {
    savingRole.value = false;
  }
}

async function toggleActive(user: any) {
  const newActive = user.is_active === 0 ? 1 : 0;
  try {
    const updated = await api.admin.updateUser(user.id, { is_active: newActive });
    users.value = users.value.map((u) => (u.id === updated.id ? updated : u));
    message.success(newActive ? "User activated" : "User deactivated");
  } catch {
    message.error("Error updating status");
  }
}

// ── User detail drawer ─────────────────────────────────────────────────────
const showUserDrawer = ref(false);
const userDetailData = ref<any>(null);
const userDetailLoading = ref(false);
const userDetailUser = ref<any>(null);
const downloadingDocId = ref<string | null>(null);
const emailTemplatesList = ref<any[]>([]);
const featureDefinitions = ref<FeatureDefinition[]>([]);
const userDefaultTemplateId = ref<number | null>(null);
const savingTemplate = ref(false);
const savingUserSettings = ref(false);
const userSettingsForm = ref<any>(null);

const allReportFieldOptions = [
  {key: "tracking_date", label: "תאריך"},
  {key: "tracking_checked", label: "מה נבדק"},
  {key: "client", label: "לקוח"},
  {key: "contact_person", label: "איש קשר"},
  {key: "tracking_phone", label: "טלפון"},
  {key: "tracking_license_number", label: "מספר רישוי"},
  {key: "tracking_relevant", label: "רלוונטי"},
  {key: "tracking_notes", label: "הערות"},
  {key: "contract_number", label: "מספר חוזה"},
  {key: "contract_type", label: "סוג מסמך"},
  {key: "contact_phone", label: "טלפון קשר"},
  {key: "contact_email", label: "אימייל"},
  {key: "client_address", label: "כתובת"},
  {key: "start_date", label: "תאריך תסקיר"},
  {key: "expiry_date", label: "תאריך סיום / בדיקה הבאה"},
  {key: "status", label: "סטטוס"},
  {key: "source_document", label: "מסמך מקור"},
  {key: "equipment", label: "ציוד"},
  {key: "reminders", label: "תזכורות"},
];
const clientReportFieldOptions = [
  {key: "contract_number", label: "מספר חוזה"},
  {key: "contract_type", label: "סוג מסמך"},
  {key: "client", label: "לקוח"},
  {key: "contact_person", label: "איש קשר"},
  {key: "contact_phone", label: "טלפון"},
  {key: "contact_email", label: "אימייל"},
  {key: "client_address", label: "כתובת"},
  {key: "start_date", label: "תאריך תסקיר"},
  {key: "expiry_date", label: "תאריך סיום / בדיקה הבאה"},
  {key: "status", label: "סטטוס"},
  {key: "source_document", label: "מסמך מקור"},
  {key: "equipment", label: "ציוד"},
  {key: "reminders", label: "תזכורות"},
];
const defaultAllReportFields = [
  "tracking_date",
  "tracking_checked",
  "client",
  "contact_person",
  "tracking_phone",
  "tracking_license_number",
  "tracking_relevant",
  "tracking_notes",
];
const defaultClientReportFields = clientReportFieldOptions.map((field) => field.key);
const formatOptions = [
  {label: "DOCX", value: "docx"},
  {label: "XLSX", value: "xlsx"},
];
const themeOptions = [
  {label: "Light", value: "light"},
  {label: "Dark", value: "dark"},
];

function parseMonthlyFormats(raw: unknown): string[] {
  try {
    const parsed = Array.isArray(raw) ? raw : JSON.parse(String(raw ?? "[]"));
    const formats = Array.isArray(parsed) ? parsed.filter((format) => format === "docx" || format === "xlsx") : [];
    return formats.length ? formats : ["docx", "xlsx"];
  } catch {
    return ["docx", "xlsx"];
  }
}

function makeUserSettingsForm(settings: any) {
  const reportConfig = settings?.report_config ?? {};
  return {
    theme: settings?.theme === "dark" ? "dark" : "light",
    email_from_name: settings?.email_from_name ?? "",
    reminder_advance_days: settings?.reminder_advance_days ?? "[90,60,30]",
    ocr_language: settings?.ocr_language ?? "heb+eng",
    pipeline_ocr: settings?.pipeline_ocr ?? true,
    pipeline_ai: settings?.pipeline_ai ?? true,
    pipeline_s3: settings?.pipeline_s3 ?? true,
    pipeline_entities: settings?.pipeline_entities ?? true,
    calendar_next_tests_only: Boolean(settings?.calendar_next_tests_only),
    monthly_report_enabled: Boolean(settings?.monthly_report_enabled),
    monthly_report_recipients: settings?.monthly_report_recipients ?? "",
    monthly_report_day: Math.min(28, Math.max(1, Number(settings?.monthly_report_day ?? 1))),
    monthly_report_hour: Math.min(23, Math.max(0, Number(settings?.monthly_report_hour ?? 8))),
    monthly_report_formats: parseMonthlyFormats(settings?.monthly_report_formats),
    report_config: {
      all_fields: Array.isArray(reportConfig.all_fields) && reportConfig.all_fields.length ? [...reportConfig.all_fields] : [...defaultAllReportFields],
      client_fields: Array.isArray(reportConfig.client_fields) && reportConfig.client_fields.length ? [...reportConfig.client_fields] : [...defaultClientReportFields],
    },
    features: settings?.features && typeof settings.features === "object" && !Array.isArray(settings.features)
      ? {...settings.features}
      : {},
  };
}

function applyFeatureDefaultsToUserSettingsForm() {
  if (!userSettingsForm.value || !featureDefinitions.value.length) return;
  userSettingsForm.value.features = {
    ...Object.fromEntries(featureDefinitions.value.map((feature) => [feature.key, feature.default_enabled])),
    ...(userSettingsForm.value.features ?? {}),
  };
}

async function openUserDetail(user: any) {
  userDetailUser.value = user;
  showUserDrawer.value = true;
  userDetailLoading.value = true;
  userDetailData.value = null;
  userDefaultTemplateId.value = null;
  userSettingsForm.value = null;
  const [detailResult, settingsResult] = await Promise.allSettled([
    api.admin.getUserDetail(user.id),
    api.admin.getUserSettings(user.id),
  ]);

  if (detailResult.status === "fulfilled") {
    userDetailData.value = detailResult.value;
  } else {
    console.error("Failed to load admin user detail", detailResult.reason);
    message.error("Failed to load user detail");
  }

  if (settingsResult.status === "fulfilled") {
    userDefaultTemplateId.value = settingsResult.value.default_email_template_id ?? null;
    userSettingsForm.value = makeUserSettingsForm(settingsResult.value);
    applyFeatureDefaultsToUserSettingsForm();
  } else {
    console.error("Failed to load admin user settings", settingsResult.reason);
    message.error("Failed to load user settings");
  }

  userDetailLoading.value = false;

  if (!emailTemplatesList.value.length) {
    try {
      const templates = await api.emailTemplates.list();
      emailTemplatesList.value = Array.isArray(templates) ? templates : [];
    } catch (err) {
      console.warn("Failed to load email templates for admin user detail", err);
      emailTemplatesList.value = [];
    }
  }

  if (!featureDefinitions.value.length) {
    try {
      const response = await api.admin.listFeatures();
      featureDefinitions.value = [...(response.rows ?? [])].sort((a, b) => a.sort_order - b.sort_order);
      applyFeatureDefaultsToUserSettingsForm();
    } catch (err) {
      console.warn("Failed to load feature definitions for admin user settings", err);
      featureDefinitions.value = [];
    }
  }
}

async function saveUserDefaultTemplate() {
  if (!userDetailUser.value) return;
  savingTemplate.value = true;
  try {
    await api.admin.setUserDefaultTemplate(userDetailUser.value.id, userDefaultTemplateId.value);
    message.success("Default template saved");
  } catch {
    message.error("Failed to save template");
  } finally {
    savingTemplate.value = false;
  }
}

async function saveUserSettings() {
  if (!userDetailUser.value || !userSettingsForm.value) return;
  savingUserSettings.value = true;
  try {
    const form = userSettingsForm.value;
    await api.admin.saveUserSettings(userDetailUser.value.id, {
      theme: form.theme,
      email_from_name: form.email_from_name || null,
      reminder_advance_days: form.reminder_advance_days || "[90,60,30]",
      ocr_language: form.ocr_language || "heb+eng",
      pipeline_ocr: Boolean(form.pipeline_ocr),
      pipeline_ai: Boolean(form.pipeline_ai),
      pipeline_s3: Boolean(form.pipeline_s3),
      pipeline_entities: Boolean(form.pipeline_entities),
      calendar_next_tests_only: Boolean(form.calendar_next_tests_only),
      monthly_report_enabled: Boolean(form.monthly_report_enabled),
      monthly_report_recipients: form.monthly_report_recipients ?? "",
      monthly_report_day: form.monthly_report_day,
      monthly_report_hour: form.monthly_report_hour,
      monthly_report_formats: JSON.stringify(form.monthly_report_formats?.length ? form.monthly_report_formats : ["docx"]),
      report_config: {
        all_fields: form.report_config?.all_fields ?? [],
        client_fields: form.report_config?.client_fields ?? [],
      },
      features: form.features ?? {},
      default_email_template_id: userDefaultTemplateId.value,
    });
    message.success("User settings saved");
  } catch (error) {
    message.error(error instanceof Error ? error.message : "Failed to save user settings");
  } finally {
    savingUserSettings.value = false;
  }
}

async function downloadDoc(docId: string) {
  downloadingDocId.value = docId;
  try {
    const { url } = await api.admin.downloadDocument(docId);
    if (url) window.open(url, "_blank");
    else message.error("No S3 file for this document");
  } catch {
    message.error("Failed to get download URL");
  } finally {
    downloadingDocId.value = null;
  }
}

const userDetailDocColumns: DataTableColumns<any> = [
  { title: "File", key: "filename", align: "left", ellipsis: { tooltip: true }, minWidth: 130,
    render: (row) => h("span", { style: "font-size:12px" }, row.filename ?? "—") },
  { title: "Status", key: "status", align: "center", width: 90,
    render: (row) => h(NTag, {
      type: row.status === "done" ? "success" : row.status === "error" ? "error" : row.status === "processing" ? "warning" : "default",
      size: "small", round: true,
    }, { default: () => row.status }) },
  { title: "Coverage", key: "field_coverage", align: "center", width: 90,
    render: (row) => {
      const fc = row.field_coverage;
      if (!fc) return h("span", { style: "font-size:11px;color:var(--text-secondary)" }, "—");
      const color = fc.coverage_pct >= 80 ? "#18a058" : fc.coverage_pct >= 50 ? "#f0a020" : "#d03050";
      const tooltip = [
        fc.missing.length ? `Missing: ${fc.missing.join(", ")}` : "",
        fc.nulled.length ? `Empty: ${fc.nulled.join(", ")}` : "",
        fc.present.length ? `OK: ${fc.present.join(", ")}` : "",
      ].filter(Boolean).join("\n");
      return h("span", {
        title: tooltip,
        style: `font-size:11px;font-weight:600;color:${color};cursor:default`,
      }, `${fc.coverage_pct}% (${fc.present.length}/${fc.total_fields})`);
    }},
  { title: "Missing", key: "missing_fields", align: "left", minWidth: 120, ellipsis: { tooltip: true },
    render: (row) => {
      const fc = row.field_coverage;
      if (!fc || (!fc.missing.length && !fc.nulled.length)) return h("span", { style: "color:#18a058;font-size:11px" }, "✓ all present");
      const all = [...fc.missing, ...fc.nulled.map((k: string) => `${k}(null)`)];
      return h("span", { style: "font-size:11px;color:#d03050", title: all.join(", ") }, all.join(", "));
    }},
  { title: "Date", key: "created_at", align: "left", width: 85,
    render: (row) => h("span", { style: "font-size:11px;color:var(--text-secondary)" },
      row.created_at ? new Date(row.created_at).toLocaleDateString("en-US") : "—") },
  { title: "↓", key: "download", align: "center", width: 50,
    render: (row) => row.has_s3
      ? h(NButton, { size: "tiny", loading: downloadingDocId.value === row.id, onClick: () => downloadDoc(row.id) }, { default: () => "↓" })
      : h("span", { style: "font-size:11px;color:var(--text-secondary)" }, "—") },
];

const userDetailEmailColumns: DataTableColumns<any> = [
  { title: "Type", key: "log_type", align: "center", width: 110,
    render: (row) => h(NTag, {
      type: row.success ? "success" : "error", size: "small", round: true,
    }, { default: () => (row.success ? "✓ " : "✗ ") + (row.log_type ?? "—") }) },
  { title: "Recipient", key: "recipient", align: "left", minWidth: 120, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, row.recipient ?? "—") },
  { title: "Error", key: "error", align: "left", minWidth: 140, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: `font-size:11px;color:${row.error ? "#d03050" : "var(--text-secondary)"}` }, row.error ?? "OK") },
  { title: "Date", key: "sent_at", align: "left", width: 90,
    render: (row) => h("span", { style: "font-size:11px;color:var(--text-secondary)" },
      row.sent_at ? new Date(row.sent_at).toLocaleDateString("en-US") : "—") },
];

const userDetailExtractionColumns: DataTableColumns<any> = [
  { title: "Backend", key: "backend", align: "left", width: 90,
    render: (row) => h("span", { style: "font-size:12px" }, row.backend ?? "—") },
  { title: "Model", key: "model", align: "left", width: 110, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:11px;color:var(--text-secondary)" }, row.model ?? "—") },
  { title: "OK", key: "parsed_ok", align: "center", width: 55,
    render: (row) => h(NTag, { type: row.parsed_ok ? "success" : "error", size: "small", round: true },
      { default: () => row.parsed_ok ? "✓" : "✗" }) },
  { title: "Time", key: "exec_ms", align: "right", width: 70,
    render: (row) => h("span", { style: `font-size:11px;color:${(row.exec_ms ?? 0) > 30000 ? "#f0a020" : "var(--text-secondary)"}` },
      row.exec_ms ? (row.exec_ms / 1000).toFixed(1) + "s" : "—") },
  { title: "Error", key: "error", align: "left", minWidth: 120, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:11px;color:#d03050" }, row.error ?? "") },
  { title: "Date", key: "created_at", align: "left", width: 90,
    render: (row) => h("span", { style: "font-size:11px;color:var(--text-secondary)" },
      row.created_at ? new Date(row.created_at).toLocaleDateString("en-US") : "—") },
];

const userColumns: DataTableColumns<any> = [
  {
    title: "Email", key: "email", align: "left", minWidth: 160, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:13px" }, row.email ?? "—"),
  },
  {
    title: "Name", key: "name", align: "left", minWidth: 120, ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:13px" }, row.name ?? "—"),
  },
  {
    title: "Role", key: "role", align: "center", width: 100,
    render: (row) =>
      h(NTag, { type: roleTagType[row.role] ?? "default", size: "small", round: true },
        { default: () => roleLabel[row.role] ?? row.role }),
  },
  {
    title: "Status", key: "is_active", align: "center", width: 90,
    render: (row) =>
      h(NTag, { type: row.is_active === 0 ? "error" : "default", size: "small", round: true },
        { default: () => row.is_active === 0 ? "Inactive" : "Active" }),
  },
  {
    title: "Registered", key: "created_at", align: "left", width: 110,
    render: (row) =>
      h("span", { style: "font-size:12px; color: var(--text-secondary)" },
        row.created_at ? new Date(row.created_at).toLocaleDateString("en-US") : "—"),
  },
  {
    title: "Actions", key: "actions", align: "center", width: 340,
    render: (row) =>
      h("div", { style: "display:flex; gap:6px; justify-content:center; flex-wrap:wrap" }, [
        h(NTooltip, { placement: "top", keepAliveOnHover: false }, {
          trigger: () => h(NButton, { size: "tiny", type: "primary", ghost: true, onClick: () => openUserDetail(row) }, { default: () => "Details" }),
          default: () => "View documents, emails, extractions and errors for this user",
        }),
        h(NTooltip, { placement: "top", keepAliveOnHover: false }, {
          trigger: () => h(NButton, { size: "tiny", type: "default", onClick: () => openReportModal(row) }, { default: () => "📧 Report" }),
          default: () => "Send a monthly report email on behalf of this user",
        }),
        h(NTooltip, { placement: "top", keepAliveOnHover: false }, {
          trigger: () => h(NButton, { size: "tiny", onClick: () => openRoleModal(row) }, { default: () => "Role" }),
          default: () => "Change this user's role (user / pro / admin)",
        }),
        h(NTooltip, { placement: "top", keepAliveOnHover: false }, {
          trigger: () => h(NButton, {
            size: "tiny", type: row.is_active === 0 ? "primary" : "error", ghost: true,
            onClick: () => toggleActive(row),
          }, { default: () => row.is_active === 0 ? "Activate" : "Deactivate" }),
          default: () => row.is_active === 0 ? "Re-enable this user's access" : "Block this user from logging in",
        }),
      ]),
  },
];

// ── Stats ──────────────────────────────────────────────────────────────────
const systemStats = computed(() => [
  { label: "Total Users",   value: users.value.length,                                  icon: PeopleOutline },
  { label: "Admins",        value: users.value.filter((u) => u.role === "admin").length, icon: PeopleOutline },
  { label: "Pro Users",     value: users.value.filter((u) => u.role === "pro").length,   icon: PeopleOutline },
  { label: "Inactive",      value: users.value.filter((u) => u.is_active === 0).length,  icon: PeopleOutline },
]);

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
    title: "File / User", key: "filename", align: "left", ellipsis: { tooltip: true },
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
  { title: "User", key: "user", align: "left", ellipsis: { tooltip: true } },
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
    title: "User", key: "user_id", align: "left", width: 130,
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "File", key: "filename", align: "left", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, row.filename ?? "—"),
  },
  {
    title: "Error", key: "error", align: "left", ellipsis: { tooltip: true },
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
    title: "User", key: "user_id", align: "left", width: 130,
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "File", key: "filename", align: "left", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, row.filename ?? "—"),
  },
  {
    title: "Upload Date", key: "created_at", align: "left", width: 130,
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
  { title: "User", key: "user_id", align: "left", width: 130, render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)) },
  { title: "Backend", key: "backend", align: "left", width: 110, render: (row) => h("span", { style: "font-size:12px" }, row.backend ?? "—") },
  { title: "Model", key: "model", align: "left", width: 120, render: (row) => h("span", { style: "font-size:12px" }, row.model ?? "—") },
  { title: "Error", key: "error", align: "left", ellipsis: { tooltip: true }, render: (row) => h("span", { style: "font-size:12px;color:var(--error-color,#d03050)" }, row.error ?? "—") },
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
  { title: "User", key: "user_id", align: "left", width: 130, render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)) },
  { title: "File", key: "filename", align: "left", ellipsis: { tooltip: true }, render: (row) => h("span", { style: "font-size:12px" }, row.filename ?? "—") },
  { title: "Date", key: "created_at", align: "left", width: 110, render: (row) => h("span", { style: "font-size:12px;color:var(--text-secondary)" }, row.created_at ? new Date(row.created_at).toLocaleDateString("en-US") : "—") },
];

const skippedReminderColumns: DataTableColumns<any> = [
  { title: "User", key: "user_id", align: "left", width: 130, render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)) },
  { title: "Note", key: "note", align: "left", ellipsis: { tooltip: true }, render: (row) => h("span", { style: "font-size:12px;color:var(--text-secondary)" }, row.note ?? "—") },
  { title: "Date", key: "created_at", align: "left", width: 110, render: (row) => h("span", { style: "font-size:12px;color:var(--text-secondary)" }, row.created_at ? new Date(row.created_at).toLocaleDateString("en-US") : "—") },
];

const missingEmailColumns: DataTableColumns<any> = [
  { title: "User", key: "user_id", align: "left", width: 130, render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)) },
  { title: "File", key: "filename", align: "left", ellipsis: { tooltip: true }, render: (row) => h("span", { style: "font-size:12px" }, row.filename ?? "—") },
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
  { title: "User", key: "user_id", align: "left", width: 130, render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)) },
  { title: "File", key: "filename", align: "left", ellipsis: { tooltip: true }, render: (row) => h("span", { style: "font-size:12px" }, row.filename ?? "—") },
  { title: "Type", key: "document_type", align: "left", width: 130, render: (row) => h("span", { style: "font-size:12px" }, row.document_type ?? "—") },
  { title: "Reminder Date", key: "reminder_date", align: "left", width: 120, render: (row) => h("span", { style: "font-size:12px;color:var(--text-secondary)" }, row.reminder_date ?? "—") },
  { title: "Uploaded", key: "created_at", align: "left", width: 110, render: (row) => h("span", { style: "font-size:12px;color:var(--text-secondary)" }, row.created_at ? new Date(row.created_at).toLocaleDateString("en-US") : "—") },
  {
    title: "View", key: "action", align: "center", width: 80,
    render: (row) => h(NButton, { size: "tiny", onClick: () => openDocModal(row.id) }, { default: () => "Open" }),
  },
];

const contractAdvanceColumns: DataTableColumns<any> = [
  { title: "User", key: "user_id", align: "left", width: 130, render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)) },
  { title: "Previous Expiry", key: "previous_expiry", align: "left", width: 130, render: (row) => h("span", { style: "font-size:12px" }, row.previous_expiry ?? "—") },
  { title: "New Expiry", key: "new_expiry", align: "left", width: 120, render: (row) => h("span", { style: "font-size:12px;font-weight:600;color:#18a058" }, row.new_expiry ?? "—") },
  { title: "Interval", key: "interval_months", align: "center", width: 90, render: (row) => h("span", { style: "font-size:12px" }, row.interval_months ? `${row.interval_months}mo` : "—") },
  { title: "Date", key: "advanced_at", align: "left", width: 120, render: (row) => h("span", { style: "font-size:12px;color:var(--text-secondary)" }, row.advanced_at ? new Date(row.advanced_at).toLocaleDateString("en-US") : "—") },
];

const failedEscalationColumns: DataTableColumns<any> = [
  { title: "User", key: "user_id", align: "left", width: 130, render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)) },
  { title: "Recipient", key: "recipient", align: "left", ellipsis: { tooltip: true }, render: (row) => h("span", { style: "font-size:12px" }, row.recipient ?? "—") },
  { title: "Error", key: "error", align: "left", ellipsis: { tooltip: true }, render: (row) => h("span", { style: "font-size:12px;color:var(--error-color,#d03050)" }, row.error ?? "—") },
  { title: "Date", key: "sent_at", align: "left", width: 130, render: (row) => h("span", { style: "font-size:12px;color:var(--text-secondary)" }, row.sent_at ? new Date(row.sent_at).toLocaleString("en-US") : "—") },
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
  { title: "User", key: "user_id", align: "left", minWidth: 180, ellipsis: { tooltip: true }, render: (row) => h("span", { style: "font-size:12px;white-space:nowrap" }, resolveUserEmail(row.user_id)) },
  { title: "Enabled", key: "enabled", align: "center", width: 90, render: (row) => h(NTag, { type: row.enabled ? "default" : "error", size: "small", round: true }, { default: () => row.enabled ? "Yes" : "No" }) },
  { title: "Recipients", key: "recipients", align: "left", ellipsis: { tooltip: true }, render: (row) => {
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
  { title: "User", key: "user", align: "left", ellipsis: { tooltip: true } },
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
    title: "User", key: "user_id", align: "left", width: 130,
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "Type", key: "doc_type", align: "left", width: 110,
    render: (row) => h("span", { style: "font-size:12px" }, row.doc_type ?? "—"),
  },
  {
    title: "Note", key: "note", align: "left", ellipsis: { tooltip: true },
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
    title: "User", key: "user_id", align: "left", width: 130,
    render: (row) => h("span", { style: "font-size:12px" }, resolveUserEmail(row.user_id)),
  },
  {
    title: "Recipient", key: "recipient", align: "left", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px" }, row.recipient ?? "—"),
  },
  {
    title: "Error", key: "error", align: "left", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px; color: var(--error-color,#d03050)" }, row.error ?? "—"),
  },
  {
    title: "Date", key: "sent_at", align: "left", width: 130,
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
    title: "Last Error", key: "last_error", align: "left", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px; color:var(--error-color,#d03050)" }, row.last_error ?? "—"),
  },
];

const monthlyScheduleColumns: DataTableColumns<any> = [
  {
    title: "User", key: "user_id", align: "left", minWidth: 180, ellipsis: { tooltip: true },
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
    title: "Last Error", key: "last_error", align: "left", ellipsis: { tooltip: true },
    render: (row) => h("span", { style: "font-size:12px; color: var(--error-color,#d03050)" }, row.last_error ?? "—"),
  },
];

// ── Monthly reports monitor ────────────────────────────────────────────────
const monthlyMonitor = ref<any>(null);

// ── Extraction quality ─────────────────────────────────────────────────────
const extractionQuality = ref<any>(null);

// ── Pipeline gaps ──────────────────────────────────────────────────────────
const pipelineGaps = ref<any>(null);

// ── Contract advances ──────────────────────────────────────────────────────
const contractAdvances = ref<any[]>([]);

// ── Admin settings ─────────────────────────────────────────────────────────
const adminSettings = ref<any>(null);

// ── Action loading states ──────────────────────────────────────────────────
const reprocessingIds = ref<Set<string>>(new Set());
const retryingIds = ref<Set<string>>(new Set());
const triggeringReportIds = ref<Set<string>>(new Set());

// ── Report modal ───────────────────────────────────────────────────────────
const showReportModal = ref(false);
const reportModalUser = ref<{ id: string; name: string } | null>(null);

function openReportModal(user: any) {
  reportModalUser.value = { id: user.id ?? user.user_id, name: user.name ?? user.email ?? user.user_id };
  showReportModal.value = true;
}

const monthlyScheduleDetailColumns: DataTableColumns<any> = [
  {
    title: "User", key: "user_id", align: "left", minWidth: 180, ellipsis: { tooltip: true },
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
    title: "Recipients", key: "recipients", align: "left", ellipsis: { tooltip: true },
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
    title: "Error", key: "last_error", align: "left", ellipsis: { tooltip: true },
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

async function triggerMonthlyReport(userId: string) {
  triggeringReportIds.value = new Set([...triggeringReportIds.value, userId]);
  try {
    const res = await api.admin.triggerMonthlyReport(userId);
    if (res.success) message.success(`Report sent (${res.count} contracts)`);
    else message.warning(res.error ?? "Sent with issues");
  } catch {
    message.error("Trigger failed");
  } finally {
    const s = new Set(triggeringReportIds.value);
    s.delete(userId);
    triggeringReportIds.value = s;
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
  width: 220px;
  flex: 0 0 220px;
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
  font-size: 15px;
  font-weight: 700;
  color: var(--brand-color);
  cursor: pointer;
  border-bottom: 1px solid var(--border-color);
}

.admin-sidebar__nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 12px 10px;
  gap: 4px;
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
  font-size: 14px;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background 0.15s, color 0.15s;
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
  padding: 10px;
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
  padding: 14px 20px 10px;
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
  font-size: 16px;
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
  padding: 14px 20px 24px;
  direction: ltr;
}

.admin-section__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* ── Stats grid ──────────────────────────────────────────────────────────── */
.admin-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.admin-stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.admin-stat-card__icon {
  color: var(--brand-color);
  flex: 0 0 auto;
}

.admin-stat-card__num {
  font-size: 26px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}

.admin-stat-card__label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

/* ── Monitor blocks ──────────────────────────────────────────────────────── */
.monitor-block {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 14px;
}

.monitor-block__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ── Env badge ───────────────────────────────────────────────────────────── */
.admin-env-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 10px 8px;
  padding: 6px 10px;
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
  left: 204px;
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
    padding: 8px 4px;
  }

  .admin-data-table {
    font-size: 12px;
  }

  /* Naive UI clamps its scrollbar content to the container width, squeezing
     columns until they wrap one char per line. Let the content grow to the
     table's natural width so columns keep their size and the row scrolls
     horizontally instead. */
  .admin-shell :deep(.n-data-table-base-table-body .n-scrollbar-content),
  .admin-shell :deep(.n-data-table-base-table-header .n-scrollbar-content) {
    min-width: max-content;
  }
  .admin-shell :deep(.n-data-table-th),
  .admin-shell :deep(.n-data-table-td) {
    white-space: nowrap;
  }

}

.user-stat-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
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
  gap: 14px;
  padding: 4px 0 12px;
}

.admin-user-settings__actions {
  display: flex;
  justify-content: flex-end;
}

.admin-user-settings__section {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
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
  gap: 10px;
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
  gap: 8px;
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
  padding: 8px 12px;
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
</style>
