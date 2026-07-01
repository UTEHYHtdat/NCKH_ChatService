const prisma = require('../config/prisma');
// AES encryption disabled for now so messages are stored and returned in plain text.
// To enable encryption later, uncomment the import and the encrypt/decrypt calls below.
// const { encryptMessage, decryptMessage } = require('../utils/encrypition');

const MESSAGE_PAGE_SIZE = 30;

const MessageRepository = {
  /**
   * Lưu tin nhắn (plain text cho test trước)
   */
  async create(dto) {
    // Plain text storage: không mã hóa
    // const encrypted = encryptMessage(dto.content);

    const message = await prisma.messages.create({
      data: {
        conversation_id: dto.conversationId,
        sender_id: dto.senderId,
        message_type_id: dto.messageTypeId || 1, // 1 = TEXT
        content: dto.content,
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
    });

    // cập nhật thời gian có tin nhắn cuối
    await prisma.conversations.update({
      where: {
        id: dto.conversationId,
      },
      data: {
        last_message_at: new Date(),
      },
    });

    return {
      ...message,
      content: dto.content,
    };
  },

  /**
   * Lấy tin nhắn gần nhất
   */
  async getRecent(conversationId, cursor) {
    const messages = await prisma.messages.findMany({
      where: {
        conversation_id: conversationId,
        is_deleted: false,
      },

      take: MESSAGE_PAGE_SIZE,

      ...(cursor
        ? {
            skip: 1,
            cursor: {
              id: cursor,
            },
          }
        : {}),

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

        message_read_status: {
          select: {
            user_id: true,
            read_at: true,
          },
        },
      },
    });

    return messages.reverse().map((msg) => ({
      ...msg,
      // Plain text mode: trả về trực tiếp content mà không giải mã
      content: msg.content,
    }));
  },

  /**
   * Đánh dấu một tin nhắn đã đọc
   */
  async markAsRead(messageId, userId) {
    return prisma.message_read_status.upsert({
      where: {
        message_id_user_id: {
          message_id: messageId,
          user_id: userId,
        },
      },

      create: {
        message_id: messageId,
        user_id: userId,
      },

      update: {
        read_at: new Date(),
      },
    });
  },

  /**
   * Đánh dấu toàn bộ cuộc trò chuyện đã đọc
   */
  async markConversationAsRead(conversationId, userId) {
    const unread = await prisma.messages.findMany({
      where: {
        conversation_id: conversationId,

        sender_id: {
          not: userId,
        },

        message_read_status: {
          none: {
            user_id: userId,
          },
        },

        is_deleted: false,
      },

      select: {
        id: true,
      },
    });

    if (!unread.length) return;

    await prisma.message_read_status.createMany({
      data: unread.map((m) => ({
        message_id: m.id,
        user_id: userId,
      })),

      skipDuplicates: true,
    });
  },
};

module.exports = {
  MessageRepository,
};
