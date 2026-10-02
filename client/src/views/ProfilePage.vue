<template>
  <div class="profile-page">
    <div class="profile-shell">
    <main class="profile-content">
      <n-spin :show="loading">
        <section v-if="activeSection === 'personal'">
          <div class="section-header">
            <div>
              <h2 class="section-title">{{ l.profilePersonal.title }}</h2>
              <p class="section-header__desc">{{ l.profilePersonal.subtitle }}</p>
            </div>
            <n-button
              v-if="!editingEngineer"
              size="small"
              ghost
              @click="startEditEngineer"
            >
              <template #icon>
                <n-icon :component="CreateOutline" />
              </template>
              {{ l.profilePersonal.edit }}
            </n-button>
            <n-space v-else>
              <n-button size="small" ghost @click="cancelEditEngineer"
                >{{ l.common.cancel }}</n-button
              >
              <n-button
                size="small"
                type="primary"
                :loading="savingEngineer"
                @click="saveEngineer"
                >{{ l.common.save }}</n-button
              >
            </n-space>
          </div>

          <div class="settings-stack">
            <div class="settings-group">
              <div class="settings-group__head">
                <span class="settings-group__icon" aria-hidden="true">
                  <n-icon :component="CameraOutline" :size="18" />
                </span>
                <div>
                  <h3 class="settings-group__title">{{ l.profileSettings.avatarTitle }}</h3>
                  <p class="settings-group__desc">{{ l.profileSettings.avatarDesc }}</p>
                </div>
              </div>
              <div class="settings-row settings-row--avatar">
                <div class="sidebar-avatar sidebar-avatar--lg">
                  <img
                    v-if="user?.picture_url"
                    :src="user.picture_url"
                    alt=""
                    referrerpolicy="no-referrer"
                  />
                  <span v-else class="sidebar-avatar__initials">{{ initials }}</span>
                </div>
                <div class="settings-row__text">
                  <span class="settings-row__title">{{ user?.name || user?.email || "—" }}</span>
                  <span class="settings-row__desc">{{ l.profileSettings.avatarFormat }}</span>
                </div>
                <input
                  ref="avatarInput"
                  type="file"
                  accept="image/*"
                  class="visually-hidden"
                  @change="onAvatarChange"
                />
                <div class="settings-row__actions">
                  <n-button
                    size="small"
                    ghost
                    :loading="uploadingAvatar"
                    @click="avatarInput?.click()"
                  >
                    <template #icon>
                      <n-icon :component="CameraOutline" />
                    </template>
                    {{ l.profileSettings.changePhoto }}
                  </n-button>
                </div>
              </div>
            </div>
            <div class="settings-group">
              <div class="settings-group__head">
                <span class="settings-group__icon" aria-hidden="true">
                  <n-icon :component="PersonOutline" :size="18" />
                </span>
                <div>
                  <h3 class="settings-group__title">{{ l.profilePersonal.contactTitle }}</h3>
                  <p class="settings-group__desc">{{ l.profilePersonal.contactDesc }}</p>
                </div>
              </div>
              <div class="profile-fields">
                <div class="profile-field">
                  <span class="profile-field__label">{{ l.profilePersonal.fullName }}</span>
                  <n-input v-if="editingEngineer" v-model:value="engineerForm.name" />
                  <span v-else class="profile-field__value">{{ user?.name || "—" }}</span>
                </div>
                <div class="profile-field">
                  <span class="profile-field__label">{{ l.profilePersonal.phone }}</span>
                  <n-input v-if="editingEngineer" v-model:value="engineerForm.phone" />
                  <span v-else class="profile-field__value">{{ user?.phone || "—" }}</span>
                </div>
                <div class="profile-field">
                  <span class="profile-field__label">{{ l.profilePersonal.email }}</span>
                  <span class="profile-field__value">{{ user?.email || "—" }}</span>
                </div>
              </div>
            </div>

            <div class="settings-group">
              <div class="settings-group__head">
                <span class="settings-group__icon" aria-hidden="true">
                  <n-icon :component="CardOutline" :size="18" />
                </span>
                <div>
                  <h3 class="settings-group__title">{{ l.profilePersonal.licensing }}</h3>
                  <p class="settings-group__desc">{{ l.profilePersonal.licensingDesc }}</p>
                </div>
              </div>
              <div class="profile-fields">
                <div class="profile-field">
                  <span class="profile-field__label">{{ l.profilePersonal.licenseNumber }}</span>
                  <n-input
                    v-if="editingEngineer"
                    v-model:value="engineerForm.inspector_number"
                    :placeholder="showPerTypeInspectorNumbers ? l.profilePersonal.licenseDefaultPlaceholder : ''"
                  />
                  <span v-else class="profile-field__value">{{ engineerProfile?.inspector_number || "—" }}</span>
                </div>
                <div class="profile-field">
                  <span class="profile-field__label">{{ l.profilePersonal.vatNumber }}</span>
                  <n-input
                    v-if="editingEngineer"
                    v-model:value="engineerForm.company_registration"
                    :placeholder="l.profilePersonal.vatPlaceholder"
                  />
                  <span v-else class="profile-field__value">{{ engineerProfile?.company_registration || "—" }}</span>
                </div>
                <div class="profile-field">
                  <span class="profile-field__label">{{ l.profilePersonal.address }}</span>
                  <n-input
                    v-if="editingEngineer"
                    v-model:value="engineerForm.address"
                    :placeholder="l.profilePersonal.addressPlaceholder"
                  />
                  <span v-else class="profile-field__value">{{ engineerProfile?.address || "—" }}</span>
                </div>
                <div class="profile-field">
                  <span class="profile-field__label">{{ l.profilePersonal.city }}</span>
                  <n-input
                    v-if="editingEngineer"
                    v-model:value="engineerForm.city"
                    :placeholder="l.profilePersonal.cityPlaceholder"
                  />
                  <span v-else class="profile-field__value">{{ engineerProfile?.city || "—" }}</span>
                </div>
                <div class="profile-field">
                  <span class="profile-field__label">{{ l.profilePersonal.inspectionStart }}</span>
                  <template v-if="editingEngineer">
                    <n-input
                      v-model:value="engineerForm.inspector_id_start"
                      :placeholder="l.profilePersonal.exampleNumber"
                    />
                    <span v-if="engineerForm.inspector_id_start && engineerForm.inspector_number" class="info-hint">
                      <n-icon :component="LockClosedOutline" :size="14" />
                      {{ l.profilePersonal.nextPreview }}
                      {{ engineerForm.inspector_number }}/{{ engineerForm.inspector_id_start }}
                    </span>
                    <span v-else-if="engineerForm.inspector_id_start" class="info-hint info-hint--warn">
                      {{ l.profilePersonal.needLicenseForPreview }}
                    </span>
                  </template>
                  <template v-else>
                    <span class="profile-field__value">{{ engineerProfile?.inspector_id_start || "—" }}</span>
                    <span
                      v-if="engineerProfile?.inspector_id_start && engineerProfile?.inspector_number"
                      class="info-hint"
                    >
                      {{ t("profilePersonal.nextWillBe", { id: nextInspectionId }) }}
                    </span>
                    <span
                      v-else-if="engineerProfile?.inspector_id_start"
                      class="info-hint info-hint--warn"
                    >
                      {{ l.profilePersonal.needLicenseForNext }}
                    </span>
                  </template>
                </div>

                <div v-if="editingEngineer" class="profile-field profile-field--wide">
                  <button
                    v-if="!showPerTypeInspectorNumbers"
                    type="button"
                    class="btn btn--ghost btn--xs per-type-toggle"
                    @click="showPerTypeInspectorNumbers = true"
                  >{{ l.profilePersonal.addLicenseByType }}</button>
                  <div v-else>
                    <div class="per-type-inspector-numbers__head">
                      <span class="profile-field__label">{{ l.profilePersonal.licenseByType }}</span>
                      <button type="button" class="btn btn--ghost btn--xs" @click="showPerTypeInspectorNumbers = false; engineerForm.inspector_numbers_by_type = {}">{{ l.profilePersonal.dismiss }}</button>
                    </div>
                    <div class="profile-fields">
                      <div v-for="opt in inspectionTypeOptions" :key="opt.value" class="profile-field">
                        <span class="profile-field__label">{{ opt.label }}</span>
                        <n-input
                          v-model:value="engineerForm.inspector_numbers_by_type[opt.value]"
                          :placeholder="engineerForm.inspector_number || l.profilePersonal.licenseNumber"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div
                  v-else-if="engineerProfile && Object.keys(engineerProfile?.inspector_numbers_by_type ?? {}).length"
                  class="profile-field profile-field--wide"
                >
                  <span class="profile-field__label">{{ l.profilePersonal.licenseByType }}</span>
                  <div class="profile-fields">
                    <div v-for="[key, num] in Object.entries(engineerProfile?.inspector_numbers_by_type ?? {})" :key="key" class="profile-field">
                      <span class="profile-field__label">{{ inspectionTypeOptions.find((o) => o.value === key)?.label ?? key }}</span>
                      <span class="profile-field__value">{{ num }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="settings-group">
              <div class="settings-group__head">
                <span class="settings-group__icon" aria-hidden="true">
                  <n-icon :component="BusinessOutline" :size="18" />
                </span>
                <div>
                  <h3 class="settings-group__title">{{ l.profilePersonal.companyTitle }}</h3>
                  <p class="settings-group__desc">{{ l.profilePersonal.companyDesc }}</p>
                </div>
              </div>
              <div class="profile-fields">
                <div class="profile-field">
                  <span class="profile-field__label">{{ l.profilePersonal.companyName }}</span>
                  <n-input
                    v-if="editingEngineer"
                    v-model:value="engineerForm.company_name"
                    :placeholder="l.profilePersonal.companyNamePlaceholder"
                  />
                  <span v-else class="profile-field__value">{{ engineerProfile?.company_name || "—" }}</span>
                </div>
                <div class="profile-field">
                  <span class="profile-field__label">{{ l.profilePersonal.companySubtitle }}</span>
                  <n-input
                    v-if="editingEngineer"
                    v-model:value="engineerForm.company_subtitle"
                    :placeholder="l.profilePersonal.companySubtitlePlaceholder"
                  />
                  <span v-else class="profile-field__value">{{ engineerProfile?.company_subtitle || "—" }}</span>
                </div>
                <div class="profile-field">
                  <span class="profile-field__label">{{ l.profilePersonal.companyPhone }}</span>
                  <n-input
                    v-if="editingEngineer"
                    v-model:value="engineerForm.company_phone"
                    placeholder="052-8195650"
                  />
                  <span v-else class="profile-field__value">{{ engineerProfile?.company_phone || user?.phone || "—" }}</span>
                </div>
                <div class="profile-field">
                  <span class="profile-field__label">{{ l.profilePersonal.email }}</span>
                  <n-input
                    v-if="editingEngineer"
                    v-model:value="engineerForm.company_email"
                    placeholder="name@company.com"
                  />
                  <span v-else class="profile-field__value">{{ engineerProfile?.company_email || user?.email || "—" }}</span>
                </div>
              </div>

              <div class="brand-grid">
                <div class="brand-tile">
                  <span class="profile-field__label">{{ l.profilePersonal.companyLogo }}</span>
                  <img
                    v-if="engineerProfile?.company_logo_url"
                    :src="engineerProfile.company_logo_url"
                    class="logo-upload__preview"
                    :alt="l.profilePersonal.companyLogoAlt"
                  />
                  <input
                    ref="companyLogoInput"
                    type="file"
                    accept="image/*"
                    class="visually-hidden"
                    @change="uploadCompanyLogo"
                  />
                  <n-button size="small" ghost @click="(companyLogoInput as HTMLInputElement)?.click()">
                    <template #icon>
                      <n-icon :component="ImageOutline" />
                    </template>
                    {{ engineerProfile?.company_logo_url ? l.profilePersonal.replaceLogo : l.profilePersonal.uploadLogo }}
                  </n-button>
                </div>
                <div class="brand-tile">
                  <span class="profile-field__label">{{ l.profilePersonal.signature }}</span>
                  <img
                    v-if="signatureUrl"
                    :src="signatureUrl"
                    class="logo-upload__preview logo-upload__preview--signature"
                    :alt="l.profilePersonal.signatureAlt"
                  />
                  <input
                    ref="signatureInput"
                    type="file"
                    accept="image/*"
                    class="visually-hidden"
                    @change="uploadSignature"
                  />
                  <div class="signature-actions">
                    <n-button
                      size="small"
                      ghost
                      :loading="uploadingSignature"
                      @click="(signatureInput as HTMLInputElement)?.click()"
                    >
                      <template #icon>
                        <n-icon :component="ImageOutline" />
                      </template>
                      {{ signatureUrl ? l.profilePersonal.replaceSignature : l.profilePersonal.uploadSignature }}
                    </n-button>
                    <n-button
                      v-if="signatureUrl"
                      size="small"
                      ghost
                      :disabled="uploadingSignature"
                      @click="removeSignature"
                    >
                      {{ l.profilePersonal.remove }}
                    </n-button>
                  </div>
                  <span class="info-hint">{{ l.profilePersonal.signatureHint }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- סטטיסטיקות -->

        <section v-if="activeSection === 'stats'">
          <div class="section-header">
            <h2 class="section-title">סטטיסטיקות</h2>
            <n-tooltip v-if="!exportAllowed">
              <template #trigger>
                <span>
                  <n-button size="small" :disabled="true">
                    <template #icon>
                      <n-icon :component="DownloadOutline" />
                    </template>
                    יצוא CSV
                  </n-button>
                </span>
              </template>
              ייצוא זמין במסלולים בסיסי ועסקי בלבד.
            </n-tooltip>
            <n-button v-else size="small" @click="exportStatsCsv">
              <template #icon>
                <n-icon :component="DownloadOutline" />
              </template>
              יצוא CSV
            </n-button>
          </div>
          <div class="stats-row">
            <div class="stat-card">
              <span class="stat-card__num">{{ inspectionStats.total }}</span>
              <span class="stat-card__label">סה״כ תסקירים</span>
            </div>
            <div class="stat-card stat-card--green">
              <span class="stat-card__num">{{
                inspectionStats.completed
              }}</span>
              <span class="stat-card__label">הושלמו</span>
            </div>
            <div class="stat-card stat-card--orange">
              <span class="stat-card__num">{{ inspectionStats.pending }}</span>
              <span class="stat-card__label">ממתינים</span>
            </div>
          </div>
          <div class="info-card info-card--spaced">
            <div class="info-row">
              <span class="info-label">סה״כ תסקירים</span>
              <div class="progress-wrap">
                <n-progress
                  type="line"
                  :percentage="100"
                  :height="8"
                  color="var(--color-success)"
                  :show-indicator="false"
                />
                <span class="info-val">{{ inspectionStats.total }}</span>
              </div>
            </div>
            <div class="info-row">
              <span class="info-label">הושלמו</span>
              <div class="progress-wrap">
                <n-progress
                  type="line"
                  :percentage="completedPct"
                  :height="8"
                  color="var(--color-success)"
                  :show-indicator="false"
                />
                <span class="info-val">{{ inspectionStats.completed }}</span>
              </div>
            </div>
            <div class="info-row">
              <span class="info-label">ממתינים</span>
              <div class="progress-wrap">
                <n-progress
                  type="line"
                  :percentage="pendingPct"
                  :height="8"
                  color="var(--color-warning)"
                  :show-indicator="false"
                />
                <span class="info-val">{{ inspectionStats.pending }}</span>
              </div>
            </div>
          </div>
          <div class="info-card info-card--tight">
            <div class="info-row">
              <span class="info-label">סיכום חודשי</span>
              <span class="info-val"
                >{{ inspectionStats.monthly }} תסקירים החודש</span
              >
            </div>
          </div>
        </section>

        <!-- התראות ועדכונים -->
        <section v-if="activeSection === 'notifications'">
          <div class="section-header">
            <h2 class="section-title">התראות ועדכונים</h2>
            <n-select
              v-model:value="notifFilter"
              :options="notifFilterOptions"
              class="notif-filter"
              size="small"
            />
          </div>
          <div class="notif-list">
            <div
              v-for="notif in filteredNotifications"
              :key="notif.id"
              class="notif-item"
              :class="{ 'notif-item--unread': !notif.read }"
            >
              <n-tag
                :type="notifTagType(notif.type)"
                size="small"
                class="notif-tag"
              >{{ notifTypeLabel(notif.type) }}</n-tag>
              <div class="notif-body">
                <div class="notif-title">{{ notif.title }}</div>
                <div class="notif-date">{{ formatDate(notif.created_at) }}</div>
              </div>
            </div>
            <div v-if="filteredNotifications.length === 0" class="empty-state">
              אין התראות
            </div>
          </div>
        </section>

        <section v-if="activeSection === 'settings'">
          <div class="section-header">
            <h2 class="section-title">{{ l.profileSettings.title }}</h2>
          </div>

          <div class="settings-stack">
            <div class="settings-group">
              <div class="settings-group__head">
                <span class="settings-group__icon" aria-hidden="true">
                  <n-icon :component="LogoGoogle" :size="18" />
                </span>
                <div>
                  <h3 class="settings-group__title">{{ l.profileSettings.googleTitle }}</h3>
                  <p class="settings-group__desc">
                    {{ l.profileSettings.googleDescPrefix }}
                    <strong>{{ driveStatus?.folderName || "RemindOCR" }}</strong>
                    {{ l.profileSettings.googleDescSuffix }}
                  </p>
                </div>
              </div>

              <div class="settings-rows">
                <div class="settings-row">
                  <span class="settings-row__media">
                    <GmailLogo :size="20" />
                  </span>
                  <div class="settings-row__text">
                    <span class="settings-row__title">
                      Gmail
                      <span
                        class="settings-status"
                        :class="gmailStatus?.connected ? 'settings-status--on' : 'settings-status--off'"
                      >
                        {{ gmailStatus?.connected ? l.profileSettings.connected : l.profileSettings.notConnected }}
                      </span>
                    </span>
                    <span class="settings-row__desc">
                      {{
                        gmailStatus?.connected
                          ? (gmailStatus.email || l.profileSettings.connected)
                          : gmailLoading
                            ? l.profileSettings.loading
                            : l.profileSettings.gmailIdle
                      }}
                      <template v-if="gmailStatus?.connected && gmailStatus.importedCount != null">
                        {{ t("profileSettings.importedCount", {n: gmailStatus.importedCount}) }}
                      </template>
                    </span>
                  </div>
                  <div class="settings-row__actions">
                    <n-button
                      v-if="!gmailStatus?.connected && gmailAllowed"
                      :loading="gmailLoading"
                      size="small"
                      ghost
                      type="primary"
                      @click="connectGmailFromProfile"
                    >
                      {{ l.profileSettings.connectGmail }}
                    </n-button>
                    <n-button
                      v-else-if="!gmailStatus?.connected"
                      size="small"
                      ghost
                      @click="openSubscription"
                    >
                      {{ l.profileSettings.upgradePlan }}
                    </n-button>
                    <template v-else>
                      <n-button
                        size="small"
                        ghost
                        tag="a"
                        href="https://myaccount.google.com/permissions"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {{ l.profileSettings.managePermissions }}
                      </n-button>
                      <n-button
                        :loading="gmailDisconnecting"
                        size="small"
                        ghost
                        @click="disconnectGmailFromProfile"
                      >
                        {{ l.profileSettings.disconnect }}
                      </n-button>
                    </template>
                  </div>
                </div>

                <div class="settings-row">
                  <span class="settings-row__media">
                    <GoogleDriveLogo :size="20" />
                  </span>
                  <div class="settings-row__text">
                    <span class="settings-row__title">
                      Google Drive
                      <span
                        v-if="driveAllowed && driveStatus"
                        class="settings-status"
                        :class="driveFolderGone
                          ? 'settings-status--warn'
                          : driveStatus.syncEnabled
                            ? 'settings-status--on'
                            : 'settings-status--off'"
                      >
                        {{
                          driveFolderGone
                            ? l.profileSettings.folderMissing
                            : driveStatus.syncEnabled
                              ? l.profileSettings.connected
                              : l.profileSettings.off
                        }}
                      </span>
                    </span>
                    <span class="settings-row__desc">
                      <template v-if="!driveAllowed">{{ l.profileSettings.driveBasicBusinessOnly }}</template>
                      <template v-else-if="!driveStatus">{{ l.profileSettings.loadingStatus }}</template>
                      <template v-else-if="driveFolderGone">{{ l.profileSettings.syncFolderMissing }}</template>
                      <template v-else-if="!driveStatus.connected">{{ l.profileSettings.driveConsentNeeded }}</template>
                      <template v-else>{{ driveStatus.folderName || "RemindOCR" }}</template>
                    </span>
                  </div>
                  <div class="settings-row__actions">
                    <n-button
                      v-if="!driveAllowed"
                      size="small"
                      ghost
                      @click="openSubscription"
                    >
                      {{ l.profileSettings.upgradePlan }}
                    </n-button>
                    <template v-else-if="driveStatus">
                      <n-button
                        v-if="!driveStatus.connected"
                        :loading="driveToggling"
                        size="small"
                        ghost
                        type="primary"
                        @click="connectDriveFromProfile"
                      >
                        {{ l.profileSettings.connectDrive }}
                      </n-button>
                      <n-switch
                        v-else
                        :value="driveStatus.syncEnabled"
                        :loading="driveToggling"
                        :aria-label="l.profileSettings.driveSyncAria"
                        @update:value="onDriveSyncToggle"
                      />
                    </template>
                  </div>
                </div>

                <div class="settings-row">
                  <span class="settings-row__media">
                    <n-icon :component="CalendarOutline" :size="20" />
                  </span>
                  <div class="settings-row__text">
                    <span class="settings-row__title">
                      Google Calendar
                      <span
                        v-if="calendarAllowed"
                        class="settings-status"
                        :class="calendarStatus?.connected ? 'settings-status--on' : 'settings-status--off'"
                      >
                        {{ calendarStatus?.connected ? l.profileSettings.connected : l.profileSettings.notConnected }}
                      </span>
                    </span>
                    <span class="settings-row__desc">
                      <template v-if="!calendarAllowed">{{ l.profileSettings.calendarBusinessOnly }}</template>
                      <template v-else-if="calendarLoading">{{ l.profileSettings.loading }}</template>
                      <template v-else-if="calendarStatus?.connected">
                        {{ calendarStatus.email || l.profileSettings.connected }}
                        <small class="settings-row__subline">
                          {{ t("profileSettings.calendarSynced", {n: calendarStatus.synced_count}) }}
                        </small>
                      </template>
                      <template v-else>{{ l.profileSettings.calendarIdle }}</template>
                    </span>
                  </div>
                  <div class="settings-row__actions">
                    <n-button
                      v-if="!calendarAllowed"
                      size="small"
                      ghost
                      @click="openSubscription"
                    >
                      {{ l.profileSettings.upgradePlan }}
                    </n-button>
                    <n-button
                      v-if="!calendarAllowed && calendarStatus?.connected"
                      :loading="calendarDisconnecting"
                      size="small"
                      ghost
                      @click="disconnectCalendarFromProfile"
                    >
                      {{ l.profileSettings.disconnect }}
                    </n-button>
                    <n-button
                      v-else-if="!calendarStatus?.connected"
                      :loading="calendarLoading"
                      size="small"
                      ghost
                      type="primary"
                      @click="connectCalendarFromProfile"
                    >
                      {{ l.profileSettings.connectCalendar }}
                    </n-button>
                    <template v-else>
                      <n-button
                        v-if="calendarStatus.calendar_url"
                        size="small"
                        ghost
                        tag="a"
                        target="_blank"
                        rel="noopener noreferrer"
                        :href="calendarStatus.calendar_url"
                      >
                        <template #icon>
                          <n-icon :component="OpenOutline" />
                        </template>
                        {{ l.profileSettings.openCalendar }}
                      </n-button>
                      <n-button
                        :loading="calendarSyncing"
                        size="small"
                        ghost
                        @click="syncCalendarNow"
                      >
                        {{ l.profileSettings.syncNow }}
                      </n-button>
                      <n-button
                        :loading="calendarDisconnecting"
                        size="small"
                        ghost
                        @click="disconnectCalendarFromProfile"
                      >
                        {{ l.profileSettings.disconnect }}
                      </n-button>
                    </template>
                  </div>
                </div>

                <div v-if="calendarAllowed" class="settings-subrow tour-feed">
                  <span class="settings-panel__label">{{ l.profileSettings.feedTitle }}</span>
                  <p class="settings-row__desc">{{ l.profileSettings.feedHint }}</p>
                  <div v-if="calendarFeed?.enabled && calendarFeedUrl" class="inline-field__row">
                    <n-input :value="calendarFeedUrl" class="inline-field__input" size="small" readonly dir="ltr" @focus="($event.target as HTMLInputElement).select()" />
                    <n-button size="small" ghost @click="copyCalendarFeed">{{ l.profileSettings.feedCopy }}</n-button>
                    <n-button size="small" ghost tag="a" :href="calendarFeedWebcal">{{ l.profileSettings.feedOpen }}</n-button>
                    <n-button size="small" ghost :loading="calendarFeedBusy" @click="enableCalendarFeed">{{ l.profileSettings.feedRotate }}</n-button>
                    <n-button size="small" ghost :loading="calendarFeedBusy" @click="disableCalendarFeed">{{ l.profileSettings.feedDisable }}</n-button>
                  </div>
                  <n-button v-else size="small" ghost type="primary" :loading="calendarFeedBusy" @click="enableCalendarFeed">{{ l.profileSettings.feedEnable }}</n-button>
                </div>

                <div v-if="inboundEmail?.configured && !inboundEmail.allowed" class="settings-subrow">
                  <span class="settings-panel__label">{{ l.profileSettings.inboundTitle }}</span>
                  <p class="settings-row__desc">{{ l.profileSettings.inboundBusinessOnly }}</p>
                </div>
                <div v-if="inboundEmail?.configured && inboundEmail.allowed" class="settings-subrow tour-inbound">
                  <span class="settings-panel__label">{{ l.profileSettings.inboundTitle }}</span>
                  <p class="settings-row__desc">{{ l.profileSettings.inboundHint }}</p>
                  <div v-if="inboundEmail.enabled && inboundEmail.address" class="inline-field__row">
                    <n-input :value="inboundEmail.address" class="inline-field__input" size="small" readonly dir="ltr" @focus="($event.target as HTMLInputElement).select()" />
                    <n-button size="small" ghost @click="copyInboundAddress">{{ l.profileSettings.feedCopy }}</n-button>
                    <n-button size="small" ghost :loading="inboundBusy" @click="enableInboundEmail">{{ l.profileSettings.inboundRotate }}</n-button>
                    <n-button size="small" ghost :loading="inboundBusy" @click="disableInboundEmail">{{ l.profileSettings.feedDisable }}</n-button>
                  </div>
                  <n-button v-else size="small" ghost type="primary" :loading="inboundBusy" @click="enableInboundEmail">{{ l.profileSettings.inboundEnable }}</n-button>
                </div>

                <div v-if="calendarAllowed && calendarStatus?.connected" class="settings-subrow">
                  <label class="settings-panel__label" for="calendar-name">{{ l.profileSettings.calendarNameLabel }}</label>
                  <div class="inline-field__row">
                    <n-input
                      id="calendar-name"
                      v-model:value="calendarName"
                      class="inline-field__input"
                      :placeholder="DEFAULT_CALENDAR_NAME"
                      :maxlength="100"
                      size="small"
                    />
                    <n-button
                      :disabled="!calendarName?.trim() || calendarName.trim() === calendarStatus.calendar_name"
                      :loading="renamingCalendar"
                      size="small"
                      ghost
                      type="primary"
                      @click="renameCalendar"
                    >
                      {{ l.profileSettings.save }}
                    </n-button>
                  </div>
                </div>
              </div>

              <div
                v-if="driveAllowed && driveStatus && driveFolderGone"
                class="settings-panel"
              >
                <n-alert :bordered="false" type="warning">
                  <template v-if="driveStatus.folderState === 'trashed'">
                    {{ l.profileSettings.driveTrashed }}
                    <span v-if="driveStatus.syncedFileCount">
                      {{ t("profileSettings.driveTrashedCount", {n: driveStatus.syncedFileCount}) }}
                    </span>
                    {{ l.profileSettings.driveTrashedHint }}
                  </template>
                  <template v-else>
                    {{ l.profileSettings.driveDeleted }}
                    <span v-if="driveStatus.syncedFileCount">
                      {{ t("profileSettings.driveDeletedCount", {n: driveStatus.syncedFileCount}) }}
                    </span>
                    {{ l.profileSettings.driveDeletedHint }}
                  </template>
                </n-alert>
                <div class="settings-row__actions">
                  <n-button
                    v-if="driveStatus.folderState === 'trashed' && driveStatus.trashUrl"
                    size="small"
                    ghost
                    tag="a"
                    :href="driveStatus.trashUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <template #icon>
                      <n-icon :component="OpenOutline" />
                    </template>
                    {{ l.profileSettings.openTrash }}
                  </n-button>
                  <n-button
                    :loading="repairingFolder"
                    size="small"
                    ghost
                    type="warning"
                    @click="repairDriveFolder"
                  >
                    {{ l.profileSettings.recreateFolder }}
                  </n-button>
                </div>
              </div>

              <div
                v-if="driveAllowed && driveStatus?.syncEnabled && !driveFolderGone"
                class="settings-panel"
              >
                <div :aria-label="l.profileSettings.driveStatusAria" class="drive-dashboard">
                  <div class="drive-dashboard__item">
                    <strong>
                      {{ driveStatus.syncedFileCount ?? 0 }}<template v-if="driveStatus.totalFileCount != null"><span class="drive-dashboard__of">/ {{ driveStatus.totalFileCount }}</span></template>
                    </strong>
                    <span>{{ l.profileSettings.synced }}</span>
                  </div>
                  <div class="drive-dashboard__item">
                    <strong>{{ driveStatus.pendingFileCount ?? 0 }}</strong>
                    <span>{{ l.profileSettings.pending }}</span>
                  </div>
                  <div :class="{ 'drive-dashboard__item--warn': (driveStatus.missingFileCount ?? 0) > 0 }"
                       class="drive-dashboard__item">
                    <strong>{{ driveStatus.missingFileCount ?? 0 }}</strong>
                    <span>{{ l.profileSettings.missingFiles }}</span>
                  </div>
                  <div class="drive-dashboard__item">
                    <strong>{{ latestDriveJobLabel }}</strong>
                    <span>{{ l.profileSettings.lastExport }}</span>
                  </div>
                </div>
                <label class="settings-panel__label" for="drive-folder-name">{{ l.profileSettings.driveFolderName }}</label>
                <div class="drive-folder__row">
                  <n-input
                    id="drive-folder-name"
                    v-model:value="driveFolderName"
                    class="drive-folder__input"
                    placeholder="RemindOCR"
                    size="small"
                  />
                  <n-button
                    :disabled="!driveFolderName?.trim() || driveFolderName.trim() === driveStatus.folderName"
                    :loading="renamingFolder"
                    ghost
                    type="primary"
                    @click="renameDriveFolder"
                  >
                    {{ l.profileSettings.save }}
                  </n-button>
                </div>
                <n-button
                  v-if="driveFolderUrl"
                  size="small"
                  ghost
                  tag="a"
                  :href="driveFolderUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <template #icon>
                    <n-icon :component="OpenOutline" />
                  </template>
                  {{ l.profileSettings.openDriveFolder }}
                </n-button>
              </div>

              <div v-if="driveNeedsReauth" class="settings-panel">
                <n-alert :bordered="false" type="warning">
                  {{ l.profileSettings.reauthDrive }}
                </n-alert>
                <n-button size="small" ghost type="warning" @click="reconnectGmailForDrive">
                  {{ l.profileSettings.reconnectGmail }}
                </n-button>
              </div>
            </div>

            <div class="settings-group">
              <div class="settings-group__head">
                <span class="settings-group__icon" aria-hidden="true">
                  <n-icon :component="DiamondOutline" :size="18" />
                </span>
                <div>
                  <h3 class="settings-group__title">{{ l.profileSettings.featuresTitle }}</h3>
                  <p class="settings-group__desc">
                    {{ l.profileSettings.featuresDesc }}
                  </p>
                </div>
              </div>
              <div class="settings-rows">
                <div class="settings-row">
                  <span class="settings-row__media">
                    <n-icon :component="NotificationsOutline" :size="20" />
                  </span>
                  <div class="settings-row__text">
                    <span class="settings-row__title">
                      {{ l.profileSettings.autoReminders }}
                      <span
                        class="settings-status"
                        :class="autoRemindersAllowed ? 'settings-status--on' : 'settings-status--off'"
                      >
                        {{ autoRemindersAllowed ? l.profileSettings.active : l.profileSettings.notIncluded }}
                      </span>
                    </span>
                    <span class="settings-row__desc">
                      <template v-if="autoRemindersAllowed">{{ l.profileSettings.autoRemindersOn }}</template>
                      <template v-else>{{ l.profileSettings.autoRemindersOff }}</template>
                    </span>
                  </div>
                  <div class="settings-row__actions">
                    <n-button
                      v-if="!autoRemindersAllowed"
                      size="small"
                      ghost
                      @click="openSubscription"
                    >
                      {{ l.profileSettings.upgradePlan }}
                    </n-button>
                  </div>
                </div>

                <div class="settings-row">
                  <span class="settings-row__media">
                    <n-icon :component="PeopleOutline" :size="20" />
                  </span>
                  <div class="settings-row__text">
                    <span class="settings-row__title">{{ l.profileSettings.users }}</span>
                    <span class="settings-row__desc">{{ seatsUsageLabel }}</span>
                  </div>
                  <div class="settings-row__actions">
                    <n-tooltip>
                      <template #trigger>
                        <span>
                          <n-button size="small" ghost disabled>
                            {{ l.profileSettings.addUser }}
                          </n-button>
                        </span>
                      </template>
                      {{ seatLimit === 1 ? l.profileSettings.extraUsersLocked : l.profileSettings.extraUsersSoon }}
                    </n-tooltip>
                    <n-button
                      v-if="seatLimit === 1"
                      size="small"
                      ghost
                      @click="openSubscription"
                    >
                      {{ l.profileSettings.upgradePlan }}
                    </n-button>
                  </div>
                </div>

                <div class="settings-row">
                  <span class="settings-row__media">
                    <n-icon :component="MailOutline" :size="20" />
                  </span>
                  <div class="settings-row__text">
                    <span class="settings-row__title">{{ l.profileSettings.emailAccounts }}</span>
                    <span class="settings-row__desc">{{ emailAccountsUsageLabel }}</span>
                  </div>
                  <div class="settings-row__actions">
                    <n-tooltip>
                      <template #trigger>
                        <span>
                          <n-button size="small" ghost disabled>
                            {{ l.profileSettings.addAccount }}
                          </n-button>
                        </span>
                      </template>
                      {{ emailAccountLimit === 1 ? l.profileSettings.extraEmailLocked : l.profileSettings.extraEmailSoon }}
                    </n-tooltip>
                    <n-button
                      v-if="emailAccountLimit === 1"
                      size="small"
                      ghost
                      @click="openSubscription"
                    >
                      {{ l.profileSettings.upgradePlan }}
                    </n-button>
                  </div>
                </div>
              </div>
            </div>

            <div class="settings-group">
              <div class="settings-group__head">
                <span class="settings-group__icon" aria-hidden="true">
                  <n-icon :component="NotificationsOutline" :size="18" />
                </span>
                <div>
                  <h3 class="settings-group__title">{{ l.profileSettings.reminderTimingTitle }}</h3>
                  <p class="settings-group__desc">
                    {{ l.profileSettings.reminderTimingDesc }}
                  </p>
                </div>
              </div>
              <div class="advance-days">
                <div class="advance-days__list">
                  <span v-for="d in advanceDays" :key="d" class="advance-days__chip">
                    {{ t("profileSettings.days", {n: d}) }}
                    <button
                      :aria-label="t('profileSettings.removeDaysAria', {n: d})"
                      class="advance-days__remove"
                      type="button"
                      @click="removeAdvanceDay(d)"
                    >✕</button>
                  </span>
                  <span v-if="!advanceDays.length" class="advance-days__empty">
                    {{ l.profileSettings.noTimings }}
                  </span>
                </div>
                <div class="advance-days__add">
                  <n-input-number
                    v-model:value="newAdvanceDay"
                    :min="0"
                    :max="365"
                    :disabled="advanceDays.length >= 6"
                    :placeholder="l.profileSettings.daysPlaceholder"
                    size="small"
                    style="width: 140px"
                    @keyup.enter="addAdvanceDay"
                  />
                  <n-button
                    :disabled="!canAddAdvanceDay"
                    :loading="savingAdvanceDays"
                    size="small"
                    type="primary"
                    ghost
                    @click="addAdvanceDay"
                  >
                    {{ l.profileSettings.addTiming }}
                  </n-button>
                  <span v-if="advanceDays.length >= 6" class="advance-days__hint">
                    {{ l.profileSettings.maxTimings }}
                  </span>
                </div>
              </div>
            </div>

            <div class="settings-group">
              <div class="settings-group__head">
                <span class="settings-group__icon" aria-hidden="true">
                  <n-icon :component="CloudUploadOutline" :size="18" />
                </span>
                <div>
                  <h3 class="settings-group__title">{{ l.profileSettings.cloudTitle }}</h3>
                  <p class="settings-group__desc">
                    {{ l.profileSettings.cloudDesc }}
                  </p>
                </div>
              </div>
              <div class="settings-rows">
                <div class="settings-row">
                  <span class="settings-row__media">
                    <AwsS3Logo :size="18" />
                  </span>
                  <div class="settings-row__text">
                    <span class="settings-row__title">{{ l.profileSettings.invoices }}</span>
                    <span class="settings-row__desc">
                      <template v-if="!cloudStorageAllowed">{{ l.profileSettings.driveBasicBusinessOnly }}</template>
                      <template v-else>{{ l.profileSettings.cloudInvoicesDesc }}</template>
                    </span>
                  </div>
                  <div class="settings-row__actions">
                    <n-switch
                      :value="s3StoreInvoices"
                      :disabled="!cloudStorageAllowed"
                      :loading="savingCloudStorage === 'invoices'"
                      :aria-label="l.profileSettings.cloudInvoicesAria"
                      @update:value="(v: boolean) => saveCloudStorage('invoices', v)"
                    />
                  </div>
                </div>
                <div class="settings-row">
                  <span class="settings-row__media">
                    <AwsS3Logo :size="18" />
                  </span>
                  <div class="settings-row__text">
                    <span class="settings-row__title">{{ l.profileSettings.inspections }}</span>
                    <span class="settings-row__desc">
                      <template v-if="!cloudStorageAllowed">{{ l.profileSettings.driveBasicBusinessOnly }}</template>
                      <template v-else>{{ l.profileSettings.cloudInspectionsDesc }}</template>
                    </span>
                  </div>
                  <div class="settings-row__actions">
                    <n-switch
                      :value="s3StoreInspections"
                      :disabled="!cloudStorageAllowed"
                      :loading="savingCloudStorage === 'inspections'"
                      :aria-label="l.profileSettings.cloudInspectionsAria"
                      @update:value="(v: boolean) => saveCloudStorage('inspections', v)"
                    />
                  </div>
                </div>
              </div>
              <n-alert
                v-if="!s3StoreInvoices || !s3StoreInspections"
                :bordered="false"
                class="settings-panel"
                type="warning"
              >
                {{ l.profileSettings.cloudWarning }}
              </n-alert>
            </div>

            <div class="settings-group">
              <div class="settings-group__head">
                <span class="settings-group__icon" aria-hidden="true">
                  <n-icon :component="KeyOutline" :size="18" />
                </span>
                <div>
                  <h3 class="settings-group__title">{{ l.profileSettings.passwordTitle }}</h3>
                  <p class="settings-group__desc">{{ l.profileSettings.passwordDesc }}</p>
                </div>
              </div>
              <n-form class="settings-form" label-placement="top">
                <div class="settings-form__grid">
                  <n-form-item :label="l.profileSettings.currentPassword" :show-feedback="false">
                    <n-input
                      v-model:value="pwForm.current"
                      type="password"
                      show-password-on="click"
                      autocomplete="current-password"
                    />
                  </n-form-item>
                  <n-form-item :label="l.profileSettings.newPassword" :show-feedback="false">
                    <n-input
                      v-model:value="pwForm.next"
                      type="password"
                      show-password-on="click"
                      autocomplete="new-password"
                    />
                  </n-form-item>
                  <n-form-item
                    class="settings-form__span"
                    :label="l.profileSettings.confirmPassword"
                    :show-feedback="false"
                  >
                    <n-input
                      v-model:value="pwForm.confirm"
                      type="password"
                      show-password-on="click"
                      autocomplete="new-password"
                    />
                  </n-form-item>
                  <div class="settings-form__span">
                    <n-button
                      ghost
                      type="primary"
                      :loading="savingPw"
                      @click="changePassword"
                    >
                      {{ l.profileSettings.changePassword }}
                    </n-button>
                  </div>
                </div>
              </n-form>
            </div>

            <div class="settings-group settings-group--danger">
              <div class="settings-group__head">
                <span class="settings-group__icon settings-group__icon--danger" aria-hidden="true">
                  <n-icon :component="LogOutOutline" :size="18" />
                </span>
                <div>
                  <h3 class="settings-group__title">{{ l.profileSettings.sessionsTitle }}</h3>
                  <p class="settings-group__desc">{{ l.profileSettings.sessionsDesc }}</p>
                </div>
              </div>
              <div class="settings-row">
                <div class="settings-row__text">
                  <span class="settings-row__title">{{ l.profileSettings.signOutAll }}</span>
                  <span class="settings-row__desc">{{ l.profileSettings.signOutAllDesc }}</span>
                </div>
                <div class="settings-row__actions">
                  <n-button
                    ghost
                    type="error"
                    size="small"
                    :loading="disconnecting"
                    @click="disconnectAll"
                  >
                    <template #icon>
                      <n-icon :component="LogOutOutline" />
                    </template>
                    {{ l.profileSettings.signOutAllButton }}
                  </n-button>
                </div>
              </div>
            </div>

            <div class="settings-group settings-group--danger">
              <div class="settings-group__head">
                <span class="settings-group__icon settings-group__icon--danger" aria-hidden="true">
                  <n-icon :component="TrashOutline" :size="18" />
                </span>
                <div>
                  <h3 class="settings-group__title">{{ l.profileSettings.closeTitle }}</h3>
                  <p class="settings-group__desc">
                    {{ l.profileSettings.closeDesc }}<a :href="securityUrl" target="_blank" rel="noopener noreferrer">{{ l.profileSettings.securityPage }}</a>.
                  </p>
                </div>
              </div>
              <div class="settings-row">
                <div class="settings-row__text">
                  <span class="settings-row__title">{{ l.profileSettings.deleteForever }}</span>
                  <span class="settings-row__desc">{{ l.profileSettings.deleteForeverDesc }}</span>
                </div>
                <div class="settings-row__actions">
                  <n-button
                    ghost
                    type="error"
                    size="small"
                    :loading="deletingAccount"
                    @click="openDeleteAccount"
                  >
                    <template #icon>
                      <n-icon :component="TrashOutline" />
                    </template>
                    {{ l.profileSettings.closeButton }}
                  </n-button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section v-if="activeSection === 'theme'">
          <h2 class="section-title">נושא עיצוב</h2>
          <div class="theme-cards">
            <button
              type="button"
              class="theme-card"
              :class="{ 'theme-card--active': currentTheme === 'light' }"
              @click="setTheme('light')"
            >
              <div class="theme-card__preview theme-card__preview--light">
                <div class="theme-preview-bar" />
                <div class="theme-preview-content" />
              </div>
              <div class="theme-card__label">
                <n-icon :component="SunnyOutline" :size="16" />
                מצב בהיר
              </div>
            </button>
            <button
              type="button"
              class="theme-card"
              :class="{ 'theme-card--active': currentTheme === 'dark' }"
              @click="setTheme('dark')"
            >
              <div class="theme-card__preview theme-card__preview--dark">
                <div class="theme-preview-bar" />
                <div class="theme-preview-content" />
              </div>
              <div class="theme-card__label">
                <n-icon :component="MoonOutline" :size="16" />
                מצב כהה
              </div>
            </button>
          </div>
        </section>

        <section v-if="activeSection === 'subscription'">
          <BillingReminder show-upcoming @loaded="billingMode = $event.mode"/>
          <div class="section-header subscription-header">
            <div>
              <h2 class="section-title">{{ l.profileBilling.title }}</h2>
              <p class="subscription-header__desc">{{ l.profileBilling.subtitle }}</p>
            </div>
            <n-tag :type="planTag.type" size="small">{{ planTag.label }}</n-tag>
          </div>

          <dl v-if="currentPricingPlan" class="sub-metrics" :aria-label="l.profileBilling.summaryAria">
            <div>
              <dt>{{ l.profileBilling.price }}</dt>
              <dd>{{ planPriceLabel }}</dd>
            </div>
            <div>
              <dt>{{ l.profileBilling.quotaType }}</dt>
              <dd>{{ quotaScopeLabel }}</dd>
            </div>
            <div v-if="quotaPeriodLabel">
              <dt>{{ l.profileBilling.quotaPeriod }}</dt>
              <dd>{{ quotaPeriodLabel }}</dd>
            </div>
          </dl>

          <div class="plans-grid">
            <article
              v-for="plan in tierPlans"
              :key="plan.id"
              class="plan"
              :class="{
                'plan--highlighted': plan.highlighted && plan.id !== currentPlanId,
                'plan--current': plan.id === currentPlanId,
              }"
            >
              <span v-if="plan.id === currentPlanId" class="plan__badge">{{ l.profileBilling.yourPlan }}</span>
              <span v-else-if="plan.highlighted" class="plan__badge">{{ PRICING_COPY[locale].recommended }}</span>
              <h3 class="plan__name">{{ plan.name }}</h3>
              <p class="plan__blurb">{{ plan.blurb }}</p>
              <div class="plan__price">
                <strong>{{ plan.price === 0 ? l.profileBilling.free : `${currency}${plan.price}` }}</strong>
                <span v-if="plan.period" class="plan__price-period">{{ plan.period }}</span>
              </div>
              <ul class="plan__features">
                <li v-for="feature in plan.features" :key="feature">{{ feature }}</li>
              </ul>
              <template v-if="plan.id !== 'trial' && plan.id !== currentPlanId && PLAN_RANK[plan.id] > PLAN_RANK[currentPlanId]">
                <a class="plan__cta plan__cta--primary" :href="planPurchaseUrl(plan, locale)" rel="noopener" target="_blank">
                  {{ PRICING_COPY[locale].purchase }}
                </a>
                <p class="plan__soon-note">{{ PRICING_COPY[locale].purchaseNote }}</p>
              </template>
              <p v-else-if="plan.id === currentPlanId" class="plan__cta plan__cta--current">{{ l.profileBilling.yourPlan }}</p>
            </article>
          </div>
          <p class="plans-note">{{ PRICING_COPY[locale].existingCustomerNote }}</p>

          <div class="subscription-panels">
            <section class="sub-panel">
              <div class="sub-panel__head">
                <div>
                  <h3>{{ l.profileBilling.quotaUsage }}</h3>
                  <p>{{ l.profileBilling.quotaUsageDesc }}</p>
                </div>
              </div>
              <div v-if="quotaUsageRows.length" class="sub-quota-list">
                <div v-for="item in quotaUsageRows" :key="item.key" class="sub-quota">
                  <div class="sub-quota__head">
                    <span class="sub-quota__label">{{ item.label }}</span>
                    <span class="sub-quota__value">{{ item.usageLabel }}</span>
                  </div>
                  <n-progress
                      v-if="item.limit !== null"
                      :color="item.percent >= 100 ? 'var(--color-error)' : item.percent >= 80 ? 'var(--color-warning)' : 'var(--brand-color)'"
                      :height="8"
                      :percentage="item.percent"
                      :show-indicator="false"
                      type="line"
                  />
                  <p v-else class="sub-quota__unlimited">{{ l.profileBilling.unlimited }}</p>
                </div>
              </div>
              <div v-else class="sub-billing-empty sub-billing-empty--compact">
                {{ l.profileBilling.usageWaiting }}
              </div>
            </section>

            <section class="sub-panel">
              <div class="sub-panel__head">
                <div>
                  <h3>{{ l.profileBilling.usageDetails }}</h3>
                  <p>{{ l.profileBilling.usageDetailsDesc }}</p>
                </div>
              </div>
              <div v-if="importCounterRows.length" class="sub-counter-list">
                <div v-for="item in importCounterRows" :key="item.key" class="sub-counter">
                  <span>{{ item.label }}</span>
                  <strong>{{ item.value }}</strong>
                </div>
              </div>
              <div v-else class="sub-billing-empty sub-billing-empty--compact">
                {{ l.profileBilling.usageEmpty }}
              </div>
            </section>
          </div>

          <section class="sub-panel sub-billing-panel">
            <div class="sub-panel__head">
              <div>
                <h3>{{ l.profileBilling.billingHistory }}</h3>
                <p>{{ l.profileBilling.billingHistoryDesc }}</p>
              </div>
              <n-icon :component="ReceiptOutline" :size="20"/>
            </div>
            <div v-if="billingHistory.length" class="billing-table-wrap">
              <table class="billing-table">
                <thead>
                <tr>
                  <th>{{ l.profileBilling.colDate }}</th>
                  <th>{{ l.profileBilling.colAmount }}</th>
                  <th>{{ l.profileBilling.colStatus }}</th>
                  <th>{{ l.profileBilling.colDescription }}</th>
                </tr>
                </thead>
                <tbody>
                <tr v-for="(row, index) in billingHistory" :key="index">
                  <td>{{ formatDate(row.date) }}</td>
                  <td>{{ currency }}{{ row.amount }}</td>
                  <td>{{ row.status }}</td>
                  <td>{{ row.description }}</td>
                </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="sub-billing-empty">
              {{ l.profileBilling.noCharges }}
            </div>
          </section>
        </section>
      </n-spin>
    </main>
    </div>
  </div>

  <n-modal
    v-model:show="showDeleteAccountModal"
    preset="card"
    :title="l.profileSettings.deleteModalTitle"
    style="width: min(480px, 94vw)"
    :mask-closable="!deletingAccount"
    :closable="!deletingAccount"
  >
    <p class="delete-account-warn">
      {{ l.profileSettings.deleteModalBody }}
      {{ l.profileSettings.deleteModalIrreversible }}
    </p>
    <n-form-item v-if="user?.email" :label="l.profileSettings.deleteEmailConfirm" :show-feedback="false">
      <n-input
        v-model:value="deleteAccountEmail"
        type="text"
        :placeholder="user.email"
        :disabled="deletingAccount"
        autocomplete="off"
      />
    </n-form-item>
    <n-form-item :label="l.profileSettings.deleteTypeConfirm" :show-feedback="false">
      <n-input
        v-model:value="deleteAccountConfirm"
        type="text"
        placeholder="DELETE_ACCOUNT"
        :disabled="deletingAccount"
        autocomplete="off"
      />
    </n-form-item>
    <template #footer>
      <n-space justify="end">
        <n-button :disabled="deletingAccount" @click="showDeleteAccountModal = false">{{ l.common.cancel }}</n-button>
        <n-button
          type="error"
          :loading="deletingAccount"
          :disabled="!canConfirmDeleteAccount"
          @click="confirmDeleteAccount"
        >
          {{ l.profileSettings.deleteConfirmButton }}
        </n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import BillingReminder from "../components/BillingReminder.vue";
import {computed, onMounted, ref, watch, type Component} from "vue";
import {useRoute, useRouter} from "vue-router";
import {loginPath} from "../stores/locale.js";
import {
  NAlert,
  NButton,
  NDatePicker,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NInputNumber,
  NModal,
  NProgress,
  NSelect,
  NSpace,
  NSpin,
  NSwitch,
  NTag,
  NTooltip,
  useMessage,
} from "naive-ui";
import {
  CalendarOutline,
  CameraOutline,
  BusinessOutline,
  CardOutline,
  CloudUploadOutline,
  ColorPaletteOutline,
  CreateOutline,
  DiamondOutline,
  DownloadOutline,
  ImageOutline,
  KeyOutline,
  LockClosedOutline,
  LogOutOutline,
  LogoGoogle,
  MailOutline,
  MoonOutline,
  NotificationsOutline,
  OpenOutline,
  PeopleOutline,
  PersonOutline,
  SettingsOutline,
  StatsChartOutline,
  SunnyOutline,
  TrashOutline,
  ReceiptOutline,
} from "@vicons/ionicons5";
import { storeToRefs } from "pinia";
import { useAuthStore } from "../stores/auth.js";
import { useUserSettingsStore } from "../stores/userSettings.js";
import {api, type DriveExportJob, type DriveStatus, type InboundEmailStatus, type ProfileSubscription} from "../services/apiService.js";
import {INSPECTION_PRINT_TEMPLATE_PRESETS} from "@shared/printTemplateLayout.js";
import type { User, UserSettings } from "@shared/types.js";
import {useI18n} from "../composables/useI18n.js";
import {useDevModal} from "../composables/useDevModal.js";
import GmailLogo from "../components/GmailLogo.vue";
import GoogleDriveLogo from "../components/GoogleDriveLogo.vue";
import AwsS3Logo from "../components/AwsS3Logo.vue";
import {useConfirm} from "../composables/useConfirm.js";
import {
  PLAN_LABELS,
  PLAN_LABELS_EN,
  formatPlanPrice,
  getPricingPlanForLocale,
  moneySymbol,
  plansForLocale,
  PRICING_COPY,
  planPurchaseUrl,
  quotaPercent,
  resolveUserPlan,
  planAllowsGoogleDrive,
  planAllowsGoogleCalendar,
  planAllowsAutomaticEmailReminders,
  featureFlagsForUser,
  planAllowsFileStorage,
  PLAN_GATE_MESSAGES,
  type PlanId,
} from "../shared/pricingPlans.js";
import {localizedPath, marketingUrl} from "../stores/locale.js";

const route = useRoute();
const router = useRouter();
const {l, t, locale} = useI18n();
const securityUrl = computed(() => marketingUrl("/security", locale.value));
const settingsReturnPath = computed(() => `${localizedPath("/profile", locale.value)}?section=settings`);

const message = useMessage();
const {confirm} = useConfirm();
const authStore = useAuthStore();
const userSettingsStore = useUserSettingsStore();
const {user: engineerProfile} = storeToRefs(authStore);
const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

// ── State ────────────────────────────────────────────────────────────────────
const loading = ref(true);
const activeSection = ref("personal");

const user = computed(() => authStore.user as User | null);
const userSettings = ref<UserSettings | null>(null);

// ── Cloud storage toggles ───────────────────────────────────────────────────
// Unset means enabled: the settings row predates these fields for existing
// users, and the server applies the same default.
const savingCloudStorage = ref<"invoices" | "inspections" | null>(null);
// Cloud storage is a paid feature — free accounts see the rows locked with an
// upsell, and the digital plan has no file storage at all (fileStorage flag).
const cloudStorageAllowed = computed(
    () => currentPlanId.value !== "expired" && planAllowsFileStorage(currentPlanId.value));
const s3StoreInvoices = computed(() =>
    cloudStorageAllowed.value && userSettings.value?.s3_store_invoices !== false);
const s3StoreInspections = computed(() =>
    cloudStorageAllowed.value && userSettings.value?.s3_store_inspection_reports !== false);

// ── Reminder advance days ───────────────────────────────────────────────────
const newAdvanceDay = ref<number | null>(null);
const savingAdvanceDays = ref(false);

const advanceDays = computed<number[]>(() => {
  const raw = userSettings.value?.reminder_advance_days;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed)
      ? parsed.map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => b - a)
      : [];
  } catch {
    return [];
  }
});

