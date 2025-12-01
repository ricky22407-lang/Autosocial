
import express, { ErrorRequestHandler, RequestHandler } from 'express';
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
app.use(cors({ origin: true }) as any);
app.use(express.json() as any);

// --- ROUTES (Modular) ---

// Auth Module
const authRouter = express.Router();
// Fix: Cast handlers to any to resolve RequestHandler type mismatch errors
authRouter.get('/me', isAuthenticated as any, AuthController.getMe as any);
app.use('/api/auth', authRouter as any);

// Content Module
const contentRouter = express.Router();
// Fix: Cast handlers to any to resolve RequestHandler type mismatch errors
contentRouter.post('/draft', isAuthenticated as any, ContentController.generateDraft as any);
contentRouter.post('/image', isAuthenticated as any, ContentController.generateImage as any);
app.use('/api/content', contentRouter as any);

// Automation Module
const automationRouter = express.Router();
const scheduler = new SchedulerService();
// Fix: Cast handlers to any to resolve RequestHandler type mismatch errors
automationRouter.post('/trigger', isAuthenticated as any, (async (req, res, next) => {
    try {
        // Simplified trigger
        const uid = (req as any).user.uid;
        const { settings } = req.body;
        const result = await scheduler.triggerAutoPilot(uid, settings);
        ResponseBuilder.success(res, result);
    } catch (e) {
        next(e);
    }
}) as any);
app.use('/api/automation', automationRouter as any);

// Global Error Handler (Must be last)
app.use(errorHandler as any);

const PORT = Config.PORT;
app.listen(PORT, () => {
  console.log(`Modular Server running on port ${PORT} [${Config.ENV}]`);
});

export default app;
