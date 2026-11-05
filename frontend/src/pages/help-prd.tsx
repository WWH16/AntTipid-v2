// Product Requirement Document, reached from the Help menu. Describes the app as built: keep it in step with the app.
import { DocTable, DocumentPage, Figure } from '@/components/document-page'

const fr = (start: number, items: string[]) => items.map((item, i) => [`FR-${start + i}`, item])

const FR_GROUPS: { title: string; items: string[] }[] = [
  {
    title: 'Account and access',
    items: [
      'A visitor can create an account with a name, email and password. AntTipid sends a confirmation email.',
      'A user can sign in with email and password, or continue with Google.',
      'A user can reset a forgotten password through an emailed link.',
      'A new password needs at least 8 characters, one uppercase letter, one lowercase letter and one number.',
      'Sign-in, sign-up and the password-reset and confirmation emails pass a Cloudflare Turnstile CAPTCHA.',
      'A user can edit their name and sign out.',
    ],
  },
  {
    title: 'Wallets',
    items: [
      'A user can add, edit and delete wallets of type cash, e-wallet, bank, credit card or savings, each with an opening balance.',
      'A wallet’s balance is its opening balance plus its transactions.',
      'A wallet in use can’t be deleted. It can be archived, and restored later.',
    ],
  },
  {
    title: 'Categories',
    items: [
      'A new account starts with 11 default categories: 8 for spending and 3 for income.',
      'A user can add, edit and delete categories, each with a name, a kind and an icon. A category with transactions can’t be deleted until they move to another category.',
      'A spending category can be marked “Paid once a month”, for bills such as rent and electricity.',
    ],
  },
  {
    title: 'Transactions and Activity',
    items: [
      'A user can record an expense, income or transfer with an amount, title, date, wallet, category and note. Wallet and date are pre-filled.',
      'A transfer moves money between two different wallets and has no category.',
      'A user can edit or delete any of their transactions.',
      'A second entry with the same date and amount asks “Is this a duplicate?”.',
      'Activity lists a month’s transactions grouped by day, newest first, with totals spent and earned.',
      'Activity filters by month, type, wallet and category together. Search looks through titles, notes and receipt items in every month.',
      'A user can export the filtered list as a CSV file.',
    ],
  },
  {
    title: 'Receipt scanning',
    items: [
      'A JPEG, PNG or WebP photo up to 8 MB fills in the store, date, items, total, a suggested category and the payment method. A missing, impossible or future date becomes today, with a message to check it. The user checks the result, then saves.',
      'The photo is kept privately with its transaction. Only its owner can open it.',
      'If reading fails, the app says so and the user can type the transaction instead.',
    ],
  },
  {
    title: 'Budgets',
    items: [
      'A user can set one monthly budget and one budget per spending category, each with a warning point from 1% to 100% (80% by default).',
      'Category budgets can’t add up past the monthly budget. The monthly budget is the real limit.',
      'Every budget change is kept per month, so a finished month is read against the budgets it had.',
    ],
  },
  {
    title: 'Decision support',
    items: [
      'Home shows what’s left to spend this month, a pace bar and a safe daily amount.',
      'From day 5, each budget shows its run-out date at the current pace and the safe daily amount that makes it last.',
      'Each budget reads On track or Spending fast, and Under limit, near its limit, Used up or over.',
      'Spending in categories with no budget is flagged once it passes the unassigned part of the monthly budget.',
      'Once-a-month categories stay out of the pace. Their category budget is set aside until they’re paid.',
      'Each purchase is judged when saved. A category needs 3 expenses in 6 months for a simple rule and 10 for K-means clustering. Until then the app says what it’s waiting for.',
      'An unusual purchase asks the user to decide: a one-off stays out of the pace, and normal becomes part of the usual amounts. Both can be undone.',
      'A finished month shows how it ended against its monthly budget and each category budget.',
      'Home’s Needs attention section lists budgets and purchases to review.',
    ],
  },
  {
    title: 'Reports',
    items: [
      'Reports shows earned, spent and saved, spending through the month, spending by category, and 6 months of income and spending as a chart or a table.',
      'Print preview gives a paper copy of one month: totals, categories, the 6-month trend and every transaction. The browser can print it or save it as a PDF.',
    ],
  },
  {
    title: 'Notifications',
    items: [
      'The bell and email warn when a budget nears its limit, is used up, goes over or will run out early, and when a purchase is unusual.',
      'A recap of last month arrives on the 1st of each month.',
      'A user can turn off email or any single warning, and send a test email once a minute.',
    ],
  },
  {
    title: 'Data, logs and help',
    items: [
      'A user can download a backup of their records as a JSON file.',
      'A user can restore a backup. It replaces their records in one step, and a failure changes nothing.',
      'The audit log lists each sign-in and each change to transactions, wallets, categories and budgets, with old and new values. It can’t be edited.',
      'The Help menu opens this document and the Technical Requirement Document, and each can be copied for Word.',
    ],
  },
]

