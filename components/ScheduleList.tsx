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
    <div className="bg-card p-4 rounded-lg border border-gray-700 flex gap-4 hover:border-gray-500 transition-colors">
        <div className="w-24 h-24 bg-dark rounded flex-shrink-0 overflow-hidden flex items-center justify-center border border-gray-800">
            {post.mediaUrl ? (
                post.mediaType === 'image' ? 
                <img src={post.mediaUrl} className="w-full h-full object-cover" alt="Post media" /> :
                <div className="text-2xl">🎥</div>
            ) : (
                <div className="text-xs text-gray-500">No Media</div>
            )}
        </div>
        
        <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start mb-2">
                <h4 className="font-bold text-lg text-white truncate pr-2">{post.topic}</h4>
                <div className="flex items-center gap-2">
                   <span className={`px-2 py-1 text-xs rounded uppercase font-bold whitespace-nowrap ${
                      post.status === 'published' ? 'bg-green-900 text-green-200' :
                      post.status === 'scheduled' ? 'bg-blue-900 text-blue-200' :
                      post.status === 'failed' ? 'bg-red-900 text-red-200' :
                      'bg-gray-700 text-gray-300'
                   }`}>
                      {post.status === 'published' ? '已發佈' : 
                          post.status === 'scheduled' ? '排程中' : 
                          post.status === 'failed' ? '失敗' : '草稿'}
                   </span>
                   
                   {/* Actions */}
                   {post.status === 'scheduled' && (
                     <button onClick={() => onEdit(post)} className="text-xs text-blue-400 hover:text-blue-300 border border-blue-900 bg-blue-900/20 px-2 py-1 rounded">
                       編輯
                     </button>
                   )}
                   <button onClick={() => onDelete(post.id)} className="text-xs text-red-400 hover:text-red-300 border border-red-900 bg-red-900/20 px-2 py-1 rounded">
                     刪除
                   </button>
                </div>
            </div>
            <p className="text-sm text-gray-400 line-clamp-2 mb-2">{post.caption}</p>
            
            <div className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1 items-center">
                <span className="flex items-center gap-1">
                  🕒 建立於: {new Date(post.createdAt).toLocaleDateString()}
                </span>
                {post.scheduledDate && (
                  <span className="text-blue-300 flex items-center gap-1">
                    📅 預計發佈: {new Date(post.scheduledDate).toLocaleString()}
                  </span>
                )}
                {post.publishedUrl && (
                  <a href={post.publishedUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                    🔗 查看貼文
                  </a>
                )}
                {post.status === 'failed' && (
                  <span className="text-red-400 flex items-center gap-1">
                    ⚠️ 錯誤: {post.errorLog}
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
    if (confirm('確定要刪除此貼文紀錄嗎？')) {
      const updated = posts.filter(p => p.id !== id);
      onUpdatePosts(updated);
    }
  };

  const handleClearHistory = () => {
    if (confirm('確定要清除所有已發佈或失敗的紀錄嗎？(排程中貼文不會被刪除)')) {
      const updated = posts.filter(p => p.status === 'scheduled');
      onUpdatePosts(updated);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-10">
      
      {/* View Toggle */}
      <div className="flex justify-end border-b border-gray-700 pb-4">
          <div className="bg-dark border border-gray-600 rounded p-1 flex">
              <button 
                  onClick={() => setViewMode('list')}
                  className={`px-4 py-1.5 rounded text-sm font-bold transition-all ${viewMode === 'list' ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'}`}
              >
                  📜 列表模式
              </button>
              <button 
                  onClick={() => setViewMode('calendar')}
                  className={`px-4 py-1.5 rounded text-sm font-bold transition-all ${viewMode === 'calendar' ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'}`}
              >
                  📅 行事曆模式
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
          <div className="space-y-10">
              <section>
                <div className="flex items-center gap-2 mb-4 border-b border-gray-700 pb-2">
                    <h2 className="text-2xl font-bold text-blue-400">📅 排程中的貼文</h2>
                    <span className="text-sm text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{scheduledPosts.length}</span>
                </div>
                
                {scheduledPosts.length === 0 ? (
                    <div className="text-center text-gray-500 py-8 bg-card/50 rounded-lg border border-dashed border-gray-700">
                        目前沒有排程中的貼文。
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
                <div className="flex items-center justify-between mb-4 border-b border-gray-700 pb-2">
                    <div className="flex items-center gap-2">
                        <h2 className="text-2xl font-bold text-gray-200">📜 發文歷史紀錄</h2>
                        <span className="text-sm text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{historyPosts.length}</span>
                    </div>
                    {historyPosts.length > 0 && (
                      <button onClick={handleClearHistory} className="text-xs text-red-400 hover:text-white border border-red-900 hover:bg-red-900 px-3 py-1 rounded transition-colors">
                        清除歷史紀錄
                      </button>
                    )}
                </div>

                {historyPosts.length === 0 ? (
                    <div className="text-center text-gray-500 py-8 bg-card/50 rounded-lg border border-dashed border-gray-700">
                        尚無歷史紀錄。
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