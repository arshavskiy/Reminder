<template>
  <div class="uf" dir="ltr">
    <!-- User picker -->
    <aside class="uf-list">
      <div class="uf-list__head">
        <n-input
          v-model:value="search"
          clearable
          placeholder="Search users..."
          size="small"
        >
          <template #prefix><n-icon :component="SearchOutline" :size="14" /></template>
        </n-input>
        <div class="uf-list__stats">
          <span>{{ filteredUsers.length }} users</span>
          <button class="btn btn--ghost btn--xs" type="button" :disabled="loading" @click="$emit('refresh')">
            <n-icon :component="RefreshOutline" :size="14" :class="{ 'uf-spin': loading }" class="btn-icon" />
          </button>
        </div>
      </div>
      <div class="uf-list__body">
        <button
          v-for="u in filteredUsers"
          :key="u.id"
          type="button"
          class="uf-user"
          :class="{ 'uf-user--active': selectedId === u.id, 'uf-user--inactive': u.is_active === 0 }"
          @click="selectUser(u)"
        >
          <span class="uf-user__avatar">{{ initials(u) }}</span>
          <span class="uf-user__meta">
            <strong class="uf-user__email">{{ u.email || u.username || u.name || u.id }}</strong>
            <span class="uf-user__sub">
              {{ roleLabel[u.role] ?? u.role }}
              · {{ planLabel[userPlan(u)] ?? userPlan(u) }}
              <span v-if="u.is_active === 0"> · inactive</span>
            </span>
          </span>
        </button>
        <div v-if="!filteredUsers.length" class="uf-list__empty">No users</div>
      </div>
    </aside>

    <!-- Focus panel -->
    <main class="uf-main">
      <div v-if="!selectedUser" class="uf-empty">
        <n-icon :component="PeopleOutline" :size="40" class="uf-empty__icon" />
        <h3>Select a user</h3>
        <p>Pick a user on the left to see documents, emails, storage, reminders, reports, and settings in one place.</p>
      </div>

      <template v-else>
        <header class="uf-hero">
          <div class="uf-hero__copy">
            <h2 class="uf-hero__title">{{ selectedUser.email || selectedUser.username || selectedUser.name }}</h2>
            <div class="uf-hero__tags">
              <n-tag :type="roleTagType[selectedUser.role] ?? 'default'" size="small" round>
                {{ roleLabel[selectedUser.role] ?? selectedUser.role }}
              </n-tag>
              <n-tag :type="planTagType[userPlan(selectedUser)] ?? 'default'" size="small" round>
                {{ planLabel[userPlan(selectedUser)] ?? userPlan(selectedUser) }}
              </n-tag>
              <n-tag :type="selectedUser.is_active === 0 ? 'error' : 'success'" size="small" round>
                {{ selectedUser.is_active === 0 ? "Inactive" : "Active" }}
              </n-tag>
              <span v-if="selectedUser.created_at" class="uf-hero__muted">
                Joined {{ new Date(selectedUser.created_at).toLocaleDateString("en-US") }}
              </span>
            </div>
          </div>
          <div class="uf-hero__actions">
            <button class="btn btn--ghost btn--xs" type="button" :disabled="busy" @click="reloadAll">
              <n-icon :component="RefreshOutline" :size="14" :class="{ 'uf-spin': busy }" class="btn-icon" />
              Refresh
            </button>
            <button class="btn btn--ghost btn--xs" type="button" @click="$emit('open-report', selectedUser)">
              Send report
            </button>
            <button
              class="btn btn--ghost btn--xs"
              type="button"
              :disabled="issuingMagicLink || selectedUser.is_active === 0"
              :title="selectedUser.is_active === 0 ? 'User is inactive' : ''"
              @click="issueMagicLink"
            >
              {{ issuingMagicLink ? "Issuing…" : "Magic link" }}
            </button>
            <button
              class="btn btn--xs"
              :class="selectedUser.is_active === 0 ? 'btn--primary' : 'btn--danger-ghost'"
              type="button"
              @click="toggleActive"
            >
              {{ selectedUser.is_active === 0 ? "Activate" : "Deactivate" }}
            </button>
          </div>
        </header>

        <div v-if="magicLinkResult && magicLinkResult.userId === selectedUser.id" class="uf-magiclink">
          <n-icon :component="KeyOutline" :size="14" class="uf-magiclink__icon" />
          <code class="uf-magiclink__value">{{ magicLinkResult.link }}</code>
          <button class="btn btn--ghost btn--xs" type="button" @click="copyMagicLink">Copy</button>
          <button class="btn btn--ghost btn--xs" type="button" @click="magicLinkResult = null">✕</button>
          <span class="uf-magiclink__note">Reusable, expires {{ formatExpiry(magicLinkResult.expiresAt) }}</span>
        </div>

        <n-spin :show="busy">
          <!-- Overview stats -->
          <div v-if="detail?.counts" class="uf-stats">
            <div class="uf-stat"><span class="uf-stat__n">{{ detail.counts.documents }}</span><span class="uf-stat__l">Documents</span></div>
            <div class="uf-stat"><span class="uf-stat__n">{{ detail.counts.clients }}</span><span class="uf-stat__l">Clients</span></div>
            <div class="uf-stat"><span class="uf-stat__n">{{ detail.counts.contracts }}</span><span class="uf-stat__l">Contracts</span></div>
            <div class="uf-stat"><span class="uf-stat__n">{{ detail.counts.equipment }}</span><span class="uf-stat__l">Equipment</span></div>
            <div class="uf-stat"><span class="uf-stat__n">{{ formatBytes(detail.counts.total_storage_bytes) }}</span><span class="uf-stat__l">Storage</span></div>
            <div class="uf-stat"><span class="uf-stat__n">{{ detail.counts.invoices ?? 0 }}</span><span class="uf-stat__l">Invoices</span></div>
            <div class="uf-stat"><span class="uf-stat__n">{{ detail.counts.emails }}</span><span class="uf-stat__l">Emails</span></div>
            <div class="uf-stat"><span class="uf-stat__n">{{ detail.active_sessions }}</span><span class="uf-stat__l">Sessions</span></div>
            <div v-if="queueStuck > 0" class="uf-stat uf-stat--warn">
              <span class="uf-stat__n">{{ queueStuck }}</span><span class="uf-stat__l">No job row</span>
            </div>
            <div class="uf-stat" :class="{ 'uf-stat--warn': orphansCount > 0 }">
              <span class="uf-stat__n">{{ orphansCount }}</span><span class="uf-stat__l">S3 orphans</span>
            </div>
          </div>

          <div v-if="detail?.reminderStatus && Object.keys(detail.reminderStatus).length" class="uf-pills">
            <n-tag
              v-for="(count, status) in detail.reminderStatus"
              :key="status"
              :type="status === 'error' ? 'error' : status === 'pending' || status === 'no_email' ? 'warning' : status === 'sent' ? 'success' : 'default'"
              size="small"
              round
            >
              {{ status }}: {{ count }}
            </n-tag>
          </div>

          <n-tabs v-model:value="tab" type="line" animated class="uf-tabs">
            <n-tab-pane name="overview" tab="Overview">
              <div class="uf-grid">
                <section class="uf-card">
                  <h3 class="uf-card__title">Pipeline snapshot</h3>
                  <ul class="uf-kv">
                    <li><span>Failed docs</span><strong>{{ userFailedDocs.length }}</strong></li>
                    <li><span>Stuck docs</span><strong>{{ userStuckDocs.length }}</strong></li>
                    <li><span>Failed sends</span><strong>{{ userFailedSends.length }}</strong></li>
                    <li><span>Pending reminders</span><strong>{{ userPendingReminders.length }}</strong></li>
                    <li><span>Bad client emails</span><strong>{{ userBadClients.length }}</strong></li>
                    <li><span>S3 files</span><strong>{{ storageFiles.length }}{{ storageTruncated ? "+" : "" }}</strong></li>
                    <li v-if="queueStuck > 0" class="uf-kv__warn">
                      <span>Queued, no job row</span><strong>{{ queueStuck }}</strong>
                    </li>
                  </ul>
                </section>
                <section v-if="detail?.import_queue" class="uf-card">
                  <h3 class="uf-card__title">Import queue</h3>
                  <div v-if="Object.keys(detail.import_queue.by_status).length" class="uf-pills" style="margin:0 0 10px">
                    <n-tag
                      v-for="(n, status) in detail.import_queue.by_status"
                      :key="status"
                      :type="status === 'failed' ? 'error' : status === 'retry_wait' ? 'warning' : status === 'completed' ? 'success' : 'default'"
                      size="small"
                      round
                    >
                      {{ status }}: {{ n }}
                    </n-tag>
                  </div>
                  <p v-else class="uf-muted">No processing jobs for this user.</p>
                  <ul v-if="detail.storage" class="uf-kv">
                    <li><span>Drive synced</span><strong>{{ detail.storage.drive_synced }} / {{ detail.storage.documents_total }}</strong></li>
                    <li><span>Missing storage key</span><strong>{{ detail.storage.without_spaces_key }}</strong></li>
                    <li><span>Legacy key layout</span><strong>{{ detail.storage.legacy_layout_keys }}</strong></li>
                  </ul>
                </section>
                <section class="uf-card">
                  <h3 class="uf-card__title">Monthly report</h3>
                  <template v-if="userSchedule">
                    <ul class="uf-kv">
                      <li><span>Enabled</span><strong>{{ userSchedule.enabled ? "Yes" : "No" }}</strong></li>
                      <li><span>Day / hour</span><strong>{{ userSchedule.day ?? "—" }} / {{ userSchedule.hour != null ? `${userSchedule.hour}:00` : "—" }}</strong></li>
                      <li><span>Last sent</span><strong>{{ userSchedule.last_sent ? new Date(userSchedule.last_sent).toLocaleString("en-US") : "—" }}</strong></li>
                      <li><span>Last error</span><strong class="uf-err">{{ userSchedule.last_error || "—" }}</strong></li>
                    </ul>
                  </template>
                  <p v-else class="uf-muted">No monthly schedule row for this user.</p>
                </section>
                <section class="uf-card uf-card--wide">
                  <h3 class="uf-card__title">Recent failed emails</h3>
                  <div v-if="!(detail?.failedEmails?.length)" class="uf-muted">No failed emails</div>
                  <div v-else class="uf-error-list">
                    <div v-for="err in detail.failedEmails.slice(0, 8)" :key="err.id" class="uf-error-item">
                      <div class="uf-error-item__top">
                        <n-tag type="error" size="small" round>{{ err.log_type }}</n-tag>
                        <span>{{ err.sent_at ? new Date(err.sent_at).toLocaleString("en-US") : "—" }}</span>
                      </div>
                      <div>{{ err.recipient ?? "—" }}</div>
                      <code>{{ err.error ?? "Unknown error" }}</code>
                    </div>
                  </div>
                </section>
              </div>
            </n-tab-pane>

            <n-tab-pane name="invoices" :tab="`Invoices (${detail?.invoices?.total ?? 0})`">
              <div v-if="!detail?.invoices?.total" class="uf-muted">No invoices for this user.</div>
              <template v-else>
                <div class="uf-pills" style="margin-bottom:12px">
                  <n-tag size="small" round>Total: {{ detail.invoices.total }}</n-tag>
                  <n-tag size="small" round>With amount: {{ detail.invoices.with_amount }}</n-tag>
                  <n-tag size="small" round type="info">
                    Sum: {{ detail.invoices.total_amount.toLocaleString("en-US") }}
                  </n-tag>
                  <n-tag
                    v-for="(n, flow) in detail.invoices.by_cash_flow"
                    :key="flow"
                    size="small"
                    round
                    :type="flow === 'income' ? 'success' : 'default'"
                  >
                    {{ flow }}: {{ n }}
                  </n-tag>
                </div>

                <div v-if="detail.invoices.by_subtype.length" class="uf-pills" style="margin-bottom:12px">
                  <n-tag v-for="r in detail.invoices.by_subtype" :key="r.subtype" size="small" round>
                    {{ r.subtype }}: {{ r.count }}
                  </n-tag>
                </div>

                <div v-if="detail.storage?.import_sources" class="uf-pills" style="margin-bottom:12px">
                  <n-tag v-for="(n, src) in detail.storage.import_sources" :key="src" size="small" round type="info">
                    {{ src }}: {{ n }}
                  </n-tag>
                </div>

                <div v-if="detail.invoices.recent.length" class="uf-table-wrap">
                <table class="uf-table">
                  <thead>
                    <tr>
                      <th>Supplier</th>
                      <th>Number</th>
                      <th>Type</th>
                      <th>Date</th>
                      <th style="text-align:right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="inv in detail.invoices.recent" :key="inv.id">
                      <td>{{ inv.supplier_name ?? "—" }}</td>
                      <td><code>{{ inv.invoice_number ?? "—" }}</code></td>
                      <td>{{ inv.document_subtype ?? "—" }}</td>
                      <td>{{ inv.issue_date ?? "—" }}</td>
                      <td style="text-align:right">
                        {{ inv.amount != null ? inv.amount.toLocaleString("en-US") : "—" }}
                        {{ inv.currency ?? "" }}
                      </td>
                    </tr>
                  </tbody>
                </table>
                </div>

                <template v-if="detail.import_queue?.gmail_jobs?.length">
                  <h3 class="uf-card__title" style="margin-top:16px">Recent Gmail imports</h3>
                  <div class="uf-table-wrap">
                  <table class="uf-table">
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th style="text-align:right">Messages</th>
                        <th style="text-align:right">Stored</th>
                        <th style="text-align:right">Invoices</th>
                        <th style="text-align:right">Rejected</th>
                        <th style="text-align:right">Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="job in detail.import_queue.gmail_jobs" :key="job.id">
                        <td>
                          <n-tag :type="job.status === 'failed' ? 'error' : job.status === 'completed' ? 'success' : 'default'" size="small" round>
                            {{ job.status }}
                          </n-tag>
                        </td>
                        <td style="text-align:right">{{ job.processed_messages }} / {{ job.total_messages }}</td>
                        <td style="text-align:right">{{ job.stored }}</td>
                        <td style="text-align:right">{{ job.classified_invoices }}</td>
                        <td style="text-align:right">{{ job.rejected }}</td>
                        <td style="text-align:right">{{ job.errors }}</td>
                      </tr>
                    </tbody>
                  </table>
                  </div>
                </template>
              </template>
            </n-tab-pane>

            <n-tab-pane name="documents" :tab="`Documents (${detail?.counts?.documents ?? detail?.documents?.length ?? 0})`">
              <div class="uf-table-wrap">
                <table class="uf-table">
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>Status</th>
                      <th>Coverage</th>
                      <th>Date</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in detail?.documents ?? []" :key="row.id">
                      <td class="uf-ellipsis" :title="row.filename">{{ row.filename || "—" }}</td>
                      <td><n-tag :type="statusType(row.status)" size="small" round>{{ row.status }}</n-tag></td>
                      <td>{{ coverageLabel(row.field_coverage) }}</td>
                      <td class="uf-muted">{{ row.created_at ? new Date(row.created_at).toLocaleDateString("en-US") : "—" }}</td>
                      <td class="uf-row-actions">
                        <n-tooltip v-if="row.id" placement="top">
                          <template #trigger>
                            <button class="btn btn--ghost btn--xs icon-btn" type="button" @click="$emit('open-doc', row.id)">
                              <n-icon :component="EyeOutline" :size="14" class="btn-icon" />
                            </button>
                          </template>
                          Open
                        </n-tooltip>
                        <n-tooltip v-if="row.has_s3" placement="top">
                          <template #trigger>
                            <button class="btn btn--ghost btn--xs icon-btn" type="button" :disabled="downloadingDocId === row.id" @click="downloadDoc(row.id)">
                              <n-icon :component="DownloadOutline" :size="14" class="btn-icon" />
                            </button>
                          </template>
                          Download
                        </n-tooltip>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div v-if="!(detail?.documents?.length)" class="uf-muted uf-pad">No documents</div>
              </div>
            </n-tab-pane>

            <n-tab-pane name="emails" :tab="`Emails (${detail?.counts?.emails ?? detail?.emailLogs?.length ?? 0})`">
              <div class="uf-table-wrap">
                <table class="uf-table">
                  <thead>
                    <tr><th>Type</th><th>Recipient</th><th>Error</th><th>Date</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in detail?.emailLogs ?? []" :key="row.id" :class="{ 'uf-row--bad': !row.success }">
                      <td>
                        <n-tag :type="row.success ? 'success' : 'error'" size="small" round>
                          {{ (row.success ? "✓ " : "✗ ") + (row.log_type ?? "—") }}
                        </n-tag>
                      </td>
                      <td class="uf-ellipsis" :title="row.recipient">{{ row.recipient || "—" }}</td>
                      <td class="uf-ellipsis" :class="row.error ? 'uf-err' : 'uf-muted'">{{ row.error || "OK" }}</td>
                      <td class="uf-muted">{{ row.sent_at ? new Date(row.sent_at).toLocaleDateString("en-US") : "—" }}</td>
                    </tr>
                  </tbody>
                </table>
                <div v-if="!(detail?.emailLogs?.length)" class="uf-muted uf-pad">No email logs</div>
              </div>
            </n-tab-pane>

            <n-tab-pane name="extractions" :tab="`AI Runs (${detail?.extractions?.length ?? 0})`">
              <div class="uf-table-wrap">
                <table class="uf-table">
                  <thead>
                    <tr><th>Backend</th><th>Model</th><th>OK</th><th>Time</th><th>Error</th><th>Date</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in detail?.extractions ?? []" :key="row.id" :class="{ 'uf-row--bad': !row.parsed_ok }">
                      <td>{{ row.backend || "—" }}</td>
                      <td class="uf-ellipsis">{{ row.model || "—" }}</td>
                      <td><n-tag :type="row.parsed_ok ? 'success' : 'error'" size="small" round>{{ row.parsed_ok ? "✓" : "✗" }}</n-tag></td>
                      <td>{{ row.exec_ms ? `${(row.exec_ms / 1000).toFixed(1)}s` : "—" }}</td>
                      <td class="uf-ellipsis uf-err">{{ row.error || "" }}</td>
                      <td class="uf-muted">{{ row.created_at ? new Date(row.created_at).toLocaleDateString("en-US") : "—" }}</td>
                    </tr>
                  </tbody>
                </table>
                <div v-if="!(detail?.extractions?.length)" class="uf-muted uf-pad">No extraction runs</div>
              </div>
            </n-tab-pane>

            <n-tab-pane name="storage" :tab="`S3 (${storageFiles.length})`">
              <div class="uf-s3-toolbar">
                <n-input
                  v-model:value="storageSearch"
                  clearable
                  size="small"
                  placeholder="Filter by file name or key..."
                  class="uf-s3-toolbar__search"
                  :disabled="!storageFiles.length"
                >
                  <template #prefix><n-icon :component="SearchOutline" :size="14" /></template>
                </n-input>
                <n-select
                  v-model:value="storageStatusFilter"
                  :options="storageStatusOptions"
                  clearable
                  size="small"
                  placeholder="Status"
                  class="uf-s3-toolbar__status"
                  :disabled="!storageFiles.length"
                />
                <span class="uf-s3-toolbar__count">
                  {{ filteredStorageFiles.length }}{{ storageTruncated ? "+" : "" }} of {{ storageFiles.length }}
                </span>
                <n-tag v-if="storageTruncated" type="warning" size="small" round>List truncated</n-tag>
              </div>
              <div class="uf-table-wrap">
                <table class="uf-table">
                  <thead>
                    <tr><th>File</th><th>Size</th><th>DB</th><th>Status</th><th>Key</th><th></th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in pagedStorageFiles" :key="row.key" :class="{ 'uf-row--bad': !row.in_db }">
                      <td class="uf-ellipsis" :title="row.file_name">{{ row.file_name || "—" }}</td>
                      <td>{{ formatBytes(row.size) }}</td>
                      <td><n-tag :type="row.in_db ? 'success' : 'error'" size="small" round>{{ row.in_db ? "Linked" : "Orphan" }}</n-tag></td>
                      <td>{{ row.status || "—" }}</td>
                      <td class="uf-ellipsis uf-muted" :title="row.key"><code>{{ row.key }}</code></td>
                      <td class="uf-row-actions">
                        <n-tooltip placement="top">
                          <template #trigger>
                            <button class="btn btn--ghost btn--xs icon-btn" type="button" @click="downloadStorage(row.key)">
                              <n-icon :component="DownloadOutline" :size="14" class="btn-icon" />
                            </button>
                          </template>
                          Download
                        </n-tooltip>
                        <n-tooltip v-if="row.doc_id" placement="top">
                          <template #trigger>
                            <button class="btn btn--ghost btn--xs icon-btn" type="button" @click="$emit('open-doc', row.doc_id)">
                              <n-icon :component="EyeOutline" :size="14" class="btn-icon" />
                            </button>
                          </template>
                          Open document
                        </n-tooltip>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div v-if="!storageFiles.length" class="uf-muted uf-pad">No S3 files for this user</div>
                <div v-else-if="!filteredStorageFiles.length" class="uf-muted uf-pad">No files match this filter</div>
              </div>
              <div v-if="filteredStorageFiles.length > storagePageSize" class="uf-pager">
                <button class="btn btn--ghost btn--xs" type="button" :disabled="storagePage <= 1" @click="storagePage--">Prev</button>
                <span class="uf-pager__label">Page {{ storagePage }} / {{ storagePageCount }}</span>
                <button class="btn btn--ghost btn--xs" type="button" :disabled="storagePage >= storagePageCount" @click="storagePage++">Next</button>
              </div>
            </n-tab-pane>

            <n-tab-pane name="reminders" :tab="`Reminders (${userPendingReminders.length + userFailedSends.length})`">
              <h4 class="uf-subhead">Pending</h4>
              <div class="uf-table-wrap">
                <table class="uf-table">
                  <thead><tr><th>Type</th><th>Note</th><th>Trigger</th></tr></thead>
                  <tbody>
                    <tr v-for="(row, i) in userPendingReminders" :key="`p-${i}`">
                      <td>{{ reminderTypeLabel(row) }}</td>
                      <td class="uf-ellipsis" :title="row.note || row.title || ''">{{ row.note || row.title || "—" }}</td>
                      <td class="uf-muted">{{ row.trigger_date ? new Date(row.trigger_date).toLocaleDateString("en-US") : "—" }}</td>
                    </tr>
                  </tbody>
                </table>
                <div v-if="!userPendingReminders.length" class="uf-muted uf-pad">No pending reminders in monitor feed</div>
              </div>
              <h4 class="uf-subhead">Failed sends</h4>
              <div class="uf-table-wrap">
                <table class="uf-table">
                  <thead><tr><th>Recipient</th><th>Error</th><th>Date</th></tr></thead>
                  <tbody>
                    <tr v-for="(row, i) in userFailedSends" :key="`f-${i}`" class="uf-row--bad">
                      <td class="uf-ellipsis">{{ row.recipient || "—" }}</td>
                      <td class="uf-ellipsis uf-err">{{ row.error || "—" }}</td>
                      <td class="uf-muted">{{ row.sent_at ? new Date(row.sent_at).toLocaleString("en-US") : "—" }}</td>
                    </tr>
                  </tbody>
                </table>
                <div v-if="!userFailedSends.length" class="uf-muted uf-pad">No failed sends in monitor feed</div>
              </div>
            </n-tab-pane>

            <n-tab-pane name="issues" :tab="`Issues (${issueCount})`">
              <div class="uf-grid">
                <section class="uf-card">
                  <div class="uf-card__head">
                    <h3 class="uf-card__title">Failed documents ({{ userFailedDocs.length }})</h3>
                    <n-button
                      v-if="userFailedDocs.length"
                      size="small"
                      type="primary"
                      :loading="rescanningAll"
                      :disabled="busy"
                      @click="rescanAllFailed"
                    >
                      AI Rescan all
                    </n-button>
                  </div>
                  <div v-for="(row, i) in userFailedDocs.slice(0, 20)" :key="row.id || `fd-${i}`" class="uf-error-item">
                    <div class="uf-error-item__top">
                      <strong class="uf-ellipsis" :title="row.filename || ''">{{ row.filename || "—" }}</strong>
                      <div class="uf-error-item__actions">
                        <n-button
                          size="tiny"
                          quaternary
                          :disabled="!row.id"
                          @click="$emit('open-doc', row.id)"
                        >
                          Open
                        </n-button>
                        <n-button
                          size="tiny"
                          type="primary"
                          ghost
                          :loading="rescanningIds.has(row.id)"
                          :disabled="!row.id || rescanningAll"
                          @click="rescanDoc(row.id)"
                        >
                          AI Rescan
                        </n-button>
                      </div>
                    </div>
                    <code>{{ row.error || "—" }}</code>
                  </div>
                  <div v-if="!userFailedDocs.length" class="uf-muted">None</div>
                </section>
                <section class="uf-card">
                  <h3 class="uf-card__title">Pipeline gaps</h3>
                  <ul class="uf-kv">
                    <li><span>Stuck processing</span><strong>{{ userGaps.stuck.length }}</strong></li>
                    <li><span>No S3</span><strong>{{ userGaps.noS3.length }}</strong></li>
                    <li><span>Skipped reminders</span><strong>{{ userGaps.skipped.length }}</strong></li>
                    <li><span>Missing emails</span><strong>{{ userGaps.missingEmail.length }}</strong></li>
                  </ul>
                </section>
                <section class="uf-card uf-card--wide">
                  <h3 class="uf-card__title">Bad client emails ({{ userBadClients.length }})</h3>
                  <div class="uf-table-wrap">
                    <table class="uf-table">
                      <thead><tr><th>Client</th><th>Email</th><th>Issues</th></tr></thead>
                      <tbody>
                        <tr v-for="row in userBadClients" :key="row.id || row.email">
                          <td class="uf-ellipsis">{{ row.display_name || "—" }}</td>
                          <td class="uf-err"><code>{{ row.email }}</code></td>
                          <td>{{ (row.issues || []).join(", ") }}</td>
                        </tr>
                      </tbody>
                    </table>
                    <div v-if="!userBadClients.length" class="uf-muted uf-pad">None</div>
                  </div>
                </section>
              </div>
            </n-tab-pane>

            <n-tab-pane name="settings" tab="Settings">
              <div v-if="settingsForm" class="uf-settings">
                <section class="uf-card">
                  <h3 class="uf-card__title">User profile</h3>
                  <div class="uf-settings__grid">
                    <label class="uf-control"><span>Email</span><n-input v-model:value="profileForm.email" size="small" clearable placeholder="Optional if username set" /></label>
                    <label class="uf-control"><span>Username</span><n-input v-model:value="profileForm.username" size="small" clearable placeholder="Optional if email set" /></label>
                    <label class="uf-control"><span>Display name</span><n-input v-model:value="profileForm.name" size="small" clearable /></label>
                    <label class="uf-control"><span>Phone</span><n-input v-model:value="profileForm.phone" size="small" clearable /></label>
                    <label class="uf-control"><span>Company</span><n-input v-model:value="profileForm.company_name" size="small" clearable /></label>
                    <label class="uf-control"><span>Picture URL</span><n-input v-model:value="profileForm.picture_url" size="small" clearable /></label>
                    <label class="uf-control">
                      <span>Role</span>
                      <n-select v-model:value="profileForm.role" :options="roleOptions" size="small" />
                    </label>
                    <label class="uf-control">
                      <span>Plan</span>
                      <n-select v-model:value="profileForm.plan" :options="planOptions" size="small" />
                    </label>
                  </div>
                  <div class="uf-switches" style="margin-top:10px">
                    <label><n-switch v-model:value="profileForm.is_active" size="small" /> Active</label>
                    <label><n-switch v-model:value="profileForm.email_verified" size="small" /> Email verified</label>
                  </div>
                  <div class="uf-settings__bar" style="margin-top:12px">
                    <n-button type="primary" size="small" :loading="savingProfile" @click="saveProfile">Save profile</n-button>
                  </div>
                </section>

                <div class="uf-settings__bar">
                  <n-button type="primary" size="small" :loading="savingSettings" @click="saveSettings">Save settings</n-button>
                </div>

                <section class="uf-card">
                  <h3 class="uf-card__title">General</h3>
                  <div class="uf-settings__grid">
                    <label class="uf-control"><span>Theme</span><n-select v-model:value="settingsForm.theme" :options="themeOptions" size="small" /></label>
                    <label class="uf-control"><span>Email sender name</span><n-input v-model:value="settingsForm.email_from_name" size="small" placeholder="RemindOCR" /></label>
                    <label class="uf-control"><span>Reminder advance days</span><n-input v-model:value="settingsForm.reminder_advance_days" size="small" placeholder="[30]" /></label>
                    <label class="uf-control"><span>OCR language</span><n-input v-model:value="settingsForm.ocr_language" size="small" placeholder="heb+eng" /></label>
                  </div>
                  <div class="uf-switches">
                    <label><n-switch v-model:value="settingsForm.calendar_next_tests_only" size="small" /> Calendar next tests only</label>
                    <label><n-switch v-model:value="settingsForm.pipeline_ocr" size="small" /> OCR</label>
                    <label><n-switch v-model:value="settingsForm.pipeline_ai" size="small" /> AI extraction</label>
                    <label><n-switch v-model:value="settingsForm.pipeline_s3" size="small" /> S3 upload</label>
                    <label><n-switch v-model:value="settingsForm.pipeline_entities" size="small" /> Entity creation</label>
                  </div>
                </section>

                <section class="uf-card">
                  <h3 class="uf-card__title">Monthly reports</h3>
                  <div class="uf-switches">
                    <label><n-switch v-model:value="settingsForm.monthly_report_enabled" size="small" /> Enabled</label>
                  </div>
                  <div class="uf-settings__grid">
                    <label class="uf-control"><span>Recipients</span><n-input v-model:value="settingsForm.monthly_report_recipients" size="small" /></label>
                    <label class="uf-control"><span>Day</span><n-input-number v-model:value="settingsForm.monthly_report_day" size="small" :min="1" :max="28" /></label>
                    <label class="uf-control"><span>Hour</span><n-input-number v-model:value="settingsForm.monthly_report_hour" size="small" :min="0" :max="23" /></label>
                    <label class="uf-control">
                      <span>Formats</span>
                      <n-checkbox-group v-model:value="settingsForm.monthly_report_formats">
                        <n-space size="small">
                          <n-checkbox v-for="f in formatOptions" :key="f.value" :value="f.value">{{ f.label }}</n-checkbox>
                        </n-space>
                      </n-checkbox-group>
                    </label>
                  </div>
                </section>

                <section class="uf-card">
                  <h3 class="uf-card__title">Default email template</h3>
                  <div class="uf-settings__bar">
                    <n-select
                      v-model:value="defaultTemplateId"
                      :options="[{ label: '— System Default —', value: null }, ...templates.map((t) => ({ label: t.name, value: t.id }))]"
                      clearable
                      style="flex:1"
                    />
                    <n-button type="primary" size="small" :loading="savingTemplate" @click="saveTemplate">Save template</n-button>
                  </div>
                </section>

                <section class="uf-card">
                  <h3 class="uf-card__title">Features</h3>
                  <template v-for="[scope, features] in featuresByScope" :key="scope">
                    <div class="uf-scope">{{ scope }}</div>
                    <div class="uf-feature-grid">
                      <label v-for="feature in features" :key="feature.key" class="uf-feature">
                        <n-switch v-model:value="settingsForm.features[feature.key]" size="small" />
                        <span>
                          <strong>{{ feature.label_he || feature.label_en }}</strong>
                          <small>{{ feature.key }}</small>
                        </span>
                      </label>
                    </div>
                  </template>
                </section>
              </div>
              <div v-else class="uf-muted uf-pad">Loading settings…</div>
            </n-tab-pane>
          </n-tabs>
        </n-spin>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import {
  NButton, NCheckbox, NCheckboxGroup, NIcon, NInput, NInputNumber,
  NSelect, NSpace, NSpin, NSwitch, NTabPane, NTabs, NTag, NTooltip, useMessage,
} from "naive-ui";
import {
  DownloadOutline, EyeOutline, KeyOutline, PeopleOutline, RefreshOutline, SearchOutline,
} from "@vicons/ionicons5";
import { api } from "../services/apiService.js";
import type { FeatureDefinition } from "@shared/types.js";
import { normalizeFeatureFlags } from "../shared/features.js";

