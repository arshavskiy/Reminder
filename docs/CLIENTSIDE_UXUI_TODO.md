Client-side UI/UX TODO based on /spects/ visuals

Goal
----
Compare the current client UI against the screenshots under `spects/` and implement missing/incorrect UI elements so the app matches the agreed visuals.

What I changed already
---------------------
- Replaced top headers in `ProfilePage.vue` and added a consistent header to `SettingsPage.vue` by using the shared `PageHeader` component.
- Removed the global theme card from `SettingsPage.vue` so theme is only editable in `ProfilePage.vue` (personal settings).

Checklist (per-screenshot)
-------------------------
I will open each screenshot and produce a short list of changes required. For now I have only listed filenames — I will implement items progressively.

spects/
- Screenshot 2026-05-20 094827.png
- Screenshot 2026-05-20 094839.png
- Screenshot 2026-05-20 094852.png
- Screenshot 2026-05-20 095353.png
- Screenshot 2026-05-20 095356.png
- Screenshot 2026-05-20 145738.png

spects/profile page/
- Screenshot 2026-05-20 103221.png — Profile header alignment, avatar sizing, action buttons
- Screenshot 2026-05-20 103224.png — Stats card layout and spacing
- Screenshot 2026-05-20 103227.png — User settings form layout (make fields 2-column on wide screens)
- Screenshot 2026-05-20 103234.png — Danger zone styling and button prominence
- Screenshot 2026-05-20 103240.png — Mobile responsiveness
- Screenshot 2026-05-20 103244.png — Visual state for disconnected sessions
- Screenshot 2026-05-20 103248.png — Empty states, placeholders
- Screenshot 2026-05-20 103253.png — Final polish (typography, spacing)

spects/user/
- Screenshot 2026-05-20 145509.png — User dropdown/menu in top nav
- Screenshot 2026-05-20 145513.png — Avatar + role badge

Implementation plan
-------------------
1. Inventory: load screenshots and annotate exact component differences (I will open each and list concrete tasks).
2. Implement shared components and style fixes (PageHeader already used). Next targets:
   - Make profile stats responsive and consistent with screenshots.
   - Ensure avatar sizes and initials match spec.
   - Make settings forms responsive (2-column grid where applicable).
   - Improve danger zone CTA styling.
   - Add missing user dropdown transitions and role badge.
3. Run app locally and visually verify pages.
4. Iterate until screenshots match.

Next action
-----------
I will now:
- Inspect the `ProfilePage.vue` and implement responsive two-column layout for the settings form and refine avatar sizing + stats layout.
- Update user dropdown to match spec (add role badge and better spacing).

If you want a different priority, tell me which screenshot or page to focus on first. Otherwise I'll proceed with profile page refinements now.
