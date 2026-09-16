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
          ...(dto.parentMessageId && { parent_message_id: dto.parentMessageId })
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

      let parentMessage = null;
      if (dto.parentMessageId) {
        const parent = await tx.messages.findUnique({
          where: { id: dto.parentMessageId },
          select: {
            id: true,
            content: true,
            sender_id: true,
            users: { select: { id: true, full_name: true } },
          },
        });
        if (parent) {
          parentMessage = {
            ...parent,
            content: decryptMessage(parent.content),
          };
        }
      }

      let createdAttachments = [];
      if (dto.attachments && dto.attachments.length > 0) {
        await tx.message_attachments.createMany({
          data: dto.attachments.map((att) => ({
            message_id: message.id,
            file_name: att.fileName,
            file_path: att.filePath,
            file_type: att.fileType,
            file_size: att.fileSize ? BigInt(att.fileSize) : null,
            thumbnail_path: att.thumbnailPath,
          })),
        });
        const atts = await tx.message_attachments.findMany({
          where: { message_id: message.id },
        });
        createdAttachments = atts.map((a) => ({
          ...a,
          file_size: a.file_size ? Number(a.file_size) : null,
        }));
      }

      let createdMentions = [];
      if (dto.mentionedUserIds && dto.mentionedUserIds.length > 0) {
        await tx.message_mentions.createMany({
          data: dto.mentionedUserIds.map((userId) => ({
            message_id: message.id,
            mentioned_user_id: userId,
          })),
          skipDuplicates: true,
        });
        createdMentions = await tx.message_mentions.findMany({
          where: { message_id: message.id },
          include: {
            users: {
              select: { id: true, full_name: true, avatar: true },
            },
          },
        });
      }

      return {
        ...message,
        content: dto.content, // ← trả về plain text cho socket emit (KHÔNG trả ciphertext)
        parentMessage,
        message_attachments: createdAttachments,
        message_mentions: createdMentions,
        message_reactions: [],
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
        message_attachments: {
          select: {
            id: true,
            file_name: true,
            file_path: true,
            file_type: true,
            file_size: true,
            thumbnail_path: true,
          },
        },
        message_reactions: {
          select: {
            id: true,
            user_id: true,
            reaction_type: true,
            reaction_icon: true,
            users: {
              select: { id: true, full_name: true, avatar: true },
            },
          },
        },
        message_mentions: {
          select: {
            id: true,
            mentioned_user_id: true,
            users: {
              select: { id: true, full_name: true, avatar: true },
            },
          },
        },
        messages: {
          select: {
            id: true,
            content: true,
            sender_id: true,
            users: {
              select: { id: true, full_name: true },
            },
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
      messages: data.reverse().map((msg) => {
        // Giải mã nội dung tin nhắn gốc đang được reply (nếu có)
        let parentMessage = msg.messages; // self-relation: parent message
        if (parentMessage) {
          parentMessage = {
            ...parentMessage,
            content: decryptMessage(parentMessage.content),
          };
        }
        return {
          ...msg,
          content: msg.is_deleted ? msg.content : decryptMessage(msg.content), // ← giải mã khi đọc từ DB
          parentMessage, // Đổi tên field cho FE dễ hiểu hơn
          messages: undefined, // Xóa field tên khó hiểu
          message_attachments: (msg.message_attachments || []).map((att) => ({
            ...att,
            file_size: att.file_size ? Number(att.file_size) : null,
          })),
        };
      }),
      hasMore,
      nextCursor,
    };
  },

  async editMessage(messageId, senderId, newContent) {
    const existing = await prisma.messages.findUnique({ where: { id: messageId } });
    if (!existing || existing.sender_id !== senderId) throw new Error('Not authorized or message not found');
    
    const encryptedContent = encryptMessage(newContent);
    const updated = await prisma.messages.update({
      where: { id: messageId },
      data: {
        content: encryptedContent,
        is_edited: true,
        updated_at: new Date()
      }
    });
    
    return {
      ...updated,
      content: newContent
    };
  },

  async softDeleteMessage(messageId, userId) {
    const existing = await prisma.messages.findUnique({ where: { id: messageId } });
    if (!existing || existing.sender_id !== userId) throw new Error('Not authorized or message not found');

    const updated = await prisma.messages.update({
      where: { id: messageId },
      data: {
        content: encryptMessage('[Tin nhắn đã bị thu hồi]'),
        is_deleted: true,
        deleted_at: new Date()
      }
    });

    return {
      ...updated,
      content: '[Tin nhắn đã bị thu hồi]'
    };
  },

  async findById(messageId) {
    const message = await prisma.messages.findUnique({
      where: { id: messageId },
      include: {
        users: { select: { id: true, username: true, full_name: true, avatar: true } }
      }
    });
    if (message) {
      message.content = decryptMessage(message.content);
    }
    return message;
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