const props = defineProps<{
  users: any[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  "open-doc": [id: string];
  "open-report": [user: any];
  "user-updated": [user: any];
}>();

const message = useMessage();
const search = ref("");
const selectedId = ref<string | null>(null);
const selectedUser = ref<any>(null);
const tab = ref("overview");
const busy = ref(false);

const detail = ref<any>(null);
const storageFiles = ref<any[]>([]);
const storageTruncated = ref(false);
const storageSearch = ref("");
const storageStatusFilter = ref<string | null>(null);
const storagePage = ref(1);
const storagePageSize = 25;
const storageStatusOptions = [
  { label: "All", value: null },
  { label: "In DB", value: "in_db" },
  { label: "Orphan (not in DB)", value: "not_in_db" },
  { label: "Done", value: "done" },
  { label: "Error", value: "error" },
  { label: "Processing", value: "processing" },
  { label: "Queued", value: "queued" },
];
const docMonitor = ref<any>(null);
const reminderMonitor = ref<any>(null);
const monthlyMonitor = ref<any>(null);
const badEmails = ref<any>(null);
const pipelineGaps = ref<any>(null);

const settingsForm = ref<any>(null);
const profileForm = reactive({
  email: "",
  username: "",
  name: "",
  phone: "",
  company_name: "",
  picture_url: "",
  role: "user",
  plan: "free",
  is_active: true,
  email_verified: true,
});
const savingProfile = ref(false);
const savingSettings = ref(false);
const savingTemplate = ref(false);
const defaultTemplateId = ref<number | null>(null);
const templates = ref<any[]>([]);
const featureDefinitions = ref<FeatureDefinition[]>([]);
const downloadingDocId = ref<string | null>(null);

const roleOptions = [
  { label: "Regular User", value: "user" },
  { label: "Pro", value: "pro" },
  { label: "Admin", value: "admin" },
];
const planOptions = [
  { label: "Free", value: "free" },
  { label: "Basic", value: "basic" },
  { label: "Business", value: "business" },
];
const roleTagType: Record<string, "default" | "warning" | "error"> = {
  user: "default", pro: "default", admin: "warning",
};
const roleLabel: Record<string, string> = { user: "User", pro: "Pro", admin: "Admin" };
const planTagType: Record<string, "default" | "success" | "info"> = {
  free: "default", basic: "info", business: "success",
};
const planLabel: Record<string, string> = { free: "Free", basic: "Basic", business: "Business" };
const themeOptions = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];
const formatOptions = [
  { label: "DOCX", value: "docx" },
  { label: "XLSX", value: "xlsx" },
];