const canAddAdvanceDay = computed(() => {
  const v = newAdvanceDay.value;
  return v != null && Number.isInteger(v) && v >= 0 && v <= 365
    && !advanceDays.value.includes(v) && advanceDays.value.length < 6;
});

async function persistAdvanceDays(days: number[]) {
  savingAdvanceDays.value = true;
  const patch = {reminder_advance_days: JSON.stringify(days)};
  try {
    await userSettingsStore.save(patch as Partial<UserSettings>);
    if (userSettings.value) Object.assign(userSettings.value, patch);
    message.success(l.value.profileSettings.timingsSaved);
  } catch {
    message.error(l.value.profileSettings.timingsSaveError);
  } finally {
    savingAdvanceDays.value = false;
  }
}

async function addAdvanceDay() {
  if (!canAddAdvanceDay.value) return;
  const next = [...advanceDays.value, Number(newAdvanceDay.value)].sort((a, b) => b - a);
  newAdvanceDay.value = null;
  await persistAdvanceDays(next);
}

async function removeAdvanceDay(day: number) {
  await persistAdvanceDays(advanceDays.value.filter((d) => d !== day));
}

async function saveCloudStorage(target: "invoices" | "inspections", value: boolean) {
  savingCloudStorage.value = target;
  const patch = target === "invoices"
    ? { s3_store_invoices: value }
    : { s3_store_inspection_reports: value };
  try {
    await userSettingsStore.save(patch as Partial<UserSettings>);
    // Mirror locally so the switch reflects the saved state without a reload.
    if (userSettings.value) Object.assign(userSettings.value, patch);
    message.success(value ? l.value.profileSettings.cloudOn : l.value.profileSettings.cloudOff);
  } catch {
    message.error(l.value.profileSettings.settingSaveError);
  } finally {
    savingCloudStorage.value = null;
  }
}

