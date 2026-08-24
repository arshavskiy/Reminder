<template>
  <div class="profile-page">
    <PageHeader
      title="פרופיל"
      subtitle="ניהול פרטים אישיים, פרופיל מהנדס, הגדרות ומנוי"
    />

    <div class="profile-shell">
    <aside class="profile-sidebar">
      <div class="sidebar-user">
        <div class="sidebar-avatar">
          <img
            v-if="user?.picture_url"
            :src="user.picture_url"
            alt=""
            referrerpolicy="no-referrer"
          />
          <span v-else class="sidebar-avatar__initials">{{ initials }}</span>
        </div>
        <div class="sidebar-user__info">
          <div class="sidebar-user__name">
            {{ user?.name || user?.email || "—" }}
          </div>
          <n-tag :type="roleTag.type" size="small">{{ roleTag.label }}</n-tag>
        </div>
      </div>

      <nav class="sidebar-nav" aria-label="ניווט פרופיל">
        <button
          v-for="item in navItems"
          :key="item.key"
          type="button"
          class="sidebar-nav__item"
          :class="{ 'sidebar-nav__item--active': activeSection === item.key }"
          :aria-current="activeSection === item.key ? 'page' : undefined"
          @click="activeSection = item.key"
        >
          <n-icon :component="item.icon" :size="18" />
          <span>{{ item.label }}</span>
        </button>
      </nav>
    </aside>

    <main class="profile-content">
      <n-spin :show="loading">
        <section v-if="activeSection === 'personal'">
          <div class="section-header">
            <h2 class="section-title">פרטים אישיים</h2>
            <n-button
              v-if="!editingPersonal"
              size="small"
              @click="startEditPersonal"
            >
              <template #icon>
                <n-icon :component="CreateOutline" />
              </template>
              עריכה
            </n-button>
            <n-space v-else>
              <n-button size="small" @click="cancelEditPersonal">ביטול</n-button>
              <n-button
                size="small"
                type="primary"
                :loading="savingPersonal"
                @click="savePersonal"
              >
                שמור
              </n-button>
            </n-space>
          </div>
          <div class="info-card">
            <div class="info-row">
              <span class="info-label">שם מלא</span>
              <n-input
                v-if="editingPersonal"
                v-model:value="personalForm.name"
                class="info-input"
              />
              <span v-else class="info-val">{{ user?.name || "—" }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">טלפון</span>
              <n-input
                v-if="editingPersonal"
                v-model:value="personalForm.phone"
                class="info-input"
              />
              <span v-else class="info-val">{{ user?.phone || "—" }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">שם חברה</span>
              <n-input
                v-if="editingPersonal"
                v-model:value="personalForm.company_name"
                class="info-input"
                placeholder="לדוגמה: M.A.D הנדסה ובטיחות"
              />
              <span v-else class="info-val">{{
                (user as any)?.company_name || "—"
              }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">אימייל</span>
              <span class="info-val">{{ user?.email }}</span>
            </div>
          </div>
        </section>

        <!-- פרופיל מהנדס -->
        <section v-if="activeSection === 'engineer'">
          <div class="section-header">
            <h2 class="section-title">פרופיל מהנדס</h2>
            <n-button
              v-if="!editingEngineer"
              size="small"
              @click="startEditEngineer"
            >
              <template #icon>
                <n-icon :component="CreateOutline" />
              </template>
              עריכה
            </n-button>
            <n-space v-else>
              <n-button size="small" @click="cancelEditEngineer"
                >ביטול</n-button
              >
              <n-button
                size="small"
                type="primary"
                :loading="savingEngineer"
                @click="saveEngineer"
                >שמור</n-button
              >
            </n-space>
          </div>
          <div class="info-card">
            <div class="info-row">
              <span class="info-label">מספר מפקח</span>
              <n-input
                v-if="editingEngineer"
                v-model:value="engineerForm.inspector_number"
                class="info-input"
              />
              <span v-else class="info-val">{{
                engineerProfile?.inspector_number || "—"
              }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">כתובת</span>
              <n-input
                v-if="editingEngineer"
                v-model:value="engineerForm.address"
                class="info-input"
                placeholder="רחוב ומספר"
              />
              <span v-else class="info-val">{{
                engineerProfile?.address || "—"
              }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">עיר</span>
              <n-input
                v-if="editingEngineer"
                v-model:value="engineerForm.city"
                class="info-input"
                placeholder="תל אביב"
              />
              <span v-else class="info-val">{{
                engineerProfile?.city || "—"
              }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">מספר מ.ג.</span>
              <n-input
                v-if="editingEngineer"
                v-model:value="engineerForm.mg_number"
                class="info-input"
              />
              <span v-else class="info-val">{{
                engineerProfile?.mg_number || "—"
              }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">תאריך תחילת חברות</span>
              <n-date-picker
                v-if="editingEngineer"
                v-model:value="engineerForm.membership_start_ms"
                class="info-input"
                type="date"
              />
              <span v-else class="info-val">{{
                formatDate(engineerProfile?.membership_start_date)
              }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">מספר התחלת תסקירים</span>
              <div
                v-if="editingEngineer"
                class="info-stack"
              >
                <n-input
                  v-model:value="engineerForm.inspector_id_start"
                  placeholder="לדוגמה: 16125"
                />
                <span v-if="engineerForm.inspector_id_start" class="info-hint">
                  <n-icon :component="LockClosedOutline" :size="14" />
                  מספר זה נקבע כבר. הבא יהיה:
                  {{ engineerProfile?.inspector_number ?? "—" }}/{{
                    engineerForm.inspector_id_start
                  }}
                </span>
              </div>
              <div
                v-else
                class="info-val info-stack"
              >
                <span>{{ engineerProfile?.inspector_id_start || "—" }}</span>
                <span
                  v-if="engineerProfile?.inspector_id_start"
                  class="info-hint"
                >
                  הבא יהיה: {{ nextInspectionId }}
                </span>
              </div>
            </div>

            <div class="info-row">
              <span class="info-label">עוסק מורשה (ח.פ)</span>
              <n-input
                v-if="editingEngineer"
                v-model:value="engineerForm.company_registration"
                class="info-input"
                placeholder="לדוגמה: 51646673"
              />
              <span v-else class="info-val">{{
                (engineerProfile as any)?.company_registration || "—"
              }}</span>
            </div>

            <!-- ── Inspector company details (used to filter out from AI extraction) ── -->
            <div class="info-section-divider">
              פרטי החברה / בית העסק (לסינון מהחילוץ)
            </div>
            <div class="info-row">
              <span class="info-label">שם החברה</span>
              <n-input
                v-if="editingEngineer"
                v-model:value="engineerForm.company_name"
                class="info-input"
                placeholder="לדוגמה: M.A.D הנדסה ובטיחות"
              />
              <span v-else class="info-val">{{
                (engineerProfile as any)?.company_name || "—"
              }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">תיאור / כותרת</span>
              <n-input
                v-if="editingEngineer"
                v-model:value="engineerForm.company_subtitle"
                class="info-input"
                placeholder="לדוגמה: בדיקות בטיחות למתקני הרמה ומכלי לחץ"
              />
              <span v-else class="info-val">{{
                (engineerProfile as any)?.company_subtitle || "—"
              }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">טלפון / נייד</span>
              <n-input
                v-if="editingEngineer"
                v-model:value="engineerForm.company_phone"
                class="info-input"
                placeholder="052-8195650"
              />
              <span v-else class="info-val">{{
                (engineerProfile as any)?.company_phone || "—"
              }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">אימייל</span>
              <n-input
                v-if="editingEngineer"
                v-model:value="engineerForm.company_email"
                class="info-input"
                placeholder="name@company.com"
              />
              <span v-else class="info-val">{{
                (engineerProfile as any)?.company_email || "—"
              }}</span>
            </div>
            <div class="info-row info-row--top">
              <span class="info-label">לוגו החברה</span>
              <div class="logo-upload">
                <img
                  v-if="(engineerProfile as any)?.company_logo_url"
                  :src="(engineerProfile as any)?.company_logo_url"
                  class="logo-upload__preview"
                  alt="לוגו חברה"
                />
                <input
                  ref="companyLogoInput"
                  type="file"
                  accept="image/*"
                  class="visually-hidden"
                  @change="uploadCompanyLogo"
                />
                <n-button size="small" secondary @click="(companyLogoInput as HTMLInputElement)?.click()">
                  <template #icon>
                    <n-icon :component="ImageOutline" />
                  </template>
                  {{ (engineerProfile as any)?.company_logo_url ? 'החלף לוגו' : 'העלה לוגו' }}
                </n-button>
              </div>
            </div>
          </div>
        </section>

        <!-- סטטיסטיקות -->
        <section v-if="activeSection === 'stats'">
          <div class="section-header">
            <h2 class="section-title">סטטיסטיקות</h2>
            <n-button size="small" @click="exportStatsCsv">
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
          <h2 class="section-title">הגדרות</h2>

          <div class="settings-group">
            <h3 class="settings-group__title">שינוי סיסמה</h3>
            <n-form class="settings-form" label-placement="top">
              <n-form-item label="סיסמה נוכחית">
                <n-input
                  v-model:value="pwForm.current"
                  type="password"
                  show-password-on="click"
                />
              </n-form-item>
              <n-form-item label="סיסמה חדשה">
                <n-input
                  v-model:value="pwForm.next"
                  type="password"
                  show-password-on="click"
                />
              </n-form-item>
              <n-form-item label="אימות סיסמה חדשה">
                <n-input
                  v-model:value="pwForm.confirm"
                  type="password"
                  show-password-on="click"
                />
              </n-form-item>
              <n-button
                type="primary"
                :loading="savingPw"
                @click="changePassword"
              >
                שנה סיסמה
              </n-button>
            </n-form>
          </div>

          <div class="settings-group">
            <h3 class="settings-group__title">תמונת פרופיל</h3>
            <div class="avatar-upload-row">
              <div class="sidebar-avatar sidebar-avatar--lg">
                <img
                  v-if="user?.picture_url"
                  :src="user.picture_url"
                  alt=""
                  referrerpolicy="no-referrer"
                />
                <span v-else class="sidebar-avatar__initials">{{
                  initials
                }}</span>
              </div>
              <input
                ref="avatarInput"
                type="file"
                accept="image/*"
                class="visually-hidden"
                @change="onAvatarChange"
              />
              <n-button
                size="small"
                :loading="uploadingAvatar"
                @click="avatarInput?.click()"
              >
                <template #icon>
                  <n-icon :component="CameraOutline" />
                </template>
                שנה תמונה
              </n-button>
            </div>
          </div>

          <div class="settings-group">
            <h3 class="settings-group__title">סנכרון Google Drive</h3>
            <p class="settings-desc">
              סנכרן מסמכים שהועלו אוטומטית לתיקיית
              <strong>{{ driveStatus?.folderName || "RemindOCR" }}</strong>
              ב-Google Drive (ב־My Drive). חשבוניות נשמרות בתת־תיקייה ״חשבוניות״, ותסקירים ב״תסקירי בדיקה״.
            </p>
            <div v-if="!driveAllowed" class="settings-desc settings-desc--follow">
              זמין במסלולים <strong>בסיסי</strong> ו<strong>עסקי</strong> בלבד.
              <router-link class="settings-link" to="/pricing">
                שדרוג מנוי
              </router-link>
            </div>
            <div v-else-if="driveStatus">
              <n-tag v-if="driveFolderGone" size="small" class="drive-status-tag" type="warning">תיקייה חסרה</n-tag>
              <n-tag v-else-if="driveStatus.syncEnabled" size="small" class="drive-status-tag" type="success">מופעל</n-tag>
              <n-tag v-else size="small" class="drive-status-tag" type="default">כבוי</n-tag>
              <div class="drive-actions">
                <n-button
                    v-if="!driveStatus.syncEnabled"
                    :disabled="!driveStatus.connected"
                    :loading="driveToggling"
                    size="small"
                    type="primary"
                    @click="enableDriveSync"
                >הפעל סנכרון
                </n-button>
                <n-button
                    v-else
                    :loading="driveToggling"
                    size="small"
                    @click="disableDriveSync"
                >כבה סנכרון
                </n-button>
                <span v-if="!driveStatus.connected" class="settings-desc settings-desc--inline">
                  יש להתחבר עם Google כדי להפעיל
                </span>
              </div>
              <div v-if="driveFolderGone" class="drive-folder-alert">
                <n-alert :bordered="false" type="warning">
                  <template v-if="driveStatus.folderState === 'trashed'">
                    תיקיית Google Drive נמצאת בפח.
                    <span v-if="driveStatus.syncedFileCount">
                      {{ driveStatus.syncedFileCount }} מסמכים סומנו כמסונכרנים, אבל הם בפח יחד עם התיקייה.
                    </span>
                    אפשר לשחזר אותה מהפח, או ליצור תיקייה חדשה ולהעלות מחדש.
                  </template>
                  <template v-else>
                    תיקיית Google Drive נמחקה.
                    <span v-if="driveStatus.syncedFileCount">
                      {{ driveStatus.syncedFileCount }} מסמכים סומנו כמסונכרנים, אבל הם כבר לא ב-Drive.
                    </span>
                    צריך ליצור תיקייה חדשה ולהעלות אותם מחדש.
                  </template>
                </n-alert>
                <a
                  v-if="driveStatus.folderState === 'trashed' && driveStatus.trashUrl"
                  class="settings-link drive-folder__open"
                  :href="driveStatus.trashUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <n-icon :component="OpenOutline" :size="14" />
                  פתח את הפח ב-Google Drive
                </a>
                <n-button
                  :loading="repairingFolder"
                  class="drive-repair-btn"
                  size="small"
                  type="warning"
                  @click="repairDriveFolder"
                >
                  צור תיקייה והעלה מחדש
                </n-button>
              </div>
              <div v-if="driveStatus.syncEnabled && !driveFolderGone" class="drive-folder">
                <label class="settings-desc drive-folder__label">שם תיקייה ב-Drive</label>
                <div class="drive-folder__row">
                  <n-input
                      v-model:value="driveFolderName"
                      class="drive-folder__input"
                      placeholder="RemindOCR"
                      size="small"
                  />
                  <n-button
                      :disabled="!driveFolderName?.trim() || driveFolderName.trim() === driveStatus.folderName"
                      :loading="renamingFolder"
                      size="small"
                      @click="renameDriveFolder"
                  >שמור
                  </n-button>
                </div>
                <a
                  v-if="driveFolderUrl"
                  class="settings-link drive-folder__open"
                  :href="driveFolderUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <n-icon :component="OpenOutline" :size="14" />
                  פתח תיקייה ב-Google Drive
                </a>
              </div>
              <div v-if="driveNeedsReauth" class="drive-reauth">
                <n-alert :bordered="false" class="drive-reauth__alert" type="warning">
                  יש להתחבר מחדש ל-Gmail כדי לאשר הרשאות Drive.
                </n-alert>
                <n-button size="small" type="warning" @click="reconnectGmailForDrive">התחבר מחדש ל-Gmail</n-button>
              </div>
            </div>
          </div>

          <div class="settings-group">
            <h3 class="settings-group__title">ניהול הפעלות</h3>
            <p class="settings-desc">
              סיים את כל ההפעלות הפעילות בכל המכשירים.
            </p>
            <n-button
              type="error"
              :loading="disconnecting"
              @click="disconnectAll"
            >
              <template #icon>
                <n-icon :component="LogOutOutline" />
              </template>
              התנתק מכל המכשירים
            </n-button>
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
          <h2 class="section-title">מנוי ותשלומים</h2>

          <article v-if="currentPricingPlan" class="sub-plan-card">
            <div class="sub-plan-card__head">
              <div>
                <p class="sub-plan-card__eyebrow">המסלול שלכם</p>
                <h3 class="sub-plan-card__title">{{ currentPricingPlan.name }}</h3>
                <p class="sub-plan-card__blurb">{{ currentPricingPlan.blurb }}</p>
              </div>
              <div class="sub-plan-card__price">
                <strong>{{ currentPricingPlan.price === 0 ? "חינם" : `₪${currentPricingPlan.price}` }}</strong>
                <span v-if="currentPricingPlan.period">{{ currentPricingPlan.period }}</span>
              </div>
            </div>
            <ul class="sub-plan-card__features">
              <li v-for="feature in currentPricingPlan.features.slice(0, 4)" :key="feature">
                <n-icon :component="CheckmarkCircleOutline" :size="16" />
                <span>{{ feature }}</span>
              </li>
            </ul>
            <router-link class="sub-plan-card__link" to="/pricing">צפייה בכל המסלולים והמחירים</router-link>
          </article>

          <div class="info-card sub-usage-card">
            <div class="info-row">
              <span class="info-label">תוכנית נוכחית</span>
              <span class="info-val">
                <n-tag :type="planTag.type" size="small">{{ planTag.label }}</n-tag>
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">מחיר</span>
              <span class="info-val">{{ planPriceLabel }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">סוג מכסה</span>
              <span class="info-val">{{ quotaScopeLabel }}</span>
            </div>
            <div v-if="quotaPeriodLabel" class="info-row">
              <span class="info-label">תקופת מכסה</span>
              <span class="info-val">{{ quotaPeriodLabel }}</span>
            </div>

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
              <p v-else class="sub-quota__unlimited">ללא הגבלה</p>
            </div>
          </div>

          <div v-if="importCounterRows.length" class="info-card sub-usage-card sub-counters-card">
            <h3 class="settings-group__title sub-counters-card__title">פירוט שימוש</h3>
            <div v-for="item in importCounterRows" :key="item.key" class="info-row">
              <span class="info-label">{{ item.label }}</span>
              <span class="info-val">{{ item.value }}</span>
            </div>
          </div>

          <h3 class="billing-title">היסטוריית חיוב</h3>
          <div v-if="billingHistory.length" class="billing-table-wrap">
            <table class="billing-table">
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>סכום</th>
                  <th>סטטוס</th>
                  <th>תיאור</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in billingHistory" :key="index">
                  <td>{{ formatDate(row.date) }}</td>
                  <td>₪{{ row.amount }}</td>
                  <td>{{ row.status }}</td>
                  <td>{{ row.description }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="sub-billing-empty">
            אין חיובים עדיין. תשלומים יופיעו כאן לאחר חיבור מערכת התשלומים.
          </div>
        </section>
      </n-spin>
    </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, onMounted, ref, watch, type Component} from "vue";
import {useRoute} from "vue-router";
import {
  NAlert,
  NButton,
  NDatePicker,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NProgress,
  NSelect,
  NSpace,
  NSpin,
  NTag,
  useMessage,
} from "naive-ui";
import {
  CameraOutline,
  CheckmarkCircleOutline,
  ColorPaletteOutline,
  ConstructOutline,
  CreateOutline,
  DiamondOutline,
  DownloadOutline,
  ImageOutline,
  LockClosedOutline,
  LogOutOutline,
  MoonOutline,
  NotificationsOutline,
  OpenOutline,
  PersonOutline,
  SettingsOutline,
  StatsChartOutline,
  SunnyOutline,
} from "@vicons/ionicons5";
import { storeToRefs } from "pinia";
import { useAuthStore } from "../stores/auth.js";
import { useUserSettingsStore } from "../stores/userSettings.js";
import { useEngineerStore } from "../stores/engineer.js";
import {api, type DriveExportJob, type DriveStatus, type ProfileSubscription} from "../services/apiService.js";
import type { User, UserSettings } from "@shared/types.js";
import PageHeader from "../components/PageHeader.vue";
import {useConfirm} from "../composables/useConfirm.js";
import {
  PLAN_LABELS,
  formatPlanPrice,
  formatQuotaScope,
  formatQuotaUsage,
  getPricingPlan,
  quotaPercent,
  resolveUserPlan,
  planAllowsGoogleDrive,
  type PlanId,
} from "../shared/pricingPlans.js";

const route = useRoute();

const message = useMessage();
const {confirm} = useConfirm();
const authStore = useAuthStore();
const userSettingsStore = useUserSettingsStore();
const engineerStore = useEngineerStore();
const { profile: engineerProfile } = storeToRefs(engineerStore);
const SERVER = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

// ── State ────────────────────────────────────────────────────────────────────
const loading = ref(true);
const activeSection = ref("personal");

const user = computed(() => authStore.user as User | null);
const userSettings = ref<UserSettings | null>(null);

// ── Sidebar nav ──────────────────────────────────────────────────────────────
const navItems = computed(() => {
  const isAdmin = user.value?.role === "admin";
  const items: { key: string; icon: Component; label: string }[] = [
    { key: "personal", icon: PersonOutline, label: "פרטים אישיים" },
    { key: "engineer", icon: ConstructOutline, label: "פרופיל מהנדס" },
  ];
  if (isAdmin) {
    items.push(
      { key: "stats", icon: StatsChartOutline, label: "סטטיסטיקות" },
      { key: "notifications", icon: NotificationsOutline, label: "התראות ועדכונים" },
    );
  }
  items.push({ key: "settings", icon: SettingsOutline, label: "הגדרות" });
  if (isAdmin) {
    items.push({ key: "theme", icon: ColorPaletteOutline, label: "נושא עיצוב" });
  }
  items.push({ key: "subscription", icon: DiamondOutline, label: "מנוי ותשלומים" });
  return items;
});

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
  free: "default",
  basic: "info",
  business: "success",
};
const currentPlanId = computed(() => resolveUserPlan(user.value));
const currentPricingPlan = computed(() => getPricingPlan(currentPlanId.value));
const planTag = computed(() => ({
  label: PLAN_LABELS[currentPlanId.value],
  type: PLAN_TAG_TYPES[currentPlanId.value],
}));
const planPriceLabel = computed(() => formatPlanPrice(currentPricingPlan.value));

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("he-IL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ── Personal info ────────────────────────────────────────────────────────────
const editingPersonal = ref(false);
const savingPersonal = ref(false);
const personalForm = ref({ name: "", phone: "", company_name: "" });

function startEditPersonal() {
  personalForm.value = {
    name: user.value?.name ?? "",
    phone: user.value?.phone ?? "",
    company_name: (user.value as any)?.company_name ?? "",
  };
  editingPersonal.value = true;
}
function cancelEditPersonal() {
  editingPersonal.value = false;
}
async function savePersonal() {
  savingPersonal.value = true;
  try {
    await fetch(`${SERVER}/api/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: personalForm.value.name,
        phone: personalForm.value.phone,
        company_name: personalForm.value.company_name,
      }),
    });
    await authStore.fetchMe();
    editingPersonal.value = false;
    message.success("הפרטים עודכנו");
  } catch {
    message.error("שגיאה בשמירה");
  } finally {
    savingPersonal.value = false;
  }
}

// ── Engineer profile ─────────────────────────────────────────────────────────
const nextInspectionId = computed(() => {
  const start = parseInt(engineerProfile.value?.inspector_id_start ?? "0", 10);
  const total = inspectionStats.value.total;
  if (!start) return "—";
  return `${engineerProfile.value?.inspector_number ?? "—"}/${start + total}`;
});

const editingEngineer = ref(false);
const savingEngineer = ref(false);
const engineerForm = ref({
  inspector_number: "",
  address: "",
  city: "",
  title: "",
  expertise: "",
  mr_number: "",
  mg_number: "",
  membership_start_ms: null as number | null,
  inspector_id_start: "",
  company_name: "",
  company_registration: "",
  company_subtitle: "",
  company_phone: "",
  company_email: "",
});

function startEditEngineer() {
  const p = engineerProfile.value;
  engineerForm.value = {
    inspector_number: p?.inspector_number ?? "",
    address: p?.address ?? "",
    city: p?.city ?? "",
    title: p?.title ?? "",
    expertise: p?.expertise ?? "",
    mr_number: p?.mr_number ?? "",
    mg_number: p?.mg_number ?? "",
    membership_start_ms: p?.membership_start_date
      ? new Date(p.membership_start_date).getTime()
      : null,
    inspector_id_start: p?.inspector_id_start ?? "",
    company_name: (p as any)?.company_name ?? "",
    company_registration: (p as any)?.company_registration ?? "",
    company_subtitle: (p as any)?.company_subtitle ?? "",
    company_phone: (p as any)?.company_phone ?? "",
    company_email: (p as any)?.company_email ?? "",
  };
  editingEngineer.value = true;
}
function cancelEditEngineer() {
  editingEngineer.value = false;
}
async function saveEngineer() {
  savingEngineer.value = true;
  try {
    const {membership_start_ms, ...formFields} = engineerForm.value;
    await engineerStore.save({
      ...formFields,
      membership_start_date: membership_start_ms
        ? new Date(membership_start_ms).toISOString().slice(0, 10)
        : null,
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
      engineerStore.patch({ company_logo_url: data.company_logo_url });
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

async function loadDriveStatus() {
  try {
    driveStatus.value = await api.drive.status();
    driveFolderName.value = driveStatus.value.folderName || "RemindOCR";
  } catch {
    driveStatus.value = null;
  }
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
    const {url} = await api.gmail.authUrl("/profile");
    window.location.href = url;
  } catch {
    message.error("שגיאה בקבלת קישור חיבור Gmail");
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

const quotaScopeLabel = computed(() => {
  if (!subscriptionData.value) return "—";
  const plan = subscriptionData.value.plan;
  if (plan === "free") {
    return formatQuotaScope(subscriptionData.value.quotas.documents?.scope ?? "lifetime");
  }
  const scope = subscriptionData.value.quotas.invoices?.scope
      ?? subscriptionData.value.quotas.contracts?.scope;
  return scope ? formatQuotaScope(scope) : "—";
});

const quotaPeriodLabel = computed(() => {
  if (!subscriptionData.value) return "";
  const plan = subscriptionData.value.plan;
  const quota = plan === "free"
      ? subscriptionData.value.quotas.documents
      : subscriptionData.value.quotas.invoices ?? subscriptionData.value.quotas.contracts;
  const periodStart = quota?.periodStart;
  const periodEnd = quota?.periodEnd;
  if (!periodStart || !periodEnd) return "";
  return `${formatDate(periodStart)} – ${formatDate(periodEnd)}`;
});

const quotaUsageRows = computed(() => {
  if (!subscriptionData.value) return [];
  const plan = subscriptionData.value.plan;
  const defs = plan === "free"
      ? [
        {key: "documents" as const, label: "מסמכים (סה״כ)"},
        {key: "reminders" as const, label: "תזכורות אימייל"},
      ]
      : [
        {key: "invoices" as const, label: "חשבוניות וקבלות (ייבוא)"},
        {key: "contracts" as const, label: "תסקירים וחוזים (העלאה/ייבוא)"},
        {key: "reminders" as const, label: "תזכורות אימייל"},
      ];
  return defs.map(({key, label}) => {
    const quota = subscriptionData.value!.quotas[key];
    return {
      key,
      label,
      limit: quota?.limit ?? null,
      usageLabel: formatQuotaUsage(quota?.used ?? 0, quota?.limit ?? null),
      percent: quotaPercent(quota?.used ?? 0, quota?.limit ?? null),
    };
  });
});

const importCounterRows = computed(() => {
  const counters = subscriptionData.value?.counters;
  if (!counters) return [];
  return [
    {key: "scanned", label: "מסמכים שנסרקו (העלאה ידנית)", value: counters.scannedDocuments},
    {key: "gmail-docs", label: "מסמכים שיובאו מ-Gmail", value: counters.gmailDocuments},
    {key: "gmail-invoices", label: "חשבוניות שיובאו מ-Gmail", value: counters.gmailInvoices},
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
    ["מספר מפקח", ep.inspector_number],
    ["כתובת", ep.address],
    ["עיר", ep.city],
    ["תואר מקצועי", ep.title],
    ["התמחות", ep.expertise],
    ["מספר מ.ר.", ep.mr_number],
    ["מספר מ.ג.", ep.mg_number],
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
  if (route.query.section === "subscription") {
    activeSection.value = "subscription";
  }
  try {
    const [settingsRes, statsRes, engineerRes, notifsRes] =
      await Promise.allSettled([
        userSettingsStore.load(),
        fetch(`${SERVER}/api/profile/stats`, { credentials: "include" }),
        engineerStore.load(),
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
  loadDriveStatus();
});

watch(activeSection, (section) => {
  if (section === "subscription" && !subscriptionData.value) {
    void loadSubscription();
  }
});
</script>

<style scoped>
.profile-page {
  min-width: 0;
}

.profile-shell {
  display: flex;
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

/* ── Sidebar ─────────────────────────────────────────────────────────────── */
.profile-sidebar {
  width: 240px;
  flex-shrink: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 20px 12px;
  position: sticky;
  top: 16px;
}

.sidebar-user {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 8px 16px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 12px;
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

.sidebar-user__info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
.sidebar-user__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sidebar-nav__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 10px;
  background: transparent;
  font-family: var(--font-ui);
  font-size: 13px;
  line-height: 1.3;
  color: var(--text-secondary);
  text-align: start;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.sidebar-nav__item :deep(.n-icon) {
  flex: 0 0 auto;
}
.sidebar-nav__item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.sidebar-nav__item:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--brand-color) 55%, transparent);
  outline-offset: 2px;
}
.sidebar-nav__item--active {
  background: color-mix(in srgb, var(--brand-color) 14%, transparent);
  color: var(--brand-color);
  font-weight: 600;
}

/* ── Content ─────────────────────────────────────────────────────────────── */
.profile-content {
  flex: 1;
  min-width: 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.section-title {
  margin: 0 0 16px;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.section-header .section-title {
  margin: 0;
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
.settings-group {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 16px;
}
.settings-group__title {
  margin: 0 0 16px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}
.settings-desc {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--text-secondary);
}
.settings-form {
  max-width: 400px;
}
.settings-desc--follow {
  margin-top: 8px;
}
.settings-desc--inline {
  margin: 0;
}
.settings-link {
  margin-inline-start: 6px;
  color: var(--brand-color);
  font-weight: 700;
  text-decoration: none;
}
.settings-link:hover {
  text-decoration: underline;
}
.drive-status-tag {
  margin-bottom: 8px;
}
.drive-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.drive-folder {
  margin-top: 12px;
}
.drive-folder__label {
  display: block;
  margin-bottom: 4px;
}
.drive-folder__row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.drive-folder__open {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
}
.drive-folder-alert {
  margin-top: 12px;
}
.drive-repair-btn {
  margin-top: 10px;
}
.drive-folder__input {
  max-width: 220px;
}
.drive-reauth {
  margin-top: 8px;
}
.drive-reauth__alert {
  margin-bottom: 8px;
}
.avatar-upload-row {
  display: flex;
  align-items: center;
  gap: 16px;
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

.sub-plan-card {
  margin-bottom: 20px;
  padding: 18px 20px;
  border: 1px solid color-mix(in srgb, var(--brand-color) 28%, var(--border-color));
  border-radius: 16px;
  background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--brand-color) 8%, var(--bg-card)) 0%,
      var(--bg-card) 72%
  );
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

.sub-plan-card__features {
  margin: 0 0 14px;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}
.sub-plan-card__features li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.sub-plan-card__features :deep(.n-icon) {
  flex: 0 0 auto;
  margin-top: 1px;
  color: var(--brand-color);
}

.sub-plan-card__link {
  display: inline-flex;
  font-size: 13px;
  font-weight: 700;
  color: var(--brand-color);
  text-decoration: none;
}

.sub-plan-card__link:hover {
  text-decoration: underline;
}

.sub-usage-card {
  margin-bottom: 24px;
}

.sub-quota {
  padding-top: 14px;
  margin-top: 14px;
  border-top: 1px solid var(--border-color);
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
  font-size: 12px;
  color: var(--brand-color);
  font-weight: 600;
}

.sub-counters-card {
  margin-top: 12px;
}

.sub-counters-card__title {
  margin: 0 0 8px;
}

.billing-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.billing-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border-color);
  border-radius: 12px;
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
  padding: 24px;
  border: 1px dashed var(--border-color);
  border-radius: 12px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
  background: var(--bg-card);
}

@media (max-width: 820px) {
  .profile-shell {
    flex-direction: column;
    gap: 16px;
    min-height: 0;
  }

  .profile-sidebar {
    position: static;
    width: 100%;
    padding: 14px;
  }

  .sidebar-user {
    padding-bottom: 12px;
  }

  .sidebar-nav {
    flex-direction: row;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: none;
  }

  .sidebar-nav::-webkit-scrollbar {
    display: none;
  }

  .sidebar-nav__item {
    flex: 0 0 auto;
    width: auto;
    white-space: nowrap;
  }

  .profile-content {
    width: 100%;
  }
}

@media (max-width: 560px) {
  .section-header {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
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

  .avatar-upload-row {
    align-items: stretch;
    flex-direction: column;
  }

  .drive-folder__row,
  .drive-folder__input {
    width: 100%;
    max-width: none;
  }

  .sub-plan-card__head {
    flex-direction: column;
  }

  .sub-plan-card__price {
    align-items: flex-start;
  }
}
</style>
