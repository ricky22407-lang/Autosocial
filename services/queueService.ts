
import { db, isMock } from './firebase';
import { getCurrentUser } from './authService';
import { QueueState } from '../types';

// --- Configuration ---
const MAX_CONCURRENCY = 3; 
const QUEUE_COLLECTION = 'api_queue';
const QUEUE_TIMEOUT_MS = 60 * 1000 * 5; 

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
        await new Promise(r => setTimeout(r, 1000));
        currentQueueState = { isQueuing: false, position: 0, totalWaiting: 0, currentAction: '' };
        notifySubscribers();
        return apiCall();
    }

    const user = getCurrentUser();
    const userId = user ? user.uid : 'guest_' + Date.now();
    
    // SAFETY CHECK: Attempt to create queue ticket. If permissions fail, bypass queue.
    let docRef: any;
    try {
        docRef = await db.collection(QUEUE_COLLECTION).add({
            userId,
            action: actionName,
            createdAt: Date.now(),
            expiresAt: Date.now() + QUEUE_TIMEOUT_MS,
            status: 'waiting'
        });
    } catch (e: any) {
        console.warn("Queue permission denied. Bypassing queue for this request.", e.message);
        // Fallback: Direct Call
        return apiCall();
    }
    
    currentQueueState = { isQueuing: true, position: 99, totalWaiting: 99, currentAction: actionName };
    notifySubscribers();

    return new Promise<T>((resolve, reject) => {
        const cleanup = () => {
            if (activeListener) { activeListener(); activeListener = null; }
            docRef.delete().catch(() => {}); 
            currentQueueState = { isQueuing: false, position: 0, totalWaiting: 0, currentAction: '' };
            notifySubscribers();
        };

        activeListener = db.collection(QUEUE_COLLECTION)
            .where('expiresAt', '>', Date.now()) 
            .orderBy('expiresAt') 
            .orderBy('createdAt', 'asc') 
            .onSnapshot(async (snapshot: any) => {
                const allDocs = snapshot.docs;
                const myIndex = allDocs.findIndex((d: any) => d.id === docRef.id);
                
                if (myIndex === -1) {
                    cleanup();
                    // If my ticket is gone, maybe it was deleted by cleanup or expired. 
                    // To be safe, just try calling it once.
                    apiCall().then(resolve).catch(reject);
                    return;
                }

                currentQueueState = { 
                    isQueuing: true, 
                    position: myIndex + 1, 
                    totalWaiting: allDocs.length, 
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
                console.warn("Queue Snapshot Error (Permissions/Index):", error.message);
                // Fallback on listener error
                if (activeListener) { activeListener(); activeListener = null; }
                apiCall().then(resolve).catch(reject).finally(cleanup);
            });
    });
};
