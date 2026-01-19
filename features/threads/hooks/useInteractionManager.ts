
import { useState } from 'react';
import { ThreadsAccount, UserProfile } from '../../../types';
import { fetchUserThreads, fetchMediaReplies, publishThreadsPost } from '../../../services/threadsService';
import { generateCommentReply } from '../../../services/geminiService';
import { checkAndUseQuota } from '../../../services/authService';

export interface CommentData {
    id: string;
    text: string;
    username: string;
    timestamp: string;
    threadId: string;
    accountIndex: number;
}

export const useInteractionManager = (
    accounts: ThreadsAccount[],
    user: UserProfile | null,
    onQuotaUpdate: () => void
) => {
    const [comments, setComments] = useState<CommentData[]>([]);
    const [isLoadingComments, setIsLoadingComments] = useState(false);
    
    // Reply State
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
            // Parallel scan across active accounts
            await Promise.all(accounts.filter(a => a.isActive).map(async (acc, idx) => {
                try {
                    const threads = await fetchUserThreads(acc, 3); // Scan last 3 threads
                    for (const thread of threads) {
                        const replies = await fetchMediaReplies(acc, thread.id);
                        replies.forEach((r: any) => {
                            // Filter out own replies
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
        if (!acc || !user) return;
        
        const COST = 2;
        const allowed = await checkAndUseQuota(user.user_id, COST, 'GENERATE_REPLY');
        if (!allowed) return; 
        onQuotaUpdate();

        setSelectedCommentId(comment.id);
        setIsReplying(true);
        setGeneratedReplies([]);
        setDraftReply(''); // Clear previous draft
        
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
                // Remove from local list
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

    return {
        comments,
        isLoadingComments,
        selectedCommentId, setSelectedCommentId,
        generatedReplies,
        draftReply, setDraftReply,
        isReplying,
        handleScan,
        handleGenReply,
        handleSendReply
    };
};
