const prisma = require('../config/prisma');

const ConversationRepository = {
  /**
   * Lấy tất cả conversation mà user tham gia, kèm thành viên và tin nhắn cuối
   */
  async getByUserId(userId) {
    const conversations = await prisma.conversations.findMany({
      where: {
        is_active: true,
        conversation_members: {
          some: {
            user_id: userId,
            is_active: true,
          },
        },
      },
      include: {
        conversation_members: {
          where: {
            is_active: true,
          },
          include: {
            users: {
              select: {
                id: true,
                username: true,
                full_name: true,
                avatar: true,
                status: true,
              },
            },
          },
          orderBy: {
            joined_at: 'asc',
          },
        },
        users: {
          select: {
            id: true,
            username: true,
            full_name: true,
            avatar: true,
          },
        },
        conversation_types: {
          select: {
            id: true,
            type_code: true,
            type_name: true,
          },
        },
        messages: {
          where: {
            is_deleted: false,
          },
          take: 1,
          orderBy: {
            created_at: 'desc',
          },
          include: {
            users: {
              select: {
                id: true,
                username: true,
                full_name: true,
                avatar: true,
              },
            },
          },
        },
      },
      orderBy: {
        last_message_at: 'desc',
      },
    });

    return conversations.map((conversation) => ({
      ...conversation,
      lastMessage: conversation.messages?.[0] ?? null,
      messages: undefined,
    }));
  },

  /**
   * Kiểm tra conversation tồn tại và user thuộc conversation đó
   */
  async findByIdAndUser(conversationId, userId) {
    return prisma.conversations.findFirst({
      where: {
        id: conversationId,
        is_active: true,
        conversation_members: {
          some: {
            user_id: userId,
            is_active: true,
          },
        },
      },
      include: {
        conversation_members: {
          select: {
            user_id: true,
            role: true,
            nickname: true,
            last_read_message_id: true,
            unread_count: true,
          },
        },
        conversation_types: {
          select: {
            id: true,
            type_code: true,
            type_name: true,
          },
        },
        users: {
          select: {
            id: true,
            username: true,
            full_name: true,
            avatar: true,
          },
        },
      },
    });
  },

  /**
   * Lấy danh sách ID thành viên
   */
  async getMemberIds(conversationId) {
    const members = await prisma.conversation_members.findMany({
      where: {
        conversation_id: conversationId,
        is_active: true,
      },
      select: {
        user_id: true,
      },
    });

    return members.map((m) => m.user_id);
  },

  /**
   * Tăng số lượng tin nhắn chưa đọc cho những thành viên khác
   */
  async incrementUnreadCounts(conversationId, senderId) {
    return prisma.conversation_members.updateMany({
      where: {
        conversation_id: conversationId,
        user_id: {
          not: senderId,
        },
        is_active: true,
      },
      data: {
        unread_count: {
          increment: 1,
        },
      },
    });
  },
};

module.exports = { ConversationRepository };
