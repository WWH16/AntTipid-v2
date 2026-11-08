// The last line of defence: without it, any error while drawing a page unmounts the whole app and leaves a white screen.
import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="max-w-sm text-sm text-muted-foreground">AntTipid hit a problem showing this page. Reloading usually fixes it, and nothing you saved is lost.</p>
        <Button onClick={() => location.reload()}>Reload</Button>
      </div>
    )
  }
}