// ── Sidebar nav ──────────────────────────────────────────────────────────────
const navItems = computed(() => {
  const isAdmin = user.value?.role === "admin";
  const items: { key: string; icon: Component; label: string }[] = [
    { key: "personal", icon: PersonOutline, label: l.value.profile.personal },
  ];
  if (isAdmin) {
    items.push(
      { key: "stats", icon: StatsChartOutline, label: l.value.profile.stats },
      { key: "notifications", icon: NotificationsOutline, label: l.value.profile.notifications },
    );
  }
  items.push({ key: "settings", icon: SettingsOutline, label: l.value.profile.settings });
  if (isAdmin) {
    items.push({ key: "theme", icon: ColorPaletteOutline, label: l.value.profile.theme });
  }
  items.push({ key: "subscription", icon: DiamondOutline, label: l.value.profile.subscription });
  return items;
});

function setActiveSection(section: string) {
  if (!navItems.value.some((item) => item.key === section)) return;
  activeSection.value = section;
}

function openSubscription() {
  setActiveSection("subscription");
  if (route.query.section !== "subscription") {
    router.replace({path: route.path, query: {...route.query, section: "subscription"}});
  }
}

function applySectionFromRoute() {
  // "engineer" was a separate tab before the engineer fields moved onto the
  // personal one — existing links still point at it.
  const section = String(route.query.section ?? "").replace(/^engineer$/, "personal");
  if (section) {
    setActiveSection(section);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const initials = computed(() => {
  const name = user.value?.name ?? "";
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase() || (user.value?.email ?? "").substring(0, 2).toUpperCase()
  );
});

const ROLE_META: Record<
  string,
  { label: string; type: "warning" | "info" | "default" }
> = {
  admin: { label: "מנהל מערכת", type: "warning" },
  pro: { label: "Pro", type: "info" },
  user: { label: "משתמש", type: "default" },
};
const roleTag = computed(
  () => ROLE_META[user.value?.role ?? "user"] ?? ROLE_META.user,
);

const PLAN_TAG_TYPES: Record<PlanId, "success" | "info" | "default"> = {
  expired: "default",
  trial: "default",
  digital: "info",
  basic: "info",
  business: "success",
};
const currentPlanId = computed(() => resolveUserPlan(user.value));
const exportAllowed = computed(() => featureFlagsForUser(user.value).excelExport);
const currency = computed(() => moneySymbol(locale.value));
const billingMode = ref<string | null>(null);
const currentPricingPlan = computed(() => {
  const plan = getPricingPlanForLocale(currentPlanId.value, locale.value);
  if (billingMode.value !== "one_time" || !plan) return plan;
  return {...plan, yearlyPrice: undefined};
});

const PLAN_RANK: Record<PlanId, number> = {
  expired: 0,
  trial: 1,
  digital: 2,
  basic: 3,
  business: 4,
};

const tierPlans = computed(() => plansForLocale(locale.value));

const planTag = computed(() => ({
  label: (locale.value === "en" ? PLAN_LABELS_EN : PLAN_LABELS)[currentPlanId.value],
  type: PLAN_TAG_TYPES[currentPlanId.value],
}));
const planPriceLabel = computed(() => formatPlanPrice(currentPricingPlan.value, locale.value));

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(locale.value === "en" ? "en-US" : "he-IL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ── Profile ──────────────────────────────────────────────────────────────────
const nextInspectionId = computed(() => {
  const start = parseInt(engineerProfile.value?.inspector_id_start ?? "0", 10);
  const total = inspectionStats.value.total;
  if (!start) return "—";
  return `${engineerProfile.value?.inspector_number ?? "—"}/${start + total}`;
});

const editingEngineer = ref(false);
const savingEngineer = ref(false);
const engineerForm = ref({
  name: "",
  phone: "",
  inspector_number: "",
  address: "",
  city: "",
  title: "",
  expertise: "",
  inspector_id_start: "",
  company_name: "",
  company_registration: "",
  company_subtitle: "",
  company_phone: "",
  company_email: "",
  inspector_numbers_by_type: {} as Record<string, string>,
});

// Some inspectors hold a separate ministry certificate per inspection type
// rather than one number covering everything — this is only shown/editable
// when a type-specific number has actually been set, or the user opts in via
// "הוסף רישוי לפי בדיקה", so the common single-number case stays a
// one-line field.
const showPerTypeInspectorNumbers = ref(false);
const inspectionTypeOptions = computed(() =>
  INSPECTION_PRINT_TEMPLATE_PRESETS.map((p) => ({
    label: l.value.profilePersonal.types[p.key as keyof typeof l.value.profilePersonal.types] ?? p.name,
    value: p.key,
  })),
);

function startEditEngineer() {
  const p = engineerProfile.value;
  engineerForm.value = {
    name: p?.name ?? "",
    phone: p?.phone ?? "",
    inspector_number: p?.inspector_number ?? "",
    address: p?.address ?? "",
    city: p?.city ?? "",
    title: p?.title ?? "",
    expertise: p?.expertise ?? "",
    // New users get a suggested 5-digit starting number rather than a blank
    // field — editable before saving, just a sane default to start from.
    inspector_id_start: p?.inspector_id_start ?? "10001",
    company_name: p?.company_name ?? "",
    company_registration: p?.company_registration ?? "",
    company_subtitle: p?.company_subtitle ?? "",
    // Seed the company contact fields from the personal ones when they've
    // never been set — a solo inspector's company phone/email is usually
    // their own, and an empty field here weakens the extraction filter.
    company_phone: p?.company_phone || user.value?.phone || "",
    company_email: p?.company_email || user.value?.email || "",
    inspector_numbers_by_type: {...(p?.inspector_numbers_by_type ?? {})},
  };
  showPerTypeInspectorNumbers.value = Object.keys(engineerForm.value.inspector_numbers_by_type).length > 0;
  editingEngineer.value = true;
}
function cancelEditEngineer() {
  editingEngineer.value = false;
}
async function saveEngineer() {
  savingEngineer.value = true;
  try {
    const {name, phone, ...formFields} = engineerForm.value;
    const inspectorNumbersByType = showPerTypeInspectorNumbers.value
      ? Object.fromEntries(
          Object.entries(formFields.inspector_numbers_by_type).filter(([, v]) => v.trim())
        )
      : {};
    await authStore.save({
      name,
      phone,
      ...formFields,
      inspector_numbers_by_type: inspectorNumbersByType,
      inspector_id_start: engineerForm.value.inspector_id_start || null,
    });
    editingEngineer.value = false;
    message.success("הפרופיל עודכן");
  } catch {
    message.error("שגיאה בשמירה");
  } finally {
    savingEngineer.value = false;
  }
}

async function uploadCompanyLogo(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const form = new FormData();
  form.append("logo", file);
  try {
    const res = await fetch(`${SERVER}/api/profile/company-logo`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (res.ok) {
      const data = await res.json();
      authStore.patch({ company_logo_url: data.company_logo_url });
      message.success("הלוגו הועלה");
    } else {
      message.error("שגיאה בהעלאת הלוגו");
    }
  } catch {
    message.error("שגיאה בהעלאת הלוגו");
  }
  (e.target as HTMLInputElement).value = "";
}

const companyLogoInput = ref<HTMLInputElement | null>(null);

// ── Signature ────────────────────────────────────────────────────────────────
// One signature per user, stamped onto generated inspection documents. A print
// template that pins its own signature image still overrides this.
const signatureInput = ref<HTMLInputElement | null>(null);
const uploadingSignature = ref(false);
const signatureUrl = computed(() => engineerProfile.value?.signature_url ?? null);

async function uploadSignature(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const form = new FormData();
  form.append("signature", file);
  uploadingSignature.value = true;
  try {
    const res = await fetch(`${SERVER}/api/profile/signature`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    authStore.patch({signature_url: data.signature_url});
    message.success("החתימה הועלתה");
  } catch {
    message.error("שגיאה בהעלאת החתימה");
  } finally {
    uploadingSignature.value = false;
  }
}

async function removeSignature() {
  uploadingSignature.value = true;
  try {
    const res = await fetch(`${SERVER}/api/profile/signature`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) throw new Error(String(res.status));
    authStore.patch({signature_url: null});
    message.success("החתימה הוסרה");
  } catch {
    message.error("שגיאה בהסרת החתימה");
  } finally {
    uploadingSignature.value = false;
  }
}

// ── Statistics ───────────────────────────────────────────────────────────────
const inspectionStats = ref({ total: 0, completed: 0, pending: 0, monthly: 0 });
const completedPct = computed(() =>
  inspectionStats.value.total
    ? Math.round(
        (inspectionStats.value.completed / inspectionStats.value.total) * 100,
      )
    : 0,
);
const pendingPct = computed(() =>
  inspectionStats.value.total
    ? Math.round(
        (inspectionStats.value.pending / inspectionStats.value.total) * 100,
      )
    : 0,
);

function exportStatsCsv() {
  if (!exportAllowed.value) {
    message.warning("ייצוא זמין במסלולים בסיסי ועסקי בלבד.");
    return;
  }
  const rows = [
    ["סטטיסטיקה", "ערך"],
    ["סה״כ תסקירים", inspectionStats.value.total],
    ["הושלמו", inspectionStats.value.completed],
    ["ממתינים", inspectionStats.value.pending],
    ["החודש", inspectionStats.value.monthly],
  ];
  const csv = rows.map((r) => r.join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }),
  );
  a.download = "stats.csv";
  a.click();
}

// ── Notifications ────────────────────────────────────────────────────────────
const notifications = ref<any[]>([]);
const notifFilter = ref<string | null>(null);
const notifFilterOptions = [
  { label: "הכל", value: null },
  { label: "מידע", value: "info" },
  { label: "אזהרה", value: "warning" },
  { label: "שגיאה", value: "error" },
];
const filteredNotifications = computed(() =>
  notifFilter.value
    ? notifications.value.filter((n) => n.type === notifFilter.value)
    : notifications.value,
);
function notifTagType(type: string): "info" | "warning" | "error" | "default" {
  const map: Record<string, "info" | "warning" | "error" | "default"> = {
    info: "info",
    warning: "warning",
    error: "error",
  };
  return map[type] ?? "default";
}
function notifTypeLabel(type: string) {
  return { info: "מידע", warning: "אזהרה", error: "שגיאה" }[type] ?? type;
}

// ── Avatar upload ────────────────────────────────────────────────────────────
const avatarInput = ref<HTMLInputElement | null>(null);
const uploadingAvatar = ref(false);

async function onAvatarChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  uploadingAvatar.value = true;
  try {
    const form = new FormData();
    form.append("avatar", file);
    const res = await fetch(`${SERVER}/api/profile/avatar`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!res.ok) throw new Error(`${res.status}`);
    await authStore.fetchMe();
    message.success("תמונת הפרופיל עודכנה");
  } catch {
    message.error("שגיאה בהעלאת התמונה");
  } finally {
    uploadingAvatar.value = false;
    if (avatarInput.value) avatarInput.value.value = "";
  }
}

// ── Settings: password ───────────────────────────────────────────────────────
const pwForm = ref({ current: "", next: "", confirm: "" });
const savingPw = ref(false);
const disconnecting = ref(false);
const deletingAccount = ref(false);
const showDeleteAccountModal = ref(false);
useDevModal("profile.deleteAccount", showDeleteAccountModal);
const deleteAccountEmail = ref("");
const deleteAccountConfirm = ref("");

const canConfirmDeleteAccount = computed(() => {
  const phraseOk = deleteAccountConfirm.value.trim() === "DELETE_ACCOUNT";
  const accountEmail = String(user.value?.email ?? "").trim().toLowerCase();
  if (!accountEmail) return phraseOk;
  return phraseOk && deleteAccountEmail.value.trim().toLowerCase() === accountEmail;
});

function openDeleteAccount() {
  deleteAccountEmail.value = "";
  deleteAccountConfirm.value = "";
  showDeleteAccountModal.value = true;
}

async function confirmDeleteAccount() {
  if (!canConfirmDeleteAccount.value) {
    message.error("יש לאשר את המחיקה לפי ההנחיות");
    return;
  }
  deletingAccount.value = true;
  try {
    await api.profile.deleteAccount({
      confirm: "DELETE_ACCOUNT",
      email: user.value?.email ? deleteAccountEmail.value.trim() : undefined,
    });
    showDeleteAccountModal.value = false;
    message.success("החשבון והנתונים נמחקו");
    localStorage.removeItem("auth_user");
    window.location.href = loginPath();
  } catch (err: any) {
    const code = String(err?.message ?? "");
    if (code.includes("email_mismatch")) message.error("כתובת האימייל אינה תואמת");
    else if (code.includes("cannot_delete_while_impersonating")) message.error("לא ניתן למחוק חשבון במצב צפייה כמשתמש אחר");
    else if (code.includes("confirm_required")) message.error("יש להקליד DELETE_ACCOUNT לאישור");
    else message.error("שגיאה במחיקת החשבון");
  } finally {
    deletingAccount.value = false;
  }
}
const gmailStatus = ref<{ connected: boolean; source: string | null; email: string | null; importedCount?: number | null } | null>(null);
const gmailLoading = ref(false);
const gmailDisconnecting = ref(false);
const calendarStatus = ref<{
  allowed?: boolean;
  connected: boolean;
  calendar_id: string | null;
  calendar_url: string | null;
  calendar_name?: string;
  email: string | null;
  synced_count: number;
  last_synced_at: string | null;
} | null>(null);
const calendarLoading = ref(false);
const calendarSyncing = ref(false);
const calendarDisconnecting = ref(false);
/** Mirrors APP_CALENDAR_SUMMARY on the server. */
const DEFAULT_CALENDAR_NAME = computed(() => l.value.profileSettings.calendarDefaultName);
const calendarName = ref("");
const renamingCalendar = ref(false);
const driveStatus = ref<DriveStatus | null>(null);
const driveToggling = ref(false);
const driveNeedsReauth = ref(false);
const driveFolderName = ref("RemindOCR");
const renamingFolder = ref(false);
const repairingFolder = ref(false);
const driveAllowed = computed(() => {
  if (driveStatus.value?.allowed === false) return false;
  return planAllowsGoogleDrive(currentPlanId.value);
});
const calendarAllowed = computed(() => {
  if (calendarStatus.value?.allowed === false) return false;
  return userSettings.value?.plan_entitlements?.googleCalendarSync
    ?? planAllowsGoogleCalendar(currentPlanId.value);
});
const autoRemindersAllowed = computed(() =>
  userSettings.value?.plan_entitlements?.automaticEmailReminders
  ?? planAllowsAutomaticEmailReminders(currentPlanId.value),
);
const seatLimit = computed(() =>
  userSettings.value?.plan_entitlements?.maxUsers
  ?? (currentPlanId.value === "business" ? null : currentPlanId.value === "basic" ? 2 : 1),
);
const emailAccountLimit = computed(() =>
  userSettings.value?.plan_entitlements?.maxEmailAccounts
  ?? (currentPlanId.value === "business" ? null : currentPlanId.value === "basic" ? 2 : 1),
);
// maxEmailAccounts: 0 means the plan gets no mailbox connection at all.
const gmailAllowed = computed(() => emailAccountLimit.value === null || emailAccountLimit.value > 0);

const seatsUsageLabel = computed(() =>
  seatLimit.value === null
    ? l.value.profileSettings.usageUnlimited
    : t("profileSettings.usageOf", {n: seatLimit.value}),
);
const emailAccountsUsageLabel = computed(() =>
  emailAccountLimit.value === null
    ? l.value.profileSettings.usageUnlimited
    : t("profileSettings.usageOf", {n: emailAccountLimit.value}),
);
const driveFolderGone = computed(() => {
  const state = driveStatus.value?.folderState;
  return state === "missing" || state === "trashed";
});
const driveFolderUrl = computed(() => {
  if (driveFolderGone.value) return null;
  if (driveStatus.value?.folderUrl) return driveStatus.value.folderUrl;
  if (driveStatus.value?.folderId) {
    return `https://drive.google.com/drive/folders/${driveStatus.value.folderId}`;
  }
  return null;
});
const latestDriveJobLabel = computed(() => {
  const job = driveStatus.value?.latestJob;
  if (!job) return l.value.profileSettings.jobNone;
  if (job.status === "queued") return l.value.profileSettings.jobQueued;
  if (job.status === "running") return `${job.processed}/${job.total}`;
  if (job.status === "failed") return l.value.profileSettings.jobFailed;
  return t("profileSettings.jobUploaded", {n: job.uploaded});
});

async function loadDriveStatus() {
  try {
    driveStatus.value = await api.drive.status();
    driveFolderName.value = driveStatus.value.folderName || "RemindOCR";
  } catch {
    driveStatus.value = null;
  }
}

const inboundEmail = ref<InboundEmailStatus | null>(null);
const inboundBusy = ref(false);
async function loadInboundEmail() {
  try { inboundEmail.value = await api.inboundEmail.status(); } catch { inboundEmail.value = null; }
}
async function enableInboundEmail() {
  inboundBusy.value = true;
  try { inboundEmail.value = await api.inboundEmail.enable(); }
  catch { message.error(l.value.profileSettings.feedError); }
  finally { inboundBusy.value = false; }
}
async function disableInboundEmail() {
  inboundBusy.value = true;
  try { await api.inboundEmail.disable(); await loadInboundEmail(); }
  catch { message.error(l.value.profileSettings.feedError); }
  finally { inboundBusy.value = false; }
}
async function copyInboundAddress() {
  try { await navigator.clipboard.writeText(inboundEmail.value?.address ?? ""); message.success(l.value.profileSettings.feedCopied); }
  catch { message.error(l.value.profileSettings.feedError); }
}

const calendarFeed = ref<{ enabled: boolean; path: string | null } | null>(null);
const calendarFeedBusy = ref(false);
const calendarFeedUrl = computed(() =>
  calendarFeed.value?.path ? `${window.location.origin}${calendarFeed.value.path}` : "",
);
const calendarFeedWebcal = computed(() => calendarFeedUrl.value.replace(/^https?:/, "webcal:"));
async function loadCalendarFeed() {
  try { calendarFeed.value = await api.calendar.feedStatus(); } catch { calendarFeed.value = null; }
}
async function enableCalendarFeed() {
  calendarFeedBusy.value = true;
  try { calendarFeed.value = await api.calendar.feedEnable(); }
  catch { message.error(l.value.profileSettings.feedError); }
  finally { calendarFeedBusy.value = false; }
}
async function disableCalendarFeed() {
  calendarFeedBusy.value = true;
  try { await api.calendar.feedDisable(); calendarFeed.value = { enabled: false, path: null }; }
  catch { message.error(l.value.profileSettings.feedError); }
  finally { calendarFeedBusy.value = false; }
}
async function copyCalendarFeed() {
  try { await navigator.clipboard.writeText(calendarFeedUrl.value); message.success(l.value.profileSettings.feedCopied); }
  catch { message.error(l.value.profileSettings.feedError); }
}

async function loadCalendarStatus() {
  calendarLoading.value = true;
  void loadCalendarFeed();
  void loadInboundEmail();
  try {
    calendarStatus.value = await api.calendar.status();
    calendarName.value = calendarStatus.value?.calendar_name || DEFAULT_CALENDAR_NAME.value;
  } catch {
    calendarStatus.value = null;
  } finally {
    calendarLoading.value = false;
  }
}

async function renameCalendar() {
  const name = calendarName.value?.trim();
  if (!name) return;
  renamingCalendar.value = true;
  try {
    const result = await api.calendar.rename(name);
    // The name is stored either way; only the push to Google can fail, and the
    // next sync reconciles it, so say so rather than reporting an error.
    if (result.synced) message.success("שם היומן עודכן");
    else message.info("שם היומן נשמר ויתעדכן בסנכרון הבא");
    await loadCalendarStatus();
  } catch {
    message.error("שגיאה בשינוי שם היומן");
  } finally {
    renamingCalendar.value = false;
  }
}

async function connectCalendarFromProfile() {
  if (!calendarAllowed.value) {
    message.warning(PLAN_GATE_MESSAGES.calendar);
    return;
  }
  calendarLoading.value = true;
  try {
    const {url} = await api.calendar.authUrl(settingsReturnPath.value);
    window.location.href = url;
  } catch {
    calendarLoading.value = false;
    message.error("חיבור היומן נכשל");
  }
}

async function syncCalendarNow() {
  if (!calendarAllowed.value) {
    message.warning(PLAN_GATE_MESSAGES.calendar);
    return;
  }
  calendarSyncing.value = true;
  try {
    const result = await api.calendar.sync();
    message.success(`סונכרן: ${result.pushed} נשלחו, ${result.updated} עודכנו`);
    await loadCalendarStatus();
  } catch {
    message.error("סנכון היומן נכשל");
  } finally {
    calendarSyncing.value = false;
  }
}

async function disconnectCalendarFromProfile() {
  calendarDisconnecting.value = true;
  try {
    await api.calendar.disconnect();
    await loadCalendarStatus();
  } catch {
    message.error("ניתוק היומן נכשל");
  } finally {
    calendarDisconnecting.value = false;
  }
}

async function loadGmailStatus() {
  gmailLoading.value = true;
  try {
    gmailStatus.value = await api.gmail.status();
  } catch {
    gmailStatus.value = null;
  } finally {
    gmailLoading.value = false;
  }
}

async function connectGmailFromProfile() {
  gmailLoading.value = true;
  try {
    const {url} = await api.gmail.authUrl(settingsReturnPath.value, "gmail");
    window.location.href = url;
  } catch {
    gmailLoading.value = false;
    message.error("שגיאה בקבלת קישור חיבור Google");
  }
}

async function connectDriveFromProfile() {
  driveToggling.value = true;
  try {
    const {url} = await api.gmail.authUrl(settingsReturnPath.value, "drive");
    window.location.href = url;
  } catch {
    driveToggling.value = false;
    message.error("שגיאה בקבלת קישור חיבור Drive");
  }
}

async function disconnectGmailFromProfile() {
  confirm({
    title: "ניתוק Gmail",
    content: "לנתק את חיבור Google/Gmail? פעולה זו תכבה גם סנכרון Drive עד לחיבור מחדש.",
    confirmText: "נתק",
    type: "warning",
    onConfirm: async () => {
      gmailDisconnecting.value = true;
      try {
        await api.gmail.disconnect();
        message.success("חיבור Gmail נותק");
        await Promise.all([loadGmailStatus(), loadDriveStatus()]);
      } catch {
        message.error("שגיאה בניתוק Gmail");
      } finally {
        gmailDisconnecting.value = false;
      }
    },
  });
}

async function enableDriveSync() {
  if (!driveAllowed.value) {
    message.warning("סנכרון Google Drive זמין במסלולים בסיסי ועסקי בלבד");
    return;
  }
  driveToggling.value = true;
  try {
    await api.drive.enable();
    message.success("סנכרון Google Drive הופעל");
    await loadDriveStatus();
  } catch (err: any) {
    if (err?.message?.includes("drive_plan_required")) {
      message.warning("סנכרון Google Drive זמין במסלולים בסיסי ועסקי בלבד");
    } else if (err?.message?.includes("no_google_token")) {
      message.warning("חבר את חשבון Google כדי להפעיל סנכרון Drive");
    } else if (err?.message?.includes("drive_scope_missing")) {
      driveNeedsReauth.value = true;
      message.warning("יש להתחבר מחדש ל-Gmail כדי לאשר גישה ל-Drive");
    } else {
      message.error("שגיאה בהפעלת סנכרון Drive");
    }
  } finally {
    driveToggling.value = false;
  }
}

async function disableDriveSync() {
  driveToggling.value = true;
  try {
    await api.drive.disable();
    message.info("סנכרון Google Drive כובה");
    await loadDriveStatus();
  } catch {
    message.error("שגיאה בכיבוי סנכרון Drive");
  } finally {
    driveToggling.value = false;
  }
}

function onDriveSyncToggle(enabled: boolean) {
  if (enabled) enableDriveSync();
  else disableDriveSync();
}

async function renameDriveFolder() {
  const name = driveFolderName.value?.trim();
  if (!name) return;
  renamingFolder.value = true;
  try {
    await api.drive.renameFolder(name);
    message.success("שם התיקייה עודכן");
    await loadDriveStatus();
  } catch {
    message.error("שגיאה בשינוי שם התיקייה");
  } finally {
    renamingFolder.value = false;
  }
}

async function repairDriveFolder() {
  const count = driveStatus.value?.syncedFileCount ?? 0;
  const trashed = driveStatus.value?.folderState === "trashed";
  confirm({
    title: trashed ? "תיקיית Drive בפח" : "תיקיית Drive נמחקה",
    content: count
      ? `${count} מסמכים סומנו כמסונכרנים אבל הם כבר לא בתיקייה. ליצור תיקייה חדשה ולהעלות אותם מחדש?`
      : "ליצור תיקייה חדשה ב-Google Drive ולהעלות את המסמכים?",
    confirmText: "העלה מחדש",
    type: "warning",
    onConfirm: async () => {
      repairingFolder.value = true;
      try {
        const started = await api.drive.exportAll();
        const result = await waitForDriveExportJob(started.jobId);
        const folderHint = result.folderName ? ` לתיקיית "${result.folderName}"` : "";
        if (result.uploaded === 0 && result.total === 0) {
          message.success("נוצרה תיקייה חדשה ב-Google Drive");
        } else {
          message.success(`נוצרה תיקייה חדשה והועלו ${result.uploaded} מסמכים${folderHint}${result.failed > 0 ? ` (${result.failed} נכשלו)` : ""}`);
        }
        if (result.folderUrl) {
          window.open(result.folderUrl, "_blank", "noopener,noreferrer");
        }
        await loadDriveStatus();
      } catch (err: any) {
        if (String(err?.message ?? "").includes("drive_scope_missing")) {
          driveNeedsReauth.value = true;
          message.warning("יש להתחבר מחדש ל-Gmail כדי לאשר גישה ל-Drive");
        } else {
          message.error("שגיאה בשחזור תיקיית Drive");
        }
      } finally {
        repairingFolder.value = false;
      }
    },
  });
}

async function waitForDriveExportJob(jobId: string | null): Promise<DriveExportJob> {
  if (!jobId) throw new Error("drive_export_missing_job");
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const last = await api.drive.exportJob(jobId);
    if (last.status === "completed") return last;
    if (last.status === "failed") throw new Error(last.error || "drive_export_failed");
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
  }
  throw new Error("drive_export_timeout");
}

