
import React, { useState } from 'react';
import { Post, BrandSettings } from '../types';
import CalendarView from './CalendarView';
import { reschedulePost, deleteFbPost } from '../services/facebookService';

interface Props {
  posts: Post[];
  onUpdatePosts: (posts: Post[]) => void;
  onEditPost: (post: Post) => void;
  settings?: BrandSettings; // Need Token for API ops
}

const PostItem: React.FC<{ 
  post: Post; 
  onDelete: (id: string) => void; 
  onEdit: (post: Post) => void;
}> = ({ post, onDelete, onEdit }) => (
    <div className="bg-card p-5 rounded-2xl border border-gray-800 flex flex-col sm:flex-row gap-4 sm:gap-6 hover:border-gray-700 transition-all group">
        <div className="w-full sm:w-28 h-48 sm:h-28 bg-dark rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center border border-gray-800 shadow-inner">
            {post.mediaUrl ? (
                post.mediaType === 'image' ? 
                <img src={post.mediaUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="Post media" /> :
                <div className="text-[10px] font-black text-gray-600 uppercase">影片</div>
            ) : (
                <div className="text-[10px] font-black text-gray-700 uppercase tracking-tighter text-center px-2">無影像素材</div>
            )}
        </div>
        
        <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div className="flex justify-between items-start mb-3">
                <h4 className="font-bold text-lg text-white truncate pr-4 tracking-tight">{post.topic}</h4>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                   <span className={`px-2.5 py-1 text-[9px] rounded-lg uppercase font-black tracking-widest border ${
                      post.status === 'published' ? 'bg-green-900/20 text-green-400 border-green-500/30' :
                      post.status === 'scheduled' ? 'bg-blue-900/20 text-blue-400 border-blue-500/30' :
                      post.status === 'failed' ? 'bg-red-900/20 text-red-400 border-red-500/30' :
                      'bg-gray-800 text-gray-500 border-gray-700'
                   }`}>
                      {post.status === 'published' ? '已發佈' : 
                          post.status === 'scheduled' ? '排程中' : 
                          post.status === 'failed' ? '發佈失敗' : '內容草稿'}
                   </span>
                   
                   {post.status === 'scheduled' && (
                     <button onClick={() => onEdit(post)} className="text-[10px] font-black uppercase tracking-widest text-blue-400 hover:text-white transition-colors">
                       編輯
                     </button>
                   )}
                   <button onClick={() => onDelete(post.id)} className="text-[10px] font-black uppercase tracking-widest text-red-400/60 hover:text-red-400 transition-colors">
                     移除
                   </button>
                </div>
            </div>
            <p className="text-sm text-gray-500 line-clamp-2 mb-3 leading-relaxed">{post.caption}</p>
            
            <div className="text-[10px] font-medium text-gray-600 flex flex-wrap gap-x-6 gap-y-2 items-center uppercase tracking-widest">
                <span className="flex items-center gap-2">
                  建立於: {new Date(post.createdAt).toLocaleDateString()}
                </span>
                {post.scheduledDate && (
                  <span className="text-blue-500/80 flex items-center gap-2 font-bold">
                    排程於: {new Date(post.scheduledDate).toLocaleString()}
                  </span>
                )}
                {post.publishedUrl && (
                  <a href={post.publishedUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-2 font-black">
                    連結: 查看貼文
                  </a>
                )}
                {post.status === 'failed' && (
                  <span className="text-red-500/80 flex items-center gap-2">
                    錯誤: {post.errorLog}
                  </span>
                )}
            </div>
        </div>
    </div>
);

const ScheduleList: React.FC<Props> = ({ posts, onUpdatePosts, onEditPost, settings }) => {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [isApiLoading, setIsApiLoading] = useState(false);

  const sortedPosts = [...posts].sort((a, b) => b.createdAt - a.createdAt);
  
  const scheduledPosts = sortedPosts.filter(p => p.status === 'scheduled');
  const historyPosts = sortedPosts.filter(p => p.status !== 'scheduled');

  const extractFbPostId = (post: Post): string | null => {
      if (!post.publishedUrl) return null;
      // Url format usually: https://facebook.com/{POST_ID} or https://facebook.com/{PAGE_ID}/posts/{POST_ID}
      const parts = post.publishedUrl.split('/');
      // Removing empty strings from split
      const validParts = parts.filter(p => p);
      return validParts[validParts.length - 1];
  };

  const handleDelete = async (id: string) => {
    const targetPost = posts.find(p => p.id === id);
    if (!targetPost) return;

    const isNativeScheduled = targetPost.status === 'scheduled' && targetPost.publishedUrl;
    
    if (confirm(`確定要永久移除此紀錄嗎？${isNativeScheduled ? '\n\n⚠️ 注意：這是一篇「FB 原生排程」貼文，刪除此紀錄將同步刪除 FB 後台的排程。' : ''}`)) {
      
      // 1. If it's a real FB scheduled post, delete from FB first
      if (isNativeScheduled) {
          if (!settings?.facebookToken) return alert("❌ 錯誤：缺少 Page Token，無法刪除 FB 排程。請先至設定頁面檢查。");
          
          const fbId = extractFbPostId(targetPost);
          if (fbId) {
              setIsApiLoading(true);
              const res = await deleteFbPost(fbId, settings.facebookToken);
              setIsApiLoading(false);
              
              if (!res.success) {
                  return alert(`❌ FB 刪除失敗: ${res.error}\n(本地紀錄未刪除)`);
              }
          }
      }

      // 2. Delete Local Record
      const updated = posts.filter(p => p.id !== id);
      onUpdatePosts(updated);
    }
  };

  const handleClearHistory = () => {
    if (confirm('確定要清除所有已發佈或失敗的歷史紀錄嗎？')) {
      const updated = posts.filter(p => p.status === 'scheduled');
      onUpdatePosts(updated);
    }
  };

  // Handler for Calendar Drag-and-Drop
  const handleReschedule = async (post: Post, newDateStr: string) => {
      if (!settings?.facebookToken) throw new Error("缺少 Page Token，無法連線 FB。");
      
      const fbId = extractFbPostId(post);
      if (!fbId) throw new Error("找不到 FB Post ID (publishedUrl 格式不符)。");

      const newUnix = Math.floor(new Date(newDateStr).getTime() / 1000);
      
      // Call API
      const res = await reschedulePost(fbId, settings.facebookToken, newUnix);
      
      if (!res.success) {
          throw new Error(`FB API 拒絕請求: ${res.error}`);
      }

      // Success: Update local state
      const updated = posts.map(p => p.id === post.id ? { ...p, scheduledDate: newDateStr } : p);
      onUpdatePosts(updated);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-fade-in pb-10 pt-4 relative">
      
      {isApiLoading && (
          <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm rounded-xl">
              <div className="text-white font-bold flex flex-col items-center">
                  <div className="loader border-t-red-500 mb-2"></div>
                  同步刪除中...
              </div>
          </div>
      )}

      {/* RESPONSIVE CHANGE: Stack header contents on mobile */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-800 pb-6">
          <h2 className="text-3xl font-black text-white tracking-tighter uppercase">排程管理與歷史</h2>
          <div className="bg-dark/80 border border-gray-800 rounded-xl p-1.5 flex gap-1 shadow-inner w-full md:w-auto">
              <button 
                  onClick={() => setViewMode('list')}
                  className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition-all ${viewMode === 'list' ? 'bg-primary text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
              >
                  列表
              </button>
              <button 
                  onClick={() => setViewMode('calendar')}
                  className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition-all ${viewMode === 'calendar' ? 'bg-primary text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
              >
                  行事曆
              </button>
          </div>
      </div>

      {viewMode === 'calendar' ? (
          <CalendarView 
              posts={posts} 
              onUpdatePosts={onUpdatePosts} 
              onEditPost={onEditPost} 
              onReschedule={handleReschedule}
          />
      ) : (
          <div className="space-y-16">
              <section>
                <div className="flex items-center gap-3 mb-6">
                    <h3 className="text-sm font-black text-blue-400 uppercase tracking-[0.2em]">待發佈任務</h3>
                    <span className="text-[10px] bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20 font-black">{scheduledPosts.length}</span>
                </div>
                
                {scheduledPosts.length === 0 ? (
                    <div className="text-center text-gray-600 py-16 bg-dark/20 rounded-3xl border-2 border-dashed border-gray-800 flex flex-col items-center justify-center">
                        <span className="text-[10px] font-black uppercase tracking-widest">目前無待處理的排程貼文</span>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {scheduledPosts.map(post => (
                            <PostItem 
                                key={post.id} 
                                post={post} 
                                onDelete={handleDelete} 
                                onEdit={onEditPost} 
                            />
                        ))}
                    </div>
                )}
              </section>

              <section>
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <h3 className="text-sm font-black text-gray-500 uppercase tracking-[0.2em]">歷史發佈紀錄</h3>
                        <span className="text-[10px] bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full border border-gray-700 font-black">{historyPosts.length}</span>
                    </div>
                    {historyPosts.length > 0 && (
                      <button onClick={handleClearHistory} className="text-[10px] font-black text-red-400/60 hover:text-red-400 uppercase tracking-widest transition-colors">
                        清除所有歷史
                      </button>
                    )}
                </div>

                {historyPosts.length === 0 ? (
                    <div className="text-center text-gray-700 py-16 bg-dark/10 rounded-3xl border border-gray-800">
                        <span className="text-[10px] font-black uppercase tracking-widest">尚無歷史紀錄</span>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {historyPosts.map(post => (
                            <PostItem 
                                key={post.id} 
                                post={post} 
                                onDelete={handleDelete} 
                                onEdit={onEditPost} 
                            />
                        ))}
                    </div>
                )}
              </section>
          </div>
      )}
    </div>
  );
};

export default ScheduleList;