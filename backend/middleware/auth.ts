import { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';

// Extend Request type to include user data
declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        email?: string;
        role: string;
      };
    }
  }
}

// Local interface to ensure type safety within this file
interface AuthRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    role: string;
  };
}

export const verifyToken = async (req: Request, res: Response, next: NextFunction) => {
  // Use casting to handle potential type definitions mismatches
  const authHeader = (req as any).headers?.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return (res as any).status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Fetch custom claims or user data from Firestore to get Role
    const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();

    // Cast req to AuthRequest to assign user
    (req as AuthRequest).user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: userData?.role || 'user'
    };

    next();
  } catch (error) {
    console.error('Error verifying auth token', error);
    return (res as any).status(403).json({ error: 'Unauthorized: Invalid token' });
  }
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if ((req as AuthRequest).user?.role !== 'admin') {
    return (res as any).status(403).json({ error: 'Forbidden: Admins only' });
  }
  next();
};

export const checkQuota = async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  if (!authReq.user) return (res as any).status(401).json({ error: 'User not identified' });

  const db = admin.firestore();
  const userRef = db.collection('users').doc(authReq.user.uid);
  
  try {
    const doc = await userRef.get();
    if (!doc.exists) return (res as any).status(404).json({ error: 'User not found' });

    const data = doc.data();
    const now = Date.now();

    // Check reset date
    if (now > (data?.quota?.resetDate || 0)) {
        // Logic to reset quota would typically happen here or via a scheduled function
        // For middleware, we might just allow it and update async, or fail if strictly over limit
    }

    if (data?.quota?.used >= data?.quota?.total) {
      return (res as any).status(402).json({ 
        error: 'Quota Exceeded', 
        message: '您的配額已用完，請升級方案。' 
      });
    }

    next();
  } catch (error) {
    (res as any).status(500).json({ error: 'Internal Server Error' });
  }
};