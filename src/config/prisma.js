const { PrismaClient } = require('@prisma/client');

// Chỉ log query ở development — production chỉ warn/error để tránh ảnh hưởng performance
const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === 'development'
      ? ['query', 'info', 'warn', 'error']
      : ['warn', 'error'],
});

module.exports = prisma;
