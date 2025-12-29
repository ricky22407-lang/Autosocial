
import React, { useState, useRef, useEffect } from 'react';
import { getAiAssistantReply } from '../services/geminiService';
import { BrandSettings } from '../types';

interface Props {
    currentView: string;
    settings: BrandSettings;
}

interface Message {
    role: 'user' | 'ai';
    text: string;
}

// 固定問題列表
const QUICK_QUESTIONS = [
    "怎麼開始寫第一篇貼文？",
    "點數不夠了怎麼辦？",
    "圖片風格要怎麼選？",
    "什麼是 SEO 文章？",
    "幫我聯絡真人客服"
];

// 固定回答內容 (不消耗 AI Token)
const PREDEFINED_ANSWERS: Record<string, string> = {
    "怎麼開始寫第一篇貼文？": "👋 歡迎使用！請依照以下簡單步驟：\n\n1. 點擊左側選單的 **「內容創作」**。\n2. 在中間的輸入框填寫您想寫的主題 (例如：夏季保養、新品上市)。\n3. 選擇 **「品牌模式」** (適合粉專經營) 或 **「爆文模式」** (適合 IG/小紅書)。\n4. 點擊 **「開始生成內容」**，AI 就會幫您寫好文案並畫好圖囉！✨",
    
    "點數不夠了怎麼辦？": "別擔心！您有幾種方式獲取點數：\n\n💰 **儲值方案**：請聯繫真人客服進行儲值。\n🎁 **推薦獎勵**：到「推薦計畫」複製您的邀請碼分享給朋友，雙方都能獲得 50 點！\n🔑 **兌換序號**：若您有獲得活動序號，請點擊左下角的「兌換序號」按鈕。",
    
    "圖片風格要怎麼選？": "這取決於您的品牌形象喔！🎨\n\n- **極簡主義 (Minimalist)**：適合 3C、高單價精品，乾淨俐落。\n- **溫馨居家 (Warm)**：適合親子、寵物、食品，給人親切感。\n- **鮮豔流行 (Vibrant)**：適合促銷活動、年輕潮流品牌，非常吸睛。\n\n您可以在「品牌設定」中調整預設風格！",
    
    "什麼是 SEO 文章？": "🔍 **SEO (搜尋引擎優化) 文章** 是專門寫給 Google 看的長篇文章。\n\nAutoSocial 會幫您生成 1500 字以上的結構化內容，包含 H2/H3 標題與關鍵字佈局。這能幫助您的品牌官網在 Google 搜尋結果中排名更靠前，帶來長期的免費流量！📈",
    
    "幫我聯絡真人客服": "沒問題！您可以透過以下方式找到我們：\n\n1. 點擊左側選單底部的 **「聯繫客服」** 按鈕。\n2. 直接加 LINE ID：**ricky50517**\n3. 撥打專線：**0983-949-997**\n\n我們服務時間是週一至週五 10:00-18:00 喔！😊"
};

