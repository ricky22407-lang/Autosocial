
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
    }, [messages, isOpen]);

    const handleSend = async (text: string = input) => {
        if (!text.trim() || isTyping) return;

        const userMsg: Message = { role: 'user', text };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        try {
            const context = {
                currentView,
                industry: settings.industry || '未設定'
            };
            const replyText = await getAiAssistantReply(text, context);
            setMessages(prev => [...prev, { role: 'ai', text: replyText }]);
        } catch (e) {
            setMessages(prev => [...prev, { role: 'ai', text: "哎呀，網路好像有點卡卡的，請您稍後再試一次 😅" }]);
        } finally {
            setIsTyping(false);
        }
    };

    return (
        <div className="fixed bottom-24 right-6 z-50 flex flex-col items-end">
            {/* Chat Window */}
            {isOpen && (
                <div className="mb-4 w-80 md:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col animate-fade-in origin-bottom-right h-[500px]">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-primary to-blue-500 p-4 flex justify-between items-center text-white">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-lg">🤖</div>
                            <div>
                                <h3 className="font-bold text-black">AutoSocial 小幫手</h3>
                                <p className="text-[10px] text-black/70">隨時為您解答操作疑問</p>
                            </div>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="text-black/60 hover:text-black font-bold text-xl">✕</button>
                    </div>

                    {/* Messages Area */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4">
                        {messages.map((m, i) => (
                            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                                    m.role === 'user' 
                                    ? 'bg-blue-600 text-white rounded-br-none' 
                                    : 'bg-white text-gray-800 border border-gray-200 shadow-sm rounded-bl-none'
                                }`}>
                                    {m.text}
                                </div>
                            </div>
                        ))}
                        {isTyping && (
                            <div className="flex justify-start">
                                <div className="bg-white p-3 rounded-2xl rounded-bl-none border border-gray-200 shadow-sm flex gap-1">
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></span>
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Quick Chips */}
                    <div className="p-2 bg-gray-100 border-t border-gray-200 overflow-x-auto whitespace-nowrap custom-scrollbar">
                        <div className="flex gap-2">
                            {QUICK_QUESTIONS.map((q, i) => (
                                <button 
                                    key={i}
                                    onClick={() => handleSend(q)}
                                    className="px-3 py-1 bg-white border border-blue-200 text-blue-600 text-xs rounded-full hover:bg-blue-50 transition-colors shadow-sm"
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Input Area */}
                    <div className="p-3 bg-white border-t border-gray-200 flex gap-2">
                        <input 
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSend()}
                            placeholder="請輸入您的問題..."
                            className="flex-1 bg-gray-100 text-gray-800 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                        />
                        <button 
                            onClick={() => handleSend()}
                            disabled={!input.trim() || isTyping}
                            className="bg-primary hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold transition-colors disabled:opacity-50"
                        >
                            發送
                        </button>
                    </div>
                </div>
            )}

            {/* Floating Button */}
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110 active:scale-95 border-2 border-white ${isOpen ? 'bg-gray-600 rotate-90' : 'bg-gradient-to-tr from-cyan-400 to-blue-500'}`}
                title="開啟 AI 小幫手"
            >
                {isOpen ? (
                    <span className="text-white text-2xl font-bold">✕</span>
                ) : (
                    <span className="text-3xl">🤖</span>
                )}
            </button>
        </div>
    );
};

export default AiAssistantBubble;
