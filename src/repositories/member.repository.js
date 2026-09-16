const prisma = require('../config/prisma');

/**
 * Repository quản lý thành viên cuộc trò chuyện
 */
const MemberRepository = {
  /**
   * Lấy danh sách thành viên hoạt động
   */
  getMembers: async (conversationId) => {
    return await prisma.conversation_members.findMany({
      where: {
        conversation_id: parseInt(conversationId),
        is_active: true
      }
    });
  },

  /**
   * Thêm thành viên mới (hoặc cập nhật nếu đã từng tham gia)
   */
  addMember: async (conversationId, userId, role = 'MEMBER') => {
    return await prisma.conversation_members.upsert({
      where: {
        conversation_id_user_id: {
          conversation_id: parseInt(conversationId),
          user_id: parseInt(userId)
        }
      },
      update: {
        is_active: true,
        role: role
      },
      create: {
        conversation_id: parseInt(conversationId),
        user_id: parseInt(userId),
        role: role,
        is_active: true
      }
    });
  },

  /**
   * Xóa mềm thành viên khỏi nhóm
   */
  removeMember: async (conversationId, userId) => {
    return await prisma.conversation_members.update({
      where: {
        conversation_id_user_id: {
          conversation_id: parseInt(conversationId),
          user_id: parseInt(userId)
        }
      },
      data: {
        is_active: false
      }
    });
  },

  /**
   * Cập nhật vai trò thành viên
   */
  updateRole: async (conversationId, userId, newRole) => {
    return await prisma.conversation_members.update({
      where: {
        conversation_id_user_id: {
          conversation_id: parseInt(conversationId),
          user_id: parseInt(userId)
        }
      },
      data: {
        role: newRole
      }
    });
  },

  /**
   * Kiểm tra quyền quản trị của thành viên
   */
  isMemberAdmin: async (conversationId, userId) => {
    const member = await prisma.conversation_members.findUnique({
      where: {
        conversation_id_user_id: {
          conversation_id: parseInt(conversationId),
          user_id: parseInt(userId)
        }
      }
    });
    return member && member.is_active && member.role === 'ADMIN';
  },

  /**
   * Đếm số lượng thành viên đang hoạt động
   */
  getMemberCount: async (conversationId) => {
    return await prisma.conversation_members.count({
      where: {
        conversation_id: parseInt(conversationId),
        is_active: true
      }
    });
  }
};

module.exports = { MemberRepository };
