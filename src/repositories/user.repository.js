const prisma = require('../config/prisma');

const UserRepository = {
  /**
   * Kiểm tra user tồn tại trong DB (được tạo bởi AuthService)
   * Dùng khi socket connect để validate JWT payload
   */
  async validateExists(userId) {
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        full_name: true,
        avatar: true,
        status: true,
      },
    });

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    return user;
  },

  /**
   * Cập nhật trạng thái Online / Offline
   */
  async setOnlineStatus(userId, isOnline) {
    return prisma.users.update({
      where: { id: userId },
      data: { status: isOnline },
    });
  },

  /**
   * Lấy thông tin user
   */
  async getById(userId) {
    return prisma.users.findUnique({
      where: { id: userId },
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
   * Kiểm tra user tồn tại (trả về id hoặc null)
   */
  async exists(userId) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { id: true },
    });
  },
};

module.exports = { UserRepository };
