
import { db, isMock } from './firebase';
import { getCurrentUser } from './authService';
import { QueueState } from '../types';

// --- Configuration ---
const MAX_CONCURRENCY = 3; // 只允許 3 個請求同時進行
const QUEUE_COLLECTION = 'api_queue';
const QUEUE_TIMEOUT_MS = 60 * 1000 * 5; // 5分鐘後過期

// --- Internal State ---
let activeListener: (() => void) | null = null;
let currentQueueState: QueueState = {
    isQueuing: false,
    position: 0,
    totalWaiting: 0,
    currentAction: ''
};
const subscribers: ((state: QueueState) => void)[] = [];

// --- Helpers ---
const notifySubscribers = () => {
    subscribers.forEach(cb => cb({ ...currentQueueState }));
};

export const subscribeToQueue = (callback: (state: QueueState) => void) => {
    subscribers.push(callback);
    callback({ ...currentQueueState });
    return () => {
        const idx = subscribers.indexOf(callback);
        if (idx > -1) subscribers.splice(idx, 1);
    };
};

/**
 * Main function to wrap API calls with Queue logic
 */
export const executeWithQueue = async <T>(
    actionName: string, 
    apiCall: () => Promise<T>
): Promise<T> => {
    if (isMock) {
        currentQueueState = { isQueuing: true, position: 1, totalWaiting: 1, currentAction: actionName };
        notifySubscribers();
        await new Promise(r => setTimeout(r, 1500));
        currentQueueState = { isQueuing: false, position: 0, totalWaiting: 0, currentAction: '' };
        notifySubscribers();
        return apiCall();
    }

    const user = getCurrentUser();
    const userId = user ? user.uid : 'guest_' + Date.now();
    
    // --- 🛡️ Defensive Try-Catch Block ---
    try {
        // 1. Create Ticket
        const ticketData = {
            userId,
            action: actionName,
            createdAt: Date.now(),
            expiresAt: Date.now() + QUEUE_TIMEOUT_MS,
            status: 'waiting'
        };
        
        const docRef = await db.collection(QUEUE_COLLECTION).add(ticketData);
        
        // 2. Start Listening
        currentQueueState = { isQueuing: true, position: 99, totalWaiting: 99, currentAction: actionName };
        notifySubscribers();

        return new Promise<T>((resolve, reject) => {
            const cleanup = () => {
                if (activeListener) { activeListener(); activeListener = null; }
                docRef.delete().catch(() => {});
                currentQueueState = { isQueuing: false, position: 0, totalWaiting: 0, currentAction: '' };
                notifySubscribers();
            };

            // SIMPLIFIED QUERY: Only use 'orderBy' on single field to avoid "Requires Index" error.
            // Filter 'expiresAt' in memory inside onSnapshot.
            activeListener = db.collection(QUEUE_COLLECTION)
                .orderBy('createdAt', 'asc')
                .onSnapshot(async (snapshot: any) => {
                    const allDocs = snapshot.docs;
                    const now = Date.now();
                    
                    // In-Memory Filtering for Expiry
                    const validDocs = allDocs.filter((d: any) => {
                        const data = d.data();
                        return data.expiresAt > now;
                    });

                    const myIndex = validDocs.findIndex((d: any) => d.id === docRef.id);
                    
                    if (myIndex === -1) {
                        // Ticket might be lost or expired, or not yet synced.
                        // If it was just added, it should be there.
                        // Wait a bit or fallback.
                        // For robustness, if we can't find ourselves but we just added it, we assume transient issue.
                        // But let's fail safe to direct execution if we are "lost" for too long.
                        // For now, cleanup and fallback.
                        cleanup();
                        // resolve(apiCall()); // Auto-fallback instead of error
                        // return;
                        
                        // Strict mode:
                        reject(new Error("Queue ticket lost (Sync Error)."));
                        return;
                    }

                    currentQueueState = { 
                        isQueuing: true, 
                        position: myIndex + 1, 
                        totalWaiting: validDocs.length, 
                        currentAction: actionName 
                    };
                    notifySubscribers();

                    if (myIndex < MAX_CONCURRENCY) {
                        if (activeListener) { activeListener(); activeListener = null; }
                        try {
                            const result = await apiCall();
                            resolve(result);
                        } catch (e) {
                            reject(e);
                        } finally {
                            cleanup();
                        }
                    }
                }, (error: any) => {
                    // Check for Index Error specifically
                    if (error.message.includes('requires an index')) {
                        console.warn("[Queue System] Index missing. Bypassing queue to keep app running.");
                    } else {
                        console.error("[Queue System] Listener Error:", error);
                    }
                    
                    if (activeListener) { activeListener(); activeListener = null; }
                    cleanup();
                    // Fallback to direct execution
                    apiCall().then(resolve).catch(reject);
                });
        });
    } catch (e: any) {
        console.warn("[Queue System] Write failed (Permission/Network), executing directly.");
        return apiCall();
    }
};
