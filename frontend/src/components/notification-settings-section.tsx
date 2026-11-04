// What AntTipid tells you about, and whether it also emails you. Each switch saves at once.
import { toast } from 'sonner'
import { useApp } from '@/app-state'
import { api } from '@/api/endpoints'
import { setCached, useQuery } from '@/api/use-query'
import { BusyButton } from '@/components/busy-button'
import { SectionHeader } from '@/components/section-header'
import { ErrorState, LoadingItems } from '@/components/states'
import { useAction } from '@/hooks/use-action'
import type { NotificationSettings } from '@/types'

const KEY = 'notification-settings'

const TRIGGERS: { key: keyof NotificationSettings; label: string; help: string }[] = [
  { key: 'nearLimit', label: 'Near limit', help: 'A budget reaches its warning percent.' },
  { key: 'overLimit', label: 'Used up or over', help: 'A budget is used up or goes over.' },
  { key: 'runOut', label: 'Run-out prediction', help: 'Your spending pace would run a budget out early.' },
  { key: 'unusual', label: 'Unusual purchases', help: 'A purchase looks unusual for its category.' },
  { key: 'newMonth', label: 'New month recap', help: "Last month's recap and a reminder on the 1st." },
]

export function NotificationSettingsSection() {
  const { user } = useApp()
  const { data, error, loading } = useQuery(KEY, api.notifications.settings)
  const [run, busy] = useAction()

  // Changes at once, and goes back if the save fails.
  async function change(key: keyof NotificationSettings, value: boolean) {
    if (!data) return
    const next = { ...data, [key]: value }
    setCached<NotificationSettings>(KEY, () => next)
    try {
      await api.notifications.saveSettings(next)
    } catch (e) {
      setCached<NotificationSettings>(KEY, () => data)
      toast.error((e as Error).message)
    }
  }

  const row = (key: keyof NotificationSettings, label: string, help: string) => (
    // Native checkbox: a two-state setting with a label, nothing a custom switch adds.
    <label key={key} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
      <input type="checkbox" className="mt-0.5 size-4 shrink-0" checked={data?.[key] ?? false} onChange={(e) => change(key, e.target.checked)} />
      <span className="grid min-w-0 gap-0.5">
        <span className="font-medium">{label}</span>
        <span className="break-words text-muted-foreground">{help}</span>
      </span>
    </label>
  )

  return (
    <section>
      <SectionHeader title="Notifications" description="Choose what AntTipid tells you about." />
      {error ? <ErrorState error={error} /> : loading ? <LoadingItems rows={6} amount={false} /> : (
        <div className="grid gap-3">
          {row('emailEnabled', 'Email me', `New notifications also go to ${user?.email ?? 'your email'}.`)}
          {TRIGGERS.map((t) => row(t.key, t.label, t.help))}
          <div className="pt-2">
            <BusyButton
              variant="outline"
              busy={busy}
              onClick={() => run(async () => {
                await api.notifications.testEmail()
                toast.success('Test email sent', { description: user?.email })
              })}
            >
              Send test email
            </BusyButton>
          </div>
        </div>
      )}
    </section>
  )
}
