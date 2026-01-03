
import { db, firebase, isMock } from '../firebase';
import { executeWithQueue } from '../queueService';

// #region Types & Constants

export const Type = {
  STRING: 'STRING',
  NUMBER: 'NUMBER',
  INTEGER: 'INTEGER',
  BOOLEAN: 'BOOLEAN',
  ARRAY: 'ARRAY',
  OBJECT: 'OBJECT'
} as const;

const CACHE_TTL = 12 * 60 * 60 * 1000;

// #endregion

// #region Utilities

export const cleanJsonText = (text: string): string => {
    if (!text) return '{}';
    let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const firstOpen = clean.search(/[\{\[]/);
    const lastCloseCurly = clean.lastIndexOf('}');
    const lastCloseSquare = clean.lastIndexOf(']');
    const lastClose = Math.max(lastCloseCurly, lastCloseSquare);
    if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
        clean = clean.substring(firstOpen, lastClose + 1);
    }
    return clean;
};

export const decodeHtml = (html: string) => {
    try {
        if (typeof document === 'undefined') return html;
        const txt = document.createElement("textarea");
        txt.innerHTML = html;
        return txt.value;
    } catch (e) { return html; }
};

export const shuffleArray = <T,>(array: T[]): T[] => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

export const trackApiLoad = async () => {
    if (isMock) return;
    try {
        // SAFETY: Only try to update if possible, fail silently if no permission
        const randomSlot = Math.floor(Math.random() * 5) + 1;
        const keyField = `key_${randomSlot}`;
        await db.collection('system_stats').doc('api_usage').set({
            [keyField]: firebase.firestore.FieldValue.increment(1),
            total_calls: firebase.firestore.FieldValue.increment(1),
            last_active: Date.now()
        }, { merge: true });
    } catch (e: any) { 
        // 靜音處理：不要因為統計資訊寫入失敗而導致 User 看到報錯
        if (e.code === 'permission-denied') {
            console.debug("Telemetry write skipped (Insufficient permissions).");
        } else {
            console.warn("Telemetry update error:", e.message);
        }
    }
};

// #endregion

// #region Backend Communication

// Raw fetch function (Internal)
const _rawCallBackend = async (action: string, payload: any) => {
    try {
        console.log(`[Backend Call] Action: ${action}`, payload.model ? `Model: ${payload.model}` : '');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000); 

        const res = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, payload }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const contentType = res.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") === -1) {
             const text = await res.text();
             throw new Error("Backend Connection Failed. Non-JSON response.");
        }

        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error || 'Server Error');
        
        // 異步追蹤流量，不等待它完成
        if (action !== 'getServiceStatus') trackApiLoad().catch(() => {}); 
        
        return data;
    } catch (e: any) {
        console.error(`Backend API Error [${action}]:`, e);
        if (e.name === 'AbortError') throw new Error("請求逾時 (Server Timeout)。");
        throw e;
    }
};

/**
 * Wrapper to decide whether to queue or not
 */
export const callBackend = async (action: string, payload: any) => {
    const heavyActions = ['generateContent', 'generateImages', 'generateVideos'];
    
    if (heavyActions.includes(action)) {
        let label = 'AI 運算中';
        if (action === 'generateImages') label = 'AI 繪圖中';
        if (action === 'generateVideos') label = 'AI 影片生成中';
        
        return executeWithQueue(label, () => _rawCallBackend(action, payload));
    } else {
        return _rawCallBackend(action, payload);
    }
};

export const getApiServiceStatus = async (): Promise<{ 
    keyStatus: boolean[], 
    totalConfigured: number, 
    providers: { openai: boolean; ideogram: boolean; grok: boolean; } 
}> => {
    if (isMock) return { 
        keyStatus: [true, true, true, false, false], 
        totalConfigured: 3, 
        providers: { openai: true, ideogram: true, grok: false } 
    };
    try {
        const res = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'getServiceStatus', payload: {} })
        });
        return await res.json();
    } catch (e) {
        return { 
            keyStatus: [false, false, false, false, false], 
            totalConfigured: 0, 
            providers: { openai: false, ideogram: false, grok: false } 
        };
    }
};

// #endregion

// #region Cache Layer

export const getSystemCache = async (key: string): Promise<any | null> => {
    if (isMock) return null;
    try {
        const doc = await db.collection('system_cache').doc(key).get();
        if (doc.exists) {
            const data = doc.data();
            if (data && (Date.now() - data.timestamp) < CACHE_TTL) {
                return data.data;
            }
        }
    } catch (e) {
        console.debug("Cache read skipped (Permission or other).");
    }
    return null;
};

export const setSystemCache = async (key: string, data: any) => {
    if (isMock) return;
    try {
        await db.collection('system_cache').doc(key).set({
            data,
            timestamp: Date.now()
        });
    } catch (e) {
        console.debug("Cache write skipped (Permission or other).");
    }
};

// #endregion
