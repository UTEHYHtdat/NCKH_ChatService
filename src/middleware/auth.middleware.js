const { verifyToken } = require('../utils/jwt');

/**
 * Middleware xác thực tài khoản qua JWT Token
 */
function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // Kiểm tra xem header Authorization có tồn tại và bắt đầu bằng "Bearer " không
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Missing or invalid token' });
    }

    // Tách chuỗi để lấy chuỗi mã hóa Token thực tế
    const token = authHeader.split(' ')[1];

    // Xác thực và giải mã token để lấy thông tin payload
    const payload = verifyToken(token);
    const userId =
      payload.userId || payload.id || payload.user_id || payload.sub;
    if (!userId) {
      return res
        .status(401)
        .json({ message: 'Invalid token payload: missing user identifier' });
    }

    // Gán thông tin người dùng trực tiếp vào đối tượng `req`
    // để các controller/middleware phía sau có thể sử dụng (ví dụ: req.user.userId)
    req.user = {
      userId,
      email: payload.email,
      username: payload.username,
    };

    // Cho phép request tiếp tục đi tới các controller xử lý logic tiếp theo
    next();
  } catch (error) {
    // Trả về lỗi 401 nếu token bị hết hạn, sai chữ ký (secret key) hoặc không hợp lệ
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// Export middleware theo chuẩn CommonJS
module.exports = { authMiddleware };