const filteredUsers = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return props.users;
  return props.users.filter(
    (u) =>
      u.email?.toLowerCase().includes(q)
      || u.username?.toLowerCase().includes(q)
      || u.name?.toLowerCase().includes(q),
  );
});

const featuresByScope = computed(() => {
  const groups = new Map<string, FeatureDefinition[]>();
  for (const f of featureDefinitions.value) {
    const scope = f.key.includes(".") ? f.key.slice(0, f.key.indexOf(".")) : "other";
    if (!groups.has(scope)) groups.set(scope, []);
    groups.get(scope)!.push(f);
  }
  return groups;
});

const uid = computed(() => selectedUser.value?.id);

const userFailedDocs = computed(() =>
  (docMonitor.value?.failed ?? []).filter((r: any) => r.user_id === uid.value),
);
const userStuckDocs = computed(() =>
  (docMonitor.value?.stuck ?? []).filter((r: any) => r.user_id === uid.value),
);
const userPendingReminders = computed(() =>
  (reminderMonitor.value?.pending ?? reminderMonitor.value?.pendingReminders ?? []).filter((r: any) => r.user_id === uid.value),
);
const userFailedSends = computed(() =>
  (reminderMonitor.value?.failedSends ?? []).filter((r: any) => r.user_id === uid.value),
);

