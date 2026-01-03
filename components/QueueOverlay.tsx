
import React, { useState, useEffect } from 'react';
import { subscribeToQueue } from '../services/queueService';
import { QueueState } from '../types';

const QueueOverlay: React.FC = () => {
    const [queueState, setQueueState] = useState<QueueState>({ 
        isQueuing: false, 
        position: 0, 
        totalWaiting: 0,
        currentAction: ''
    });

    useEffect(() => {
        const unsubscribe = subscribeToQueue((state) => {
            setQueueState(state);
        });
        return () => unsubscribe();
    }, []);

    if (!queueState.isQueuing) return null;

    // Visual State Logic
    const isProcessing = queueState.position <= 3; // Match MAX_CONCURRENCY in queueService
    const progress = Math.max(5, 100 - (queueState.position * 10)); // Simple visual progress

    return (
        <div className="fixed inset-0 bg-black/80 z-[300] flex items-center justify-center backdrop-blur-md animate-fade-in cursor-wait">
            <div className="bg-gray-900 border border-gray-700 p-8 rounded-2xl shadow-2xl max-w-sm w-full relative overflow-hidden flex flex-col items-center text-center">
                
                {/* Background Glow */}
                <div className={`absolute top-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 transition-all duration-1000 ${isProcessing ? 'opacity-100 animate-pulse' : 'opacity-50'}`}></div>

                {isProcessing ? (
                    // Processing State
                    <>
                        <div className="w-20 h-20 relative mb-6">
                            <div className="absolute inset-0 rounded-full border-4 border-gray-800"></div>
                            <div className="absolute inset-0 rounded-full border-4 border-t-primary border-r-transparent border-b-transparent border-l-transparent animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center text-2xl animate-pulse">⚡</div>
                        </div>
                        <h3 className="text-xl font-black text-white mb-2 tracking-tight">正在執行：{queueState.currentAction}</h3>
                        <p className="text-primary font-bold text-sm uppercase tracking-widest animate-pulse">Processing...</p>
                    </>
                ) : (
                    // Waiting State
                    <>
                        <div className="mb-6 relative">
                            <div className="text-5xl font-black text-gray-700 absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-2 opacity-30 blur-[1px]">#{queueState.position}</div>
                            <div className="text-6xl font-black text-white relative z-10 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                                {queueState.position}
                            </div>
                        </div>
                        
                        <h3 className="text-lg font-bold text-white mb-2">系統繁忙，排隊中...</h3>
                        <div className="flex items-center gap-2 text-xs text-gray-400 mb-6 bg-black/30 px-3 py-1 rounded-full border border-gray-800">
                            <span>前方等待人數:</span>
                            <span className="text-yellow-400 font-bold">{Math.max(0, queueState.position - 1)} 人</span>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden mb-2">
                            <div 
                                className="h-full bg-yellow-500 transition-all duration-1000 ease-out" 
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                        <p className="text-[10px] text-gray-600">請勿關閉視窗，輪到您時將自動執行</p>
                    </>
                )}
            </div>
        </div>
    );
};

export default QueueOverlay;
