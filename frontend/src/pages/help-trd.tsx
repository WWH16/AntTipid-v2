// Technical Requirement Document, reached from the Help menu. Describes the system as built: keep it in step with the
// code and migrations. Names of secrets only, never their values.
import { DocTable, DocumentPage, Figure } from '@/components/document-page'

const c = (text: string) => <code>{text}</code>

export function HelpTrdPage() {
  return (
    <DocumentPage
      title="Technical Requirement Document"
      sections={[
        {
          id: 'overview',
          title: 'Overview',
          body: (
            <>
              <p>
                This document describes how AntTipid is built: its architecture, database, security, API and decision support logic. It’s
                written for a developer maintaining the system and for the MIT 202 reviewer. The Product Requirement Document covers what
                the product does and why.
              </p>
              <p>
                AntTipid is a React single-page app and a FastAPI service, both on Vercel, with Supabase for Postgres, Auth and Storage. Every
                row of data belongs to one user, and the database itself enforces that.
              </p>
            </>
          ),
        },
        {
          id: 'architecture',
          title: 'Architecture',
          body: (
            <>
              <Figure
                n={1}
                name="architecture"
                width={760}
                height={476}
                alt="The browser loads the frontend over HTTPS, signs in with Supabase Auth and completes a Turnstile challenge. The frontend rewrites API calls to the FastAPI backend, which verifies tokens with Auth, queries Postgres, stores photos in Storage, sends photos to receipt models and sends email through Gmail."
                caption="System components and the calls between them."
              />
              <DocTable
                head={['Component', 'Role']}
                rows={[
                  ['Frontend', 'Static React app on Vercel. Rewrites /api/* to the backend, so the browser sees one origin.'],
                  ['Backend', 'FastAPI on Vercel functions. All data access and all decision support rules run here.'],
                  ['Supabase Auth', 'Accounts, passwords, Google sign-in and JWT access tokens. The browser talks to it directly.'],
                  ['Supabase Postgres', '10 application tables with row level security, reached through the transaction pooler on port 6543.'],
                  ['Supabase Storage', 'Private receipts bucket, one folder per user.'],
                  ['Cloudflare Turnstile', 'CAPTCHA on sign-in, sign-up and auth emails, checked by Supabase Auth.'],
                  ['OpenRouter and Gemini', 'Vision models that read receipt photos.'],
                  ['Gmail SMTP', 'Notification and recap email.'],
                  ['Vercel Cron', 'Calls the new-month recap job at 00:00 UTC on the 1st, which is 08:00 in Manila.'],
                ]}
              />
              <h3>Path of a signed-in request</h3>
              <ol>
                <li>The browser holds a Supabase session in local storage, refreshed automatically by {c('auth-js')}.</li>
                <li>The browser calls {c('/api/...')} with {c('Authorization: Bearer <JWT>')}. Vercel rewrites the call to the backend.</li>
                <li>{c('auth.py')} verifies the token’s signature, expiry, audience and issuer, and takes the user from it.</li>
                <li>{c('db.py')} opens one transaction on a pooled connection, as role {c('authenticated')} with the token’s claims set.</li>
                <li>Row level security now applies, on top of the explicit {c('user_id')} in each query.</li>
                <li>The route commits. Warnings are stored inside that transaction, and any email goes out after it commits.</li>
              </ol>
            </>
          ),
        },
        {
          id: 'stack',
          title: 'Technology stack',
          body: (
            <DocTable
              head={['Layer', 'Technology']}
              rows={[
                ['Frontend', 'React 19, TypeScript 6, Vite 8, React Router 7, Tailwind CSS 4, shadcn/ui on Base UI, Recharts 3, Sonner, lucide-react, Geist'],
                ['Frontend auth', '@supabase/auth-js only, instead of all of supabase-js, to keep the download small'],
                ['Backend', 'Python, FastAPI 0.115, Uvicorn 0.34, psycopg 3.2 with psycopg-pool, PyJWT 2.10, httpx 0.28'],
                ['Database', 'PostgreSQL on Supabase, with plain SQL migrations'],
                ['Hosting', 'Vercel, two projects, region sin1 (Singapore)'],
                ['Quality', 'oxlint, TypeScript build checks, node:test and Python self-checks'],
              ]}
            />
          ),
        },
        {
          id: 'database',
          title: 'Database design',
          body: (
            <>
              <Figure
                n={2}
                name="data-model"
                width={760}
                height={572}
                alt="Entity relationships: wallets and categories each have many transactions. A transaction has many receipt items and at most one anomaly check. A category has at most one budget. Every table belongs to one auth user."
                caption="Data model. Fields are selected, and the data dictionary below lists the rest."
              />
              <h3>Conventions</h3>
              <ul>
                <li>Money is {c('numeric(14,2)')} in pesos, never a floating-point type.</li>
                <li>Primary keys are {c('uuid')} from {c('gen_random_uuid()')}. {c('audit_log')} and {c('notifications')} use identity {c('bigint')} keys, and {c('budget_history')} has a unique constraint instead.</li>
                <li>Every table has {c('user_id')} referencing {c('auth.users')} with {c('on delete cascade')}, so deleting an account removes its data.</li>
                <li>Composite foreign keys such as {c('(wallet_id, user_id)')} mean a row can only point at its own user’s rows.</li>
                <li>Allowed values live in {c('check')} constraints, not only in the app.</li>
                <li>A wallet balance is never stored. It’s worked out from the opening balance and transactions.</li>
              </ul>
              <h3>Data dictionary</h3>
              <DocTable
                head={['Table', 'Purpose', 'Key columns and rules']}
                rows={[
                  [c('wallets'), 'Where money is kept', <>{c('type')} is cash, e_wallet, bank, credit_card or savings. {c('opening_balance')}, {c('archived')}. Name 1 to 80 characters.</>],
                  [c('categories'), 'Spending and income groups', <>{c('kind')} is expense or income. {c('icon')}. {c('once_a_month')} only on expense categories.</>],
                  [c('transactions'), 'Every money movement', <>{c('kind')} is expense, income or transfer. {c('amount')} above 0. A transfer needs two different wallets and no category. The others need a category. {c('source')} is manual or receipt.</>],
                  [c('receipt_items'), 'Lines read from a receipt', <>{c('qty')} above 0, {c('price')} 0 or more. Unique on {c('(transaction_id, position)')}. The transaction amount stays the receipt total.</>],
                  [c('budgets'), 'Current limits', <>{c('limit_amount')} above 0. {c('warn_at')} 1 to 100, default 80. {c('category_id')} empty is the monthly budget. Unique on {c('(user_id, category_id)')}, nulls not distinct.</>],
                  [c('budget_history'), 'The limit each month had', <>Written only by a trigger. {c('month')} is the first day of the month. Empty {c('limit_amount')} means removed that month. Goes with its category on delete.</>],
                  [c('anomaly_checks'), 'Verdict on each purchase', <>Key is {c('transaction_id')}. {c('unusual')}, {c('decision')} (one_off or normal), {c('method')} (kmeans, simple or none), {c('usual_low')}, {c('usual_high')}. A decision needs {c('unusual')}.</>],
                  [c('audit_log'), 'Who changed what and when', <>Written only by triggers and restore. {c('action')}, {c('entity')}, {c('label')}, {c('changes')} as JSON of old and new values. No foreign key on {c('entity_id')}, because the row may be gone.</>],
                  [c('notifications'), 'What the bell lists and email sends', <>{c('kind')} is near, used, over, run_out, unusual or new_month. Unique on {c('(user_id, key)')}, so each warning fires once. {c('read_at')}, {c('emailed_at')}.</>],
                  [c('notification_settings'), 'One switch per warning', <>Key is {c('user_id')}. A missing row means everything is on. {c('test_email_at')} limits test emails.</>],
                ]}
              />
              <h3>Normalization</h3>
              <p>
                The design follows third normal form, with three deliberate exceptions. {c('user_id')} repeats on child tables so row level
                security can test ownership without a join. {c('audit_log.label')} keeps an item’s name at the time, so a deleted row still
                reads. {c('anomaly_checks.usual_low')} and {c('usual_high')} keep the range at the time, so a later purchase can’t rewrite an
                earlier verdict.
              </p>
              <h3>Indexes</h3>
              <DocTable
                head={['Index', 'Columns', 'Serves']}
                rows={[
                  [c('transactions_user_date_idx'), c('(user_id, date desc, created_at desc)'), 'Activity list and month totals'],
                  [c('transactions_wallet_idx'), c('(wallet_id)'), 'Wallet balances and the foreign key'],
                  [c('transactions_to_wallet_idx'), <>{c('(to_wallet_id)')}, partial</>, 'Transfers only'],
                  [c('transactions_category_idx'), <>{c('(category_id)')}, partial</>, 'Category filters and history'],
                  [<>{c('wallets_user_idx')}, {c('categories_user_idx')}, {c('receipt_items_user_idx')}</>, c('(user_id)'), 'Row level security and owner lookups'],
                  [c('audit_log_user_idx'), c('(user_id, id desc)'), 'Newest entries first'],
                  [c('notifications_user_idx'), c('(user_id, id desc)'), 'The bell’s list'],
                  [c('notifications_unsent_idx'), <>{c('(user_id)')}, partial on {c('emailed_at is null')}</>, 'Finding email still to send'],
                ]}
              />
              <h3>Triggers</h3>
              <DocTable
                head={['Trigger', 'On', 'Does']}
                rows={[
                  [c('on_auth_user_created_seed_categories'), <>Insert on {c('auth.users')}</>, 'Adds the 11 default categories.'],
                  [c('on_budget_change_record_history'), <>Change to {c('budgets')}</>, 'Writes the month’s limit to budget_history. The last edit in a month wins.'],
                  [<>{c('audit_transactions')}, {c('audit_wallets')}, {c('audit_categories')}, {c('audit_budgets')}</>, 'Insert, update or delete', 'Writes one audit entry per direct change, with a diff on updates. Skips nested trigger writes and restores.'],
                  [c('on_session_created_audit'), <>Insert on {c('auth.sessions')}</>, 'Logs a sign-in. A failure here never blocks the sign-in.'],
                ]}
              />
              <p>
                These functions are {c('security definer')} with an empty {c('search_path')}, and execute rights are revoked from every client
                role, so only their triggers can run them.
              </p>
              <h3>Migrations</h3>
              <DocTable
                head={['File', 'Adds']}
                rows={[
                  [c('20261020000000_init'), 'Five core tables, row level security, default categories, receipts bucket'],
                  [c('20261026000000_budget_history'), 'Budget history table and trigger'],
                  [c('20261026010000_budget_history_category_fk'), 'History goes with its category; start months corrected'],
                  [c('20261026020000_category_once_a_month'), 'Paid once a month switch'],
                  [c('20261026030000_anomaly_dismissals'), 'First version of “It’s normal”, replaced by the next migration'],
                  [c('20261026040000_anomaly_checks'), 'Verdicts and decisions on each purchase'],
                  [c('20261104000000_audit_log'), 'Audit log table and triggers'],
                  [c('20261104010000_notifications'), 'Notifications and settings tables'],
                ]}
              />
            </>
          ),
        },
        {
          id: 'security',
          title: 'Security',
          body: (
            <>
              <DocTable
                head={['Area', 'How it’s handled']}
                rows={[
                  ['Passwords', <>Supabase Auth stores a one-way hash in {c('auth.users.encrypted_password')}. The browser sends passwords to Supabase, and AntTipid’s API never receives one.</>],
                  ['SSL and transport', 'Browser traffic to Vercel and Supabase uses HTTPS. Gmail SMTP uses STARTTLS.'],
                  ['Bots', 'Cloudflare Turnstile on sign-in, sign-up and auth emails, with a new token per attempt.'],
                  ['Tokens', <>Every route except the cron job needs a JWT. ES256 and RS256 are checked against the project’s JWKS, HS256 against a secret. {c('exp')}, {c('aud')}, {c('iss')} and {c('sub')} are required.</>],
                  ['Row access', <>Row level security on all 10 tables: {c('user_id = auth.uid()')}. The anonymous role has no access. {c('audit_log')} and {c('budget_history')} are read-only to users.</>],
                  ['Receipt photos', 'Private bucket, own folder only, 1 MB cap, images only. File type is checked from the bytes. Links are signed for 10 minutes. The server uses the caller’s token and holds no service-role key.'],
                  ['Restore', 'New ids for every row, and a photo path is kept only if it’s in the caller’s own folder, so a file from another account can’t reach their data.'],
                  ['Injection', <>All SQL is parameterized. {c('LIKE')} wildcards in search are escaped. CSV text cells starting with {c('= + - @')} are prefixed, so spreadsheets don’t run them.</>],
                  ['Cron', <>The job requires {c('CRON_SECRET')} as a bearer token, compared in constant time.</>],
                  ['Secrets', <>Kept in environment variables. {c('.env')} files are ignored by git.</>],
                ]}
              />
              <h3>Known gaps</h3>
              <ul>
                <li>CORS allows any origin. Calls authenticate with a bearer token and not a cookie, so another site can’t borrow a session.</li>
                <li>The API has no rate limiter of its own, apart from one test email a minute.</li>
                <li>The session token sits in local storage, as is standard for Supabase in the browser, so cross-site scripting would expose it.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'api',
          title: 'API',
          body: (
            <>
              <p>
                All paths start with {c('/api')}, and bodies are JSON. Errors return {c('{"detail": "..."}')} with a readable message: 401 for
                sign-in problems, 409 for conflicts, 422 for values the database rejects and 503 when the database is unreachable.
              </p>
              <DocTable
                head={['Method and path', 'Purpose']}
                rows={[
                  [c('GET, POST /wallets'), 'List and add wallets'],
                  [c('PATCH, DELETE /wallets/{id}'), 'Edit or delete a wallet. In use: 409'],
                  [c('GET, POST /categories'), 'List and add categories'],
                  [c('PATCH, DELETE /categories/{id}'), 'Edit or delete a category. In use: 409'],
                  [c('GET, POST /transactions'), 'List with filters month, kind, walletId, categoryId, search, since; add one'],
                  [c('GET /transactions/export.csv'), 'The same filters as a CSV file'],
                  [c('GET, PATCH, DELETE /transactions/{id}'), 'Read, edit or delete one'],
                  [c('POST /transactions/{id}/receipt'), 'Attach a receipt photo'],
                  [c('POST /receipts/scan'), 'Read a photo, up to 8 MB. Stores nothing'],
                  [c('GET, POST /budgets'), 'Budgets with their spending; add one'],
                  [c('PUT, DELETE /budgets/{id}'), 'Change or remove a budget'],
                  [c('GET /reports/summary'), 'Month summary for Home'],
                  [c('GET /reports/monthly'), 'Full month report'],
                  [c('GET /reports/months'), 'Months with data'],
                  [c('GET /anomalies'), 'Unusual purchases in a month'],
                  [c('GET /anomalies/check'), 'Verdict on an amount before saving'],
                  [c('PUT /anomalies/{transaction_id}/decision'), 'Record one-off or normal'],
                  [c('GET /notifications'), 'Latest 50 and the unread count'],
                  [c('POST /notifications/read'), 'Mark all as read'],
                  [c('GET, PUT /notifications/settings'), 'Read or save the switches'],
                  [c('POST /notifications/test'), 'Send a test email to the caller, one a minute'],
                  [c('GET /audit'), 'Latest audit entries, up to 1,000'],
                  [c('GET /backup'), 'Download the backup file'],
                  [c('POST /backup/restore'), 'Replace the caller’s records from a backup'],
                  [c('GET /cron/new-month'), 'Recap job. Needs CRON_SECRET, not a user token'],
                ]}
              />
            </>
          ),
        },
        {
          id: 'decision-support',
          title: 'Decision support logic',
          body: (
            <>
              <p>
                Statistics come first. Machine learning replaces a statistic only when it predicts better on real data, measured against it.
                The rules run in the backend for email and in {c('frontend/src/lib/budget.ts')} for the screen, and they match.
              </p>
              <h3>Budget state</h3>
              <DocTable
                head={['State', 'Rule']}
                rows={[
                  ['Over', c('spent > limit')],
                  ['Used up', c('limit - spent < 0.005')],
                  ['Near', c('spent >= limit * warn_at / 100')],
                  ['Under limit', 'Otherwise'],
                ]}
              />
              <h3>Pace and run-out date</h3>
              <ul>
                <li>Run-out day: {c('day + (limit - spent) / (spent / day)')}. It’s a warning when that falls before month-end.</li>
                <li>Safe daily amount: {c('(limit - spent) / (days_in_month - day + 1)')}. Days left count today.</li>
                <li>It shows only for the current month, from day 5, with spending above 0, and not once over the limit.</li>
                <li>Unusual purchases count once and aren’t projected.</li>
                <li>On the monthly budget, once-a-month categories leave the pace, and their category budget or paid amount, whichever is higher, is set aside.</li>
              </ul>
              <h3>Unusual purchases</h3>
              <p>Each purchase is judged when saved, against the history before it. The verdict is kept, so a later purchase can’t rewrite it.</p>
              <Figure
                n={3}
                name="anomaly-flow"
                width={760}
                height={664}
                alt="Flowchart. Income, transfers and once-a-month bills are not checked. Under 3 expenses in the category in 6 months: not checked. 3 to 9: a simple rule. 10 or more: K-means. If unusual, the user decides one-off or normal. If not, it counts in the pace."
                caption="How a saved purchase is judged."
              />
              <DocTable
                head={['Setting', 'Value']}
                rows={[
                  ['Scope', 'Per user and per spending category'],
                  ['History', 'Last 6 months, this month included'],
                  ['Feature', 'log(amount), standardized'],
                  ['Algorithm', 'Plain Python K-means (Lloyd’s) in one dimension, k-means++ start, 5 restarts, lowest inertia kept, seeded per user and category'],
                  ['Choosing k', 'Best silhouette over k = 2 to min(4, n / 3). Best under 0.75 means k = 1, one habit'],
                  ['Habits', 'The biggest clusters covering 90% of purchases, or until the next is 5 times smaller (as in CBLOF)'],
                  ['Flag', 'Against the nearest habit: modified z-score over 3.5 and at least 1.5 times the habit’s centre. Only above it, so a small purchase never counts'],
                  ['Simple rule, 3 to 9 expenses', 'Over 3 times the highest other amount'],
                  ['Speed target', 'Scoring 2,000 expenses in under 100 ms, using sorted values and prefix sums'],
                ]}
              />
              <h3>Evaluation</h3>
              <p>One sample user’s real data plus planted outliers, compared with a 3x median baseline.</p>
              <DocTable
                head={['Method', 'Precision', 'Recall', 'F1']}
                rows={[
                  ['K-means', '1.00', '0.71', '0.83'],
                  ['3x median', '0.18', '0.88', '0.30'],
                ]}
              />
              <p>Every 4x and 8x outlier was caught, along with most 2x and few 1.5x ones, which are borderline by design. One user is a small sample, so these figures show the method works and don’t predict accuracy for every user.</p>
            </>
          ),
        },
        {
          id: 'notifications',
          title: 'Notifications',
          body: (
            <ul>
              <li>Each save runs {c('after_save')} inside its transaction, in a savepoint, so a bug in a warning can’t cost the save.</li>
              <li>The unique {c('(user_id, key)')} makes each warning fire once, with keys such as {c('near:{budget}:{YYYY-MM}')}.</li>
              <li>Email goes out after the commit. Rows are claimed first so two saves can’t send the same one, and handed back if sending fails.</li>
              <li>Rows over a day old aren’t emailed, so email set up later doesn’t deliver old warnings.</li>
              <li>The recap job creates one row per user per month, so running it twice is safe. It holds no database connection while sending.</li>
            </ul>
          ),
        },
        {
          id: 'receipts',
          title: 'Receipt scanning',
          body: (
            <ul>
              <li>The route accepts JPEG, PNG or WebP up to 8 MB, and sends the photo to vision models with the caller’s category names.</li>
              <li>Models are tried in order: two free OpenRouter models, then two Gemini models. A model whose key isn’t set is skipped.</li>
              <li>Each model gets 25 seconds. A bad reply moves to the next one, and a reply with no total means “not a receipt”.</li>
              <li>The scan stores nothing. The photo saved with a transaction is a WebP, or a JPEG from Safari, within the bucket’s 1 MB cap.</li>
            </ul>
          ),
        },
        {
          id: 'backup',
          title: 'Backup and restore',
          body: (
            <>
              <ul>
                <li>{c('GET /backup')} returns one user’s wallets, categories, budgets, budget history and transactions, with their items and verdicts, as versioned JSON.</li>
                <li>{c('POST /backup/restore')} runs in one transaction, so any failure undoes every step.</li>
                <li>Restore deletes the user’s records and inserts the file’s with new ids. The audit triggers stay quiet through {c('anttipid.restoring')}, and one audit entry records the restore.</li>
                <li>Receipt photos aren’t in the file. Whole-project backups come from the Supabase plan.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'frontend',
          title: 'Frontend',
          body: (
            <>
              <DocTable
                head={['Route', 'Page', 'Access']}
                rows={[
                  [c('/'), 'Landing, or Home when signed in', 'Public / user'],
                  [c('/sign-in'), 'Sign in, sign up, reset password', 'Public'],
                  [<>{c('/privacy')}, {c('/terms')}</>, 'Legal pages', 'Public'],
                  [<>{c('/activity')}, {c('/budgets')}, {c('/reports')}, {c('/settings')}</>, 'Main pages inside the app shell', 'User'],
                  [c('/reports/print'), 'Print preview, outside the shell', 'User'],
                  [<>{c('/help/prd')}, {c('/help/trd')}</>, 'These documents, outside the shell', 'User'],
                ]}
              />
              <ul>
                <li>Each page is its own lazy-loaded file. Signed-in pages load in the background 1.5 seconds after the app is up.</li>
                <li>Data goes through {c('api/endpoints.ts')} and a small cached {c('useQuery')} hook. There’s no state library.</li>
                <li>The service worker serves hashed assets cache first and pages network first. It never caches API calls, so records always come from the server.</li>
                <li>The shell is a sidebar from tablet width up, and a bottom bar on phones.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'deployment',
          title: 'Deployment and configuration',
          body: (
            <>
              <p>Two Vercel projects deploy from one repository, with root directories {c('frontend')} and {c('backend')}. Migrations are applied in name order in the Supabase SQL Editor.</p>
              <DocTable
                head={['Variable', 'Where', 'Purpose']}
                rows={[
                  [<>{c('VITE_SUPABASE_URL')}, {c('VITE_SUPABASE_ANON_KEY')}</>, 'Frontend', 'Supabase Auth from the browser'],
                  [c('VITE_TURNSTILE_SITE_KEY'), 'Frontend', 'CAPTCHA widget'],
                  [<>{c('SUPABASE_URL')}, {c('SUPABASE_ANON_KEY')}</>, 'Backend', 'Token checks and Storage calls'],
                  [c('DATABASE_URL'), 'Backend', 'Transaction pooler connection'],
                  [c('SUPABASE_JWT_SECRET'), 'Backend', 'Only for older HS256 tokens'],
                  [<>{c('OPENROUTER_API_KEY')}, {c('GEMINI_API_KEY')}</>, 'Backend', 'Receipt reading. Either alone works'],
                  [<>{c('SMTP_USER')}, {c('SMTP_APP_PASSWORD')}, {c('APP_URL')}</>, 'Backend', 'Email and its links. Without them the bell still works'],
                  [c('CRON_SECRET'), 'Backend', 'Guards the recap job'],
                  [c('APP_TIMEZONE'), 'Backend', 'Optional, defaults to Asia/Manila. Must match the budget history trigger'],
                ]}
              />
            </>
          ),
        },
        {
          id: 'testing',
          title: 'Testing',
          body: (
            <>
              <DocTable
                head={['Suite', 'Size', 'Covers']}
                rows={[
                  [<>Frontend, {c('node --test src/lib/*.test.ts')}</>, '27 tests in 6 files', 'Budget and pace maths, formatting, print report, audit, backup and notification helpers'],
                  [<>Backend, {c('test_receipts.py')} and three more</>, '78 checks in 4 files', 'Receipt parsing, JWT verification, every route group, user A vs user B isolation, anomalies, audit, backup and notifications'],
                  [c('backend/paper_anomalies.py'), 'Evaluation script', 'K-means against the baseline, with elbow and silhouette charts'],
                ]}
              />
              <p>Backend checks need a Supabase project to run against.</p>
            </>
          ),
        },
        {
          id: 'limits',
          title: 'Performance and known limits',
          body: (
            <DocTable
              head={['Limit', 'Why', 'What to do if reached']}
              rows={[
                ['Connection pool of 5', 'Fits Vercel function concurrency and the Supabase free tier', 'Raise it with the plan'],
                ['Backup of about 12,000 transactions', 'Vercel caps a request and a response at 4.5 MB', 'Stream or gzip the file'],
                ['About 500 emails a day', 'Gmail’s allowance, with one connection per recap', 'Move to a mail service'],
                ['Free receipt models change', 'Model names and quotas change without notice', 'Update the list in receipts.py'],
                ['Restored accounts can leave unlinked photos', 'Photos of transactions not in the file stay in storage', 'List the folder and clean up'],
                ['One timezone', 'Months are counted in one configured zone', 'Store a timezone per user'],
              ]}
            />
          ),
        },
      ]}
    />
  )
}
