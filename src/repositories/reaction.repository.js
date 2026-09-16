const prisma = require('../config/prisma');

/**
 * Repository quản lý cảm xúc (reaction) của tin nhắn
 */
const ReactionRepository = {
  /**
   * Thêm hoặc cập nhật cảm xúc
   */
  addReaction: async (messageId, userId, reactionType, reactionIcon) => {
    return await prisma.message_reactions.upsert({
      where: {
        message_id_user_id: {
          message_id: parseInt(messageId),
          user_id: parseInt(userId)
        }
      },
      update: {
        reaction_type: reactionType,
        reaction_icon: reactionIcon
      },
      create: {
        message_id: parseInt(messageId),
        user_id: parseInt(userId),
        reaction_type: reactionType,
        reaction_icon: reactionIcon
      }
    });
  },

  /**
   * Xóa cảm xúc
   */
  removeReaction: async (messageId, userId) => {
    return await prisma.message_reactions.delete({
      where: {
        message_id_user_id: {
          message_id: parseInt(messageId),
          user_id: parseInt(userId)
        }
      }
    });
  },

  /**
   * Lấy danh sách cảm xúc của tin nhắn
   */
  getReactions: async (messageId) => {
    const reactions = await prisma.message_reactions.findMany({
      where: {
        message_id: parseInt(messageId)
      }
    });
    
    // Gom nhóm cảm xúc theo loại
    const grouped = reactions.reduce((acc, curr) => {
      const type = curr.reaction_type;
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(curr);
      return acc;
    }, {});
    
    return grouped;
  }
};

module.exports = { ReactionRepository };