async function reconnectGmailForDrive() {
  try {
    const {url} = await api.gmail.authUrl(settingsReturnPath.value, "drive");
    window.location.href = url;
  } catch {
    message.error("שגיאה בקבלת קישור חיבור Drive");
  }
}

async function changePassword() {
  if (!pwForm.value.next || pwForm.value.next !== pwForm.value.confirm) {
    message.warning("הסיסמאות אינן תואמות");
    return;
  }
  savingPw.value = true;
  try {
    const res = await fetch(`${SERVER}/api/auth/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        current_password: pwForm.value.current,
        new_password: pwForm.value.next,
      }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    pwForm.value = { current: "", next: "", confirm: "" };
    message.success("הסיסמה שונתה בהצלחה");
  } catch {
    message.error("שגיאה בשינוי הסיסמה");
  } finally {
    savingPw.value = false;
  }
}

async function disconnectAll() {
  disconnecting.value = true;
  try {
    await authStore.logout();
    message.success("התנתקת מכל המכשירים");
  } catch {
    message.error("שגיאה בהתנתקות");
  } finally {
    disconnecting.value = false;
  }
}

// ── Theme ────────────────────────────────────────────────────────────────────
const currentTheme = ref<string>(localStorage.getItem("theme") ?? "light");

async function setTheme(t: string) {
  currentTheme.value = t;
  localStorage.setItem("theme", t);
  document.documentElement.setAttribute("data-theme", t);
  userSettingsStore.save({ theme: t as "dark" | "light" }).catch(() => {});
  message.success(t === "dark" ? "הוחלף למצב כהה" : "הוחלף למצב בהיר");
}

// ── Subscription ─────────────────────────────────────────────────────────────
const subscriptionData = ref<ProfileSubscription | null>(null);
const billingHistory = ref<any[]>([]);

function quotaScopeText(scope: string) {
  if (scope === "monthly") return l.value.profileBilling.monthlyQuota;
  if (scope === "lifetime") return l.value.profileBilling.lifetimeQuota;
  return l.value.profileBilling.unlimited;
}

function quotaUsageText(used: number, limit: number | null) {
  if (limit === null) return t("profileBilling.usageUnlimited", {n: used});
  return `${used} / ${limit}`;
}

const quotaScopeLabel = computed(() => {
  if (!subscriptionData.value) return "—";
  const plan = subscriptionData.value.plan;
  if (plan === "expired" || plan === "trial") {
    return quotaScopeText(subscriptionData.value.quotas.manualDocuments?.scope ?? "lifetime");
  }
  const scope = subscriptionData.value.quotas.invoices?.scope
      ?? subscriptionData.value.quotas.contracts?.scope;
  return scope ? quotaScopeText(scope) : "—";
});

const quotaPeriodLabel = computed(() => {
  if (!subscriptionData.value) return "";
  const plan = subscriptionData.value.plan;
  const quota = plan === "expired" || plan === "trial"
      ? subscriptionData.value.quotas.manualDocuments
      : subscriptionData.value.quotas.invoices ?? subscriptionData.value.quotas.contracts;
  const periodStart = quota?.periodStart;
  const periodEnd = quota?.periodEnd;
  if (!periodStart || !periodEnd) return "";
  return `${formatDate(periodStart)} – ${formatDate(periodEnd)}`;
});

const quotaUsageRows = computed(() => {
  if (!subscriptionData.value) return [];
  const plan = subscriptionData.value.plan;
  const defs = plan === "expired" || plan === "trial"
      ? [
        {key: "manualDocuments" as const, label: l.value.profileBilling.importDocuments},
        {key: "emailDocuments" as const, label: l.value.profileBilling.importFromEmail},
        {key: "reminders" as const, label: l.value.profileBilling.emailReminders},
      ]
      : [
        {key: "contracts" as const, label: l.value.profileBilling.inspectionsContracts},
        {key: "reminders" as const, label: l.value.profileBilling.emailReminders},
      ];
  return defs.map(({key, label}) => {
    const quota = subscriptionData.value!.quotas[key];
    return {
      key,
      label,
      limit: quota?.limit ?? null,
      usageLabel: quotaUsageText(quota?.used ?? 0, quota?.limit ?? null),
      percent: quotaPercent(quota?.used ?? 0, quota?.limit ?? null),
    };
  });
});

const importCounterRows = computed(() => {
  const counters = subscriptionData.value?.counters;
  if (!counters) return [];
  return [
    {key: "scanned", label: l.value.profileBilling.scannedDocs, value: counters.scannedDocuments},
    {key: "gmail-docs", label: l.value.profileBilling.gmailDocs, value: counters.gmailDocuments},
    {key: "gmail-invoices", label: l.value.profileBilling.gmailInvoices, value: counters.gmailInvoices},
  ];
});

async function loadSubscription() {
  try {
    subscriptionData.value = await api.profile.getSubscription();
  } catch {
    subscriptionData.value = null;
  }
}

// ── Export helpers ───────────────────────────────────────────────────────────
function buildProfileHtml(): string {
  const ep = engineerProfile.value;
  const rows = (pairs: [string, string | null | undefined][]) =>
    pairs
      .map(([k, v]) => `<tr><td class="lbl">${k}</td><td>${v || "—"}</td></tr>`)
      .join("");

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; direction: rtl; padding: 40px; color: #111; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 16px; margin: 24px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; }
  td.lbl { color: #666; width: 200px; }
  .role { display:inline-block; background:#e8f5e9; color:#2e7d32; padding:2px 10px; border-radius:12px; font-size:12px; }
</style>
</head>
<body>
  <h1>${user.value?.name || user.value?.email || ""}</h1>
  <span class="role">${roleTag.value.label}</span>

  <h2>פרטים אישיים</h2>
  <table>${rows([
    ["שם מלא", user.value?.name],
    ["טלפון", user.value?.phone],
    ["אימייל", user.value?.email],
  ])}</table>

  ${
    ep
      ? `<h2>פרופיל מהנדס</h2>
  <table>${rows([
    ["מספר רישוי", ep.inspector_number],
    ["כתובת", ep.address],
    ["עיר", ep.city],
    ["תואר מקצועי", ep.title],
    ["התמחות", ep.expertise],
    ["תחילת חברות", formatDate(ep.membership_start_date)],
  ])}</table>`
      : ""
  }

  <h2>סטטיסטיקות</h2>
  <table>${rows([
    ["סה״כ תסקירים", String(inspectionStats.value.total)],
    ["הושלמו", String(inspectionStats.value.completed)],
    ["ממתינים", String(inspectionStats.value.pending)],
    ["החודש", String(inspectionStats.value.monthly)],
  ])}</table>
</body></html>`;
}

function exportPdf() {
  if (!exportAllowed.value) {
    message.warning("ייצוא זמין במסלולים בסיסי ועסקי בלבד.");
    return;
  }
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(buildProfileHtml());
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 400);
}

function exportWord() {
  if (!exportAllowed.value) {
    message.warning("ייצוא זמין במסלולים בסיסי ועסקי בלבד.");
    return;
  }
  const html = buildProfileHtml();
  const blob = new Blob(["﻿", html], { type: "application/msword" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `profile-${user.value?.name || user.value?.email || "export"}.doc`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Mount ────────────────────────────────────────────────────────────────────
onMounted(async () => {
  applySectionFromRoute();
  showGoogleConnectionErrorFromRoute();
  try {
    const [settingsRes, statsRes, engineerRes, notifsRes] =
      await Promise.allSettled([
        userSettingsStore.load(),
        fetch(`${SERVER}/api/profile/stats`, { credentials: "include" }),
        authStore.fetchMe(),
        fetch(`${SERVER}/api/profile/notifications`, {
          credentials: "include",
        }),
        loadSubscription(),
      ]);

    if (settingsRes.status === "fulfilled") {
      userSettings.value = settingsRes.value;
    }
    if (statsRes.status === "fulfilled" && statsRes.value.ok) {
      const data = await statsRes.value.json();
      if (data.active !== undefined) {
        inspectionStats.value = {
          total:
            (data.active ?? 0) + (data.snoozed ?? 0) + (data.completed ?? 0),
          completed: data.completed ?? 0,
          pending: data.active ?? 0,
          monthly: data.monthly ?? 0,
        };
      }
    }
    if (notifsRes.status === "fulfilled" && notifsRes.value.ok) {
      notifications.value = await notifsRes.value.json();
    }
  } finally {
    loading.value = false;
  }
  loadGmailStatus();
  loadDriveStatus();
  loadCalendarStatus();
});

watch(activeSection, (section) => {
  if (section === "subscription" && !subscriptionData.value) {
    void loadSubscription();
  }
});

watch(
  () => route.query.section,
  () => applySectionFromRoute(),
);

watch(
  () => route.query.error,
  () => showGoogleConnectionErrorFromRoute(),
);

function showGoogleConnectionErrorFromRoute() {
  const error = String(route.query.error ?? "");
  if (error === "calendar_account_mismatch") {
    message.error("Google Calendar נבחר בחשבון אחר. התחבר עם חשבון Google של המשתמש המחובר באפליקציה.");
  } else if (error === "calendar_identity_check_failed") {
    message.error("לא הצלחנו לאמת את חשבון Google שנבחר ליומן. נסה להתחבר שוב.");
  } else if (error === "calendar_plan_required") {
    message.error("סנכרון Google Calendar זמין במסלול עסקי בלבד.");
  }
}
</script>

<style scoped>
.profile-page {
  width: 100%;
  min-width: 0;
}

.profile-shell {
  display: flex;
  width: 100%;
  gap: 24px;
  align-items: flex-start;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.sidebar-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--brand-color) 16%, var(--bg-elevated));
  border: 1px solid color-mix(in srgb, var(--brand-color) 28%, var(--border-color));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  color: var(--brand-color);
}
.sidebar-avatar--lg {
  width: 64px;
  height: 64px;
}
.sidebar-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.sidebar-avatar__initials {
  font-size: 15px;
  font-weight: 700;
  color: var(--brand-color);
}

/* ── Content ─────────────────────────────────────────────────────────────── */
.profile-content {
  flex: 1;
  width: 100%;
  min-width: 0;
  max-width: none;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
  padding-inline: 24px;
}

.section-title {
  margin: 0 0 16px;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.section-header .section-title {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.4px;
}

.section-header__desc {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.45;
}

.profile-fields {
  display: flex;
  flex-direction: column;
}

.profile-field {
  display: grid;
  grid-template-columns: minmax(9.5rem, 14rem) minmax(0, 1fr);
  align-items: center;
  gap: 8px 20px;
  min-width: 0;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);
}

.profile-fields > .profile-field:first-child {
  padding-top: 0;
}

.profile-fields > .profile-field:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.profile-field--wide {
  grid-template-columns: minmax(0, 1fr);
  align-items: stretch;
}

.profile-field__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.profile-field__value {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.profile-field :deep(.n-input),
.profile-field__value {
  justify-self: start;
}

.profile-field :deep(.n-input) {
  width: min(100%, 420px);
}

.section-header :deep(.n-button) {
  --n-border-radius: 8px !important;
  border-radius: 8px;
}

.brand-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}

.brand-tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  min-height: 132px;
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-elevated);
}

