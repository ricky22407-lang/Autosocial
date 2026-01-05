
import { Request, Response, NextFunction } from 'express';
import { ResponseBuilder } from '../../core/apiResponse';
import { MembershipService } from '../membership/membership.service';
import { Config } from '../../config/env';

export class AuthController {
  static async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      const uid = (req as any).user.uid;
      // In real scenario, we'd inject service
      const db = new MembershipService(); 
      // Simplified: assume we get user data
      ResponseBuilder.success(res, { uid, message: "User Profile" });
    } catch (err) {
      next(err);
    }
  }

  static async exchangeThreads(req: Request, res: Response, next: NextFunction) {
    try {
        const { code, redirectUri } = (req as any).body;
        
        // SECURITY FIX: Read credentials from Server Config (Env Vars)
        // Never trust client-provided secrets
        const clientId = Config.THREADS.APP_ID;
        const clientSecret = Config.THREADS.APP_SECRET;

        if (!clientId || !clientSecret) {
            return ResponseBuilder.error(res, "Server Configuration Error: Missing Threads App Credentials.", 'SYS_001' as any, 500);
        }
        
        if (!code || !redirectUri) {
            return ResponseBuilder.error(res, "Missing code or redirectUri", 'AUTH_002' as any, 400);
        }

        // 1. Exchange Code for Short Token
        const params = new URLSearchParams();
        params.append('client_id', clientId);
        params.append('client_secret', clientSecret);
        params.append('grant_type', 'authorization_code');
        params.append('redirect_uri', redirectUri);
        params.append('code', code);

        const tokenRes = await fetch('https://graph.threads.net/oauth/access_token', {
            method: 'POST',
            body: params
        });
        
        const tokenData = await tokenRes.json();
        if (tokenData.error) {
            throw new Error(`Meta API Error (Step 1): ${tokenData.error.message}`);
        }
        
        const shortToken = tokenData.access_token;
        const userId = tokenData.user_id;

        // 2. Exchange for Long Token
        const longTokenUrl = `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${clientSecret}&access_token=${shortToken}`;
        const longRes = await fetch(longTokenUrl);
        const longData = await longRes.json();
        
        if (longData.error) {
             throw new Error(`Meta API Error (Step 2): ${longData.error.message}`);
        }
        
        const longToken = longData.access_token;

        // 3. Get Username (Optional, but good for UI)
        let username = 'Unknown';
        try {
            const userRes = await fetch(`https://graph.threads.net/v1.0/me?fields=id,username,name&access_token=${longToken}`);
            const userData = await userRes.json();
            if (userData.username) username = userData.username;
        } catch (e) {
            console.warn("Failed to fetch username", e);
        }

        ResponseBuilder.success(res, {
            token: longToken,
            userId: userId,
            username: username
        });

    } catch(e: any) {
        next(e);
    }
  }
}