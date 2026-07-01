const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined in environment variables');
}

/**
 * Chỉ verify token từ auth service — không tạo token mới
 */
function verifyToken(token) {
  // Giải mã và xác thực chữ ký token bằng SECRET_KEY
  const decoded = jwt.verify(token, JWT_SECRET);
  return decoded;
}

// Export hàm theo chuẩn CommonJS
module.exports = {
  verifyToken,
};
