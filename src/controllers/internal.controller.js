const { Router } = require('express');
const prisma = require('../config/prisma');

const router = Router();

// ─── Internal API Key Middleware ────────────────────────────────────────────
// Bảo vệ internal endpoints khỏi bị gọi từ bên ngoài
// ThesisService gửi key này trong header x-internal-key
function requireInternalKey(req, res, next) {
  const key = req.headers['x-internal-key'];
  const expectedKey = process.env.INTERNAL_API_KEY;

  if (!expectedKey) {
    console.error('[Internal] INTERNAL_API_KEY chưa được cấu hình trong .env');
    return res.status(500).json({ message: 'Internal API key not configured' });
  }

  if (key !== expectedKey) {
    return res.status(403).json({ message: 'Invalid internal API key' });
  }

  next();
}

/**
 * POST /api/v1/chatbox/internal/conversations
 *
 * Được gọi bởi ThesisService khi đề tài được duyệt xong (cả instructor + department head).
 * Tạo group conversation và thêm tất cả members.
 *
 * Body:
 * {
 *   thesisId: number,
 *   conversationName: string,      // VD: "Nhóm đề tài: Xây dựng hệ thống chat"
 *   createdByUserId: number,       // user_id của instructor (người tạo group)
 *   memberUserIds: number[],       // [userId1, userId2, ...] — sinh viên + giảng viên
 *   conversationTypeCode: string   // "THESIS_GROUP" (sẽ tạo nếu chưa có)
 * }
 */
router.post('/conversations', requireInternalKey, async (req, res) => {
  const { thesisId, conversationName, createdByUserId, memberUserIds, conversationTypeCode } = req.body;

  // Validate input
  if (!thesisId || !createdByUserId || !Array.isArray(memberUserIds) || memberUserIds.length === 0) {
    return res.status(400).json({
      message: 'Thiếu thông tin: thesisId, createdByUserId, memberUserIds là bắt buộc',
    });
  }

  try {
    // Kiểm tra conversation cho thesis này đã tồn tại chưa (tránh tạo 2 lần)
    const existing = await prisma.conversations.findFirst({
      where: { thesis_id: thesisId, is_active: true },
      select: { id: true },
    });

    if (existing) {
      return res.status(409).json({
        message: 'Group chat cho đề tài này đã tồn tại',
        conversationId: existing.id,
      });
    }

    // Lấy hoặc tạo conversation_type cho THESIS_GROUP
    const typeCode = conversationTypeCode || 'THESIS_GROUP';
    let convType = await prisma.conversation_types.findUnique({
      where: { type_code: typeCode },
    });

    if (!convType) {
      convType = await prisma.conversation_types.create({
        data: {
          type_code: typeCode,
          type_name: 'Nhóm đề tài',
          description: 'Nhóm chat dành cho các thành viên của một đề tài khóa luận',
          status: true,
        },
      });
    }

    // Tạo conversation + members trong 1 transaction
    const conversation = await prisma.$transaction(async (tx) => {
      // Tạo conversation
      const conv = await tx.conversations.create({
        data: {
          conversation_type_id: convType.id,
          conversation_name: conversationName || `Nhóm đề tài #${thesisId}`,
          created_by_id: createdByUserId,
          thesis_id: thesisId,
          is_active: true,
        },
      });

      // Lọc userId hợp lệ (phải tồn tại trong bảng users)
      const uniqueIds = [...new Set(memberUserIds.map(Number))];

      // Thêm tất cả members vào conversation
      await tx.conversation_members.createMany({
        data: uniqueIds.map((userId, idx) => ({
          conversation_id: conv.id,
          user_id: userId,
          // Người tạo (instructor) là ADMIN của nhóm, còn lại là MEMBER
          role: userId === createdByUserId ? 'ADMIN' : 'MEMBER',
          is_active: true,
          unread_count: 0,
        })),
        skipDuplicates: true,
      });

      return conv;
    });

    console.log(`[Internal] ✅ Tạo group chat thành công cho thesis #${thesisId} → conversation #${conversation.id}`);

    return res.status(201).json({
      success: true,
      conversationId: conversation.id,
      thesisId,
      memberCount: memberUserIds.length,
    });
  } catch (err) {
    console.error('[Internal] Lỗi tạo group conversation:', err);
    return res.status(500).json({
      message: 'Không thể tạo group conversation',
      error: err.message,
    });
  }
});

/**
 * GET /api/v1/chatbox/internal/conversations/thesis/:thesisId
 * Lấy conversation của thesis (để ThesisService kiểm tra)
 */
router.get('/conversations/thesis/:thesisId', requireInternalKey, async (req, res) => {
  const thesisId = parseInt(req.params.thesisId, 10);

  if (isNaN(thesisId)) {
    return res.status(400).json({ message: 'Invalid thesisId' });
  }

  try {
    const conversation = await prisma.conversations.findFirst({
      where: { thesis_id: thesisId, is_active: true },
      include: {
        conversation_members: {
          where: { is_active: true },
          select: { user_id: true, role: true },
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({ message: 'Chưa có group chat cho đề tài này' });
    }

    return res.json({ success: true, conversation });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

module.exports = router;
