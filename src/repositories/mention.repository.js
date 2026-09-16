const prisma = require('../config/prisma');

/**
 * Repository quản lý lượt nhắc (mention) trong tin nhắn
 */
const MentionRepository = {
  /**
   * Tạo nhiều mention cùng lúc
   */
  createMentions: async (messageId, mentionedUserIds) => {
    if (!mentionedUserIds || mentionedUserIds.length === 0) return { count: 0 };
    
    const data = mentionedUserIds.map(userId => ({
      message_id: parseInt(messageId),
      mentioned_user_id: parseInt(userId)
    }));

    return await prisma.message_mentions.createMany({
      data,
      skipDuplicates: true
    });
  },

  /**
   * Lấy danh sách mention của tin nhắn
   */
  getMentions: async (messageId) => {
    return await prisma.message_mentions.findMany({
      where: {
        message_id: parseInt(messageId)
      }
    });
  },

  /**
   * Lấy các tin nhắn có nhắc đến người dùng trong một cuộc trò chuyện
   */
  getUserMentions: async (userId, conversationId) => {
    return await prisma.message_mentions.findMany({
      where: {
        mentioned_user_id: parseInt(userId),
        message: {
          conversation_id: parseInt(conversationId)
        }
      },
      include: {
        message: true
      }
    });
  }
};

module.exports = { MentionRepository };
