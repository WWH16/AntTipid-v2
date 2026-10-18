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
function useBackToClose(open: boolean, onOpenChange: (open: boolean) => void) {
  const close = useRef(onOpenChange)
  useEffect(() => { close.current = onOpenChange })
  useEffect(() => {
    if (!open) return
    const depth = ++livePanels
    if ((history.state?.panelDepth ?? 0) >= depth) history.replaceState({ ...history.state, panelDepth: depth }, '')
    else history.pushState({ ...history.state, panelDepth: depth }, '')
    let closedByBack = false
    const onPop = () => {
      if ((history.state?.panelDepth ?? 0) < depth) {
        closedByBack = true
        close.current(false)
      }
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      livePanels--
      // Closed with X, Cancel or Save: drop this panel's history entry, unless another panel took it over.
      if (!closedByBack) setTimeout(() => { if ((history.state?.panelDepth ?? 0) > livePanels) history.back() })
    }
  }, [open])
}

export function ResponsivePanel({ open, onOpenChange, title, description, footer, children }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  footer?: ReactNode
  children: ReactNode
}) {
  const isMobile = useIsMobile()
  useBackToClose(open, onOpenChange)
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto p-4">{children}</div>
          {footer && <DrawerFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</DrawerFooter>}
        </DrawerContent>
      </Drawer>
    )
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
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
