/** shadcn sidebar-header pattern: square brand tile + name. */
export function Logo() {
  return (
    <>
      <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary font-semibold text-sidebar-primary-foreground">₱</div>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">AntTipid</span>
        <span className="truncate text-xs opacity-70">Money tracker</span>
      </div>
    </>
  )
}
