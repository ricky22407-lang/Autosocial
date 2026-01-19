
import React from 'react';

interface Props {
    caption: string;
    imageUrl?: string;
    scheduleDate: string;
    setScheduleDate: (val: string) => void;
    onPublish: (isScheduled: boolean) => void;
    publishResult: { success: boolean; msg: string } | null;
    clearResult: () => void;
    scheduledPostsCount: number;
    limit: number;
}

export const PreviewCard: React.FC<Props> = ({ 
    caption, imageUrl, 
    scheduleDate, setScheduleDate, 
    onPublish, publishResult, clearResult,
    scheduledPostsCount, limit 
}) => {
    const isLimitReached = scheduledPostsCount >= limit;

    return (
        <div className="space-y-6">
            <div className="glass-card p-6 md:p-8 rounded-3xl flex flex-col min-h-[600px] relative">
                <h3 className="font-black text-gray-300 tracking-tighter uppercase text-sm mb-6">預覽效果</h3>
                
                <div className="bg-white rounded-[2rem] overflow-hidden flex-1 border-8 border-gray-900 shadow-2xl flex flex-col relative mx-auto w-full max-w-sm">
                    <div className="bg-white text-black text-[10px] font-bold p-3 flex justify-between px-6"><span>9:41</span><span>📶 🔋</span></div>
                    <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 to-red-500 flex items-center justify-center text-white text-xs font-bold">B</div>
                        <div className="space-y-0.5"><div className="h-2 w-20 bg-gray-200 rounded"></div><div className="h-1.5 w-12 bg-gray-100 rounded"></div></div>
                    </div>
                    <div className="p-4 overflow-y-auto max-h-[400px] custom-scrollbar flex-1 bg-white">
                        <p className="text-black text-[14px] whitespace-pre-wrap mb-4 leading-relaxed font-sans">{caption}</p>
                        {imageUrl && <img src={imageUrl} className="w-full h-auto rounded-xl shadow-sm border border-gray-100 animate-fade-in" alt="Generated" />}
                        {!imageUrl && (
                            <div className="w-full aspect-square bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-300 gap-2">
                                <span className="text-2xl opacity-50">🖼️</span>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-center px-4">
                                    {caption ? "請選擇左側風格並點擊生成圖片" : "等待文案生成..."}
                                </span>
                            </div>
                        )}
                        <div className="flex gap-4 mt-4 text-gray-400">
                             <div className="w-5 h-5 bg-gray-100 rounded-full"></div>
                             <div className="w-5 h-5 bg-gray-100 rounded-full"></div>
                             <div className="w-5 h-5 bg-gray-100 rounded-full ml-auto"></div>
                        </div>
                    </div>
                </div>

                {publishResult ? (
                    <div className={`mt-8 p-5 rounded-2xl text-center font-bold border transition-all ${publishResult.success ? 'bg-green-500/20 text-green-400 border-green-500/50' : 'bg-red-500/20 text-red-400 border-red-500/50'}`}>
                        <div className="text-[15px] mb-1">{publishResult.msg}</div>
                        <button onClick={clearResult} className="text-[10px] uppercase font-black tracking-widest text-white/50 hover:text-white transition-colors underline underline-offset-4">返回編輯</button>
                    </div>
                ) : (
                    <div className="mt-8 space-y-4">
                        <div className="bg-black/40 p-4 rounded-xl border border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div className="flex-1 w-full">
                                <label className="block text-[9px] text-gray-500 font-black uppercase tracking-[0.2em] mb-1">FB 排程發佈 (選填)</label>
                                <input type="datetime-local" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="w-full bg-transparent text-white outline-none text-sm font-bold p-0 border-none" />
                            </div>
                            <div className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest border ${isLimitReached ? 'text-red-400 border-red-900/50' : 'text-primary border-primary/20'}`}>
                                {scheduledPostsCount}/{limit} 席位
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <button onClick={() => onPublish(true)} disabled={isLimitReached} className={`flex-1 py-4 rounded-xl font-black transition-all border uppercase tracking-widest text-xs ${isLimitReached ? 'border-gray-800 text-gray-700 cursor-not-allowed' : 'border-gray-600 text-gray-400 hover:border-white hover:text-white'}`}>
                                {isLimitReached ? '已滿' : '排程發佈 (FB API)'}
                            </button>
                            <button onClick={() => onPublish(false)} className="flex-1 bg-white text-black py-4 rounded-xl font-black shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:bg-gray-200 transition-all transform active:scale-95 text-xs uppercase tracking-widest">
                                立即發佈
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
