import { PrismaClient } from '@prisma/client'

// Textos cortados no meio de um emoji deixam "meio caractere" (surrogate solto), que o PostgreSQL
// recusa e derruba a gravação inteira. Limpa isso em tudo que é gravado, antes de chegar ao banco.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

function clean<T>(value: T, depth = 0): T {
  if (depth > 40) return value
  if (typeof value === 'string') return value.replace(LONE_SURROGATE, '') as T
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1)) as T
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = clean(v, depth + 1)
    return out as T
  }
  return value
}

const WRITES = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert'])

function createClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }) {
          if (WRITES.has(operation) && args && typeof args === 'object') {
            const a = args as Record<string, unknown>
            if ('data' in a) a.data = clean(a.data)
            if ('create' in a) a.create = clean(a.create)
            if ('update' in a) a.update = clean(a.update)
          }
          return query(args)
        },
      },
    },
  }) as unknown as PrismaClient
}

declare global {
  // eslint-disable-next-line no-var
  var __prismaV2: PrismaClient | undefined
}

export const prisma = global.__prismaV2 ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  global.__prismaV2 = prisma
}