const SOURCE_TYPE_LABELS: Record<string, string> = {
  contract_expiry: "Contract",
  manual: "Manual",
  task: "Task",
};

function reminderTypeLabel(row: any): string {
  const raw = row?.source_type ?? row?.doc_type;
  if (!raw) return "—";
  return SOURCE_TYPE_LABELS[raw] ?? String(raw);
}

const rescanningIds = ref<Set<string>>(new Set());
const rescanningAll = ref(false);

async function rescanDoc(docId: string) {
  if (!docId) return;
  rescanningIds.value = new Set([...rescanningIds.value, docId]);
  try {
    await api.admin.reprocessDocument(docId);
    message.success("AI rescan queued");
    // Refresh monitors so status flips off "error" after queue pickup.
    const [docs, gaps] = await Promise.allSettled([
      api.admin.monitorDocuments(),
      api.admin.monitorPipelineGaps(),
    ]);
    if (docs.status === "fulfilled") docMonitor.value = docs.value;
    if (gaps.status === "fulfilled") pipelineGaps.value = gaps.value;
  } catch (err: any) {
    message.error(err?.message ?? "AI rescan failed");
  } finally {
    const next = new Set(rescanningIds.value);
    next.delete(docId);
    rescanningIds.value = next;
  }
}

async function rescanAllFailed() {
  const ids = userFailedDocs.value.map((r: any) => r.id).filter(Boolean) as string[];
  if (!ids.length) return;
  rescanningAll.value = true;
  let ok = 0;
  let fail = 0;
  try {
    for (const id of ids) {
      try {
        await api.admin.reprocessDocument(id);
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    if (ok) message.success(`Queued AI rescan for ${ok} document${ok === 1 ? "" : "s"}`);
    if (fail) message.error(`${fail} rescan${fail === 1 ? "" : "s"} failed to queue`);
    const [docs, gaps] = await Promise.allSettled([
      api.admin.monitorDocuments(),
      api.admin.monitorPipelineGaps(),
    ]);
    if (docs.status === "fulfilled") docMonitor.value = docs.value;
    if (gaps.status === "fulfilled") pipelineGaps.value = gaps.value;
  } finally {
    rescanningAll.value = false;
  }
}
const userSchedule = computed(() =>
  (monthlyMonitor.value?.schedules ?? []).find((s: any) => s.user_id === uid.value || s.id === uid.value),
);
const userBadClients = computed(() =>
  (badEmails.value?.bad_clients ?? []).filter((r: any) => r.user_id === uid.value),
);
const userGaps = computed(() => {
  const g = pipelineGaps.value;
  const id = uid.value;
  return {
    stuck: (g?.stuck_processing ?? []).filter((r: any) => r.user_id === id),
    noS3: (g?.no_s3 ?? []).filter((r: any) => r.user_id === id),
    skipped: (g?.skipped_reminders ?? []).filter((r: any) => r.user_id === id),
    missingEmail: (g?.missing_emails ?? []).filter((r: any) => r.user_id === id),
  };
});
const orphansCount = computed(() => storageFiles.value.filter((f) => !f.in_db).length);

// Documents queued for processing with no job row to run them — the signature
// of an enqueue that failed after the document was already written.
const queueStuck = computed(() => Number(props.detail?.import_queue?.stuck_without_job ?? 0));

const filteredStorageFiles = computed(() => {
  let result = storageFiles.value;
  const q = storageSearch.value.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (f) => f.file_name?.toLowerCase().includes(q) || f.key?.toLowerCase().includes(q),
    );
  }
  const status = storageStatusFilter.value;
  if (status === "in_db") result = result.filter((f) => f.in_db);
  else if (status === "not_in_db") result = result.filter((f) => !f.in_db);
  else if (status) result = result.filter((f) => f.status === status);
  return result;
});

