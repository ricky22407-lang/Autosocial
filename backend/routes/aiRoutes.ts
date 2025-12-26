
import { Router } from 'express';
import { verifyToken, checkQuota } from '../middleware/auth';
import { ContentController } from '../modules/content/content.controller';

const router = Router();

// POST /api/ai/draft - Generate Post Draft
router.post('/draft', verifyToken, checkQuota, ContentController.generateDraft);

// POST /api/ai/image - Generate Image
router.post('/image', verifyToken, checkQuota, ContentController.generateImage);

// POST /api/ai/video - Generate Video
// (Logic would also be moved to controller in full implementation)
router.post('/video', verifyToken, checkQuota, async (req, res, next) => {
    // For now, keeping inline as placeholder or move to controller similarly
    res.status(501).json({ error: "Video route migrated to controller." });
});

export default router;
