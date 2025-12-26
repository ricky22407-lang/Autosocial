
import React, { useState } from 'react';
import { Post } from '../types';

interface Props {
  posts: Post[];
  onUpdatePosts: (posts: Post[]) => void;
  onEditPost: (post: Post) => void;
  onReschedule?: (post: Post, newDate: string) => Promise<void>; // New callback
}

const CalendarView: React.FC<Props> = ({ posts, onUpdatePosts, onEditPost, onReschedule }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [draggedPostId, setDraggedPostId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Constants
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const taiwanHolidays: Record<string, string> = {
      '1-1': '元旦',
      '2-28': '228',
      '4-4': '兒童節',
      '4-5': '清明節',
      '5-1': '勞動節',
      '10-10': '國慶日',
      '12-25': '聖誕節'
  };

  // Calendar Logic
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  // Navigation
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  // DnD Handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
      setDraggedPostId(id);
      e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = async (e: React.DragEvent, day: number) => {
      e.preventDefault();
      if (!draggedPostId || isProcessing) return;

      const targetDate = new Date(year, month, day, 9, 0, 0); // Default 9 AM
      const newDateStr = targetDate.toISOString().slice(0, 16); 

      // Validation: Facebook Native Scheduling constraints (10 mins to 30 days)
      const now = Date.now();
      const diffMinutes = (targetDate.getTime() - now) / 1000 / 60;
      
      if (diffMinutes < 15) {
          return alert("❌ 錯誤：新時間距離現在太近 (需大於 15 分鐘)，FB 拒絕排程。");
      }
      if (diffMinutes > 30 * 24 * 60) {
          return alert("❌ 錯誤：排程時間不能超過 30 天。");
      }

      const post = posts.find(p => p.id === draggedPostId);
      if (!post) return;

      // Logic: If onReschedule provided (Connected to FB API), use it. Else fall back to local update.
      if (onReschedule && post.status === 'scheduled') {
          setIsProcessing(true);
          try {
              await onReschedule(post, newDateStr);
          } catch (err: any) {
              alert(`改期失敗: ${err.message}`);
          } finally {
              setIsProcessing(false);
              setDraggedPostId(null);
          }
      } else {
          // Fallback for draft/local only or if no handler provided
          const updatedPosts = posts.map(p => {
              if (p.id === draggedPostId) {
                  return { 
                      ...p, 
                      status: 'scheduled' as const,
                      scheduledDate: newDateStr 
                  };
              }
              return p;
          });
          onUpdatePosts(updatedPosts);
          setDraggedPostId(null);
      }
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
  };

  // Render Cells
  const renderCells = () => {
      const cells = [];
      
      // Empty cells
      for (let i = 0; i < firstDay; i++) {
          cells.push(<div key={`empty-${i}`} className="bg-dark/30 border border-gray-700 min-h-[100px]"></div>);
      }

      // Days
      for (let day = 1; day <= daysInMonth; day++) {
          const dateKey = `${month + 1}-${day}`;
          const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
          const holiday = taiwanHolidays[dateKey];

          const dayPosts = posts.filter(p => {
              if (!p.scheduledDate) return false;
              const pDate = new Date(p.scheduledDate);
              return pDate.getFullYear() === year && pDate.getMonth() === month && pDate.getDate() === day;
          });

          cells.push(
              <div 
                  key={day} 
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, day)}
                  className={`border border-gray-700 min-h-[100px] p-2 relative hover:bg-gray-800/50 transition-colors ${isToday ? 'bg-blue-900/10' : 'bg-card'}`}
              >
                  <div className="flex justify-between items-start mb-2">
                      <span className={`text-sm font-bold ${isToday ? 'text-primary bg-primary/20 px-2 rounded-full' : 'text-gray-400'}`}>{day}</span>
                      {holiday && <span className="text-xs text-red-400 border border-red-900/50 px-1 rounded bg-red-900/10">{holiday}</span>}
                  </div>

                  <div className="space-y-1">
                      {dayPosts.map(post => (
                          <div 
                              key={post.id}
                              draggable={!isProcessing} // Disable drag while processing
                              onDragStart={(e) => handleDragStart(e, post.id)}
                              onClick={() => onEditPost(post)}
                              className={`text-xs p-1 rounded cursor-pointer truncate shadow-sm hover:opacity-80 border-l-2 relative ${
                                  post.status === 'published' ? 'bg-green-900 text-green-100 border-green-500' :
                                  post.status === 'failed' ? 'bg-red-900 text-red-100 border-red-500' :
                                  'bg-blue-900 text-blue-100 border-blue-500'
                              } ${isProcessing ? 'opacity-50 cursor-wait' : ''}`}
                              title={post.topic}
                          >
                              {new Date(post.scheduledDate!).getHours().toString().padStart(2, '0')}:00 {post.topic}
                          </div>
                      ))}
                  </div>
              </div>
          );
      }

      return cells;
  };

  return (
    <div className="animate-fade-in relative">
        {isProcessing && (
            <div className="absolute inset-0 bg-black/50 z-10 flex items-center justify-center backdrop-blur-sm rounded-lg">
                <div className="text-white font-bold flex flex-col items-center">
                    <div className="loader border-t-primary mb-2"></div>
                    同步 Facebook 排程中...
                </div>
            </div>
        )}

        <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold text-white">📅 {year} 年 {month + 1} 月</h2>
                <div className="flex gap-2">
                    <button onClick={prevMonth} className="p-1 px-3 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm">◀ 上個月</button>
                    <button onClick={() => setCurrentDate(new Date())} className="p-1 px-3 bg-primary hover:bg-blue-600 rounded text-white text-sm">今天</button>
                    <button onClick={nextMonth} className="p-1 px-3 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm">下個月 ▶</button>
                </div>
            </div>
            
            <div className="flex gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"></div> 已發佈</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div> 排程中 (可拖移改期)</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div> 失敗</span>
            </div>
        </div>

        {/* Header */}
        <div className="grid grid-cols-7 gap-1 mb-1">
            {weekDays.map(d => (
                <div key={d} className="text-center text-gray-500 font-bold py-2 bg-dark rounded border border-gray-700">
                    {d}
                </div>
            ))}
        </div>

        {/* Body */}
        <div className="grid grid-cols-7 gap-1">
            {renderCells()}
        </div>
        
        <p className="text-xs text-gray-500 mt-4 text-center">💡 提示：拖移藍色卡片將直接同步修改 FB 後台排程時間 (需等待約 2-3 秒)。</p>
    </div>
  );
};

export default CalendarView;
