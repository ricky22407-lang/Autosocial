import React, { useState } from 'react';
import { Post } from '../types';
import CalendarView from './CalendarView';

interface Props {
  posts: Post[];
  onUpdatePosts: (posts: Post[]) => void;
  onEditPost: (post: Post) => void;
}

const PostItem: React.FC<{ 
  post: Post; 
  onDelete: (id: string) => void; 
  onEdit: (post: Post) => void;
}> = ({ post, onDelete, onEdit }) => (
    <div className="bg-card p-5 rounded-2xl border border-gray-800 flex gap-6 hover:border-gray-700 transition-all group">
        <div className="w-28 h-28 bg-dark rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center border border-gray-800 shadow-inner">
            {post.mediaUrl ? (
                post.mediaType === 'image' ? 
                <img src={post.mediaUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="Post media" /> :
                <div className="text-[10px] font-black text-gray-600 uppercase">Video</div>
            ) : (
                <div className="text-[10px] font-black text-gray-700 uppercase tracking-tighter text-center px-2">No Visual Asset</div>
            )}
        </div>
        
        <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div className="flex justify-between items-start mb-3">
                <h4 className="font-bold text-lg text-white truncate pr-4 tracking-tight">{post.topic}</h4>
                <div className="flex items-center gap-2">
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
                  Created: {new Date(post.createdAt).toLocaleDateString()}
                </span>
                {post.scheduledDate && (
                  <span className="text-blue-500/80 flex items-center gap-2 font-bold">
                    Schedule: {new Date(post.scheduledDate).toLocaleString()}
                  </span>
                )}
                {post.publishedUrl && (
                  <a href={post.publishedUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-2 font-black">
                    Link: View Post
                  </a>
                )}
                {post.status === 'failed' && (
                  <span className="text-red-500/80 flex items-center gap-2">
                    Error: {post.errorLog}
                  </span>
                )}
            </div>
        </div>
    </div>
);

const ScheduleList: React.FC<Props> = ({ posts, onUpdatePosts, onEditPost }) => {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  const sortedPosts = [...posts].sort((a, b) => b.createdAt - a.createdAt);
  
  const scheduledPosts = sortedPosts.filter(p => p.status === 'scheduled');
  const historyPosts = sortedPosts.filter(p => p.status !== 'scheduled');

  const handleDelete = (id: string) => {
    if (confirm('確定要永久移除此貼文紀錄嗎？')) {
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

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-fade-in pb-10 pt-4">
      
      <div className="flex justify-between items-center border-b border-gray-800 pb-6">
          <h2 className="text-3xl font-black text-white tracking-tighter uppercase">排程管理與歷史</h2>
          <div className="bg-dark/80 border border-gray-800 rounded-xl p-1.5 flex gap-1 shadow-inner">
              <button 
                  onClick={() => setViewMode('list')}
                  className={`px-6 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition-all ${viewMode === 'list' ? 'bg-primary text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
              >
                  列表
              </button>
              <button 
                  onClick={() => setViewMode('calendar')}
                  className={`px-6 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition-all ${viewMode === 'calendar' ? 'bg-primary text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
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
                        <span className="text-[10px] font-black uppercase tracking-widest">尚無歷史紀錄紀錄</span>
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
