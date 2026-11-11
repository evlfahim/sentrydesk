import { describe, it, expect, beforeEach } from 'vitest'
import { DockerClient } from '../docker/client'
import {
  parseComposeYaml,
  validateCompose,
  parseComposeFile,
  getServiceSummary,
  ComposeConfig,
  ComposeService,
  ComposeNetwork,
  ComposeVolume,
  ComposeFile,
  ComposeValidationError,
} from '../compose/compose'

describe('Docker Compose', () => {
  beforeEach(() => {
    DockerClient['instance'] = null
  })

  it('should throw when getting compose files without connection', async () => {
    const client = DockerClient.getInstance()
    await expect(client.getComposeFiles()).rejects.toThrow('Docker client not connected')
  })

  it('should throw when getting compose files with project name without connection', async () => {
    const client = DockerClient.getInstance()
    await expect(client.getComposeFiles('myproject')).rejects.toThrow(
      'Docker client not connected',
    )
  })
})

describe('parseComposeYaml', () => {
  it('should parse a simple compose file with services', () => {
    const yaml = `
name: myapp
version: "3.8"
services:
  web:
    image: nginx:latest
    ports:
      - "8080:80"
`
    const config = parseComposeYaml(yaml, 'myapp')

    expect(config.name).toBe('myapp')
    expect(config.version).toBe('3.8')
    expect(config.services).toHaveLength(1)
    expect(config.services[0].name).toBe('web')
    expect(config.services[0].image).toBe('nginx:latest')
    expect(config.services[0].ports).toHaveLength(1)
    expect(config.services[0].ports![0].host).toBe(8080)
    expect(config.services[0].ports![0].container).toBe(80)
    expect(config.networks).toHaveLength(0)
    expect(config.volumes).toHaveLength(0)
  })

  it('should parse services with build context', () => {
    const yaml = `
services:
  api:
    build:
      context: ./api
      dockerfile: Dockerfile.prod
`
    const config = parseComposeYaml(yaml)

    expect(config.services).toHaveLength(1)
    expect(config.services[0].name).toBe('api')
    expect(config.services[0].build).toEqual({
      context: './api',
      dockerfile: 'Dockerfile.prod',
    })
  })

  it('should parse services with string build', () => {
    const yaml = `
services:
  api:
    build: ./api
`
    const config = parseComposeYaml(yaml)

    expect(config.services[0].build).toBe('./api')
  })

  it('should parse environment variables as array', () => {
    const yaml = `
services:
  app:
    image: node:20
    environment:
      - NODE_ENV=production
      - DB_HOST=localhost
`
    const config = parseComposeYaml(yaml)

    expect(config.services[0].environment).toEqual({
      NODE_ENV: 'production',
      DB_HOST: 'localhost',
    })
  })

  it('should parse environment variables as mapping', () => {
    const yaml = `
services:
  app:
    image: node:20
    environment:
      NODE_ENV: production
      DB_HOST: localhost
`
    const config = parseComposeYaml(yaml)

    expect(config.services[0].environment).toEqual({
      NODE_ENV: 'production',
      DB_HOST: 'localhost',
    })
  })

  it('should parse volumes', () => {
    const yaml = `
services:
  db:
    image: postgres:16
    volumes:
      - db-data:/var/lib/postgresql/data
      - ./config:/etc/postgresql
`
    const config = parseComposeYaml(yaml)

    expect(config.services[0].volumes).toEqual([
      'db-data:/var/lib/postgresql/data',
      './config:/etc/postgresql',
    ])
  })

  it('should parse depends_on', () => {
    const yaml = `
services:
  web:
    image: nginx:latest
    depends_on:
      - api
      - db
`
    const config = parseComposeYaml(yaml)

    expect(config.services[0].dependsOn).toEqual(['api', 'db'])
  })

  it('should parse restart policy', () => {
    const yaml = `
services:
  app:
    image: node:20
    restart: unless-stopped
`
    const config = parseComposeYaml(yaml)

    expect(config.services[0].restart).toBe('unless-stopped')
  })

  it('should parse networks', () => {
    const yaml = `
services:
  web:
    image: nginx:latest
    networks:
      - frontend
      - backend
`
    const config = parseComposeYaml(yaml)

    expect(config.services[0].networks).toEqual(['frontend', 'backend'])
  })

  it('should parse networks as string', () => {
    const yaml = `
services:
  web:
    image: nginx:latest
    networks:
      - frontend
`
    const config = parseComposeYaml(yaml)

    expect(config.services[0].networks).toEqual(['frontend'])
  })

  it('should parse healthcheck', () => {
    const yaml = `
services:
  web:
    image: nginx:latest
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost"]
      interval: 30s
      timeout: 10s
      retries: 3
`
    const config = parseComposeYaml(yaml)

    expect(config.services[0].healthcheck).toEqual({
      test: '["CMD","curl","-f","http://localhost"]',
      interval: '30s',
      timeout: '10s',
      retries: 3,
    })
  })

  it('should parse networks section', () => {
    const yaml = `
networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    external: true
`
    const config = parseComposeYaml(yaml)

    expect(config.networks).toHaveLength(2)
    expect(config.networks[0].name).toBe('frontend')
    expect(config.networks[0].driver).toBe('bridge')
    expect(config.networks[1].name).toBe('backend')
    expect(config.networks[1].driver).toBe('bridge')
    expect(config.networks[1].external).toBe(true)
  })

  it('should parse volumes section', () => {
    const yaml = `
volumes:
  db-data:
    driver: local
  backup:
    driver: local
    external: true
`
    const config = parseComposeYaml(yaml)

    expect(config.volumes).toHaveLength(2)
    expect(config.volumes[0].name).toBe('db-data')
    expect(config.volumes[0].driver).toBe('local')
    expect(config.volumes[1].name).toBe('backup')
    expect(config.volumes[1].external).toBe(true)
  })

  it('should throw on invalid YAML', () => {
    const invalidYaml = `
services:
  web:
    image: nginx:latest
    invalid yaml: [
`
    expect(() => parseComposeYaml(invalidYaml)).toThrow('YAML parse error')
  })

  it('should throw when root is not a mapping', () => {
    expect(() => parseComposeYaml('just a string')).toThrow('Invalid compose file')
    expect(() => parseComposeYaml('- item1\n- item2')).toThrow('Invalid compose file')
  })

  it('should use provided project name', () => {
    const yaml = `
services:
  web:
    image: nginx:latest
`
    const config = parseComposeYaml(yaml, 'myproject')
    expect(config.name).toBe('myproject')
  })

  it('should use YAML name when no project name provided', () => {
    const yaml = `
name: yamlproject
services:
  web:
    image: nginx:latest
`
    const config = parseComposeYaml(yaml)
    expect(config.name).toBe('yamlproject')
  })

  it('should default to unnamed when no name provided', () => {
    const yaml = `
services:
  web:
    image: nginx:latest
`
    const config = parseComposeYaml(yaml)
    expect(config.name).toBe('unnamed')
  })

  it('should handle empty services section', () => {
    const yaml = `
services: {}
`
    const config = parseComposeYaml(yaml)
    expect(config.services).toHaveLength(0)
  })

  it('should handle missing services section', () => {
    const yaml = `
networks:
  frontend:
    driver: bridge
`
    const config = parseComposeYaml(yaml)
    expect(config.services).toHaveLength(0)
    expect(config.networks).toHaveLength(1)
  })

  it('should parse command and entrypoint', () => {
    const yaml = `
services:
  app:
    image: node:20
    command: node server.js
    entrypoint: /usr/bin/node
`
    const config = parseComposeYaml(yaml)

    expect(config.services[0].command).toBe('node server.js')
    expect(config.services[0].entrypoint).toBe('/usr/bin/node')
  })

  it('should handle complex port mappings', () => {
    const yaml = `
services:
  web:
    image: nginx:latest
    ports:
      - "8080:80"
      - "8443:443"
      - "3000-3010:3000-3010"
`
    const config = parseComposeYaml(yaml)

    expect(config.services[0].ports).toHaveLength(3)
    expect(config.services[0].ports![0].host).toBe(8080)
    expect(config.services[0].ports![0].container).toBe(80)
    expect(config.services[0].ports![1].host).toBe(8443)
    expect(config.services[0].ports![1].container).toBe(443)
  })

  it('should parse multiple services', () => {
    const yaml = `
services:
  web:
    image: nginx:latest
  api:
    image: node:20
  db:
    image: postgres:16
`
    const config = parseComposeYaml(yaml)

    expect(config.services).toHaveLength(3)
    expect(config.services.map((s) => s.name)).toEqual(['web', 'api', 'db'])
  })

  it('should preserve raw content', () => {
    const yaml = `
services:
  web:
    image: nginx:latest
`
    const config = parseComposeYaml(yaml)
    expect(config.raw).toBe(yaml)
  })
})

