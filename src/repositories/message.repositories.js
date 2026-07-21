const prisma = require('../config/prisma');
const { encryptMessage, decryptMessage } = require('../utils/encryption');

// Mã hóa AES-256 đã được BẬT:
// - Mọi tin nhắn được mã hóa TRƯỚC khi lưu vào DB
// - Mọi tin nhắn được giải mã SAU khi đọc từ DB
// - Client luôn nhận/gửi plain text — encryption hoàn toàn trong suốt

const MESSAGE_PAGE_SIZE = 30;

const MessageRepository = {
  /**
   * Lưu tin nhắn và cập nhật last_message_at trong 1 transaction
   * đảm bảo data consistency — nếu 1 trong 2 fail thì rollback hết
   */
  async create(dto) {
    // Mã hóa nội dung trước khi lưu vào DB
    const encryptedContent = encryptMessage(dto.content);

    return prisma.$transaction(async (tx) => {
      const message = await tx.messages.create({
        data: {
          conversation_id: dto.conversationId,
          sender_id: dto.senderId,
          message_type_id: dto.messageTypeId || 1, // 1 = TEXT
          content: encryptedContent, // ← lưu bản MÃ HÓA vào DB
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

      // Cập nhật thời gian tin nhắn cuối trong cùng transaction
      await tx.conversations.update({
        where: { id: dto.conversationId },
        data: { last_message_at: new Date() },
      });

      return {
        ...message,
        content: dto.content, // ← trả về plain text cho socket emit (KHÔNG trả ciphertext)
      };
    });
  },

  /**
   * Lấy tin nhắn gần nhất với cursor-based pagination
   * Trả về: { messages, hasMore, nextCursor }
   */
  async getRecent(conversationId, cursor) {
    // Lấy thêm 1 record để detect hasMore
    const fetchSize = MESSAGE_PAGE_SIZE + 1;

    const messages = await prisma.messages.findMany({
      where: {
        conversation_id: conversationId,
        is_deleted: false,
      },

      take: fetchSize,

      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),

      orderBy: { created_at: 'desc' },

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

    const hasMore = messages.length > MESSAGE_PAGE_SIZE;
    const data = hasMore ? messages.slice(0, MESSAGE_PAGE_SIZE) : messages;

    // nextCursor là id của tin nhắn cũ nhất trong batch hiện tại
    // Client dùng cursor này để load batch tiếp theo
    const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;

    return {
      messages: data.reverse().map((msg) => ({
        ...msg,
        content: decryptMessage(msg.content), // ← giải mã khi đọc từ DB
      })),
      hasMore,
      nextCursor,
    };
  },

  /**
   * Đánh dấu một tin nhắn đã đọc (cho sender khi vừa gửi)
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
   * Đánh dấu toàn bộ cuộc trò chuyện đã đọc và reset unread_count về 0
   */
  async markConversationAsRead(conversationId, userId) {
    // Lấy tin nhắn chưa đọc của user này
    const unread = await prisma.messages.findMany({
      where: {
        conversation_id: conversationId,
        sender_id: { not: userId },
        message_read_status: {
          none: { user_id: userId },
        },
        is_deleted: false,
      },
      select: { id: true },
      orderBy: { id: 'desc' },
    });

    // Lấy id tin nhắn mới nhất để cập nhật last_read_message_id
    const latestMessageId = unread.length > 0 ? unread[0].id : null;

    if (unread.length > 0) {
      await prisma.message_read_status.createMany({
        data: unread.map((m) => ({
          message_id: m.id,
          user_id: userId,
        })),
        skipDuplicates: true,
      });
    }

    // Reset unread_count về 0 và cập nhật last_read_message_id
    await prisma.conversation_members.updateMany({
      where: {
        conversation_id: conversationId,
        user_id: userId,
      },
      data: {
        unread_count: 0,
        ...(latestMessageId && { last_read_message_id: latestMessageId }),
      },
    });
  },
};

module.exports = { MessageRepository };
