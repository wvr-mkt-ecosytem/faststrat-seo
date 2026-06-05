'use client'

import { useEffect, useState } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts'

type PageRow = { page: string; clicks: number; impressions: number }

type Cluster = {
  name: string
  type: 'new' | 'existing'
  newSlug: string | null
  existingPage: string | null
  clicks: number
  impressions: number
  queryCount: number
}

// Paleta de marca FastStrat: granates + cálidos complementarios sobre crema.
const PALETTE = [
  '#5a1a1a', '#a23b2e', '#c8742b', '#d8a534', '#7c8a3f',
  '#3f7a6d', '#9c5d6b', '#7a4a2e', '#b58a4a', '#8a8276',
]

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="border border-maroon/15 bg-white/60 rounded-lg p-4">
      <h3 className="font-semibold text-sm text-ink">{title}</h3>
      <p className="text-xs text-sand mb-2">{subtitle}</p>
      <div className="h-64">{children}</div>
    </div>
  )
}

function shortenPath(p: string) {
  if (p === '/') return '/ (home)'
  const clean = p.replace(/\/$/, '').replace(/^\//, '')
  return clean.length > 22 ? clean.slice(0, 20) + '…' : clean
}

export function SeoCharts({ rows, days }: { rows: PageRow[]; days: number }) {
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [other, setOther] = useState<{ impressions: number } | null>(null)

  useEffect(() => {
    fetch(`/api/gsc/clusters?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.clusters) {
          setClusters(d.clusters)
          setOther(d.other)
        }
      })
      .catch(() => {})
  }, [days])

  // Pie 1: clicks por página (top 7 + otros)
  const withClicks = rows.filter((r) => r.clicks > 0).sort((a, b) => b.clicks - a.clicks)
  const topPages = withClicks.slice(0, 7).map((r) => ({
    name: shortenPath(r.page),
    value: r.clicks,
  }))
  const restClicks = withClicks.slice(7).reduce((s, r) => s + r.clicks, 0)
  if (restClicks > 0) topPages.push({ name: 'otras', value: restClicks })

  // Pie 2: impresiones por cluster temático (+ otros)
  const clusterImpr = clusters.map((c) => ({ name: c.name, value: c.impressions }))
  if (other && other.impressions > 0)
    clusterImpr.push({ name: 'otras queries', value: other.impressions })

  // Pie 3: oportunidad — impresiones de los clusters de temas NUEVOS
  const opportunity = clusters
    .filter((c) => c.type === 'new')
    .map((c) => ({ name: c.name, value: c.impressions }))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <ChartCard title="Clicks por página" subtitle={`Últimos ${days} días · top páginas`}>
        <Donut data={topPages} />
      </ChartCard>

      <ChartCard
        title="Demanda por tema (impresiones)"
        subtitle="Queries agrupadas por cluster temático · 90 días"
      >
        <Donut data={clusterImpr} />
      </ChartCard>

      <ChartCard
        title="Oportunidad: temas nuevos"
        subtitle="Impresiones de los blogs que vamos a publicar"
      >
        <Donut data={opportunity} />
      </ChartCard>
    </div>
  )
}

function Donut({ data }: { data: { name: string; value: number }[] }) {
  if (data.length === 0)
    return (
      <div className="h-full flex items-center justify-center text-xs text-neutral-400">
        Sin datos
      </div>
    )
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={45}
          outerRadius={75}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v) => (typeof v === 'number' ? v.toLocaleString() : String(v))}
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: '1px solid rgba(0,0,0,0.1)',
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          iconType="circle"
          layout="vertical"
          align="right"
          verticalAlign="middle"
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
