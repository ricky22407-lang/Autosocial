
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

const QUICK_QUESTIONS = [
    "怎麼開始寫第一篇貼文？",
    "點數不夠了怎麼辦？",
    "圖片風格要怎麼選比較好？",
    "什麼是 SEO 文章？",
    "幫我聯絡真人客服"
];

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

        // Immediate input clear to prevent double send and improve UX
        const userText = text;
        setInput(''); 
        
        const userMsg: Message = { role: 'user', text: userText };
        setMessages(prev => [...prev, userMsg]);
        setIsTyping(true);

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
                                    handleSend();
                                }
                            }}
                            placeholder="輸入問題 (Enter 發送)..."
                            rows={1}
                            className="flex-1 bg-black/40 text-white rounded-xl px-4 py-3 text-sm outline-none border border-gray-700 focus:border-primary/50 transition-colors resize-none overflow-hidden custom-scrollbar max-h-24"
                            style={{ minHeight: '44px' }}
                        />
                        <button 
                            onClick={() => handleSend()}
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
