const HttpError = require('../utils/HttpError');

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      throw new HttpError(401, 'Không tìm thấy thông tin người dùng');
    }

    if (!roles.includes(req.user.role)) {
      throw new HttpError(403, 'Bạn không có quyền truy cập tài nguyên này');
    }

    next();
  };
};

module.exports = requireRole;