describe('validateCompose', () => {
  it('should return no errors for a valid config', () => {
    const config: ComposeConfig = {
      name: 'test',
      services: [
        { name: 'web', image: 'nginx:latest' },
        { name: 'api', image: 'node:20' },
      ],
      networks: [],
      volumes: [],
      raw: '',
    }

    const errors = validateCompose(config)
    expect(errors).toHaveLength(0)
  })

  it('should error when no services defined', () => {
    const config: ComposeConfig = {
      name: 'test',
      services: [],
      networks: [],
      volumes: [],
      raw: '',
    }

    const errors = validateCompose(config)
    expect(errors).toHaveLength(1)
    expect(errors[0].severity).toBe('error')
    expect(errors[0].path).toBe('/services')
    expect(errors[0].message).toBe('No services defined')
  })

  it('should error when service has no image or build', () => {
    const config: ComposeConfig = {
      name: 'test',
      services: [{ name: 'broken' }],
      networks: [],
      volumes: [],
      raw: '',
    }

    const errors = validateCompose(config)
    expect(errors).toHaveLength(1)
    expect(errors[0].severity).toBe('error')
    expect(errors[0].path).toBe('/services/broken')
    expect(errors[0].message).toBe('Service must have either "image" or "build" specified')
  })

  it('should not error when service has build instead of image', () => {
    const config: ComposeConfig = {
      name: 'test',
      services: [{ name: 'app', build: './app' }],
      networks: [],
      volumes: [],
      raw: '',
    }

    const errors = validateCompose(config)
    expect(errors).toHaveLength(0)
  })

  it('should error on invalid port mappings', () => {
    const config: ComposeConfig = {
      name: 'test',
      services: [
        {
          name: 'web',
          image: 'nginx:latest',
          ports: [{ host: 0, container: 80 }],
        },
      ],
      networks: [],
      volumes: [],
      raw: '',
    }

    const errors = validateCompose(config)
    expect(errors).toHaveLength(1)
    expect(errors[0].severity).toBe('error')
    expect(errors[0].path).toBe('/services/web/ports[0]')
  })

  it('should warn about unknown depends_on targets', () => {
    const config: ComposeConfig = {
      name: 'test',
      services: [
        { name: 'web', image: 'nginx:latest', dependsOn: ['api', 'nonexistent'] },
        { name: 'api', image: 'node:20' },
      ],
      networks: [],
      volumes: [],
      raw: '',
    }

    const errors = validateCompose(config)
    expect(errors).toHaveLength(1)
    expect(errors[0].severity).toBe('warning')
    expect(errors[0].message).toContain('nonexistent')
  })

  it('should not warn about valid depends_on targets', () => {
    const config: ComposeConfig = {
      name: 'test',
      services: [
        { name: 'web', image: 'nginx:latest', dependsOn: ['api'] },
        { name: 'api', image: 'node:20' },
      ],
      networks: [],
      volumes: [],
      raw: '',
    }

    const errors = validateCompose(config)
    expect(errors).toHaveLength(0)
  })

  it('should warn about unknown networks', () => {
    const config: ComposeConfig = {
      name: 'test',
      services: [{ name: 'web', image: 'nginx:latest', networks: ['frontend', 'missing'] }],
      networks: [{ name: 'frontend' }],
      volumes: [],
      raw: '',
    }

    const errors = validateCompose(config)
    expect(errors).toHaveLength(1)
    expect(errors[0].severity).toBe('warning')
    expect(errors[0].message).toContain('missing')
  })

  it('should warn about missing healthcheck test', () => {
    const config: ComposeConfig = {
      name: 'test',
      services: [
        {
          name: 'web',
          image: 'nginx:latest',
          healthcheck: { test: '' },
        },
      ],
      networks: [],
      volumes: [],
      raw: '',
    }

    const errors = validateCompose(config)
    expect(errors).toHaveLength(1)
    expect(errors[0].severity).toBe('warning')
    expect(errors[0].path).toBe('/services/web/healthcheck')
  })

  it('should not warn about valid healthcheck', () => {
    const config: ComposeConfig = {
      name: 'test',
      services: [
        {
          name: 'web',
          image: 'nginx:latest',
          healthcheck: { test: 'curl -f http://localhost' },
        },
      ],
      networks: [],
      volumes: [],
      raw: '',
    }

    const errors = validateCompose(config)
    expect(errors).toHaveLength(0)
  })

  it('should handle multiple errors', () => {
    const config: ComposeConfig = {
      name: 'test',
      services: [
        { name: 'broken' },
        { name: 'also-broken' },
      ],
      networks: [],
      volumes: [],
      raw: '',
    }

    const errors = validateCompose(config)
    expect(errors).toHaveLength(2)
    expect(errors.every((e) => e.severity === 'error')).toBe(true)
  })
})