const storagePageCount = computed(() =>
  Math.max(1, Math.ceil(filteredStorageFiles.value.length / storagePageSize)),
);

const pagedStorageFiles = computed(() => {
  const start = (storagePage.value - 1) * storagePageSize;
  return filteredStorageFiles.value.slice(start, start + storagePageSize);
});
const issueCount = computed(
  () =>
    userFailedDocs.value.length +
    userGaps.value.stuck.length +
    userGaps.value.noS3.length +
    userBadClients.value.length +
    (detail.value?.failedEmails?.length ?? 0),
);

function initials(u: any) {
  const s = String(u.email || u.username || u.name || "?").trim();
  return s.slice(0, 2).toUpperCase();
}

function planFromRole(role: string | null | undefined) {
  if (role === "admin") return "business";
  if (role === "pro") return "basic";
  return "free";
}

function userPlan(u: any) {
  const raw = String(u?.plan ?? "").trim().toLowerCase();
  if (raw === "business" || raw === "basic" || raw === "free") return raw;
  return planFromRole(u?.role);
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / Math.pow(k, i)) * 10) / 10} ${sizes[i]}`;
}

function statusType(status: string) {
  if (status === "done") return "success";
  if (status === "error") return "error";
  if (status === "processing") return "warning";
  return "default";
}

function coverageLabel(fc: any) {
  if (!fc) return "—";
  return `${fc.coverage_pct}% (${fc.present?.length ?? 0}/${fc.total_fields ?? 0})`;
}

function makeSettingsForm(settings: any) {
  let formats: string[] = ["docx"];
  try {
    const raw = settings?.monthly_report_formats;
    formats = typeof raw === "string" ? JSON.parse(raw) : Array.isArray(raw) ? raw : ["docx"];
  } catch { /* keep default */ }
  const report = settings?.report_config ?? {};
  return {
    theme: settings?.theme ?? "system",
    email_from_name: settings?.email_from_name ?? "",
    reminder_advance_days: settings?.reminder_advance_days ?? "[30]",
    ocr_language: settings?.ocr_language ?? "heb+eng",
    pipeline_ocr: settings?.pipeline_ocr ?? true,
    pipeline_ai: settings?.pipeline_ai ?? true,
    pipeline_s3: settings?.pipeline_s3 ?? true,
    pipeline_entities: settings?.pipeline_entities ?? true,
    calendar_next_tests_only: settings?.calendar_next_tests_only ?? false,
    monthly_report_enabled: settings?.monthly_report_enabled ?? false,
    monthly_report_recipients: settings?.monthly_report_recipients ?? "",
    monthly_report_day: settings?.monthly_report_day ?? 1,
    monthly_report_hour: settings?.monthly_report_hour ?? 8,
    monthly_report_formats: formats,
    report_config: {
      all_fields: report.all_fields ?? [],
      client_fields: report.client_fields ?? [],
    },
    features: normalizeFeatureFlags(settings?.features ?? {}),
  };
}

function applyFeatureDefaults() {
  if (!settingsForm.value) return;
  const flat = normalizeFeatureFlags(settingsForm.value.features);
  settingsForm.value.features = {
    ...Object.fromEntries(featureDefinitions.value.map((f) => [f.key, f.default_enabled])),
    ...flat,
  };
}

async function selectUser(user: any) {
  selectedId.value = user.id;
  selectedUser.value = user;
  fillProfileForm(user);
  tab.value = "overview";
  storageSearch.value = "";
  storageStatusFilter.value = null;
  storagePage.value = 1;
  magicLinkResult.value = null;
  await reloadAll();
}

async function reloadAll() {
  if (!selectedUser.value) return;
  const user = selectedUser.value;
  busy.value = true;
  detail.value = null;
  storageFiles.value = [];
  storagePage.value = 1;
  try {
    const [detailRes, settingsRes, storageRes, docsRes, remRes, monthlyRes, badRes, gapsRes] =
      await Promise.allSettled([
        api.admin.getUserDetail(user.id),
        api.admin.getUserSettings(user.id),
        api.admin.browseStorage({ user_id: user.id }),
        api.admin.monitorDocuments(),
        api.admin.monitorReminders(),
        api.admin.monitorMonthlyReports(),
        api.admin.monitorBadEmails(),
        api.admin.monitorPipelineGaps(),
      ]);

    if (detailRes.status === "fulfilled") detail.value = detailRes.value;
    else message.error("Failed to load user detail");

    if (settingsRes.status === "fulfilled") {
      defaultTemplateId.value = settingsRes.value.default_email_template_id ?? null;
      settingsForm.value = makeSettingsForm(settingsRes.value);
      fillProfileForm(user);
      applyFeatureDefaults();
    }

    if (storageRes.status === "fulfilled") {
      storageFiles.value = storageRes.value.files ?? [];
      storageTruncated.value = !!storageRes.value.truncated;
    }

    if (docsRes.status === "fulfilled") docMonitor.value = docsRes.value;
    if (remRes.status === "fulfilled") reminderMonitor.value = remRes.value;
    if (monthlyRes.status === "fulfilled") monthlyMonitor.value = monthlyRes.value;
    if (badRes.status === "fulfilled") badEmails.value = badRes.value;
    if (gapsRes.status === "fulfilled") pipelineGaps.value = gapsRes.value;

    if (!templates.value.length) {
      try {
        const t = await api.emailTemplates.list();
        templates.value = Array.isArray(t) ? t : [];
      } catch { templates.value = []; }
    }
    if (!featureDefinitions.value.length) {
      try {
        const response = await api.admin.listFeatures();
        featureDefinitions.value = [...(response.rows ?? [])].sort((a, b) => a.sort_order - b.sort_order);
        applyFeatureDefaults();
      } catch { featureDefinitions.value = []; }
    }
  } finally {
    busy.value = false;
  }
}

const magicLinkResult = ref<{ userId: string; link: string; expiresAt: number } | null>(null);
const issuingMagicLink = ref(false);

function formatExpiry(expiresAt: number): string {
  const days = Math.round((expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
  return days >= 1 ? `in ${days} day${days === 1 ? "" : "s"}` : "soon";
}

async function issueMagicLink() {
  if (!selectedUser.value) return;
  issuingMagicLink.value = true;
  try {
    const res = await api.admin.issueMagicLinkForUser(selectedUser.value.id);
    magicLinkResult.value = {
      userId: selectedUser.value.id,
      link: res.magicLink,
      expiresAt: Date.now() + res.expiresInMinutes * 60_000,
    };
  } catch {
    message.error("Error issuing magic link");
  } finally {
    issuingMagicLink.value = false;
  }
}

async function copyMagicLink() {
  if (!magicLinkResult.value) return;
  try {
    await navigator.clipboard.writeText(magicLinkResult.value.link);
    message.success("Link copied");
  } catch {
    message.error("Copy failed — select and copy manually");
  }
}

async function toggleActive() {
  if (!selectedUser.value) return;
  const newActive = selectedUser.value.is_active === 0 ? 1 : 0;
  try {
    const updated = await api.admin.updateUser(selectedUser.value.id, { is_active: newActive });
    selectedUser.value = { ...selectedUser.value, ...updated };
    fillProfileForm(selectedUser.value);
    emit("user-updated", updated);
    message.success(newActive ? "User activated" : "User deactivated");
  } catch {
    message.error("Error updating status");
  }
}

function fillProfileForm(user: any) {
  profileForm.email = user?.email ?? "";
  profileForm.username = user?.username ?? "";
  profileForm.name = user?.name ?? "";
  profileForm.phone = user?.phone ?? "";
  profileForm.company_name = user?.company_name ?? "";
  profileForm.picture_url = user?.picture_url ?? "";
  profileForm.role = user?.role ?? "user";
  profileForm.plan = userPlan(user);
  profileForm.is_active = user?.is_active !== 0;
  profileForm.email_verified = user?.email_verified !== 0 && user?.email_verified !== false;
}

async function saveProfile() {
  if (!selectedUser.value) return;
  const email = profileForm.email.trim().toLowerCase();
  const username = profileForm.username.trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    message.error("Email is invalid");
    return;
  }
  if (username && (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username) || username.includes("@"))) {
    message.error("Username must be 2–32 chars: letters, digits, . _ - (no @)");
    return;
  }
  if (!email && !username) {
    message.error("Email or username is required");
    return;
  }
  savingProfile.value = true;
  try {
    const updated = await api.admin.updateUser(selectedUser.value.id, {
      email: email || null,
      username: username || null,
      name: profileForm.name.trim() || null,
      phone: profileForm.phone.trim() || null,
      company_name: profileForm.company_name.trim() || null,
      picture_url: profileForm.picture_url.trim() || null,
      role: profileForm.role,
      plan: profileForm.plan,
      is_active: profileForm.is_active,
      email_verified: profileForm.email_verified,
    });
    selectedUser.value = { ...selectedUser.value, ...updated };
    fillProfileForm(selectedUser.value);
    emit("user-updated", updated);
    message.success("User profile saved");
  } catch (err: any) {
    message.error(err?.message ?? "Error updating profile");
  } finally {
    savingProfile.value = false;
  }
}

async function saveSettings() {
  if (!selectedUser.value || !settingsForm.value) return;
  savingSettings.value = true;
  try {
    const form = settingsForm.value;
    await api.admin.saveUserSettings(selectedUser.value.id, {
      theme: form.theme,
      email_from_name: form.email_from_name || null,
      reminder_advance_days: form.reminder_advance_days || "[30]",
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
      default_email_template_id: defaultTemplateId.value,
    });
    message.success("User settings saved");
  } catch (error) {
    message.error(error instanceof Error ? error.message : "Failed to save user settings");
  } finally {
    savingSettings.value = false;
  }
}

async function saveTemplate() {
  if (!selectedUser.value) return;
  savingTemplate.value = true;
  try {
    await api.admin.setUserDefaultTemplate(selectedUser.value.id, defaultTemplateId.value);
    message.success("Default template saved");
  } catch {
    message.error("Failed to save template");
  } finally {
    savingTemplate.value = false;
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

function downloadStorage(key: string) {
  window.open(api.admin.storageDownloadUrl(key), "_blank");
}

watch(
  () => props.users,
  (list) => {
    if (!selectedId.value || !list.length) return;
    const fresh = list.find((u) => u.id === selectedId.value);
    if (fresh) selectedUser.value = { ...selectedUser.value, ...fresh };
  },
);

watch([storageSearch, storageStatusFilter], () => {
  storagePage.value = 1;
});
</script>

<style scoped>
.uf {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 16px;
  flex: 1;
  min-height: 0;
  height: 100%;
  padding: 16px 20px 20px;
  direction: ltr;
  text-align: left;
}

.uf-list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  overflow: hidden;
}

.uf-list__head {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
}

.uf-list__stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
}

.uf-list__body {
  flex: 1;
  overflow: auto;
  padding: 6px;
}

.uf-list__empty,
.uf-muted {
  color: var(--text-secondary);
  font-size: 13px;
}

.uf-pad { padding: 24px; text-align: center; }

.uf-user {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s;
}

.uf-user:hover { background: var(--bg-hover); }
.uf-user--active {
  background: color-mix(in srgb, var(--brand-color) 14%, var(--bg-card));
}
.uf-user--inactive { opacity: 0.65; }

.uf-user__avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--bg-elevated);
  color: var(--brand-color);
  font-size: 11px;
  font-weight: 700;
  flex: 0 0 auto;
}

.uf-user__meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.uf-user__email {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.uf-user__sub {
  font-size: 11px;
  color: var(--text-secondary);
}

.uf-main {
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: auto;
  padding-inline-end: 4px;
}

.uf-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 420px;
  padding: 40px;
  border: 1px dashed var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  text-align: center;
}

.uf-empty__icon { color: var(--brand-color); opacity: 0.7; }
.uf-empty h3 { margin: 0; font-size: 18px; }
.uf-empty p { margin: 0; max-width: 420px; color: var(--text-secondary); font-size: 13px; }

.uf-hero {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.uf-hero__title {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 700;
}

.uf-hero__tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.uf-hero__muted { font-size: 12px; color: var(--text-secondary); }

.uf-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-start;
}

.uf-magiclink {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--surface-2, rgba(127,127,127,0.08));
  border: 1px solid var(--border-color, rgba(127,127,127,0.2));
  font-size: 12px;
}
.uf-magiclink__icon { flex-shrink: 0; opacity: 0.7; }
.uf-magiclink__value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
  font-size: 11px;
}
.uf-magiclink__note { flex-shrink: 0; color: var(--text-secondary); white-space: nowrap; }

.uf-stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.uf-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
}

.uf-stat--warn {
  border-color: color-mix(in srgb, #f0a020 40%, var(--border-color));
  background: color-mix(in srgb, #f0a020 8%, var(--bg-card));
}

.uf-kv__warn strong { color: #f0a020; }

.uf-stat__n { font-size: 16px; font-weight: 700; }
.uf-stat__l { font-size: 11px; color: var(--text-secondary); font-weight: 600; }

.uf-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.uf-tabs :deep(.n-tabs-pane-wrapper) {
  padding-top: 12px;
}

.uf-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.uf-card {
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.uf-card--wide { grid-column: 1 / -1; }

.uf-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.uf-card__head .uf-card__title {
  margin: 0;
}

.uf-card__title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 700;
}

.uf-kv {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.uf-kv li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.uf-kv span { color: var(--text-secondary); }

.uf-table-wrap {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  overflow: auto;
  max-height: min(58vh, 560px);
}

.uf-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}

.uf-table th,
.uf-table td {
  padding: 7px 10px;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
  vertical-align: middle;
}

.uf-table th {
  position: sticky;
  top: 0;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.uf-table tbody tr:last-child td { border-bottom: none; }
.uf-row--bad td { background: color-mix(in srgb, #d03050 5%, var(--bg-card)); }

.uf-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.uf-err { color: #d03050; }
.uf-row-actions { display: flex; gap: 2px; }
.uf-row-actions .icon-btn {
  padding: 2px;
  min-width: 28px;
  min-height: 28px;
  justify-content: center;
}
.uf-row-actions .btn-icon { margin: 0; }

.uf-error-list { display: grid; gap: 8px; }
.uf-error-item {
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(208, 48, 80, 0.04);
  border-left: 3px solid #d03050;
  font-size: 12px;
}
.uf-error-item__top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
  color: var(--text-secondary);
}
.uf-error-item__actions {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
  align-items: center;
}
.uf-error-item code {
  display: block;
  margin-top: 4px;
  color: #d03050;
  word-break: break-word;
}

.uf-s3-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.uf-s3-toolbar__search {
  flex: 1 1 220px;
  max-width: 360px;
}

.uf-s3-toolbar__status {
  width: 180px;
}

.uf-s3-toolbar__count {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.uf-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 10px;
}

.uf-pager__label {
  font-size: 12px;
  color: var(--text-secondary);
}

.uf-subhead {
  margin: 16px 0 8px;
  font-size: 13px;
  font-weight: 700;
}

.uf-settings { display: grid; gap: 12px; }
.uf-settings__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.uf-settings__role {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
.uf-settings__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.uf-control {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}
.uf-switches {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  margin-top: 10px;
  font-size: 12px;
}
.uf-scope {
  margin: 10px 0 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
}
.uf-feature-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
}
.uf-feature {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
}
.uf-feature small {
  display: block;
  color: var(--text-secondary);
}

.uf-spin { animation: uf-spin 0.8s linear infinite; }
@keyframes uf-spin { to { transform: rotate(360deg); } }

@media (max-width: 960px) {
  .uf {
    grid-template-columns: 1fr;
  }
  .uf-list {
    max-height: 240px;
  }
  .uf-grid,
  .uf-settings__grid,
  .uf-feature-grid {
    grid-template-columns: 1fr;
  }
  .uf-s3-toolbar__search,
  .uf-s3-toolbar__status {
    width: 100%;
    max-width: none;
  }
}
</style>
