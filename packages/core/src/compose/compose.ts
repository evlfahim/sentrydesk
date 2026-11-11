import * as yaml from 'js-yaml'

export interface ComposeService {
  name: string
  image?: string
  build?: string | { context: string; dockerfile?: string }
  ports?: Array<{ host: number; container: number; protocol?: string }>
  environment?: Record<string, string>
  volumes?: string[]
  dependsOn?: string[]
  restart?: string
  networks?: string[]
  command?: string
  entrypoint?: string
  healthcheck?: {
    test: string
    interval?: string
    timeout?: string
    retries?: number
  }
  [key: string]: unknown
}

export interface ComposeNetwork {
  name: string
  driver?: string
  external?: boolean
  [key: string]: unknown
}

export interface ComposeVolume {
  name: string
  driver?: string
  external?: boolean
  [key: string]: unknown
}

export interface ComposeConfig {
  version?: string
  name: string
  services: ComposeService[]
  networks: ComposeNetwork[]
  volumes: ComposeVolume[]
  raw: string
}

export interface ComposeValidationError {
  path: string
  message: string
  severity: 'error' | 'warning'
}

export interface ComposeFile {
  path: string
  content: string
  config: ComposeConfig | null
  errors: ComposeValidationError[]
}

/**
 * Parse a raw YAML string into a ComposeConfig.
 */
