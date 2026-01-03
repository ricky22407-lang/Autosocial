
import { db, isMock } from './firebase';
import { getCurrentUser } from './authService';
import { QueueState } from '../types';

const MAX_CONCURRENCY = 3; 
const QUEUE_COLLECTION = 'api_queue';
const QUEUE_TIMEOUT_MS = 60 * 1000 * 5; 

let activeListener: (() => void) | null = null;
let currentQueueState: QueueState = {
    isQueuing: false, 
    position: 0, 
    totalWaiting: 0,
    currentAction: ''
};
const subscribers: ((state: QueueState) => void)[] = [];

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
 * 商業化修正：不再提供無限循環的 99 人模擬
 */
export const executeWithQueue = async <T>(
    actionName: string, 
    apiCall: () => Promise<T>
): Promise<T> => {
    // 如果是 Mock 或開發模式，直接執行，不進入排隊 UI
    if (isMock) {
        return apiCall();
    }

    const user = getCurrentUser();
    const userId = user ? user.uid : 'anonymous';
    
    let docRef: any;
    try {
        // 嘗試在 Firestore 建立排隊票券
        docRef = await db.collection(QUEUE_COLLECTION).add({
            userId,
            action: actionName,
            createdAt: Date.now(),
            expiresAt: Date.now() + QUEUE_TIMEOUT_MS,
            status: 'waiting'
        });
    } catch (e: any) {
        console.warn("[Queue] 無法建立隊列票券，切換至併發模式:", e.message);
        return apiCall(); // 降級處理：直接執行
    }
    
    // 初始化 UI 狀態：從 1 開始而非 99
    currentQueueState = { isQueuing: true, position: 1, totalWaiting: 1, currentAction: actionName };
    notifySubscribers();

    return new Promise<T>((resolve, reject) => {
        const cleanup = () => {
            if (activeListener) { activeListener(); activeListener = null; }
            docRef.delete().catch(() => {}); 
            currentQueueState = { isQueuing: false, position: 0, totalWaiting: 0, currentAction: '' };
            notifySubscribers();
        };

        // 監聽排隊狀況
        activeListener = db.collection(QUEUE_COLLECTION)
            .where('expiresAt', '>', Date.now()) 
            .orderBy('createdAt', 'asc') 
            .onSnapshot(async (snapshot: any) => {
                const allDocs = snapshot.docs;
                const myIndex = allDocs.findIndex((d: any) => d.id === docRef.id);
                
                if (myIndex === -1) {
                    cleanup();
                    apiCall().then(resolve).catch(reject);
                    return;
                }

                // 更新 UI 上的排隊名次
                currentQueueState = { 
                    isQueuing: true, 
                    position: myIndex + 1, 
                    totalWaiting: allDocs.length, 
                    currentAction: actionName 
                };
                notifySubscribers();

                // 如果輪到自己（名次小於併發限制）
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
                console.error("[Queue] 監聽異常，強制執行:", error.message);
                cleanup();
                apiCall().then(resolve).catch(reject);
            });
    });
};