const AiAssistantBubble: React.FC<Props> = ({ currentView, settings }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        { role: 'ai', text: '嗨！我是您的專屬小幫手 🤖\n有什麼我可以幫您的嗎？您可以直接打字，或是點選下面的按鈕喔！' }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isOpen, isTyping]);

    const handleSend = async (text: string = input) => {
        if (!text.trim() || isTyping) return;

        // 1. 立即清除輸入框 (UX Fix: Ensure this runs synchronously first)
        setInput('');
        
        const userText = text;
        const userMsg: Message = { role: 'user', text: userText };
        setMessages(prev => [...prev, userMsg]);
        setIsTyping(true);

        // 2. 檢查是否有「固定回答」(Local Answer)
        if (PREDEFINED_ANSWERS[userText]) {
            // 模擬思考延遲，增加真實感，但不消耗 API
            setTimeout(() => {
                setMessages(prev => [...prev, { role: 'ai', text: PREDEFINED_ANSWERS[userText] }]);
                setIsTyping(false);
            }, 600);
            return;
        }

        // 3. 若無固定回答，則呼叫 AI API
        try {
            const context = {
                currentView,
                industry: settings.industry || '未設定'
            };
            const replyText = await getAiAssistantReply(userText, context);
            setMessages(prev => [...prev, { role: 'ai', text: replyText }]);
        } catch (e) {
            setMessages(prev => [...prev, { role: 'ai', text: "哎呀，網路好像有點卡卡的，請您稍後再試一次 😅" }]);
        } finally {
            setIsTyping(false);
        }
    };

    return (
        <div className="fixed bottom-24 right-6 z-50 flex flex-col items-end">
            {/* Chat Window - Dark/Neon Theme */}
            {isOpen && (
                <div className="mb-4 w-80 md:w-96 bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.5)] border border-gray-700 overflow-hidden flex flex-col animate-fade-in origin-bottom-right h-[500px]">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-gray-800 to-gray-900 border-b border-gray-700 p-4 flex justify-between items-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-primary/5"></div>
                        <div className="flex items-center gap-3 relative z-10">
                            <div className="w-10 h-10 bg-gradient-to-tr from-primary to-blue-500 rounded-full flex items-center justify-center text-xl shadow-[0_0_15px_rgba(0,242,234,0.4)]">
                                🤖
                            </div>
                            <div>
                                <h3 className="font-black text-white tracking-wide">AI 智慧小幫手</h3>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className={`w-2 h-2 rounded-full ${isTyping ? 'bg-primary animate-pulse' : 'bg-green-500'}`}></span>
                                    <p className="text-[10px] text-gray-400 font-medium">
                                        {isTyping ? '思考中...' : '線上待命'}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <button 
                            onClick={() => setIsOpen(false)} 
                            className="text-gray-400 hover:text-white transition-colors p-2 relative z-10"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Messages Area */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-transparent">
                        {messages.map((m, i) => (
                            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-md ${
                                    m.role === 'user' 
                                    ? 'bg-primary/20 text-primary border border-primary/30 rounded-br-none' 
                                    : 'bg-white/10 text-gray-200 border border-white/10 rounded-bl-none'
                                }`}>
                                    {m.text}
                                </div>
                            </div>
                        ))}
                        {isTyping && (
                            <div className="flex justify-start">
                                <div className="bg-white/10 p-4 rounded-2xl rounded-bl-none border border-white/5 flex gap-1.5 items-center">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Quick Chips */}
                    <div className="p-3 bg-gray-900/50 border-t border-gray-800 overflow-x-auto whitespace-nowrap custom-scrollbar">
                        <div className="flex gap-2">
                            {QUICK_QUESTIONS.map((q, i) => (
                                <button 
                                    key={i}
                                    onClick={() => handleSend(q)}
                                    disabled={isTyping}
                                    className="px-3 py-1.5 bg-transparent border border-primary/30 text-primary hover:bg-primary/10 text-xs rounded-full transition-colors font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Input Area */}
                    <div className="p-3 bg-gray-900 border-t border-gray-800 flex gap-2 items-end">
                        <textarea 
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend(input); // Explicitly pass current input
                                }
                            }}
                            placeholder="輸入問題 (Enter 發送)..."
                            rows={1}
                            className="flex-1 bg-black/40 text-white rounded-xl px-4 py-3 text-sm outline-none border border-gray-700 focus:border-primary/50 transition-colors resize-none overflow-hidden custom-scrollbar max-h-24"
                            style={{ minHeight: '44px' }}
                        />
                        <button 
                            onClick={() => handleSend(input)}
                            disabled={!input.trim() || isTyping}
                            className="bg-primary hover:bg-cyan-400 text-black px-4 py-3 rounded-xl font-black transition-all hover:shadow-[0_0_15px_rgba(0,242,234,0.4)] disabled:opacity-50 disabled:shadow-none h-[44px] flex items-center"
                        >
                            <svg className="w-5 h-5 transform rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19V5m0 0l-7 7m7-7l7 7" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* Floating Button - Enhanced Neon Style */}
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={`w-14 h-14 rounded-full shadow-[0_0_20px_rgba(0,242,234,0.3)] flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 border-2 border-white/20 backdrop-blur-md group ${
                    isOpen ? 'bg-gray-800 rotate-90' : 'bg-gradient-to-tr from-cyan-500 to-blue-600 hover:shadow-[0_0_30px_rgba(0,242,234,0.6)]'
                }`}
                title="開啟 AI 小幫手"
            >
                {isOpen ? (
                    <span className="text-white text-2xl font-bold">✕</span>
                ) : (
                    <span className="text-3xl filter drop-shadow-md group-hover:animate-pulse">🤖</span>
                )}
            </button>
        </div>
    );
};

export default AiAssistantBubble;
