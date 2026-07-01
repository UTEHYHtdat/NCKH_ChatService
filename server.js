// server.js
const app = require('./index'); // Nạp cấu hình từ file app.js (đảm bảo đường dẫn chính xác)

const PORT = process.env.PORT || 3001;

const test = require('./src/utils/test'); // Nạp file test.js để chạy các hàm test
/**
 * File này đóng vai trò là "Entry Point" (Cổng vào chính) của ứng dụng NodeJS.
 * Mọi logic cấu hình Server, HTTPS, và Socket.IO đã được xử lý trọn vẹn trong app.js.
 * Tại đây, chúng ta chỉ gọi lại biến app để đảm bảo NodeJS process giữ kết nối sống.
 */
console.log(`[Boot] Khởi động hệ thống chat Node.js...`);

// Dự phòng trường hợp có lỗi không mong muốn làm sập server (Uncaught Exceptions)
process.on('uncaughtException', (err) => {
  console.error(
    '🔴 Có lỗi nghiêm trọng chưa được bắt (Uncaught Exception):',
    err,
  );
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(
    '🔴 Lời hứa bị từ chối chưa được xử lý (Unhandled Rejection) tại:',
    promise,
    'lý do:',
    reason,
  );
});
