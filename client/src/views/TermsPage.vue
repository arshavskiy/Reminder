<template>
  <article class="legal-page" dir="rtl" lang="he">
    <section class="legal-page__hebrew" lang="he" dir="rtl">
      <h1>תנאי שימוש</h1>
      <p class="legal-page__updated">עודכן לאחרונה: 19 באוגוסט 2026</p>

      <div class="legal-page__note">
        <p>השימוש ב-RemindOCR כפוף לתנאי השימוש שלהלן. המערכת מיועדת לניהול מסמכים, תסקירים, חוזים ותזכורות עבור משתמשים מורשים בלבד.</p>
        <ul>
          <li>הגישה למערכת דורשת התחברות והרשאה מתאימה.</li>
          <li>אין להשתמש במערכת לפעילות בלתי חוקית או להעלאת קבצים מזיקים.</li>
          <li>המסמכים והנתונים שהעלית נשארים בבעלותך, אך ניתנת לנו הרשאה לעבד אותם לצורך מתן השירות.</li>
          <li>חיבור Gmail הוא אופציונלי וניתן לניתוק בכל עת.</li>
        </ul>
        <p>הנוסח האנגלי המלא מופיע להלן והוא הנוסח המחייב של תנאי השימוש.</p>
      </div>
    </section>

    <section class="legal-page__english" lang="en" dir="ltr">
      <h1>Terms of Service</h1>
      <p class="legal-page__updated">Last updated: August 19, 2026</p>

    <p>These Terms of Service ("Terms") govern your use of RemindOCR ("the App"), operated by HandCoded ("we", "us"). By using the App, you agree to these Terms.</p>

    <h2>1. Description of Service</h2>
    <p>RemindOCR is a document management application that helps users track inspection reports, contracts, and reminders. The App provides OCR processing, AI-powered data extraction, client management, and automated email reminders.</p>

    <h2>2. Account and Access</h2>
    <ul>
      <li>Access to the App requires authentication via Google Sign-In or email/password registration.</li>
      <li>Access is restricted to approved users only. We reserve the right to approve or deny access at our discretion.</li>
      <li>You are responsible for maintaining the security of your account credentials.</li>
      <li>You must not share your account or allow unauthorized access.</li>
    </ul>

    <h2>3. Acceptable Use</h2>
    <p>You agree to:</p>
    <ul>
      <li>Use the App only for its intended purpose of document and reminder management.</li>
      <li>Not upload malicious files, attempt to exploit vulnerabilities, or interfere with the App's operation.</li>
      <li>Not use the App to store or process illegal content.</li>
      <li>Comply with all applicable laws and regulations.</li>
    </ul>

    <h2>4. Your Data</h2>
    <ul>
      <li>You retain ownership of all documents and data you upload to the App.</li>
      <li>You grant us a limited license to process your documents for the purpose of providing the App's services (OCR, AI extraction, reminder generation).</li>
      <li>Your data is handled in accordance with our <router-link to="/privacy">Privacy Policy</router-link>.</li>
    </ul>

    <h2>5. Gmail Integration</h2>
    <ul>
      <li>Connecting your Gmail account is optional and requires explicit consent.</li>
      <li>The App accesses Gmail in read-only mode only.</li>
      <li>You can disconnect Gmail at any time.</li>
      <li>Gmail data usage complies with the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener">Google API Services User Data Policy</a>.</li>
    </ul>

    <h2>6. AI Processing</h2>
    <ul>
      <li>Document text may be processed by third-party AI services (OpenAI) for data extraction.</li>
      <li>AI-extracted data should be reviewed for accuracy. We do not guarantee the correctness of AI-generated extractions.</li>
    </ul>

    <h2>7. Service Availability</h2>
    <ul>
      <li>We strive to maintain the App's availability but do not guarantee uninterrupted service.</li>
      <li>We may perform maintenance, updates, or modifications at any time.</li>
      <li>We reserve the right to suspend or terminate access for violations of these Terms.</li>
    </ul>

    <h2>8. Limitation of Liability</h2>
    <p>The App is provided "as is" without warranties of any kind. We are not liable for:</p>
    <ul>
      <li>Loss of data or documents</li>
      <li>Missed reminders or incorrect AI extractions</li>
      <li>Service interruptions or downtime</li>
      <li>Any damages arising from use of the App</li>
    </ul>

    <h2>9. Changes to Terms</h2>
    <p>We may update these Terms from time to time. Continued use of the App after changes constitutes acceptance of the updated Terms.</p>

    <h2>10. Contact</h2>
      <p>For questions about these Terms, contact: <a href="mailto:arshavsky.pasha@gmail.com">arshavsky.pasha@gmail.com</a></p>
    </section>

    <p class="legal-page__nav">
      <router-link to="/privacy">Privacy Policy</router-link>
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