describe('parseComposeFile', () => {
  it('should parse valid YAML and return config', () => {
    const yaml = `
name: test
services:
  web:
    image: nginx:latest
`
    const file = parseComposeFile(yaml, 'test')

    expect(file.config).not.toBeNull()
    expect(file.config!.name).toBe('test')
    expect(file.config!.services).toHaveLength(1)
    expect(file.errors).toHaveLength(0)
  })

  it('should return null config and errors on invalid YAML', () => {
    const invalidYaml = `
services:
  web:
    image: nginx:latest
    invalid: [
`
    const file = parseComposeFile(invalidYaml)

    expect(file.config).toBeNull()
    expect(file.errors).toHaveLength(1)
    expect(file.errors[0].severity).toBe('error')
  })

  it('should include validation errors for valid YAML with issues', () => {
    const yaml = `
services:
  broken:
    image: nginx:latest
    depends_on:
      - nonexistent
`
    const file = parseComposeFile(yaml)

    expect(file.config).not.toBeNull()
    expect(file.errors.length).toBeGreaterThan(0)
    expect(file.errors.some((e) => e.severity === 'warning')).toBe(true)
  })

  it('should have empty path by default', () => {
    const yaml = `
services:
  web:
    image: nginx:latest
`
    const file = parseComposeFile(yaml)
    expect(file.path).toBe('')
  })

  it('should preserve raw content', () => {
    const yaml = `
services:
  web:
    image: nginx:latest
`
    const file = parseComposeFile(yaml)
    expect(file.content).toBe(yaml)
  })
})

