const { Router } = require('express');
const { authMiddleware } = require('../middleware/auth.middleware');
const { MemberRepository } = require('../repositories/member.repository');

// Sử dụng mergeParams để truy cập conversationId từ router cha
const router = Router({ mergeParams: true });

/**
 * Lấy danh sách thành viên của cuộc trò chuyện
 * GET /api/v1/chatbox/conversations/:conversationId/members/
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const members = await MemberRepository.getMembers(conversationId);
    
    res.status(200).json({
      success: true,
      data: members
    });
  } catch (error) {
    console.error('[MemberController] Lỗi lấy danh sách thành viên:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ nội bộ' });
  }
});

/**
 * Thêm thành viên vào cuộc trò chuyện
 * POST /api/v1/chatbox/conversations/:conversationId/members/
 * Chỉ ADMIN mới được thêm
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId, role } = req.body;
    const currentUserId = req.user.userId; // user id từ token

    if (!userId) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp userId' });
    }

    // Kiểm tra quyền ADMIN
    const isAdmin = await MemberRepository.isMemberAdmin(conversationId, currentUserId);
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Chỉ quản trị viên mới có quyền thêm thành viên' });
    }

    const newMember = await MemberRepository.addMember(conversationId, userId, role || 'MEMBER');

    res.status(201).json({
      success: true,
      message: 'Thêm thành viên thành công',
      data: newMember
    });
  } catch (error) {
    console.error('[MemberController] Lỗi thêm thành viên:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ nội bộ' });
  }
});

/**
 * Xóa thành viên khỏi cuộc trò chuyện
 * DELETE /api/v1/chatbox/conversations/:conversationId/members/:userId
 * Chỉ ADMIN mới được xóa (không tự xóa chính mình)
 */
router.delete('/:userId', authMiddleware, async (req, res) => {
  try {
    const { conversationId, userId } = req.params;
    const currentUserId = req.user.id;

    if (parseInt(userId) === currentUserId) {
      return res.status(400).json({ success: false, message: 'Không thể tự xóa bản thân bằng chức năng này' });
    }

    // Kiểm tra quyền ADMIN
    const isAdmin = await MemberRepository.isMemberAdmin(conversationId, currentUserId);
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Chỉ quản trị viên mới có quyền xóa thành viên' });
    }

    await MemberRepository.removeMember(conversationId, userId);

    res.status(200).json({
      success: true,
      message: 'Xóa thành viên thành công'
    });
  } catch (error) {
    console.error('[MemberController] Lỗi xóa thành viên:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ nội bộ' });
  }
});

/**
 * Cập nhật vai trò thành viên
 * PUT /api/v1/chatbox/conversations/:conversationId/members/:userId/role
 * Chỉ ADMIN mới được cập nhật
 */
router.put('/:userId/role', authMiddleware, async (req, res) => {
  try {
    const { conversationId, userId } = req.params;
    const { role } = req.body;
    const currentUserId = req.user.id;

    if (!role) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp role mới' });
    }

    // Kiểm tra quyền ADMIN
    const isAdmin = await MemberRepository.isMemberAdmin(conversationId, currentUserId);
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Chỉ quản trị viên mới có quyền cập nhật vai trò' });
    }

    const updatedMember = await MemberRepository.updateRole(conversationId, userId, role);

    res.status(200).json({
      success: true,
      message: 'Cập nhật vai trò thành công',
      data: updatedMember
    });
  } catch (error) {
    console.error('[MemberController] Lỗi cập nhật vai trò:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ nội bộ' });
  }
});

module.exports = router;