.info-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 0 20px;
}
.info-card--spaced {
  margin-top: 20px;
}
.info-card--tight {
  margin-top: 16px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid var(--border-color);
  font-size: 14px;
}
.info-row--top {
  align-items: flex-start;
}
.info-row:last-child {
  border-bottom: none;
}
.info-label {
  color: var(--text-secondary);
  min-width: 160px;
  flex-shrink: 0;
}
.info-val {
  color: var(--text-primary);
  font-weight: 500;
}
.info-input {
  flex: 1;
  min-width: 0;
}

.per-type-toggle {
  margin: 10px 0;
}
.per-type-inspector-numbers {
  padding: 10px 0 14px;
  border-bottom: 1px solid var(--border-color);
}
.per-type-inspector-numbers--readonly {
  padding-top: 14px;
}
.per-type-inspector-numbers__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.per-type-inspector-numbers__row {
  padding: 8px 0;
  border-bottom: none;
}
.per-type-inspector-numbers__row .info-label {
  min-width: 140px;
  font-size: 13px;
}
.info-stack {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.info-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-warning);
}
.logo-upload {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.signature-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
/* Signatures are usually wide and thin, and often on a transparent or white
   ground — give them a light plate so a dark-theme preview stays legible. */
.logo-upload__preview--signature {
  max-height: 48px;
  max-width: 220px;
  background: #ffffff;
}
.logo-upload__preview {
  max-height: 56px;
  max-width: 180px;
  border-radius: 8px;
  object-fit: contain;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  padding: 4px;
}
.info-section-divider {
  grid-column: 1 / -1;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 12px 0 4px;
  border-top: 1px solid var(--border-color);
  margin-top: 4px;
}

.progress-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

/* ── Stats ───────────────────────────────────────────────────────────────── */
.stats-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.stat-card {
  flex: 1;
  min-width: 120px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.stat-card--green {
  border-color: color-mix(in srgb, var(--color-success) 35%, var(--border-color));
}
.stat-card--orange {
  border-color: color-mix(in srgb, var(--color-warning) 40%, var(--border-color));
}
.stat-card__num {
  font-size: 32px;
  font-weight: 700;
  color: var(--text-primary);
}
.stat-card__label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 6px;
}

/* ── Notifications ───────────────────────────────────────────────────────── */
.notif-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.notif-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px 16px;
}
.notif-item--unread {
  border-color: var(--brand-color);
}
.notif-tag {
  flex-shrink: 0;
}
.notif-filter {
  width: 160px;
}
.notif-body {
  flex: 1;
}
.notif-title {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}
.notif-date {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}
.empty-state {
  padding: 32px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 14px;
}

