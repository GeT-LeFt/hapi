const ENV_PREFIX = 'HAPI_API_'

export function discoverApiProfiles(): string[] {
    const profiles = new Set<string>()
    profiles.add('default')

    for (const key of Object.keys(process.env)) {
        if (!key.startsWith(ENV_PREFIX)) continue
        const rest = key.slice(ENV_PREFIX.length)
        const sep = rest.indexOf('_')
        if (sep <= 0) continue
        profiles.add(rest.slice(0, sep).toLowerCase())
    }

    return Array.from(profiles)
}

export function resolveProfileEnvVars(profileName: string): Record<string, string> {
    if (profileName === 'default') return {}

    const prefix = `${ENV_PREFIX}${profileName.toUpperCase()}_`
    const vars: Record<string, string> = {}

    for (const [key, value] of Object.entries(process.env)) {
        if (!key.startsWith(prefix) || value === undefined) continue
        const envName = key.slice(prefix.length)
        if (envName) {
            vars[envName] = value
        }
    }

    return vars
}