describe('getServiceSummary', () => {
  it('should return summary for all services', () => {
    const config: ComposeConfig = {
      name: 'test',
      services: [
        { name: 'web', image: 'nginx:latest', ports: [{ host: 8080, container: 80 }] },
        { name: 'api', build: './api', ports: [{ host: 3000, container: 3000 }] },
      ],
      networks: [],
      volumes: [],
      raw: '',
    }

    const summary = getServiceSummary(config)

    expect(summary).toHaveLength(2)
    expect(summary[0].name).toBe('web')
    expect(summary[0].image).toBe('nginx:latest')
    expect(summary[0].status).toBe('image')
    expect(summary[0].ports).toEqual(['8080:80'])

    expect(summary[1].name).toBe('api')
    expect(summary[1].build).toBe('./api')
    expect(summary[1].status).toBe('build')
    expect(summary[1].ports).toEqual(['3000:3000'])
  })

  it('should handle services without ports', () => {
    const config: ComposeConfig = {
      name: 'test',
      services: [{ name: 'worker', image: 'node:20' }],
      networks: [],
      volumes: [],
      raw: '',
    }

    const summary = getServiceSummary(config)

    expect(summary).toHaveLength(1)
    expect(summary[0].ports).toEqual([])
  })

  it('should handle build as object', () => {
    const config: ComposeConfig = {
      name: 'test',
      services: [
        {
          name: 'app',
          build: { context: './app', dockerfile: 'Dockerfile.prod' },
        },
      ],
      networks: [],
      volumes: [],
      raw: '',
    }

    const summary = getServiceSummary(config)

    expect(summary[0].build).toBe('./app')
  })
})