/* ── Settings ────────────────────────────────────────────────────────────── */
.settings-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.settings-group {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px 24px;
}
.settings-group--danger {
  border-color: color-mix(in srgb, var(--color-error) 32%, var(--border-color));
  background: color-mix(in srgb, var(--color-error) 5%, var(--bg-card));
}
.delete-account-warn {
  margin: 0 0 16px;
  color: var(--text-secondary);
  line-height: 1.5;
  font-size: 14px;
}
.settings-group__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}
.settings-group__icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--brand-color) 14%, transparent);
  color: var(--brand-color);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.settings-group__icon--danger {
  background: color-mix(in srgb, var(--color-error) 12%, transparent);
  color: var(--color-error);
}
.drive-dashboard__of {
  font-size: 0.7em;
  font-weight: 600;
  color: var(--text-muted);
  margin-inline-start: 3px;
}

.advance-days {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.advance-days__list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.advance-days__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-elevated);
  font-size: 13px;
  font-weight: 600;
}

.advance-days__remove {
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1;
  padding: 0;
}

.advance-days__remove:hover { color: var(--color-error, #d03050); }

.advance-days__empty,
.advance-days__hint {
  color: var(--text-muted);
  font-size: 12px;
}

.advance-days__add {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.settings-group__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}
.settings-group__desc {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-secondary);
}
.settings-rows {
  display: flex;
  flex-direction: column;
}
.settings-row {
  display: grid;
  grid-template-columns: 36px minmax(12rem, 28rem) auto 1fr;
  align-items: center;
  column-gap: 14px;
  min-height: 56px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);
}
.settings-row--avatar {
  display: flex;
  align-items: center;
  gap: 14px;
}

