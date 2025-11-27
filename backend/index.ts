

import express, { ErrorRequestHandler } from 'express';
import cors from 'cors';
import * as admin from 'firebase-admin';
import { Config } from './config/env';
import { errorHandler } from './middlewares/errorHandler';
import { isAuthenticated } from './modules/auth/auth.middleware';

// Module Controllers (Routes would usually be in separate files)
import { AuthController } from './modules/auth/auth.controller';
import { ContentController } from './modules/content/content.controller';
import { SchedulerService } from './modules/automation/scheduler.service';
import { ResponseBuilder } from './core/apiResponse';

// Initialize Firebase
if (!admin.apps.length) {
  admin.initializeApp({
      credential: admin.credential.cert({
          projectId: Config.FIREBASE.PROJECT_ID,
          clientEmail: Config.FIREBASE.CLIENT_EMAIL,
          privateKey: Config.FIREBASE.PRIVATE_KEY
      })
  });
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// --- ROUTES (Modular) ---

// Auth Module
const authRouter = express.Router();
authRouter.get('/me', isAuthenticated, AuthController.getMe);
app.use('/api/auth', authRouter as any);

// Content Module
const contentRouter = express.Router();
contentRouter.post('/draft', isAuthenticated, ContentController.generateDraft);
contentRouter.post('/image', isAuthenticated, ContentController.generateImage);
app.use('/api/content', contentRouter as any);

// Automation Module
const automationRouter = express.Router();
const scheduler = new SchedulerService();
automationRouter.post('/trigger', isAuthenticated, async (req, res, next) => {
    try {
        // Simplified trigger
        const uid = (req as any).user.uid;
        const { settings } = req.body;
        const result = await scheduler.triggerAutoPilot(uid, settings);
        ResponseBuilder.success(res, result);
    } catch (e) {
        next(e);
    }
});
app.use('/api/automation', automationRouter as any);

// Global Error Handler (Must be last)
app.use(errorHandler as any);

const PORT = Config.PORT;
app.listen(PORT, () => {
  console.log(`Modular Server running on port ${PORT} [${Config.ENV}]`);
});

export default app;