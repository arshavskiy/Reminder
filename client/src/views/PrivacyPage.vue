<template>
  <article class="legal-page" dir="rtl" lang="he">
    <section class="legal-page__hebrew" lang="he" dir="rtl">
      <h1>מדיניות פרטיות</h1>
      <p class="legal-page__updated">עודכן לאחרונה: 19 באוגוסט 2026</p>

      <div class="legal-page__note">
        <p>RemindOCR מופעלת על ידי HandCoded. אנו משתמשים במידע שלך רק כדי להפעיל את המערכת, לאמת משתמשים, לייבא מסמכים לפי בחירתך, להפיק תזכורות ולשמור על אבטחת השירות.</p>
        <ul>
          <li>כניסה עם Google משמשת לאימות זהות והצגת פרטי המשתמש באפליקציה.</li>
          <li>גישה ל-Gmail היא אופציונלית, לקריאה בלבד, ומשמשת להצגת הודעות עם קבצים מצורפים ולייבוא קבצים שבחרת.</li>
          <li>מסמכים שהועלו נשמרים ומעובדים לצורך OCR, חילוץ נתונים וניהול תזכורות.</li>
          <li>ניתן לבקש מחיקה, תיקון או גישה למידע באמצעות פנייה אלינו.</li>
        </ul>
        <p>הנוסח האנגלי המלא מופיע להלן והוא הנוסח המחייב של מדיניות הפרטיות.</p>
      </div>
    </section>

    <section class="legal-page__english" lang="en" dir="ltr">
      <h1>Privacy Policy</h1>
      <p class="legal-page__updated">Last updated: August 19, 2026</p>

    <p>RemindOCR ("the App") is operated by HandCoded ("we", "us"). This policy describes how we collect, use, and protect your information.</p>

    <h2>1. Information We Collect</h2>
    <ul>
      <li><strong>Google Account Info:</strong> When you sign in with Google, we receive your name, email address, and profile picture from Google. We use this solely for authentication and displaying your identity within the App.</li>
      <li><strong>Gmail Data:</strong> If you connect your Gmail account, we access your inbox in read-only mode to list emails with attachments. We only read email metadata (sender, subject, date) and download attachments you explicitly choose to import. We do not read email body content.</li>
      <li><strong>Uploaded Documents:</strong> Documents you upload or import are stored securely and processed using OCR and AI extraction to identify key data (dates, names, contract terms).</li>
      <li><strong>Usage Data:</strong> We log basic request information (IP address, user agent, timestamps) for security and debugging purposes.</li>
    </ul>

    <h2>2. How We Use Your Information</h2>
    <ul>
      <li>Authenticate your identity and maintain your session</li>
      <li>Display and manage your documents, clients, contracts, and reminders</li>
      <li>Send reminder emails on your behalf when contracts or inspections are due</li>
      <li>Import PDF attachments from your Gmail when you request it</li>
    </ul>

    <h2>3. Data Storage and Security</h2>
    <ul>
      <li>Your data is stored in a MongoDB database hosted on MongoDB Atlas with encryption at rest.</li>
      <li>Document files are stored in cloud object storage (DigitalOcean Spaces) with server-side encryption.</li>
      <li>All connections use HTTPS/TLS encryption in transit.</li>
      <li>Session cookies are signed, HTTP-only, and secure.</li>
      <li>Gmail OAuth tokens are stored encrypted in the database and are used only to access your Gmail on your behalf.</li>
    </ul>

    <h2>4. Data Sharing</h2>
    <p>We do not sell, trade, or share your personal data with third parties. Your data is shared only with:</p>
    <ul>
      <li><strong>Google APIs:</strong> To authenticate you and access your Gmail (with your explicit consent).</li>
      <li><strong>OpenAI API:</strong> Document text may be sent to OpenAI for AI-powered data extraction. No personal identifiers are included beyond what appears in the document text.</li>
      <li><strong>Email provider (Resend):</strong> To send reminder emails on your behalf.</li>
    </ul>

    <h2>5. Data Retention</h2>
    <ul>
      <li>Your account and data are retained as long as your account is active.</li>
      <li>You can request deletion of your account and all associated data by contacting us.</li>
      <li>Session data expires automatically after 7 days.</li>
      <li>OAuth state tokens expire after 10 minutes.</li>
    </ul>

    <h2>6. Your Rights</h2>
    <ul>
      <li>You can disconnect your Gmail at any time from the Gmail Inbox page.</li>
      <li>You can request access to, correction of, or deletion of your personal data.</li>
      <li>You can revoke the App's access to your Google account at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">Google Account Permissions</a>.</li>
    </ul>

    <h2>7. Google API Services User Data Policy</h2>
    <p>RemindOCR's use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>

    <h2>8. Changes to This Policy</h2>
    <p>We may update this policy from time to time. Changes will be posted on this page with an updated date.</p>

    <h2>9. Contact</h2>
      <p>For privacy-related questions, contact: <a href="mailto:arshavsky.pasha@gmail.com">arshavsky.pasha@gmail.com</a></p>
    </section>

    <p class="legal-page__nav">
      <router-link to="/terms">Terms of Service</router-link>
      <span aria-hidden="true"> · </span>
      <router-link to="/login">Back to login</router-link>
    </p>
  </article>
</template>

<script setup lang="ts">
</script>

<style scoped>
.legal-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 40px 20px 64px;
  line-height: 1.6;
  color: var(--text-primary, #222);
}
.legal-page__hebrew {
  direction: rtl;
  text-align: right;
}
.legal-page__english {
  direction: ltr;
  text-align: left;
  margin-top: 36px;
  padding-top: 32px;
  border-top: 1px solid var(--border-color, #e5e7eb);
}
.legal-page__note {
  background: var(--bg-card, #f8fafc);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 18px 20px;
}
.legal-page h1 {
  font-size: 1.8em;
  margin: 0 0 0.2em;
}
.legal-page h2 {
  font-size: 1.2em;
  margin-top: 2em;
}
.legal-page__updated {
  color: var(--text-muted, #666);
  font-size: 0.9em;
  margin-bottom: 2em;
}
.legal-page ul {
  padding-inline-start: 1.5em;
}
.legal-page__hebrew ul {
  padding-inline-start: 0;
  padding-inline-end: 1.5em;
}
.legal-page a {
  color: var(--brand-color, #18a058);
}
.legal-page__nav {
  direction: ltr;
  text-align: left;
  margin-top: 3em;
  padding-top: 1.5em;
  border-top: 1px solid var(--border-color, #e5e7eb);
  font-size: 0.95em;
}
</style>
