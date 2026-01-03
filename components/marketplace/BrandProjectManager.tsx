
import React, { useState, useEffect } from 'react';
import { UserProfile, ProjectListing, ProjectApplication } from '../../types';
import { checkAndUseQuota, fetchMyProjects, saveProjectListing, fetchApplicationsForProject, updateApplicationStatus } from '../../services/authService';
import InfluencerCard from './InfluencerCard';
import { v4 as uuidv4 } from 'uuid';

interface Props {
    user: UserProfile;
    onRefresh: () => void;
}

const BrandProjectManager: React.FC<Props> = ({ user, onRefresh }) => {
    const [myProjects, setMyProjects] = useState<ProjectListing[]>([]);
    const [selectedProject, setSelectedProject] = useState<ProjectListing | null>(null);
    const [applicants, setApplicants] = useState<ProjectApplication[]>([]);
    const [loadingApps, setLoadingApps] = useState(false);
    const [showPostModal, setShowPostModal] = useState(false);
    const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());

    // Form State
    const [newProj, setNewProj] = useState({ title: '', description: '', budget: '', requirements: '' });

    useEffect(() => {
        loadMyProjects();
    }, []);

    const loadMyProjects = async () => {
        const data = await fetchMyProjects(user.user_id);
        setMyProjects(data);
    };

    const handleCreateProject = async () => {
        const COST = 100;
        if (!confirm(`建立合作案並上架 10 天將消耗 ${COST} 點。\n(提早關閉案子不予退點)\n\n確認執行？`)) return;

        const allowed = await checkAndUseQuota(user.user_id, COST, 'CREATE_PROJECT_LISTING', { title: newProj.title });
        if (!allowed) return;

        const project: ProjectListing = {
            id: uuidv4(),
            brandId: user.user_id,
            brandName: user.email.split('@')[0],
            brandEmail: user.email,
            title: newProj.title,
            description: newProj.description,
            budget: newProj.budget,
            requirements: newProj.requirements.split(',').map(s => s.trim()),
            createdAt: Date.now(),
            expiresAt: Date.now() + 10 * 24 * 60 * 60 * 1000,
            status: 'open',
            applicantCount: 0
        };

        await saveProjectListing(project);
        alert("✅ 案子已成功發布！");
        setShowPostModal(false);
        setNewProj({ title: '', description: '', budget: '', requirements: '' });
        onRefresh();
        loadMyProjects();
    };

    const viewApplicants = async (proj: ProjectListing) => {
        setSelectedProject(proj);
        setLoadingApps(true);
        try {
            const apps = await fetchApplicationsForProject(proj.id);
            setApplicants(apps);
        } finally { setLoadingApps(false); }
    };

    const handleUnlockApplicant = async (appId: string) => {
        const COST = 30;
        if (!confirm(`解鎖該接案人的真實身分、聯繫 Email 與詳細計畫將消耗 ${COST} 點。\n\n確認解鎖？`)) return;

        const allowed = await checkAndUseQuota(user.user_id, COST, 'UNLOCK_PROJECT_APPLICANT');
        if (!allowed) return;

        setUnlockedIds(prev => new Set(prev).add(appId));
        onRefresh();
    };

    const handleStatusUpdate = async (appId: string, status: 'accepted' | 'rejected') => {
        const msg = status === 'accepted' ? '錄用' : '婉拒';
        if (!confirm(`確認要${msg}這位申請者嗎？通知將會發送到對方的收件匣。`)) return;

        try {
            await updateApplicationStatus(appId, status);
            setApplicants(prev => prev.map(a => a.id === appId ? { ...a, status } : a));
            alert(`已完成${msg}操作。`);
        } catch (e) {
            alert("狀態更新失敗，請檢查網路。");
        }
    };

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex justify-between items-center">
                <h3 className="text-2xl font-bold text-white">我的發案中心</h3>
                <button onClick={() => setShowPostModal(true)} className="bg-primary text-black px-6 py-3 rounded-xl font-black text-xs shadow-lg hover:scale-105 transition-all">＋ 建立新案子 (100點)</button>
            </div>

            {!selectedProject && (
                myProjects.length === 0 ? (
                    <div className="py-24 text-center text-gray-600 border-2 border-dashed border-gray-800 rounded-[2.5rem] flex flex-col items-center gap-4">
                        <span className="text-4xl grayscale">📁</span>
                        <p>目前您尚未發布任何合作案。</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {myProjects.map(p => (
                            <div key={p.id} className="bg-card p-6 rounded-2xl border border-gray-700 flex justify-between items-center hover:border-gray-600 transition-colors">
                                <div>
                                    <h4 className="text-white font-bold text-lg">{p.title}</h4>
                                    <p className="text-xs text-gray-500 mt-1">目前已有 {p.applicantCount || 0} 人報名 • 有效期至 {new Date(p.expiresAt).toLocaleDateString()}</p>
                                </div>
                                <button onClick={() => viewApplicants(p)} className="bg-gray-800 text-gray-300 px-6 py-2 rounded-lg font-bold text-xs hover:bg-gray-700 transition-all border border-gray-600">檢視報名清單</button>
                            </div>
                        ))}
                    </div>
                )
            )}

            {/* Applicant List View */}
            {selectedProject && (
                <div className="space-y-6 animate-fade-in">
                    <div className="flex items-center gap-4 border-b border-gray-800 pb-4">
                        <button onClick={() => setSelectedProject(null)} className="text-gray-500 hover:text-white flex items-center gap-1 text-sm font-bold">
                            <span>←</span> 返回專案列表
                        </button>
                        <h4 className="text-xl font-bold text-white">報名者名單：{selectedProject.title}</h4>
                    </div>
                    
                    {loadingApps ? <div className="py-20 text-center text-gray-500 animate-pulse">正在讀取報名資料...</div> : (
                        applicants.length === 0 ? (
                            <div className="py-20 text-center text-gray-600">目前尚無人報名此案件。</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {applicants.map(app => (
                                    <div key={app.id} className={`space-y-4 relative ${app.isFeatured ? 'ring-2 ring-yellow-400 p-2 rounded-[2.8rem] bg-yellow-400/5' : ''}`}>
                                        {app.isFeatured && <div className="absolute -top-3 left-6 z-20 bg-yellow-400 text-black text-[9px] font-black px-2 py-0.5 rounded shadow-lg animate-pulse">✨ 置頂推薦</div>}
                                        <InfluencerCard profile={app.influencerProfile} email={app.influencerEmail} displayMode={unlockedIds.has(app.id) ? 'FULL' : 'PREVIEW'} />
                                        
                                        <div className="bg-dark p-4 rounded-2xl border border-gray-800 min-h-[120px] flex flex-col justify-between">
                                            <div>
                                                <p className="text-[10px] text-gray-500 font-bold uppercase mb-2">合作計畫摘要</p>
                                                <p className={`text-xs text-gray-300 transition-all leading-relaxed ${!unlockedIds.has(app.id) ? 'blur-md select-none' : ''}`}>「{app.proposal}」</p>
                                            </div>
                                            
                                            <div className="mt-4 pt-4 border-t border-gray-800/50">
                                                <div className="flex justify-between items-end mb-4">
                                                    <div>
                                                        <p className="text-[10px] text-gray-500 font-bold">預期報價</p>
                                                        <p className="text-lg font-black text-white">NT${app.price}</p>
                                                    </div>
                                                    {!unlockedIds.has(app.id) && (
                                                        <button onClick={() => handleUnlockApplicant(app.id)} className="bg-primary text-black px-4 py-2 rounded-lg font-black text-[10px] shadow-lg hover:scale-105 transition-all">🔓 解鎖聯繫方式 (30點)</button>
                                                    )}
                                                </div>

                                                {unlockedIds.has(app.id) && (
                                                    <div className="flex gap-2">
                                                        {app.status === 'pending' ? (
                                                            <>
                                                                <button onClick={() => handleStatusUpdate(app.id, 'accepted')} className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg font-black text-[10px] transition-all">錄用對方</button>
                                                                <button onClick={() => handleStatusUpdate(app.id, 'rejected')} className="flex-1 bg-red-900/50 hover:bg-red-800 text-red-200 py-2 rounded-lg font-black text-[10px] border border-red-700/50 transition-all">婉拒</button>
                                                            </>
                                                        ) : (
                                                            <div className={`w-full text-center py-2 rounded-lg font-black text-[10px] border ${app.status === 'accepted' ? 'bg-green-900/20 text-green-400 border-green-500/30' : 'bg-red-900/20 text-red-400 border-red-500/30'}`}>
                                                                {app.status === 'accepted' ? '✅ 已錄取' : '❌ 已婉拒'}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </div>
            )}

            {/* Post Project Modal */}
            {showPostModal && (
                <div className="fixed inset-0 bg-black/90 z-[500] flex items-center justify-center p-4 backdrop-blur-xl">
                    <div className="bg-gray-900 border border-gray-700 w-full max-w-2xl rounded-[3rem] p-10 space-y-8 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] rounded-full pointer-events-none"></div>
                        <button onClick={() => setShowPostModal(false)} className="absolute top-8 right-8 text-gray-500 hover:text-white transition-colors">✕</button>
                        
                        <div className="space-y-2">
                            <h3 className="text-3xl font-black text-white tracking-tight">發布新的合作案件</h3>
                            <p className="text-gray-400 text-sm">徵才訊息將公開 10 天，所有符合條件的人才皆可主動報名。</p>
                        </div>

                        <div className="space-y-6">
                            <div><label className="block text-[10px] text-gray-500 font-black uppercase tracking-widest mb-2 ml-1">合作案標題</label><input value={newProj.title} onChange={e => setNewProj({...newProj, title: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white outline-none focus:border-primary transition-all" placeholder="例如：尋找 3C 領域創作者進行產品開箱..." /></div>
                            <div><label className="block text-[10px] text-gray-500 font-black uppercase tracking-widest mb-2 ml-1">案情詳細說明</label><textarea value={newProj.description} onChange={e => setNewProj({...newProj, description: e.target.value})} rows={4} className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white outline-none focus:border-primary transition-all resize-none shadow-inner" placeholder="請描述您的產品、預期 KPI、以及希望人才呈現的方式..." /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-[10px] text-gray-500 font-black uppercase tracking-widest mb-2 ml-1">預算區間</label><input value={newProj.budget} onChange={e => setNewProj({...newProj, budget: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white outline-none focus:border-primary transition-all" placeholder="例如：NT$2000 - $5000" /></div>
                                <div><label className="block text-[10px] text-gray-500 font-black uppercase tracking-widest mb-2 ml-1">核心需求標籤</label><input value={newProj.requirements} onChange={e => setNewProj({...newProj, requirements: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white outline-none focus:border-primary transition-all" placeholder="3C, 攝影 (用逗號隔開)" /></div>
                            </div>
                        </div>

                        <div className="bg-primary/10 border border-primary/30 p-4 rounded-2xl flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-black font-black text-xs">P</div>
                                <p className="text-primary text-xs font-bold uppercase tracking-widest">發布費用 (上架10天)</p>
                            </div>
                            <span className="text-xl font-black text-primary">100 點</span>
                        </div>

                        <button onClick={handleCreateProject} disabled={!newProj.title || !newProj.description} className="w-full bg-white text-black py-5 rounded-[2rem] font-black text-xl shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:scale-100">
                            確認並扣點發布
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BrandProjectManager;
