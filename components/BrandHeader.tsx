'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FileBarChart, Lightbulb, FileText } from 'lucide-react'

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/reports', label: 'Reportes', icon: FileBarChart },
  { href: '/ideas', label: 'Ideas', icon: Lightbulb },
  { href: '/blogs', label: 'Blogs', icon: FileText },
]

/** Logo FastStrat: marca granate + tagline, estilo de las portadas del blog. */
export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="block leading-none">
      <span className="text-xl font-extrabold tracking-tight text-maroon">FastStrat</span>
      {!compact && (
        <span className="block text-[10px] font-bold uppercase tracking-[0.15em] text-sand mt-0.5">
          AI Marketing for Small Business
        </span>
      )}
    </Link>
  )
}

export function BrandHeader({
  subtitle,
  children,
}: {
  subtitle?: string
  children?: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-20 border-b border-maroon/15 bg-cream/80 backdrop-blur">
      <div className="h-1 w-full bg-maroon" />
      <div className="px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <BrandMark />
          <nav className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={`flex items-center gap-1.5 text-sm font-medium px-2.5 sm:px-3 py-1.5 rounded-md transition-colors ${
                    active
                      ? 'bg-maroon text-cream'
                      : 'text-ink/70 hover:bg-maroon/8 hover:text-maroon'
                  }`}
                >
                  <Icon size={15} />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">{children}</div>
      </div>
      {subtitle && (
        <div className="px-6 pb-2 -mt-1 text-xs text-sand">{subtitle}</div>
      )}
    </header>
  )
}