describe('ComposeService interface', () => {
  it('should allow all optional fields', () => {
    const service: ComposeService = {
      name: 'test',
      image: 'nginx:latest',
      build: './app',
      ports: [{ host: 8080, container: 80 }],
      environment: { NODE_ENV: 'production' },
      volumes: ['data:/data'],
      dependsOn: ['db'],
      restart: 'unless-stopped',
      networks: ['frontend'],
      command: 'node server.js',
      entrypoint: '/usr/bin/node',
      healthcheck: {
        test: 'curl -f http://localhost',
        interval: '30s',
        timeout: '10s',
        retries: 3,
      },
    }

    expect(service.name).toBe('test')
    expect(service.image).toBe('nginx:latest')
    expect(service.ports).toHaveLength(1)
    expect(service.environment).toEqual({ NODE_ENV: 'production' })
    expect(service.volumes).toEqual(['data:/data'])
    expect(service.dependsOn).toEqual(['db'])
    expect(service.restart).toBe('unless-stopped')
    expect(service.networks).toEqual(['frontend'])
    expect(service.command).toBe('node server.js')
    expect(service.entrypoint).toBe('/usr/bin/node')
    expect(service.healthcheck).toEqual({
      test: 'curl -f http://localhost',
      interval: '30s',
      timeout: '10s',
      retries: 3,
    })
  })

  it('should allow minimal service', () => {
    const service: ComposeService = { name: 'minimal' }

    expect(service.name).toBe('minimal')
    expect(service.image).toBeUndefined()
    expect(service.build).toBeUndefined()
    expect(service.ports).toBeUndefined()
  })
})

describe('ComposeValidationError interface', () => {
  it('should have all required fields', () => {
    const error: ComposeValidationError = {
      path: '/services/web',
      message: 'Test error',
      severity: 'error',
    }

    expect(error.path).toBe('/services/web')
    expect(error.message).toBe('Test error')
    expect(error.severity).toBe('error')
  })

  it('should allow warning severity', () => {
    const error: ComposeValidationError = {
      path: '/services/web/depends_on',
      message: 'Unknown dependency',
      severity: 'warning',
    }

    expect(error.severity).toBe('warning')
  })
})

describe('ComposeConfig interface', () => {
  it('should have all required fields', () => {
    const config: ComposeConfig = {
      name: 'test',
      services: [],
      networks: [],
      volumes: [],
      raw: '',
    }

    expect(config.name).toBe('test')
    expect(config.services).toEqual([])
    expect(config.networks).toEqual([])
    expect(config.volumes).toEqual([])
    expect(config.raw).toBe('')
  })

  it('should allow optional version', () => {
    const config: ComposeConfig = {
      name: 'test',
      services: [],
      networks: [],
      volumes: [],
      raw: '',
      version: '3.8',
    }

    expect(config.version).toBe('3.8')
  })

  it('should allow undefined version', () => {
    const config: ComposeConfig = {
      name: 'test',
      services: [],
      networks: [],
      volumes: [],
      raw: '',
    }

    expect(config.version).toBeUndefined()
  })
})

describe('ComposeNetwork interface', () => {
  it('should have all required fields', () => {
    const network: ComposeNetwork = { name: 'frontend' }

    expect(network.name).toBe('frontend')
    expect(network.driver).toBeUndefined()
    expect(network.external).toBeUndefined()
  })

  it('should allow optional fields', () => {
    const network: ComposeNetwork = {
      name: 'backend',
      driver: 'bridge',
      external: true,
    }

    expect(network.name).toBe('backend')
    expect(network.driver).toBe('bridge')
    expect(network.external).toBe(true)
  })
})

describe('ComposeVolume interface', () => {
  it('should have all required fields', () => {
    const volume: ComposeVolume = { name: 'db-data' }

    expect(volume.name).toBe('db-data')
    expect(volume.driver).toBeUndefined()
    expect(volume.external).toBeUndefined()
  })

  it('should allow optional fields', () => {
    const volume: ComposeVolume = {
      name: 'backup',
      driver: 'local',
      external: false,
    }

    expect(volume.name).toBe('backup')
    expect(volume.driver).toBe('local')
    expect(volume.external).toBe(false)
  })
})

