
import React, { useState, useEffect } from 'react';
import { UserProfile, ProjectListing, ProjectApplication } from '../../types';
import { checkAndUseQuota, fetchAllProjects, applyForProject } from '../../services/authService';
import { v4 as uuidv4 } from 'uuid';

interface Props {
    user: UserProfile;
    onRefresh: () => void;
}

const ProjectBoard: React.FC<Props> = ({ user, onRefresh }) => {
    const [projects, setProjects] = useState<ProjectListing[]>([]);
    const [loading, setLoading] = useState(false);
    const [showApplyModal, setShowApplyModal] = useState<ProjectListing | null>(null);
    const [proposal, setProposal] = useState('');
    const [price, setPrice] = useState(0);
    const [isFeatured, setIsFeatured] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        loadProjects();
    }, [user.quota_used]); // 當點數變動或父組件重整時觸發

    const loadProjects = async () => {
        setLoading(true);
        try {
            const data = await fetchAllProjects();
            setProjects(data);
        } finally { setLoading(false); }
    };

    const handleApply = async () => {
        if (!showApplyModal || !user.influencerProfile) {
            alert("請先完成人才名片設定後再進行報名。");
            return;
        }
        
        let cost = 0;
        if (isFeatured) cost = 10; 
        
        if (cost > 0) {
            if (!confirm(`「發光加成」將消耗 ${cost} 點，讓您的報名在甲方列表頂端發光顯示，確認執行？`)) return;
            const allowed = await checkAndUseQuota(user.user_id, cost, 'PROJECT_APPLY_FEATURED');
            if (!allowed) return;
        }

        setIsSubmitting(true);
        try {
            const newApp: ProjectApplication = {
                id: uuidv4(),
                projectId: showApplyModal.id,
                influencerId: user.user_id,
                influencerEmail: user.email,
                influencerProfile: user.influencerProfile,
                proposal,
                price,
                isFeatured,
                timestamp: Date.now(),
                status: 'pending'
            };

            await applyForProject(newApp);
            alert("✅ 報名成功！品牌方已收到您的申請。");
            
            // 重要：重整全域狀態，讓發案方的列表能看到人數增加
            onRefresh();
            await loadProjects(); 
            
            setShowApplyModal(null);
            setProposal('');
            setPrice(0);
            setIsFeatured(false);
        } finally { setIsSubmitting(false); }
    };

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h3 className="text-2xl font-bold text-white">合作案佈告欄</h3>
                    <p className="text-gray-500 text-sm">目前有 {projects.length} 個品牌正在尋找人才</p>
                </div>
                <button onClick={loadProjects} className="text-xs text-primary hover:underline flex items-center gap-1">
                    <span className="text-lg">↻</span> 刷新案源
                </button>
            </div>

            {loading ? <div className="py-20 text-center animate-pulse text-gray-500">正在同步雲端案源...</div> : (
                projects.length === 0 ? (
                    <div className="py-32 text-center text-gray-600 border-2 border-dashed border-gray-800 rounded-[3rem]">
                        目前尚無開放中的合作案件，請稍後再試。
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {projects.map(p => (
                            <div key={p.id} className="bg-card p-6 rounded-[2rem] border border-gray-700 hover:border-secondary/40 transition-all flex flex-col justify-between group">
                                <div>
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="px-3 py-1 bg-green-900/30 text-green-400 text-[10px] font-black rounded-lg border border-green-500/30">招募中</div>
                                        <span className="text-[10px] text-gray-500 font-mono">截止日: {new Date(p.expiresAt).toLocaleDateString()}</span>
                                    </div>
                                    <h4 className="text-xl font-bold text-white mb-2 group-hover:text-secondary transition-colors">{p.title}</h4>
                                    <p className="text-sm text-gray-400 line-clamp-3 mb-4 leading-relaxed">{p.description}</p>
                                    <div className="flex flex-wrap gap-2 mb-6">
                                        {p.requirements.map(r => <span key={r} className="text-[10px] bg-dark border border-gray-600 px-2.5 py-1 rounded-full text-gray-300">#{r}</span>)}
                                    </div>
                                </div>
                                <div className="pt-6 border-t border-gray-800 flex justify-between items-center">
                                    <div>
                                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">合作預算</p>
                                        <p className="text-lg font-black text-white">{p.budget}</p>
                                        <p className="text-[9px] text-gray-600 mt-1">{p.applicantCount || 0} 人已報名</p>
                                    </div>
                                    <button onClick={() => setShowApplyModal(p)} className="bg-white text-black px-6 py-3 rounded-xl font-black text-xs hover:bg-secondary hover:text-white transition-all shadow-lg">立即報名</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            )}

            {/* Application Modal */}
            {showApplyModal && (
                <div className="fixed inset-0 bg-black/80 z-[500] flex items-center justify-center p-4 backdrop-blur-md">
                    <div className="bg-gray-900 border border-gray-700 w-full max-w-xl rounded-[2.5rem] p-8 space-y-6 shadow-2xl relative">
                        <button onClick={() => setShowApplyModal(null)} className="absolute top-6 right-6 text-gray-500 hover:text-white">✕</button>
                        <h3 className="text-2xl font-black text-white">申請報名合作</h3>
                        <div className="bg-dark p-4 rounded-2xl border border-gray-800">
                            <p className="text-[10px] text-gray-500 font-bold mb-1">正在報名</p>
                            <p className="text-white font-bold">{showApplyModal.title}</p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs text-gray-500 font-bold mb-2 uppercase">您的自我推薦與規劃 (重點說明)</label>
                                <textarea value={proposal} onChange={e => setProposal(e.target.value)} rows={4} className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white text-sm focus:border-secondary outline-none transition-all resize-none shadow-inner" placeholder="簡單說明為什麼品牌應該選您？您的合作構想是？" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 font-bold mb-2 uppercase">您的執行報價 (NT$)</label>
                                <input type="number" value={price} onChange={e => setPrice(parseInt(e.target.value))} className="w-full bg-dark border border-gray-700 rounded-xl p-4 text-white font-black outline-none focus:border-secondary" placeholder="請輸入您的預期執行價" />
                            </div>

                            <div className={`p-4 rounded-2xl border transition-all cursor-pointer ${isFeatured ? 'bg-yellow-900/20 border-yellow-500 shadow-lg' : 'bg-dark border-gray-800 opacity-60'}`} onClick={() => setIsFeatured(!isFeatured)}>
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl">✨</span>
                                        <div>
                                            <p className="text-white font-bold text-sm">優先置頂加成 (Featured Bid)</p>
                                            <p className="text-[10px] text-yellow-500/80">在甲方的名單中發光置頂，被選中機率提升 250%</p>
                                        </div>
                                    </div>
                                    <span className="text-yellow-400 font-black text-xs">10 點</span>
                                </div>
                            </div>
                        </div>

                        <button onClick={handleApply} disabled={isSubmitting || !proposal} className="w-full bg-secondary text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-secondary/20 hover:scale-105 transition-all">
                            {isSubmitting ? '報名傳送中...' : '確認報名'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProjectBoard;