.settings-row--avatar .settings-row__text {
  flex: 1;
  min-width: 0;
}

.settings-row--avatar .settings-row__actions {
  margin-inline-start: auto;
  flex: 0 0 auto;
}
.settings-row:not(:has(.settings-row__media, .sidebar-avatar)) {
  grid-template-columns: minmax(12rem, 28rem) auto 1fr;
}
.settings-rows .settings-row:first-child {
  padding-top: 0;
}
.settings-rows .settings-row:last-child,
.settings-group > .settings-row:last-child {
  padding-bottom: 0;
  border-bottom: none;
}
.settings-row > .visually-hidden {
  display: none;
}
.settings-row__media {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.settings-row__text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
.settings-row__title {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.settings-row__desc {
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-secondary);
}
.settings-status {
  font-size: 12px;
  font-weight: 500;
}
.settings-status--on {
  color: var(--brand-color);
}
.settings-status--off {
  color: var(--text-secondary);
}
.settings-status--warn {
  color: var(--color-warning);
}
.settings-row__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
}
.settings-group :deep(.n-button) {
  --n-border-radius: 8px !important;
  border-radius: 8px;
}
.settings-group :deep(.n-button .n-button__border),
.settings-group :deep(.n-button .n-button__state-border) {
  border-radius: 8px !important;
}
.settings-group :deep(.n-input .n-input-wrapper) {
  --n-border-radius: 8px;
}
.settings-form {
  width: 100%;
}
.settings-form__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 16px;
  max-width: 560px;
}
.settings-form__span {
  grid-column: 1 / -1;
}
.settings-form :deep(.n-form-item) {
  margin-bottom: 8px;
}
.settings-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--brand-color);
  font-weight: 600;
  font-size: 13px;
  text-decoration: none;
}
.settings-link:hover {
  text-decoration: underline;
}
.settings-panel {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}
.settings-panel__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.drive-dashboard {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
}

