
import React, { useState } from 'react';
import { ThreadsAccount, UserProfile } from '../../types';
import { fetchUserThreads, fetchMediaReplies, publishThreadsPost } from '../../services/threadsService';
import { generateCommentReply } from '../../services/geminiService';
import { checkAndUseQuota } from '../../services/authService';
import { LoadingOverlay } from './ThreadsCommon';

interface CommentData {
    id: string;
    text: string;
    username: string;
    timestamp: string;
    threadId: string;
    accountIndex: number;
}

interface Props {
    accounts: ThreadsAccount[];
    user: UserProfile | null;
    onQuotaUpdate: () => void;
}

const InteractionManager: React.FC<Props> = ({ accounts, user, onQuotaUpdate }) => {
    const [comments, setComments] = useState<CommentData[]>([]);
    const [isLoadingComments, setIsLoadingComments] = useState(false);
    const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
    const [generatedReplies, setGeneratedReplies] = useState<string[]>([]);
    const [draftReply, setDraftReply] = useState('');
    const [isReplying, setIsReplying] = useState(false);

    const handleScan = async () => {
        if (!user) return alert("請先登入");
        setIsLoadingComments(true);
        setComments([]);
        
        try {
            const allComments: CommentData[] = [];
            await Promise.all(accounts.filter(a => a.isActive).map(async (acc, idx) => {
                try {
                    const threads = await fetchUserThreads(acc, 3);
                    for (const thread of threads) {
                        const replies = await fetchMediaReplies(acc, thread.id);
                        replies.forEach((r: any) => {
                            if (r.username !== acc.username) {
                                allComments.push({
                                    id: r.id,
                                    text: r.text,
                                    username: r.username || 'Unknown',
                                    timestamp: r.timestamp,
                                    threadId: thread.id,
                                    accountIndex: idx 
                                });
                            }
                        });
                    }
                } catch (e) {
                    console.error(`Error scanning account ${acc.username}:`, e);
                }
            }));
            
            setComments(allComments);
            if (allComments.length === 0) alert("目前沒有偵測到新留言。");
        } catch (e) {
            alert("掃描失敗");
        } finally {
            setIsLoadingComments(false);
        }
    };

    const handleGenReply = async (comment: CommentData) => {
        const acc = accounts[comment.accountIndex];
        if (!acc) return;
        
        const COST = 2;
        const allowed = await checkAndUseQuota(user!.user_id, COST, 'GENERATE_REPLY');
        if (!allowed) return; 
        onQuotaUpdate();

        setSelectedCommentId(comment.id);
        setIsReplying(true);
        setGeneratedReplies([]);
        
        try {
            const replies = await generateCommentReply(comment.text, acc.styleGuide || acc.personaPrompt || '');
            setGeneratedReplies(replies);
            if(replies.length > 0) setDraftReply(replies[0]);
        } catch (e: any) {
            alert(`生成失敗: ${e.message}`);
        } finally {
            setIsReplying(false);
        }
    };

    const handleSendReply = async (comment: CommentData, text: string) => {
        const acc = accounts[comment.accountIndex];
        if (!acc) return;
        
        setIsReplying(true);
        try {
            const res = await publishThreadsPost(acc, text, undefined, comment.id);
            if (res.success) {
                alert("回覆成功！");
                setComments(prev => prev.filter(c => c.id !== comment.id));
                setSelectedCommentId(null);
                setDraftReply('');
            } else {
                alert(`回覆失敗: ${res.error}`);
            }
        } catch (e: any) {
            alert(`錯誤: ${e.message}`);
        } finally {
            setIsReplying(false);
        }
    };

    if (isLoadingComments) return <LoadingOverlay message="正在掃描留言" detail="AI 正在讀取多個帳號的最新互動..." />;

    return (
        <div className="bg-card p-6 rounded-xl border border-gray-700">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">留言互動中心</h3>
                <button onClick={handleScan} disabled={isLoadingComments} className="bg-pink-600 hover:bg-pink-500 text-white px-4 py-2 rounded font-bold transition-colors disabled:opacity-50">
                    {isLoadingComments ? '掃描中...' : '掃描最新留言'}
                </button>
            </div>

            {comments.length === 0 ? (
                <div className="text-center py-20 bg-dark/30 rounded-xl border border-gray-800 border-dashed">
                    <p className="text-gray-500 mb-2">目前沒有未處理的留言</p>
                    <p className="text-xs text-gray-600">點擊「掃描」來檢查所有帳號的最新互動</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Comment List */}
                    <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                        {comments.map((comment) => (
                            <div 
                                key={comment.id} 
                                onClick={() => { setSelectedCommentId(comment.id); handleGenReply(comment); }}
                                className={`p-4 rounded-lg cursor-pointer border transition-all ${selectedCommentId === comment.id ? 'bg-pink-900/20 border-pink-500' : 'bg-dark border-gray-700 hover:border-gray-500'}`}
                            >
                                <div className="flex justify-between mb-2">
                                    <span className="font-bold text-white text-sm">@{comment.username}</span>
                                    <span className="text-[10px] text-gray-500">{new Date(comment.timestamp).toLocaleString()}</span>
                                </div>
                                <p className="text-gray-300 text-sm">{comment.text}</p>
                                <div className="mt-2 flex justify-between items-center">
                                    <span className="text-[10px] text-gray-500 bg-black/30 px-2 py-1 rounded">
                                        Account: {accounts[comment.accountIndex]?.username}
                                    </span>
                                    {selectedCommentId === comment.id && <span className="text-pink-400 text-xs font-bold">● 選取中</span>}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Reply Editor */}
                    <div className="bg-dark p-6 rounded-xl border border-gray-600 flex flex-col">
                        {selectedCommentId ? (
                            <>
                                <h4 className="font-bold text-gray-300 mb-4 flex items-center gap-2">
                                    AI 建議回覆
                                    {isReplying && <div className="loader w-4 h-4 border-t-pink-500"></div>}
                                </h4>
                                
                                <div className="flex-1 space-y-3 mb-4 overflow-y-auto max-h-[300px] custom-scrollbar">
                                    {generatedReplies.length > 0 ? (
                                        generatedReplies.map((reply, i) => (
                                            <div 
                                                key={i} 
                                                onClick={() => setDraftReply(reply)}
                                                className={`p-3 rounded border cursor-pointer text-sm transition-colors ${draftReply === reply ? 'bg-pink-900/40 border-pink-500 text-white' : 'bg-black/20 border-gray-700 text-gray-400 hover:border-gray-500'}`}
                                            >
                                                {reply}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-gray-500 text-xs text-center py-10">正在生成回覆建議...</div>
                                    )}
                                </div>

                                <textarea 
                                    value={draftReply}
                                    onChange={(e) => setDraftReply(e.target.value)}
                                    className="w-full h-24 bg-black/50 border border-gray-600 rounded p-3 text-white text-sm mb-4 resize-none focus:border-pink-500 outline-none"
                                    placeholder="選擇上方建議或自行撰寫..."
                                />

                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => {
                                            const c = comments.find(c => c.id === selectedCommentId);
                                            if(c) handleGenReply(c);
                                        }}
                                        className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded font-bold text-sm"
                                    >
                                        重新生成
                                    </button>
                                    <button 
                                        onClick={() => {
                                            const c = comments.find(c => c.id === selectedCommentId);
                                            if(c) handleSendReply(c, draftReply);
                                        }}
                                        disabled={!draftReply || isReplying}
                                        className="flex-[2] bg-pink-600 hover:bg-pink-500 text-white py-3 rounded font-bold text-sm disabled:opacity-50"
                                    >
                                        發送回覆
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-500">
                                <span className="text-4xl mb-4">👈</span>
                                <p>請從左側選擇一則留言</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default InteractionManager;
