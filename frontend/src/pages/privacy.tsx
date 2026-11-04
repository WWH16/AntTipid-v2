// Public privacy policy, linked from the sign-in screen, Google's consent screen (Google Auth Platform > Branding)
// and Meta's app settings (App settings > Basic: privacy policy and data deletion URLs).
import { LegalPage, Mail, Section } from '@/components/legal-page'

export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      path="/privacy"
      updated="November 4, 2026"
      intro="AntTipid is a personal expense and budget tracker. This page explains what it keeps about you, why, and how to have it deleted."
    >
      <Section title="What AntTipid keeps">
        <ul>
          <li><span className="text-foreground">Your account:</span> your name and email address. If you sign in with Google or Facebook, it shares your name, email address and profile picture with AntTipid. The app only uses your name and email.</li>
          <li><span className="text-foreground">What you enter:</span> wallets, categories, transactions, budgets, and receipt photos and items you attach to a transaction.</li>
          <li><span className="text-foreground">An audit log:</span> each sign-in and each change to your wallets, categories, transactions and budgets, with the time. It keeps the item's name and its old and new values, even after you delete the item. You can read it in Settings, and it's deleted with your account. After you restore a backup, photos of transactions that aren't in that backup stay in storage until your account is deleted.</li>
          <li><span className="text-foreground">Notifications:</span> the warnings and monthly recaps AntTipid creates for you, and your notification settings. They're deleted with your account.</li>
        </ul>
        <p>AntTipid has no ads and no analytics or tracking tools, and it never sells or rents your information.</p>
      </Section>

      <Section title="How it's used">
        <p>Only to run the app for you: signing you in, saving your records, and showing your balances, budgets and reports. Your records are private to your account, and other users can't see them.</p>
      </Section>

      <Section title="Receipt scanning">
        <p>
          When you scan a receipt, the photo is sent to an AI service to read the store, date, items and total: free models on OpenRouter, or Google Gemini if those fail.
          AntTipid doesn't keep the scan itself; only what you choose to save. Those services handle the photo under their own terms, and free models may keep what they receive, so don't scan receipts that show information you'd rather not share.
        </p>
      </Section>

      <Section title="Where it's stored">
        <p>
          Your account, records and receipt photos are stored with Supabase (database, file storage and sign-in). The app is hosted on Vercel.
          The sign-in page uses Cloudflare Turnstile to check that a person, not a bot, is signing in. For that check, your browser sends Cloudflare some
          details about itself and your device, which Cloudflare handles under its own privacy policy.
          Your session is kept in your browser's local storage so you stay signed in. Signing out clears it.
          Notification emails are sent through Google's mail service to the address you sign in with. You can turn them off in Settings.
        </p>
      </Section>

      <Section title="Information from Google">
        <p>
          AntTipid's use of information received from Google APIs follows the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-foreground underline underline-offset-4">Google API Services User Data Policy</a>,
          including its Limited Use requirements. Your Google name and email are used only to create and show your AntTipid account, and they aren't shared with anyone else.
        </p>
      </Section>

      <Section title="Deleting your data">
        <p>
          Email <Mail /> from the address you sign in with and ask for your account to be deleted. Your account, records and receipt photos will be deleted within 30 days.
          You can also delete single transactions, categories and budgets in the app at any time.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>If this policy changes, the date at the top changes with it. For questions, email <Mail />.</p>
      </Section>
    </LegalPage>
  )
}
