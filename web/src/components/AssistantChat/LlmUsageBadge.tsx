import { useState } from 'react'
import type { ApiClient } from '@/api/client'
import { useLlmUsage } from '@/hooks/queries/useLlmUsage'
import type { LlmUsageWeekEntry } from '@/hooks/queries/useLlmUsage'

const DAILY_LIMIT_RMB = 5040 // 700 USD × 7.2

function getSpendColor(ratio: number): string {
    if (ratio > 0.8) return 'text-red-500'
    if (ratio > 0.5) return 'text-amber-500'
    return 'text-emerald-500'
}

function getBarFill(ratio: number): string {
    if (ratio > 0.8) return '#ef4444'
    if (ratio > 0.5) return '#f59e0b'
    return '#10b981'
}

function formatSpend(value: number): string {
    if (value >= 1000) return Math.round(value).toLocaleString()
    return value.toFixed(1)
}

function Sparkline({ week }: { week: LlmUsageWeekEntry[] }) {
    const spends = week.map(w => parseFloat(w.spend) || 0)
    const max = Math.max(...spends, 1)
    const barWidth = 4
    const gap = 2
    const height = 14
    const totalWidth = week.length * barWidth + (week.length - 1) * gap

    return (
        <svg width={totalWidth} height={height} className="inline-block align-middle">
            {spends.map((spend, i) => {
                const barHeight = Math.max(1, (spend / max) * (height - 1))
                return (
                    <rect
                        key={i}
                        x={i * (barWidth + gap)}
                        y={height - barHeight}
                        width={barWidth}
                        height={barHeight}
                        rx={1}
                        fill={getBarFill(spend / DAILY_LIMIT_RMB)}
                    />
                )
            })}
        </svg>
    )
}

function UsageTooltip({ usage }: { usage: { week: LlmUsageWeekEntry[]; week_total: string; updated: string; today_spend: string } }) {
    return (
        <div className="absolute bottom-full right-0 mb-2 z-50 w-56 rounded-lg bg-[var(--app-secondary-bg)] border border-[var(--app-border)] shadow-lg p-3 text-xs">
            <div className="font-medium mb-2 text-[var(--app-fg)]">LLM 用量详情</div>
            {usage.week.map(entry => {
                const spend = parseFloat(entry.spend) || 0
                const ratio = spend / DAILY_LIMIT_RMB
                return (
                    <div key={entry.date} className="flex justify-between py-0.5">
                        <span className="text-[var(--app-hint)]">{entry.day} {entry.date.slice(5)}</span>
                        <span className={getSpendColor(ratio)}>¥{formatSpend(spend)}</span>
                    </div>
                )
            })}
            <div className="border-t border-[var(--app-border)] mt-1.5 pt-1.5 flex justify-between font-medium text-[var(--app-fg)]">
                <span>本周合计</span>
                <span>¥{formatSpend(parseFloat(usage.week_total) || 0)}</span>
            </div>
            <div className="text-[var(--app-hint)] mt-1.5 text-[10px]">
                每日限额 ¥{DAILY_LIMIT_RMB.toLocaleString()} · 更新于 {usage.updated}
            </div>
        </div>
    )
}

export function LlmUsageBadge({ api }: { api: ApiClient | null }) {
    const { data } = useLlmUsage(api)
    const [showTooltip, setShowTooltip] = useState(false)

    if (!data?.data) return null

    const usage = data.data
    const todaySpend = parseFloat(usage.today_spend) || 0
    const ratio = todaySpend / DAILY_LIMIT_RMB
    const colorClass = getSpendColor(ratio)

    return (
        <div
            className="relative"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            <div className="flex items-center gap-1.5 cursor-default select-none">
                {usage.week.length > 1 && <Sparkline week={usage.week} />}
                <span className={`text-[11px] tabular-nums ${colorClass}`}>
                    ¥{formatSpend(todaySpend)}
                </span>
            </div>
            {showTooltip && <UsageTooltip usage={usage} />}
        </div>
    )
}
