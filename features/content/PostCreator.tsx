
import React from 'react';
import { BrandSettings, Post } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { usePostGenerator } from './hooks/usePostGenerator';
import { TopicSelector } from './components/TopicSelector';
import { EditorControls } from './components/EditorControls';
import { PreviewCard } from './components/PreviewCard';

interface Props {
  settings: BrandSettings;
  onPostCreated: (post: Post) => void;
  editPost?: Post | null;
  onCancel?: () => void;
  scheduledPostsCount?: number;
  initialTopic?: string; 
  initialSourceUrl?: string; // New
}

const LoadingOverlay: React.FC<{ message: string, subMessage?: string }> = ({ message, subMessage }) => (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-8 backdrop-blur-xl animate-fade-in text-center">
        <div className="loader mb-6 scale-150 border-t-primary"></div>
        <h2 className="text-2xl font-black text-white mb-2 tracking-tight">{message}</h2>
        {subMessage && <p className="text-gray-400 font-mono text-xs uppercase tracking-widest">{subMessage}</p>}
    </div>
);

export const PostCreator: React.FC<Props> = ({ settings, onPostCreated, editPost, onCancel, scheduledPostsCount = 0, initialTopic, initialSourceUrl }) => {
  const { userProfile, refreshProfile } = useAuth();
  
  const { 
      step, setStep, 
      topic, setTopic, 
      mode, setMode, 
      trends, draft, image, publish,
      sourceUrl, setSourceUrl // From hook
  } = usePostGenerator(settings, onPostCreated, refreshProfile, editPost, initialTopic, initialSourceUrl);

  const role = userProfile?.role || 'user';
  const limit = role === 'pro' ? 5 : (role === 'business' ? 10 : (role === 'admin' ? 100 : 3));

  // --- Loading States ---
  if (draft.isGenerating) return <LoadingOverlay message="AI 正在構思文案..." />;
  if (image.isGenerating) return <LoadingOverlay message={image.phase} subMessage="請稍候，正在為您打造專屬素材" />;
  if (publish.isPublishing) return <LoadingOverlay message="正在傳送至 Facebook..." />;

  // --- Step 1: Topic Selection ---
  if (step === 1) {
      return (
          <TopicSelector 
              topic={topic} 
              setTopic={setTopic} 
              mode={mode} 
              setMode={setMode} 
              trends={trends} 
              onNext={draft.generate} 
              onSetSourceUrl={setSourceUrl} // Pass handler
          />
      );
  }

  // --- Step 2: Editor & Preview ---
  return (
    <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in pt-4 pb-20">
        <EditorControls 
            mode={mode}
            draft={draft}
            image={image}
            onBack={() => setStep(1)}
        />
        
        <PreviewCard 
            caption={draft.data.caption}
            imageUrl={image.url}
            scheduleDate={publish.scheduleDate}
            setScheduleDate={publish.setScheduleDate}
            onPublish={publish.execute}
            publishResult={publish.result}
            clearResult={() => publish.setResult(null)}
            scheduledPostsCount={scheduledPostsCount}
            limit={limit}
            sourceUrl={sourceUrl} // Pass URL to preview
        />
    </div>
  );
};
