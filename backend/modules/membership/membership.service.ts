import * as admin from 'firebase-admin';
import { AppError } from '../../core/appError';
import { ErrorCode, UserRole } from '../../../types';
import { Config } from '../../config/env';

export class MembershipService {
  private db = admin.firestore();
  private usersCollection = this.db.collection('users');

  async checkQuota(userId: string): Promise<boolean> {
    const doc = await this.usersCollection.doc(userId).get();
    if (!doc.exists) throw new AppError('User not found', 404, ErrorCode.NOT_FOUND);

    const data = doc.data();
    if (data?.isSuspended) throw new AppError('Account suspended', 403, ErrorCode.FORBIDDEN);

    // Reset logic could go here or in a separate Cron job
    const now = Date.now();
    if (data?.quota?.resetDate && now > data.quota.resetDate) {
      await this.resetQuota(userId, data.role as UserRole);
      return true;
    }

    if (data?.quota?.used >= data?.quota?.total) {
      return false;
    }
    return true;
  }

  async deductQuota(userId: string, amount = 1): Promise<void> {
    const hasQuota = await this.checkQuota(userId);
    if (!hasQuota) {
      throw new AppError('Quota exceeded', 402, ErrorCode.QUOTA_EXCEEDED);
    }

    await this.usersCollection.doc(userId).update({
      'quota.used': admin.firestore.FieldValue.increment(amount),
      updatedAt: Date.now()
    });
  }

  async resetQuota(userId: string, role: UserRole): Promise<void> {
    let total = Config.APP.DEFAULT_QUOTA_USER;
    if (role === 'starter') total = 500;
    if (role === 'pro') total = Config.APP.DEFAULT_QUOTA_PRO;
    if (role === 'business') total = Config.APP.DEFAULT_QUOTA_VIP;

    const nextReset = new Date();
    nextReset.setMonth(nextReset.getMonth() + 1);
    nextReset.setDate(1);

    await this.usersCollection.doc(userId).update({
      'quota.used': 0,
      'quota.total': total,
      'quota.resetDate': nextReset.getTime()
    });
  }
}