let next = 1
const FUNCTIONAL = FR_GROUPS.map((group) => {
  const rows = fr(next, group.items)
  next += group.items.length
  return { title: group.title, rows }
})

export function HelpPrdPage() {
  return (
    <DocumentPage
      title="Product Requirement Document"
      sections={[
        {
          id: 'overview',
          title: 'Overview',
          body: (
            <>
              <p>
                AntTipid is a personal money tracker in Philippine pesos, built as a decision support system. <em>Tipid</em> means
                spending carefully so your money lasts until your next payday. A person records what they spend and earn across cash,
                e-wallets, bank accounts, savings and credit cards, sets budgets, and gets a warning before the money runs out.
              </p>
              <p>This document describes the product as built. The Technical Requirement Document covers how it’s built.</p>
              <DocTable
                head={['Item', 'Detail']}
                rows={[
                  ['Product', 'AntTipid'],
                  ['Web address', 'https://ant-tipid-v2-frontend.vercel.app'],
                  ['Promise', 'Know where every peso goes.'],
                  ['Core question', 'How much can I still spend this month?'],
                  ['Price', 'Free, with no ads'],
                ]}
              />
            </>
          ),
        },
        {
          id: 'problem',
          title: 'Problem',
          body: (
            <>
              <p>
                The author built AntTipid because of one problem: money kept going out with no clear picture of where it went. The need
                was to be responsible with money, to track it, and to know everything about it.
              </p>
              <DocTable
                head={['Problem', 'What AntTipid does']}
                rows={[
                  ['Not knowing where the money goes', 'Every transaction carries a category and a wallet. Reports break the month down by category.'],
                  ['Money spread across cash, e-wallets and bank accounts', 'Each wallet keeps its own balance, and transfers move money between them.'],
                  ['Finding out when the money is already gone', 'Warnings arrive near a limit, and a run-out date shows from day 5.'],
                  ['Long receipts take time to type', 'A photo of the receipt fills in the transaction for the user to check.'],
                  ['A big bill or one-off purchase distorts the picture', 'Once-a-month bills and one-offs stay out of the daily pace.'],
                ]}
              />
            </>
          ),
        },
        {
          id: 'goals',
          title: 'Goals and non-goals',
          body: (
            <>
              <h3>Goals</h3>
              <ul>
                <li>Show where every peso goes.</li>
                <li>Answer how much can still be spent this month, at any moment.</li>
                <li>Warn early enough for the user to change what happens next.</li>
                <li>Keep the user in charge: AntTipid recommends, and the user decides.</li>
                <li>Let users keep their own copy of their records.</li>
              </ul>
              <h3>Non-goals</h3>
              <ul>
                <li>No connection to bank or e-wallet accounts. AntTipid never asks for those logins.</li>
                <li>No currency other than Philippine pesos.</li>
                <li>No shared or family accounts. Every record belongs to one user.</li>
                <li>No investment or loan advice.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'users',
          title: 'Users',
          body: (
            <>
              <p>
                The primary user is a person in the Philippines who manages day-to-day spending across cash and e-wallets, mostly on a phone.
                AntTipid has one account type. It has no administrator role, and no account can see another account’s records.
              </p>
              <DocTable
                head={['Type', 'Can use']}
                rows={[
                  ['Visitor, not signed in', 'Landing page, Privacy policy, Terms, sign-up and sign-in.'],
                  ['User, signed in', 'Every feature, on their own records only.'],
                ]}
              />
            </>
          ),
        },
        {
          id: 'decision-loop',
          title: 'How the decision support works',
          body: (
            <>
              <p>
                The product runs on one loop. The user records a transaction, AntTipid checks it against budgets, pace and usual amounts,
                a warning appears if something needs attention, and the user decides what to do. Each decision on an unusual purchase
                shapes how later purchases are judged.
              </p>
              <Figure
                n={1}
                name="decision-loop"
                width={760}
                height={196}
                alt="Four steps in a loop: record a transaction, check it against budgets, pace and usual amounts, warn on the Home screen, bell and email, then the user decides. The decision feeds back into later checks."
                caption="The decision loop."
              />
            </>
          ),
        },
        {
          id: 'course-features',
          title: 'Required web application features',
          body: (
            <>
              <p>The ten features the MIT 202 template requires, and how AntTipid meets each one.</p>
              <DocTable
                head={['Requirement', 'How AntTipid meets it, and where']}
                rows={[
                  ['1. User authentication and login security', 'Email and password or Google, email confirmation, password reset, password rules and a CAPTCHA. Sign-in page.'],
                  ['2. Dashboard', 'Left to spend with a pace bar, budgets needing attention, wallets and recent activity. Home.'],
                  ['3. Decision support', 'Budget warnings, run-out date, safe daily amount, outside-budget flag, unusual purchases by K-means, and saved vs budget. Home, Budgets, Reports, bell and email.'],
                  ['4. CRUD operations', 'Create, read, update and delete transactions, wallets, categories and budgets. Activity, Budgets, Settings.'],
                  ['5. Print preview and reports', 'Monthly report with charts and tables, plus a print preview that can save a PDF. Reports.'],
                  ['6. Multi-filtering', 'Month, type, wallet and category together, with search across every month. Activity.'],
                  ['7. SSL security', 'The app, API and database services are served over HTTPS by Vercel and Supabase.'],
                  ['8. Password encryption', 'Supabase Auth stores each password as a one-way hash. AntTipid’s own API never receives a password.'],
                  ['9. Log, activity and audit log', 'Database triggers record each sign-in and change, with old and new values. Settings, Audit log.'],
                  ['10. Backup and restore', 'Download a JSON backup and restore it in one step. Settings, Backup and restore.'],
                ]}
              />
            </>
          ),
        },
        {
          id: 'functional',
          title: 'Functional requirements',
          body: (
            <>
              <p>All of these are built in the current version.</p>
              {FUNCTIONAL.map((group) => (
                <div key={group.title}>
                  <h3>{group.title}</h3>
                  <DocTable head={['ID', 'Requirement']} rows={group.rows} nowrapFirst />
                </div>
              ))}
            </>
          ),
        },
        {
          id: 'screens',
          title: 'Screens',
          body: (
            <>
              <p>Phones get a bottom bar with Home, Activity, Add, Budgets and Reports. Tablets and laptops get a sidebar.</p>
              <DocTable
                head={['Screen', 'What comes first']}
                rows={[
                  ['Home', 'Left to spend with a pace bar, then budgets needing attention, wallets and recent activity.'],
                  ['Activity', 'All transactions for a month grouped by day, with search, filters and CSV export.'],
                  ['Add transaction', 'Amount, category, save. “Scan a receipt instead” fills it from a photo.'],
                  ['Budgets', 'Monthly budget, category budgets worst first, and quick-add for categories with no budget.'],
                  ['Reports', 'Earned, spent and saved, spending by category, and 6 months of income and spending.'],
                  ['Print preview', 'A paper copy of one month.'],
                  ['Settings', 'Account, wallets, categories, notifications, backup and restore, audit log, and help.'],
                  ['Landing, Privacy, Terms', 'Public pages about the app and how it treats data.'],
                  ['Sign-in', 'Sign in, sign up, forgotten password and new password on one card.'],
                ]}
              />
            </>
          ),
        },
        {
          id: 'non-functional',
          title: 'Non-functional requirements',
          body: (
            <DocTable
              head={['Area', 'Requirement']}
              rows={[
                ['Devices', 'Designed for phones first, and works on tablets, laptops and wide screens.'],
                ['Installable', 'Installs to a phone’s home screen as a web app and opens offline. Changes need a connection, and the app says so.'],
                ['Privacy', 'Each user reaches only their own records, enforced in the database as well as the API.'],
                ['Reliability', 'A restore either finishes or changes nothing. A failed warning or email never costs the user their save.'],
                ['Honesty', 'A feature without enough data says what it’s waiting for instead of guessing.'],
                ['Accessibility', 'A skip link, labelled controls, keyboard use, and animation that respects the reduced-motion setting.'],
                ['Language and region', 'English, Philippine pesos, and calendar months in Asia/Manila time.'],
                ['Cost', 'Free for users, with no ads.'],
              ]}
            />
          ),
        },
        {
          id: 'success',
          title: 'How success is measured',
          body: (
            <>
              <p>AntTipid collects no usage analytics, so these are checked directly.</p>
              <DocTable
                head={['Measure', 'How it’s checked', 'Result']}
                rows={[
                  ['Unusual purchases are caught without false alarms', 'Automated checks on the unusual-purchase rules', 'Part of the test suite'],
                  ['The maths behind warnings holds', 'Automated checks on budgets, pace and notifications', 'Part of the test suite'],
                  ['One user can’t reach another’s records', 'Automated user A vs user B checks on every route group', 'Part of the test suite'],
                ]}
              />
            </>
          ),
        },
        {
          id: 'limits',
          title: 'Assumptions and known limits',
          body: (
            <ul>
              <li>Records are only as complete as what the user adds. AntTipid doesn’t read bank or e-wallet activity.</li>
              <li>Warnings need history: a run-out date needs day 5, and unusual purchases need 3 expenses in a category.</li>
              <li>A first purchase in a new habit is flagged until the user calls it normal. Repeats make normal the default choice.</li>
              <li>A backup leaves out receipt photos.</li>
              <li>Receipt reading uses free AI models. When they’re busy, the user types the transaction instead.</li>
              <li>Notification email goes through Gmail, which allows about 500 emails a day.</li>
              <li>Deleting an account is a request by email, handled within 30 days. The app can’t do it yet.</li>
            </ul>
          ),
        },
        {
          id: 'future',
          title: 'Not built yet',
          body: (
            <ul>
              <li>Machine learning forecast of the run-out date, compared against the current pace method. Optional, since K-means already covers machine learning.</li>
              <li>A suggestion to mark a category as paid once a month (“Rent looks like a monthly bill”). On hold.</li>
              <li>Updating the pace when the app stays open past midnight, and a test for the last day of the month.</li>
            </ul>
          ),
        },
        {
          id: 'glossary',
          title: 'Glossary',
          body: (
            <DocTable
              head={['Word', 'Meaning']}
              rows={[
                ['Monthly budget', 'The overall limit for a month.'],
                ['Category budget', 'A limit for one spending category, a share of the monthly budget.'],
                ['Unassigned', 'Money in the monthly budget not given to any category.'],
                ['Month-end', 'The last day of the month.'],
                ['Pace', 'Spending so far per day, projected to month-end.'],
                ['On track', 'The pace lasts the month.'],
                ['Spending fast', 'The pace runs out before month-end.'],
                ['Under limit', 'Usage is below the warning point.'],
                ['Used up', 'Usage is exactly at the limit.'],
                ['One-off', 'An unusual purchase the user says won’t repeat. It stays out of the pace.'],
                ['Decision support system', 'Software that turns data into a recommendation, for a person to act on.'],
              ]}
            />
          ),
        },
      ]}
    />
  )
}
