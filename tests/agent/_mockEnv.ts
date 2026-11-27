import path from 'node:path';

export interface MockPrismaClient {
  aiBotConfig: {
    findUnique: (...args: any[]) => Promise<any>;
    create: (...args: any[]) => Promise<any>;
    upsert: (...args: any[]) => Promise<any>;
  };
  aiChatSession: {
    findUnique: (...args: any[]) => Promise<any>;
    findFirst: (...args: any[]) => Promise<any>;
    findMany: (...args: any[]) => Promise<any[]>;
    create: (...args: any[]) => Promise<any>;
    update: (...args: any[]) => Promise<any>;
    count: (...args: any[]) => Promise<number>;
    aggregate: (...args: any[]) => Promise<any>;
  };
  aiChatMessage: {
    create: (...args: any[]) => Promise<any>;
    aggregate: (...args: any[]) => Promise<any>;
  };
  product: {
    findMany: (...args: any[]) => Promise<any[]>;
  };
  productCombo: {
    findMany: (...args: any[]) => Promise<any[]>;
  };
  $queryRawUnsafe: (...args: any[]) => Promise<any>;
  $executeRawUnsafe: (...args: any[]) => Promise<any>;
}

/**
 * Cài đặt mock Prisma vào require.cache trước khi bất kỳ module nào import src/config/database.ts.
 * Đảm bảo toàn bộ test chạy offline 100%, không khởi tạo pg.Pool thật.
 */
export function installMockPrisma(overrides?: Partial<MockPrismaClient>): MockPrismaClient {
  const mockPrisma: MockPrismaClient = {
    aiBotConfig: {
      findUnique: async () => null,
      create: async (args: any) => args?.data || {},
      upsert: async (args: any) => args?.update || args?.create || {},
    },
    aiChatSession: {
      findUnique: async () => null,
      findFirst: async () => null,
      findMany: async () => [],
      create: async (args: any) => ({ id: 'mock-session-id', ...args?.data }),
      update: async (args: any) => ({ id: args?.where?.id || 'mock-session-id', ...args?.data }),
      count: async () => 0,
      aggregate: async () => ({ _count: { id: 0 }, _sum: { totalMessages: 0, totalTokens: 0 } }),
    },
    aiChatMessage: {
      create: async (args: any) => ({ id: 'mock-msg-id', ...args?.data }),
      aggregate: async () => ({ _avg: { latencyMs: 0, totalTokens: 0, promptTokens: 0, completionTokens: 0 } }),
    },
    product: {
      findMany: async () => [],
    },
    productCombo: {
      findMany: async () => [],
    },
    $queryRawUnsafe: async () => [],
    $executeRawUnsafe: async () => 0,
    ...overrides,
  };

  const dbPath = require.resolve(path.resolve(__dirname, '../../src/config/database'));
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      __esModule: true,
      default: mockPrisma,
    },
  } as any;

  return mockPrisma;
}