.drive-dashboard__item {
  min-height: 70px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-elevated);
  padding: 10px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
}

.drive-dashboard__item strong {
  color: var(--text-primary);
  font-size: 18px;
  line-height: 1.2;
}

.drive-dashboard__item span {
  color: var(--text-secondary);
  font-size: 12px;
}

.drive-dashboard__item--warn strong {
  color: var(--color-warning);
}
.drive-folder__row,
.inline-field__row {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}
.drive-folder__input,
.inline-field__input {
  max-width: 280px;
  flex: 1;
}
.settings-subrow {
  display: flex;
  flex-direction: column;
  gap: 6px;
  /* Without this the buttons stretch across the whole card. */
  align-items: flex-start;
  padding: 10px 0 2px;
}

/* ── Theme ───────────────────────────────────────────────────────────────── */
.theme-cards {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}
.theme-card {
  cursor: pointer;
  border: 2px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  width: 168px;
  padding: 0;
  background: var(--bg-card);
  font-family: inherit;
  text-align: start;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.theme-card:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--brand-color) 55%, transparent);
  outline-offset: 2px;
}
.theme-card--active {
  border-color: var(--brand-color);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand-color) 35%, transparent);
}
.theme-card__preview {
  height: 100px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}
.theme-card__preview--light {
  background: #f5f5f5;
}
.theme-card__preview--dark {
  background: #1a1a2e;
}
.theme-preview-bar {
  height: 10px;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.3);
}
.theme-preview-content {
  flex: 1;
  border-radius: 6px;
  background: rgba(128, 128, 128, 0.15);
}
.theme-card__label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-card);
  border-top: 1px solid var(--border-color);
}

.subscription-header {
  align-items: flex-start;
}

.subscription-header__desc {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.45;
}

.subscription-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(220px, 0.9fr);
  gap: 14px;
  margin-bottom: 14px;
}

.sub-hero,
.sub-plan-card,
.sub-summary-card,
.sub-panel,
.upgrade-card {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.sub-hero {
  padding: 20px 22px;
  margin-bottom: 14px;
  border-color: color-mix(in srgb, var(--brand-color) 30%, var(--border-color));
  background: linear-gradient(180deg, color-mix(in srgb, var(--brand-color) 8%, transparent), transparent 70%),
  var(--bg-card);
}

.sub-hero__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.sub-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 0 0 18px;
}

.plans-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 24px;
  align-items: stretch;
  margin-bottom: 14px;
  padding-top: 14px;
}

.plan {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 32px 28px;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: var(--bg-card);
}

.plan--highlighted,
.plan--current {
  border-color: var(--brand-color);
  box-shadow: 0 12px 40px color-mix(in srgb, var(--brand-color) 18%, transparent);
}

.plan__badge {
  position: absolute;
  top: -13px;
  inset-inline-end: 28px;
  padding: 4px 14px;
  border-radius: 999px;
  background: var(--brand-color);
  color: var(--text-inverse);
  font-size: 12px;
  font-weight: 700;
}

.plan__name {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.plan__blurb {
  min-height: 44px;
  margin: 0 0 18px;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.45;
}

.plan__price {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 18px;
}

.plan__price strong {
  font-size: 40px;
  font-weight: 800;
  line-height: 1;
  color: var(--text-primary);
}

.plan__price-period {
  color: var(--text-secondary);
  font-size: 14px;
}

.plan__features {
  flex: 1;
  margin: 0 0 26px;
  padding: 0;
  list-style: none;
}

.plan__features li {
  position: relative;
  margin-bottom: 10px;
  padding-inline-start: 26px;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.45;
}

.plan__features li::before {
  content: "✓";
  position: absolute;
  inset-inline-start: 0;
  color: var(--brand-color);
  font-weight: 700;
}

.plan__cta {
  display: block;
  margin-top: auto;
  padding: 13px 20px;
  border-radius: 10px;
  text-align: center;
  text-decoration: none;
  font-size: 15px;
  font-weight: 700;
}

.plan__cta--primary {
  background: var(--brand-color);
  color: var(--text-inverse);
}

.plan__cta--primary:hover {
  background: var(--brand-color-hover);
}

.plan__cta--current {
  margin-bottom: 0;
  background: color-mix(in srgb, var(--brand-color) 14%, transparent);
  color: var(--brand-color);
}

.plan__soon-note,
.plans-note {
  margin: 10px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.45;
  text-align: center;
}

.plans-note {
  margin: 0 0 18px;
  font-size: 13px;
}

.sub-metrics div {
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-elevated) 72%, transparent);
}

.sub-metrics dt {
  font-size: 12px;
  color: var(--text-secondary);
}

.sub-metrics dd {
  margin: 4px 0 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.sub-plan-card {
  padding: 18px 20px;
  border-color: color-mix(in srgb, var(--brand-color) 30%, var(--border-color));
  background: linear-gradient(180deg, color-mix(in srgb, var(--brand-color) 8%, transparent), transparent 70%),
  var(--bg-card);
}

.sub-plan-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.sub-plan-card__eyebrow {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 700;
  color: var(--brand-color);
}

.sub-plan-card__title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary);
}

.sub-plan-card__blurb {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.sub-plan-card__price {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  white-space: nowrap;
  color: var(--text-primary);
}

.sub-plan-card__price strong {
  font-size: 28px;
  line-height: 1;
}

.sub-plan-card__price span {
  font-size: 12px;
  color: var(--text-secondary);
}

.sub-plan-card__old-price {
  text-decoration: line-through;
  opacity: 0.7;
}

.sub-plan-card__yearly {
  white-space: normal;
  text-align: end;
  max-width: 11rem;
}

.sub-plan-card__features {
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.sub-plan-card__features--cols {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 18px;
}

.sub-plan-card__features li,
.upgrade-card__features li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.sub-plan-card__features :deep(.n-icon),
.upgrade-card__features :deep(.n-icon) {
  flex: 0 0 auto;
  margin-top: 2px;
  color: var(--brand-color);
}

.sub-summary-card {
  display: grid;
  gap: 0;
  padding: 4px 16px;
}

.sub-summary-card__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 0;
  border-bottom: 1px solid var(--border-color);
}

.sub-summary-card__row:last-child {
  border-bottom: none;
}

.sub-summary-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  color: var(--brand-color);
  background: color-mix(in srgb, var(--brand-color) 12%, transparent);
  flex: 0 0 auto;
}

.sub-summary-card__label {
  display: block;
  margin-bottom: 2px;
  font-size: 12px;
  color: var(--text-secondary);
}

.sub-summary-card strong {
  display: block;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.subscription-panels {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 14px;
}

.sub-panel {
  padding: 18px 20px;
}

.sub-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.sub-panel__head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.sub-panel__head p {
  margin: 4px 0 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.sub-panel__head :deep(.n-icon) {
  flex: 0 0 auto;
  color: var(--brand-color);
}

.sub-quota-list {
  display: grid;
  gap: 14px;
}

.sub-quota__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 13px;
}

.sub-quota__label {
  color: var(--text-primary);
  font-weight: 600;
}

.sub-quota__value {
  color: var(--text-secondary);
  font-weight: 700;
}

.sub-quota__unlimited {
  margin: 0;
  padding: 7px 10px;
  border-radius: 8px;
  color: var(--brand-color);
  background: color-mix(in srgb, var(--brand-color) 10%, transparent);
  font-size: 12px;
  font-weight: 700;
}

.sub-counter-list {
  display: grid;
  gap: 8px;
}

.sub-counter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 13px;
}

.sub-counter:last-child {
  border-bottom: none;
}

.sub-counter strong {
  color: var(--text-primary);
  font-size: 16px;
}

.subscription-upgrades {
  margin-bottom: 14px;
}

.upgrade-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
}

.upgrade-card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 20px 18px;
}

.upgrade-card--highlighted {
  border-color: var(--brand-color);
}

.upgrade-card__badge {
  position: absolute;
  top: -10px;
  inset-inline-start: 18px;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--brand-color);
  color: var(--text-inverse);
  font-size: 11px;
  font-weight: 700;
}

.upgrade-card__name {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.upgrade-card__blurb {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.upgrade-card__price {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 4px;
}

.upgrade-card__price strong {
  font-size: 28px;
  font-weight: 800;
  line-height: 1;
  color: var(--text-primary);
}

.upgrade-card__old {
  font-size: 14px;
  text-decoration: line-through;
  opacity: 0.7;
  color: var(--text-secondary);
}

.upgrade-card__period,
.upgrade-card__terms {
  font-size: 12px;
  color: var(--text-secondary);
}

.upgrade-card__terms {
  margin: 0 0 2px;
}

.upgrade-card__vat {
  margin: 0 0 14px;
  font-size: 11px;
  opacity: 0.8;
  color: var(--text-secondary);
}

.upgrade-card__features {
  list-style: none;
  padding: 0;
  margin: 0 0 16px;
  flex: 1;
}

.upgrade-card__features li {
  margin-bottom: 7px;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.upgrade-card__cta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  padding: 9px 14px;
  border-radius: 8px;
  background: #25d366;
  color: #fff;
  font-size: 13.5px;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.15s ease;
}

.upgrade-card__cta:hover {
  background: #1da851;
}

.upgrade-card__note {
  margin: 8px 0 0;
  text-align: center;
  font-size: 11px;
  color: var(--text-secondary);
}

.sub-billing-panel {
  margin-bottom: 0;
}

.billing-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
}

.billing-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.billing-table th,
.billing-table td {
  padding: 10px 14px;
  text-align: start;
  border-bottom: 1px solid var(--border-color);
}

.billing-table th {
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-weight: 700;
}

.billing-table tbody tr:last-child td {
  border-bottom: none;
}

.sub-billing-empty {
  padding: 22px;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
  background: color-mix(in srgb, var(--bg-elevated) 55%, transparent);
}

.sub-billing-empty--compact {
  padding: 18px;
}

@media (max-width: 820px) {
  .profile-shell {
    flex-direction: column;
    gap: 16px;
    min-height: 0;
  }

  .profile-content {
    width: 100%;
  }

  .subscription-layout,
  .subscription-panels,
  .profile-fields,
  .brand-grid,
  .sub-metrics,
  .sub-plan-card__features--cols {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .section-header {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
    padding-inline: 16px;
  }

  .profile-field {
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
    gap: 6px;
  }

  .section-header :deep(.n-button),
  .section-header :deep(.n-select) {
    width: 100% !important;
  }

  .info-card,
  .settings-group {
    padding-inline: 16px;
  }

  .info-row {
    align-items: stretch;
    flex-direction: column;
    gap: 8px;
  }

  .info-label {
    min-width: 0;
  }

  .info-input,
  .progress-wrap {
    width: 100%;
  }

  .stats-row,
  .theme-cards {
    flex-direction: column;
  }

  .stat-card,
  .theme-card {
    width: 100%;
  }

  .settings-row,
  .settings-row--avatar {
    grid-template-columns: 36px minmax(0, 1fr);
  }
  .settings-row--avatar {
    grid-template-columns: 64px minmax(0, 1fr);
  }
  .settings-row:not(:has(.settings-row__media, .sidebar-avatar)) {
    grid-template-columns: minmax(0, 1fr);
  }
  .settings-row__actions {
    grid-column: 2;
    justify-content: flex-start;
    min-width: 0;
    padding-top: 4px;
  }
  .settings-row:not(:has(.settings-row__media, .sidebar-avatar)) .settings-row__actions {
    grid-column: 1;
  }

  .settings-row__desc {
    white-space: normal;
  }

  .settings-form__grid {
    grid-template-columns: 1fr;
  }

  .drive-folder__row,
  .drive-folder__input,
  .inline-field__row,
  .inline-field__input {
    width: 100%;
    max-width: none;
  }

  .drive-dashboard {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .subscription-header :deep(.n-tag) {
    align-self: flex-start;
  }

  .sub-plan-card,
  .sub-panel,
  .upgrade-card {
    padding: 16px;
  }

  .sub-plan-card__head {
    flex-direction: column;
  }

  .sub-plan-card__price {
    align-items: flex-start;
  }

  .sub-plan-card__yearly {
    text-align: start;
  }

  .sub-summary-card {
    padding-inline: 14px;
  }

  .sub-panel__head {
    flex-direction: column;
  }

  .plan {
    padding: 24px 18px;
  }

  .plan__price strong {
    font-size: 34px;
  }
}
</style>