export function parseComposeYaml(raw: string, projectName?: string): ComposeConfig {
  let parsed: unknown

  try {
    parsed = yaml.load(raw)
  } catch (error) {
    throw new Error(`YAML parse error: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid compose file: root must be a YAML mapping')
  }

  const obj = parsed as Record<string, unknown>

  const services: ComposeService[] = []
  if (obj.services && typeof obj.services === 'object') {
    for (const [name, svc] of Object.entries(obj.services as Record<string, unknown>)) {
      const service: ComposeService = { name }
      if (svc && typeof svc === 'object') {
        const s = svc as Record<string, unknown>
        if (typeof s.image === 'string') service.image = s.image
        if (typeof s.build === 'string') service.build = s.build
        else if (s.build && typeof s.build === 'object') {
          const buildObj = s.build as Record<string, unknown>
          service.build = {
            context: typeof buildObj.context === 'string' ? buildObj.context : '.',
            dockerfile: typeof buildObj.dockerfile === 'string' ? buildObj.dockerfile : undefined,
          }
        }
        if (Array.isArray(s.ports)) {
          service.ports = (s.ports as string[]).map((p) => {
            const parts = String(p).split(':')
            return {
              host: parseInt(parts[0], 10) || 0,
              container: parseInt(parts[parts.length - 1], 10) || 0,
              protocol: parts.length > 2 ? parts[parts.length - 1].split('/')[1] || 'tcp' : 'tcp',
            }
          })
        }
        if (s.environment && typeof s.environment === 'object') {
          if (Array.isArray(s.environment)) {
            const env: Record<string, string> = {}
            for (const item of s.environment as string[]) {
              const eqIdx = item.indexOf('=')
              if (eqIdx > 0) {
                env[item.slice(0, eqIdx)] = item.slice(eqIdx + 1)
              } else {
                env[item] = ''
              }
            }
            service.environment = env
          } else {
            const env: Record<string, string> = {}
            for (const [k, v] of Object.entries(s.environment as Record<string, unknown>)) {
              env[k] = typeof v === 'string' ? v : String(v)
            }
            service.environment = env
          }
        }
        if (Array.isArray(s.volumes)) {
          service.volumes = s.volumes.map((v) => (typeof v === 'string' ? v : String(v)))
        }
        if (Array.isArray(s.depends_on)) {
          service.dependsOn = s.depends_on.map((d) => String(d))
        }
        if (typeof s.restart === 'string') service.restart = s.restart
        if (typeof s.command === 'string') service.command = s.command
        if (typeof s.entrypoint === 'string') service.entrypoint = s.entrypoint
        if (typeof s.networks === 'string') service.networks = [s.networks]
        else if (Array.isArray(s.networks)) {
          service.networks = s.networks.map((n) => String(n))
        }
        if (s.healthcheck && typeof s.healthcheck === 'object') {
          const hc = s.healthcheck as Record<string, unknown>
          let testValue = ''
          if (typeof hc.test === 'string') {
            testValue = String(hc.test)
          } else if (Array.isArray(hc.test)) {
            testValue = JSON.stringify(hc.test)
          }
          service.healthcheck = {
            test: testValue,
            interval: typeof hc.interval === 'string' ? String(hc.interval) : undefined,
            timeout: typeof hc.timeout === 'string' ? String(hc.timeout) : undefined,
            retries: typeof hc.retries === 'number' ? hc.retries : undefined,
          }
        }
      }
      services.push(service)
    }
  }

  const networks: ComposeNetwork[] = []
  if (obj.networks && typeof obj.networks === 'object') {
    for (const [name, net] of Object.entries(obj.networks as Record<string, unknown>)) {
      const network: ComposeNetwork = { name }
      if (net && typeof net === 'object') {
        const n = net as Record<string, unknown>
        if (typeof n.driver === 'string') network.driver = n.driver
        if (typeof n.external === 'boolean') network.external = n.external
        else if (typeof n.external === 'object') {
          network.external = (n.external as Record<string, unknown>)?.name !== undefined
        }
      }
      networks.push(network)
    }
  }

  const volumes: ComposeVolume[] = []
  if (obj.volumes && typeof obj.volumes === 'object') {
    for (const [name, vol] of Object.entries(obj.volumes as Record<string, unknown>)) {
      const volume: ComposeVolume = { name }
      if (vol && typeof vol === 'object') {
        const v = vol as Record<string, unknown>
        if (typeof v.driver === 'string') volume.driver = v.driver
        if (typeof v.external === 'boolean') volume.external = v.external
        else if (typeof v.external === 'object') {
          volume.external = (v.external as Record<string, unknown>)?.name !== undefined
        }
      }
      volumes.push(volume)
    }
  }

  return {
    version: typeof obj.version === 'string' ? obj.version : undefined,
    name: projectName || (typeof obj.name === 'string' ? obj.name : 'unnamed'),
    services,
    networks,
    volumes,
    raw: raw,
  }
}

/**
 * Validate a parsed ComposeConfig and return any errors.
 */
export function validateCompose(config: ComposeConfig): ComposeValidationError[] {
  const errors: ComposeValidationError[] = []

  if (config.services.length === 0) {
    errors.push({
      path: '/services',
      message: 'No services defined',
      severity: 'error',
    })
  }

  for (const service of config.services) {
    if (!service.image && !service.build) {
      errors.push({
        path: `/services/${service.name}`,
        message: 'Service must have either "image" or "build" specified',
        severity: 'error',
      })
    }

    if (service.ports) {
      for (let i = 0; i < service.ports.length; i++) {
        if (service.ports[i].host === 0 || service.ports[i].container === 0) {
          errors.push({
            path: `/services/${service.name}/ports[${i}]`,
            message: 'Port mapping must specify both host and container ports',
            severity: 'error',
          })
        }
      }
    }

    if (service.dependsOn) {
      const serviceNames = new Set(config.services.map((s) => s.name))
      for (const dep of service.dependsOn) {
        if (!serviceNames.has(dep)) {
          errors.push({
            path: `/services/${service.name}/depends_on`,
            message: `Depends on unknown service: ${dep}`,
            severity: 'warning',
          })
        }
      }
    }

    if (service.networks) {
      const networkNames = new Set(config.networks.map((n) => n.name))
      for (const net of service.networks) {
        if (!networkNames.has(net)) {
          errors.push({
            path: `/services/${service.name}/networks`,
            message: `References unknown network: ${net}`,
            severity: 'warning',
          })
        }
      }
    }

    if (service.healthcheck) {
      if (!service.healthcheck.test) {
        errors.push({
          path: `/services/${service.name}/healthcheck`,
          message: 'Healthcheck must have a "test" command',
          severity: 'warning',
        })
      }
    }
  }

  return errors
}

/**
 * Parse and validate a compose file from raw content.
 */
export function parseComposeFile(
  content: string,
  projectName?: string,
): ComposeFile {
  let config: ComposeConfig | null = null
  let errors: ComposeValidationError[] = []

  try {
    config = parseComposeYaml(content, projectName)
    errors = validateCompose(config)
  } catch {
    // YAML parse error — config stays null
    errors = [
      {
        path: '/',
        message: 'Failed to parse YAML content',
        severity: 'error',
      },
    ]
  }

  return {
    path: '',
    content,
    config,
    errors,
  }
}

/**
 * Get a summary of services from a compose config.
 */
export function getServiceSummary(config: ComposeConfig): Array<{
  name: string
  image?: string
  build?: string
  ports: string[]
  status: string
}> {
  return config.services.map((svc) => ({
    name: svc.name,
    image: svc.image,
    build: typeof svc.build === 'string' ? svc.build : svc.build?.context,
    ports: (svc.ports || []).map((p) => `${p.host}:${p.container}`),
    status: svc.image ? 'image' : 'build',
  }))
}
