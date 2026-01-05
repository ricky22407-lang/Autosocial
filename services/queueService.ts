
import { db, isMock } from './firebase';
import { getCurrentUser } from './authService';
import { QueueState } from '../types';

// --- Configuration ---
const MAX_CONCURRENCY = 3; // 只允許 3 個請求同時進行 (依據後端 Key 的數量調整)
const QUEUE_COLLECTION = 'api_queue';
const QUEUE_TIMEOUT_MS = 60 * 1000 * 5; // 5分鐘後過期 (防止殭屍請求)

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
    callback({ ...currentQueueState }); // Immediate update
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
        // Mock mode: simulate short delay
        currentQueueState = { isQueuing: true, position: 1, totalWaiting: 1, currentAction: actionName };
        notifySubscribers();
        await new Promise(r => setTimeout(r, 1500));
        currentQueueState = { isQueuing: false, position: 0, totalWaiting: 0, currentAction: '' };
        notifySubscribers();
        return apiCall();
    }

    const user = getCurrentUser();
    const userId = user ? user.uid : 'guest_' + Date.now();
    
    // 1. Create Ticket
    const ticketData = {
        userId,
        action: actionName,
        createdAt: Date.now(),
        expiresAt: Date.now() + QUEUE_TIMEOUT_MS,
        status: 'waiting'
    };
    
    const docRef = await db.collection(QUEUE_COLLECTION).add(ticketData);
    
    // 2. Start Listening to Queue
    currentQueueState = { isQueuing: true, position: 99, totalWaiting: 99, currentAction: actionName };
    notifySubscribers();

    return new Promise<T>((resolve, reject) => {
        // Define cleanup
        const cleanup = () => {
            if (activeListener) { activeListener(); activeListener = null; }
            docRef.delete().catch(() => {}); // Clean up ticket
            currentQueueState = { isQueuing: false, position: 0, totalWaiting: 0, currentAction: '' };
            notifySubscribers();
        };

        // Listen logic
        activeListener = db.collection(QUEUE_COLLECTION)
            .where('expiresAt', '>', Date.now()) // Filter out expired zombies
            .orderBy('expiresAt') // Required for inequality filter
            .orderBy('createdAt', 'asc') // FIFO
            .onSnapshot(async (snapshot: any) => {
                const allDocs = snapshot.docs;
                const myIndex = allDocs.findIndex((d: any) => d.id === docRef.id);
                
                if (myIndex === -1) {
                    // Document disappeared (maybe expired or deleted)
                    cleanup();
                    reject(new Error("Queue ticket lost or expired."));
                    return;
                }

                // Update UI State
                currentQueueState = { 
                    isQueuing: true, 
                    position: myIndex + 1, 
                    totalWaiting: allDocs.length, 
                    currentAction: actionName 
                };
                notifySubscribers();

                // 3. Check Concurrency Lock
                // If I am within the top MAX_CONCURRENCY items, I can go.
                if (myIndex < MAX_CONCURRENCY) {
                    // Stop listening so we don't trigger again
                    if (activeListener) { activeListener(); activeListener = null; }
                    
                    // Mark as processing (Optional metadata update)
                    // await docRef.update({ status: 'processing' }); 

                    // EXECUTE API
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
                console.error("Queue Listener Error:", error);
                cleanup();
                reject(error);
            });
    });
};
