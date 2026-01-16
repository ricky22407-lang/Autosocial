
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
};

const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 Hours Cache

// #region Helper Utilities

export const cleanJsonText = (text: string): string => {
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
};

/**
 * Removes Markdown formatting that Facebook/Instagram/Threads don't support.
 * e.g., "**Bold**" -> "Bold", "## Title" -> "Title"
 */
export const cleanSocialMediaText = (text: string): string => {
    if (!text) return "";
    let clean = text;
    
    // 1. Remove Bold/Italic asterisks (**text**, *text*)
    clean = clean.replace(/\*\*(.*?)\*\*/g, '$1'); 
    clean = clean.replace(/\*(.*?)\*/g, '$1');
    
    // 2. Remove Headers (## Title)
    clean = clean.replace(/^#+\s+/gm, '');
    
    // 3. Fix Escaped Newlines (literal "\n" to real newline)
    clean = clean.replace(/\\n/g, '\n');
    
    return clean.trim();
};

export const decodeHtml = (html: string): string => {
  const txt = document.createElement("textarea");
  txt.innerHTML = html;
  return txt.value;
};

export const shuffleArray = <T>(array: T[]): T[] => {
    let currentIndex = array.length,  randomIndex;
    while (currentIndex !== 0) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [array[currentIndex], array[randomIndex]] = [
        array[randomIndex], array[currentIndex]];
    }
    return array;
};

// #region System Cache

export const getSystemCache = async (key: string) => {
    if (isMock) {
        const item = localStorage.getItem('cache_' + key);
        if (!item) return null;
        try {
            const parsed = JSON.parse(item);
            if (Date.now() > parsed.expiry) {
                localStorage.removeItem('cache_' + key);
                return null;
            }
            return parsed.data;
        } catch(e) { return null; }
    }
    
    try {
        const doc = await db.collection('system_cache').doc(key).get();
        if (doc.exists) {
            const data = doc.data();
            if (data.expiry > Date.now()) {
                return JSON.parse(data.content);
            }
        }
    } catch (e) { 
        console.warn("Cache Read Error (Permission/Network)", e); 
    }
    return null;
};

export const setSystemCache = async (key: string, data: any) => {
    const expiry = Date.now() + CACHE_TTL;
    
    if (isMock) {
        localStorage.setItem('cache_' + key, JSON.stringify({ data, expiry }));
        return;
    }
    
    try {
        await db.collection('system_cache').doc(key).set({
            content: JSON.stringify(data),
            expiry
        });
    } catch (e) { 
        console.warn("Cache Write Error (Permission/Network)", e); 
    }
};

// #region Backend API Caller

export const callBackend = async (action: string, payload: any) => {
    console.log(`[Backend Call] Action: ${action}`, payload.model ? `Model: ${payload.model}` : '');
    
    return executeWithQueue(action, async () => {
        const controller = new AbortController();
        // TIMEOUT EXTENDED: 300s (5 minutes) for Gemini 3 Pro Reasoning + Search
        const timeoutId = setTimeout(() => controller.abort(), 300000); 

        try {
            const res = await fetch('/api/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, payload }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!res.ok) {
                let errorMsg = `HTTP Error ${res.status}`;
                try {
                    const err = await res.json();
                    if (err.error) errorMsg = err.error;
                } catch (e) {}
                
                // Retry logic for 504 Gateway Timeout (Vercel Hard Limit)
                if (res.status === 504) {
                    throw new Error("伺服器運算逾時 (Vercel 504)。請縮小搜尋範圍或稍後再試。");
                }
                
                throw new Error(errorMsg);
            }
            
            return await res.json();
        } catch (e: any) {
            clearTimeout(timeoutId);
            console.error(`Backend API Error [${action}]:`, e);
            
            if (e.name === 'AbortError') {
                throw new Error("請求逾時 (Server Timeout)。AI 思考或搜尋時間過長，請稍後再試。");
            }
            throw e;
        }
    });
};

export const getApiServiceStatus = async () => {
    try {
        return await callBackend('getServiceStatus', {});
    } catch (e) {
        console.warn("Failed to get API status", e);
        return { keyStatus: [], providers: { openai: false, ideogram: false, grok: false } };
    }
};
