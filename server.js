

const app = require('./index');

console.log(`[Boot] ChatService Node.js đang khởi động...`);

// Bắt lỗi đồng bộ không được xử lý (tránh crash silent)
process.on('uncaughtException', (err) => {
  console.error('🔴 Uncaught Exception:', err);
});

// Bắt lỗi async/promise không được xử lý
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔴 Unhandled Rejection tại:', promise, 'lý do:', reason);
});
