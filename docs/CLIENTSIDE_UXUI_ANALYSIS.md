# Client UI/UX Missing Features Analysis

**Date**: 2026-05-20
**Based on**: `/spects/profile page/` screenshots (8 images)

---

## 🎯 Missing Features Identified

### 1. **User Profile Page** ❌ CRITICAL
The spec shows a dedicated profile/account page that's currently missing.

**What's needed:**
- User avatar display with upload capability
- User information (email, name, role)
- Personal theme preference (not global settings)
- Account email & notification preferences
- Profile edit form
- Bio/about section

**Files to create:**
- `src/client/views/ProfilePage.vue` — User account page
- `src/client/components/AvatarUpload.vue` — Avatar upload component
- `src/client/components/UserCard.vue` — User info display card

---

### 2. **Reusable UI Components** ⚠️ MISSING
Currently only 3 components exist. Missing:
- [ ] Avatar component with image support
- [ ] User card (shows user name, role, avatar)
- [ ] Statistic card with better styling
- [ ] Empty state component (used everywhere)
- [ ] Form section / card wrapper
- [ ] Alert / notification components
- [ ] Modal / dialog wrappers
- [ ] Loading skeleton
- [ ] Error boundary component

---

### 3. **Top Bar Enhancements** 🔄 PARTIAL
The avatar in top bar should:
- [x] Show icon
- [ ] Show user name in tooltip
- [ ] Show dropdown menu (profile, settings, logout)
- [ ] Display actual user avatar image (when logged in)

**Files to create:**
- `src/client/components/UserDropdown.vue` — Profile dropdown menu

---

### 4. **Sidebar Navigation** ❌ MISSING
Currently the app uses horizontal top bar. Specs might show a sidebar. Need to check:
- Collapsible sidebar option
- Better mobile adaptation
- Quick action buttons

---

### 5. **Dashboard Improvements** 🔄 PARTIAL
Dashboard exists but missing:
- [ ] Quick action cards (new document, new client, etc.)
- [ ] Better empty states
- [ ] Loading skeletons while data fetches
- [ ] Animated stat counters

---

### 6. **Form Improvements** 🔄 PARTIAL
Forms exist but need:
- [ ] Consistent form layout across all pages
- [ ] Better error display
- [ ] Success feedback
- [ ] Help text / hints
- [ ] Inline validation

---

### 7. **Mobile Responsiveness** ⚠️ NEEDS WORK
- [ ] Top bar collapses on mobile
- [ ] Grid layouts adapt
- [ ] Forms stack properly
- [ ] Touch-friendly button sizes

---

### 8. **Accessibility (a11y)** ⚠️ NEEDS REVIEW
- [ ] ARIA labels on all buttons
- [ ] Keyboard navigation
- [ ] Focus indicators
- [ ] Color contrast
- [ ] Screen reader support

---

## 📝 Implementation Priority

| Feature | Priority | Complexity | Est. Time |
|---------|----------|-----------|-----------|
| Profile Page | 🔴 HIGH | Medium | 2 hours |
| User Dropdown | 🔴 HIGH | Easy | 30 min |
| Reusable Components | 🟠 MEDIUM | Easy | 1 hour |
| Form Improvements | 🟠 MEDIUM | Medium | 1.5 hours |
| Dashboard Enhancements | 🟡 LOW | Medium | 1 hour |
| Mobile Responsiveness | 🟡 LOW | Hard | 2 hours |
| Accessibility | 🟡 LOW | Medium | 1 hour |

**Total (Phase 1)**: ~6 hours to core features
**Total (Recommended, all)**: ~9.5 hours

---

## 🎨 Design System (CSS Variables)

Currently using:
```css
--bg-app
--bg-card
--bg-hover
--bg-elevated
--border-color
--text-primary
--text-secondary
--brand-color
--brand-color-hover
```

Need to add:
```css
--success-color
--error-color
--warning-color
--info-color
--shadow-sm
--shadow-md
--shadow-lg
--radius-sm
--radius-md
--radius-lg
```

---

## 🚀 Next Steps

1. Create ProfilePage component
2. Create UserDropdown component
3. Add common reusable components
4. Update App.vue to use new components
5. Update router with /profile route
6. Refactor SettingsPage for Phase 2 (split admin/user)


