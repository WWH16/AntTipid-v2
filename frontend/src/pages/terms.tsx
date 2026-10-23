// Public terms of use, linked from the sign-in screen's consent line and the landing page footer.
import { Link } from 'react-router-dom'
import { LegalPage, Mail, Section } from '@/components/legal-page'

export function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      path="/terms"
      updated="October 23, 2026"
      intro="These terms cover your use of AntTipid, a free personal expense and budget tracker. By creating an account or signing in, you agree to them."
    >
      <Section title="What AntTipid is">
        <p>
          AntTipid helps you record what you spend and earn, set budgets and see where your money goes. It isn't connected to your bank, GCash, Maya or any other account:
          every amount in it is one you entered, so balances are only as accurate as your records. It's a record-keeping tool, not financial, tax or investment advice.
        </p>
      </Section>

      <Section title="Your account">
        <ul>
          <li>Use an email address you can receive mail at, and keep your password to yourself.</li>
          <li>An account is for one person. You're responsible for what happens in yours.</li>
          <li>If you think someone else got into your account, change your password and email <Mail />.</li>
        </ul>
      </Section>

      <Section title="Your records">
        <p>
          What you enter stays yours. AntTipid stores it only to run the app for you, as the <Link to="/privacy" className="text-foreground underline underline-offset-4">Privacy policy</Link> explains.
        </p>
      </Section>

      <Section title="Receipt scanning">
        <p>Scanned receipts are read by an AI service, which can misread the store, date, items or total. Check what it filled in before you save.</p>
      </Section>

      <Section title="Fair use">
        <p>Don't use AntTipid to break the law, get into other people's accounts, overload or attack the service, or get around its bot checks.</p>
      </Section>

      <Section title="Availability">
        <p>
          AntTipid is free and provided as it is. It may change, have downtime, or lose features, and it could shut down. Keep your own copy of records that matter to you.
          To the extent the law allows, AntTipid isn't liable for losses that come from using it or from it being unavailable.
        </p>
      </Section>

      <Section title="Ending your account">
        <p>
          You can stop using AntTipid at any time and ask for your account and records to be deleted, as described in the Privacy policy.
          Accounts that break these terms may be suspended or removed.
        </p>
      </Section>

      <Section title="Changes, law and contact">
        <p>
          If these terms change, the date at the top changes with them. Using AntTipid after that means you accept the new terms.
          They're governed by the laws of the Philippines. For questions, email <Mail />.
        </p>
      </Section>
    </LegalPage>
  )
}
