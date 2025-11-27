


import { Request, Response, NextFunction } from 'express';
import { ContentService } from './content.service';
import { MembershipService } from '../membership/membership.service';
import { ResponseBuilder } from '../../core/apiResponse';

const contentService = new ContentService();
const membershipService = new MembershipService();

export class ContentController {
  static async generateDraft(req: Request, res: Response, next: NextFunction) {
    try {
      const uid = (req as any).user.uid;
      
      // 1. Check & Deduct Quota
      await membershipService.deductQuota(uid, 1);
      
      // 2. Generate
      const { topic, brand, length } = (req as any).body;
      const result = await contentService.generateDraft(topic, brand, length);
      
      ResponseBuilder.success(res, result);
    } catch (err) {
      next(err);
    }
  }

  static async generateImage(req: Request, res: Response, next: NextFunction) {
    try {
        const uid = (req as any).user.uid;
        await membershipService.deductQuota(uid, 1);
        
        const { prompt } = (req as any).body;
        const url = await contentService.generateImage(prompt);
        
        ResponseBuilder.success(res, { url });
    } catch (err) {
        next(err);
    }
  }
}