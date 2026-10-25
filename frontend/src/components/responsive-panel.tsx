// shadcn "responsive dialog" pattern: Drawer on phones, Sheet from the right on tablet and up.
import { useEffect, useRef, type ReactNode } from 'react'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'

// Panels currently on screen. Each one owns one browser-history entry so the phone back button closes it.
let livePanels = 0

/**
 * Back button (Android) or swipe-back (iPhone) closes the top panel instead of leaving the page.
 * Panels that replace each other in the same flow (add form and receipt scan) share one entry.
 */
function useBackToClose(onClose: () => void) {
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })
  useEffect(() => {
    const depth = ++livePanels
    if ((history.state?.panelDepth ?? 0) >= depth) history.replaceState({ ...history.state, panelDepth: depth }, '')
    else history.pushState({ ...history.state, panelDepth: depth }, '')
    let closedByBack = false
    let alive = true
    const onPop = () => {
      if ((history.state?.panelDepth ?? 0) < depth) {
        closedByBack = true
        close.current()
        // A panel can stay open instead (the add form asks before discarding what was typed): then it needs its
        // history entry back, or the next Back would leave the page.
        setTimeout(() => {
          if (!alive) return
          closedByBack = false
          history.pushState({ ...history.state, panelDepth: depth }, '')
        })
      }
    }
    window.addEventListener('popstate', onPop)
    return () => {
      alive = false
      window.removeEventListener('popstate', onPop)
      livePanels--
      // Closed with X, Cancel or Save: drop this panel's history entry, unless another panel took it over.
      if (!closedByBack) setTimeout(() => { if ((history.state?.panelDepth ?? 0) > livePanels) history.back() })
    }
  }, [])
}

/** Always open while mounted: render it to show it, unmount it to hide it. */
export function ResponsivePanel({ onClose, title, description, footer, children }: {
  onClose: () => void
  title: string
  description: string
  footer?: ReactNode
  children: ReactNode
}) {
  const isMobile = useIsMobile()
  useBackToClose(onClose)
  const onOpenChange = (open: boolean) => { if (!open) onClose() }
  if (isMobile) {
    return (
      // The grab handle says "this is a sheet: swipe it down", the way native bottom sheets do.
      <Drawer open onOpenChange={onOpenChange} showSwipeHandle>
        <DrawerContent>
          <DrawerHeader className="group-data-[swipe-axis=y]/drawer-popup:text-left">
            <DrawerTitle className="text-lg font-semibold">{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto p-4">{children}</div>
          {footer && <DrawerFooter className="border-t pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</DrawerFooter>}
        </DrawerContent>
      </Drawer>
    )
  }
  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4">{children}</div>
        {footer && <SheetFooter>{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  )
}
