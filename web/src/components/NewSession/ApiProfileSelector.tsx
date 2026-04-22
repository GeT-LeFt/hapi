import type { Machine } from '@/types/api'
import { useTranslation } from '@/lib/use-translation'

export function ApiProfileSelector(props: {
    machine: Machine | null
    apiProfile: string
    isDisabled: boolean
    onApiProfileChange: (value: string) => void
}) {
    const { t } = useTranslation()
    const profiles = props.machine?.metadata?.apiProfiles
    if (!profiles || profiles.length <= 1) {
        return null
    }

    return (
        <div className="flex flex-col gap-1.5 px-3 py-3">
            <label className="text-xs font-medium text-[var(--app-hint)]">
                API Profile{' '}
                <span className="font-normal">({t('newSession.model.optional')})</span>
            </label>
            <select
                value={props.apiProfile}
                onChange={(e) => props.onApiProfileChange(e.target.value)}
                disabled={props.isDisabled}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--app-divider)] bg-[var(--app-bg)] text-[var(--app-text)] focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-50"
            >
                {profiles.map((profile) => (
                    <option key={profile} value={profile}>
                        {profile}
                    </option>
                ))}
            </select>
        </div>
    )
}