describe('ComposeFile interface', () => {
  it('should have all required fields', () => {
    const file: ComposeFile = {
      path: '/docker-compose.yml',
      content: 'services:\n  web:\n    image: nginx:latest\n',
      config: {
        name: 'test',
        services: [{ name: 'web', image: 'nginx:latest' }],
        networks: [],
        volumes: [],
        raw: '',
      },
      errors: [],
    }

    expect(file.path).toBe('/docker-compose.yml')
    expect(file.content).toContain('services')
    expect(file.config).not.toBeNull()
    expect(file.errors).toEqual([])
  })

  it('should allow null config', () => {
    const file: ComposeFile = {
      path: '/invalid.yml',
      content: 'invalid yaml',
      config: null,
      errors: [{ path: '/', message: 'Parse error', severity: 'error' }],
    }

    expect(file.config).toBeNull()
    expect(file.errors).toHaveLength(1)
  })
})

describe('Real-world compose file parsing', () => {
  it('should parse a full docker-compose.yml', () => {
    const yaml = `
name: full-stack-app
version: "3.9"

services:
  nginx:
    image: nginx:1.25-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - node-api
      - redis
    restart: always
    networks:
      - public
      - internal

  node-api:
    build:
      context: ./api
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      REDIS_HOST: redis
      DB_HOST: postgres
    depends_on:
      - redis
      - postgres
    restart: unless-stopped
    networks:
      - internal

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: always
    networks:
      - internal

  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: appdb
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: secret
    volumes:
      - pg-data:/var/lib/postgresql/data
    restart: always
    networks:
      - internal

networks:
  public:
    driver: bridge
  internal:
    driver: bridge
    internal: true

volumes:
  redis-data:
    driver: local
  pg-data:
    driver: local
`
    const config = parseComposeYaml(yaml, 'full-stack-app')

    expect(config.name).toBe('full-stack-app')
    expect(config.version).toBe('3.9')
    expect(config.services).toHaveLength(4)

    // Check nginx
    const nginx = config.services.find((s) => s.name === 'nginx')!
    expect(nginx.image).toBe('nginx:1.25-alpine')
    expect(nginx.ports).toHaveLength(2)
    expect(nginx.volumes).toHaveLength(1)
    expect(nginx.dependsOn).toEqual(['node-api', 'redis'])
    expect(nginx.restart).toBe('always')
    expect(nginx.networks).toEqual(['public', 'internal'])

    // Check node-api
    const api = config.services.find((s) => s.name === 'node-api')!
    expect(api.build).toEqual({ context: './api', dockerfile: 'Dockerfile' })
    expect(api.environment).toEqual({
      NODE_ENV: 'production',
      REDIS_HOST: 'redis',
      DB_HOST: 'postgres',
    })

    // Check networks
    expect(config.networks).toHaveLength(2)
    expect(config.networks.find((n) => n.name === 'internal')?.driver).toBe('bridge')

    // Check volumes
    expect(config.volumes).toHaveLength(2)
    expect(config.volumes.find((v) => v.name === 'pg-data')?.driver).toBe('local')
  })

  it('should handle compose file with healthchecks', () => {
    const yaml = `
services:
  web:
    image: nginx:latest
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
`
    const config = parseComposeYaml(yaml)

    expect(config.services[0].healthcheck).toEqual({
      test: '["CMD","curl","-f","http://localhost"]',
      interval: '30s',
      timeout: '10s',
      retries: 3,
    })
  })

  it('should handle compose file with no optional sections', () => {
    const yaml = `
services:
  simple:
    image: alpine:latest
    command: echo hello
`
    const config = parseComposeYaml(yaml)

    expect(config.services).toHaveLength(1)
    expect(config.services[0].name).toBe('simple')
    expect(config.services[0].image).toBe('alpine:latest')
    expect(config.services[0].command).toBe('echo hello')
    expect(config.services[0].ports).toBeUndefined()
    expect(config.services[0].environment).toBeUndefined()
    expect(config.services[0].volumes).toBeUndefined()
    expect(config.services[0].dependsOn).toBeUndefined()
    expect(config.services[0].restart).toBeUndefined()
    expect(config.services[0].networks).toBeUndefined()
    expect(config.services[0].healthcheck).toBeUndefined()
    expect(config.networks).toHaveLength(0)
    expect(config.volumes).toHaveLength(0)
  })
})
