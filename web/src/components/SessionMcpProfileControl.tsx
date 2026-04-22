import { useEffect, useMemo, useState } from 'react'
import type { Machine, Session } from '@/types/api'
import { useTranslation } from '@/lib/use-translation'

export function SessionMcpProfileControl(props: {
    session: Session
    machine: Machine | null
    isPending: boolean
    onReload: (profile: string) => Promise<void>
}) {
    const { t } = useTranslation()
    const profiles = props.machine?.metadata?.mcpProfiles ?? []
    const profilesKey = useMemo(() => profiles.join('\0'), [profiles])
    const currentProfile = props.session.metadata?.currentMcpProfile ?? ''
    const hasMcpJsonPath = typeof props.session.metadata?.mcpJsonPath === 'string'
        && props.session.metadata.mcpJsonPath.length > 0
    const [selectedProfile, setSelectedProfile] = useState(currentProfile || profiles[0] || '')

    useEffect(() => {
        setSelectedProfile((previous) => {
            if (currentProfile) {
                return currentProfile
            }
            if (previous && profiles.includes(previous)) {
                return previous
            }
            return profiles[0] || ''
        })
    }, [currentProfile, props.session.id, profilesKey])

    const shouldRender = props.session.metadata?.flavor === 'claude'
        && hasMcpJsonPath
        && profiles.length > 0
    const canSwitch = props.session.active
        && selectedProfile.length > 0
        && !props.isPending
        && selectedProfile !== currentProfile

    const description = useMemo(() => {
        if (currentProfile) {
            return t('session.mcp.current', { profile: currentProfile })
        }
        return t('session.mcp.currentUnknown')
    }, [currentProfile, t])

    if (!shouldRender) {
        return null
    }

    return (
        <div className="px-3 pt-3">
            <div className="mx-auto flex w-full max-w-content flex-col gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-xs font-medium text-[var(--app-fg)]">
                            {t('session.mcp.label')}
                        </div>
                        <div className="truncate text-xs text-[var(--app-hint)]">
                            {description}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => void props.onReload(selectedProfile)}
                        disabled={!canSwitch}
                        className="shrink-0 rounded-md bg-[var(--app-link)] px-3 py-2 text-xs font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {props.isPending ? t('session.mcp.switching') : t('session.mcp.switch')}
                    </button>
                </div>

                <select
                    value={selectedProfile}
                    onChange={(e) => setSelectedProfile(e.target.value)}
                    disabled={props.isPending || !props.session.active}
                    className="w-full rounded-md border border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2 text-sm text-[var(--app-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-50"
                >
                    {profiles.map((profile) => (
                        <option key={profile} value={profile}>
                            {profile}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    )
}
