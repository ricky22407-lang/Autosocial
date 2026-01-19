
import React from 'react';
import { ThreadsAccount, UserProfile } from '../../types';
import { useInteractionManager, CommentData } from './hooks/useInteractionManager';
import { LoadingOverlay } from './components/Common';

interface Props {
    accounts: ThreadsAccount[];
    user: UserProfile | null;
    onQuotaUpdate: () => void;
}

const InteractionManager: React.FC<Props> = ({ accounts, user, onQuotaUpdate }) => {
    const {
        comments,
        isLoadingComments,
        selectedCommentId, setSelectedCommentId,
        generatedReplies,
        draftReply, setDraftReply,
        isReplying,
        handleScan,
        handleGenReply,
        handleSendReply
    } = useInteractionManager(accounts, user, onQuotaUpdate);

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
