const prisma = require('../config/prisma');

const UserRepository = {
  /**
   * Cập nhật trạng thái Online / Offline
   */
  async setOnlineStatus(userId, isOnline) {
    return prisma.users.update({
      where: {
        id: userId,
      },
      data: {
        status: isOnline,
      },
    });
  },

  /**
   * Lấy thông tin user
   */
  async getById(userId) {
    return prisma.users.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        username: true,
        full_name: true,
        avatar: true,
        status: true,
      },
    });
  },

  /**
   * Kiểm tra user tồn tại
   */
  async exists(userId) {
    return prisma.users.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
      },
    });
  },
};

module.exports = {
  UserRepository,
};
