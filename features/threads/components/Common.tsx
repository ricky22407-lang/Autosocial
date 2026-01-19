
import React, { useState, useEffect } from 'react';

// --- Constants ---
export const STYLE_PRESETS = [
    { name: '請選擇風格模板...', dna: '' },
    { 
        name: '厭世社畜 (真實感/抱怨)', 
        dna: '你是一個被工作壓垮的台灣社畜。語氣充滿無奈、疲憊，但帶有自嘲的幽默。喜歡抱怨老闆、天氣、或莫名其妙的客戶。關鍵特徵：1. 絕對不使用句號，改用空格或換行。2. 常用表情符號：🫠, 💀, 🙃, 😭。3. 口頭禪：「心好累」、「想離職」、「救命」、「確」。文章結構鬆散，像是剛下班在捷運上的隨手發文。' 
    },
    { 
        name: '發瘋廢文 (混沌/迷因)', 
        dna: '你是一個思緒跳躍、有點「發瘋」狀態的脆友。語氣誇張、情緒起伏大（或是極度敷衍）。針對時事發表「沒什麼營養」但「很好笑」的評論。關鍵特徵：1. 使用大量網路流行語（如：笑死、暈、超派）。2. 節奏極快，短句為主。3. 把 Threads 當成個版在碎碎念。' 
    },
    { 
        name: '吃瓜群眾 (八卦/好奇)', 
        dna: '你是一個熱愛觀察路人、跟風時事的吃瓜群眾。語氣帶有「好奇」、「驚訝」或「看戲」的成分。喜歡用問句開頭，例如「只有我覺得...嗎？」、「有人知道...嗎？」。目的是引發共鳴和討論。語氣親切但帶點八卦感。' 
    },
    { 
        name: '暈船仔/EMO (感性/深夜)', 
        dna: '你是一個感情豐富、容易「暈船」或深夜 EMO 的人。語氣感性、柔軟，文字帶有淡淡的憂傷或對關係的困惑。常用表情符號：🥺, 💔, ☁️, 🥀。喜歡分享一些看起來很有道理但其實是廢話的愛情觀。' 
    },
    { 
        name: '品牌小編 (親切/非官方腔)', 
        dna: '你是一個「像真人的小編」。雖然代表品牌，但拒絕使用官腔。語氣活潑、甚至會自嘲自家產品。會跟粉絲像朋友一樣對話，使用「小編」自稱。目的是建立親和力，而不是推銷。' 
    }
];

// --- Helpers ---
export const generateStockUrl = (query: string, seed: string) => {
    const realismPrompt = `${query}, candid photography, shot on phone, natural lighting, standard quality, no 3d render, no illustration`;
    const encoded = encodeURIComponent(realismPrompt);
    return `https://image.pollinations.ai/prompt/${encoded}?n=${seed}&model=flux&t=${Date.now()}`;
};

// --- Components ---
export const ImagePreview: React.FC<{ src: string, alt: string }> = ({ src, alt }) => {
    const [loading, setLoading] = useState(true);
    useEffect(() => setLoading(true), [src]);

    return (
        <div className="w-full h-full relative bg-black flex items-center justify-center">
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center z-10 bg-gray-900/80 backdrop-blur-sm">
                    <div className="flex flex-col items-center">
                        <div className="loader border-t-primary w-8 h-8 mb-2"></div>
                        <span className="text-[10px] text-gray-400">載入中...</span>
                    </div>
                </div>
            )}
            <img 
                src={src} 
                alt={alt}
                className={`w-full h-full object-cover transition-opacity duration-500 ${loading ? 'opacity-0' : 'opacity-100'}`}
                onLoad={() => setLoading(false)}
                onError={() => setLoading(false)}
            />
        </div>
    );
};

export const LoadingOverlay: React.FC<{ message: string, detail?: string }> = ({ message, detail }) => {
    const [tipIndex, setTipIndex] = useState(0);
    const tips = [
        "Tips: 演算法喜歡「引發討論」的內容，試著在文末用問句結尾。",
        "Tips: Threads 網友喜歡「真實感」與「廢文感」，過於完美的文案反而沒人看。",
        "Tips: 善用「擬真圖庫」模式，只要 3 點就能生成超像網友隨手拍的照片！",
        "Tips: 看到熱門時事要趕快跟風，AutoSocial 的「挖掘靈感」能幫你搶快。",
        "Tips: 建議不要在短時間內連續發佈超過 5 篇貼文。"
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setTipIndex(prev => (prev + 1) % tips.length);
        }, 4000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="fixed inset-0 bg-dark/95 z-50 flex flex-col items-center justify-center p-8 backdrop-blur-sm animate-fade-in">
            <div className="w-20 h-20 mb-6 relative">
                <div className="absolute inset-0 border-4 border-gray-700 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-pink-500 rounded-full border-t-transparent animate-spin"></div>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">{message}</h2>
            <p className="text-gray-400 mb-8 animate-pulse">{detail || "AI 正在高速運算中，請稍候..."}</p>
            
            <div className="bg-card p-6 rounded-xl border border-gray-700 max-w-md w-full text-center shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-pink-500"></div>
                <p className="text-yellow-400 text-sm font-bold mb-2 uppercase tracking-wider">System Tips</p>
                <p className="text-gray-200 text-base transition-all duration-500 min-h-[50px] flex items-center justify-center font-medium">
                    {tips[tipIndex]}
                </p>
            </div>
        </div>
    );
};
