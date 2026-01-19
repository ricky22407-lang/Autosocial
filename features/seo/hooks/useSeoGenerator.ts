
import { useState } from 'react';
import { generateSeoArticle } from '../../../services/geminiService';
import { checkAndUseQuota, logUserActivity } from '../../../services/authService';
import { UserProfile } from '../../../types';

export const useSeoGenerator = (user: UserProfile | null, onQuotaUpdate: () => void) => {
    // Input States
    const [topic, setTopic] = useState('');
    const [length, setLength] = useState('約 800 字');
    const [keywords, setKeywords] = useState('');
    
    // Options
    const [optAgenda, setOptAgenda] = useState(true);
    const [optMeta, setOptMeta] = useState(true);
    const [optFAQ, setOptFAQ] = useState(true);
    const [optRefLinks, setOptRefLinks] = useState(true);

    // Output States
    const [resultText, setResultText] = useState('');
    const [imageKeyword, setImageKeyword] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [copyBtnText, setCopyBtnText] = useState('複製全文');

    const handleGenerate = async () => {
        if (!topic.trim()) {
            setErrorMsg("請輸入核心關鍵字！");
            return;
        }
        if (!user || isGenerating) return;

        setErrorMsg('');
        
        // [BILLING] SEO Articles: 15 Credits
        const COST = 15;

        try {
            const allowed = await checkAndUseQuota(user.user_id, COST, 'GENERATE_SEO_ARTICLE', { topic });
            if (!allowed) return;
            onQuotaUpdate();
        } catch (e) {
            setErrorMsg("資料庫連線錯誤，無法確認配額。");
            return;
        }

        setIsGenerating(true);
        setResultText('');
        setImageKeyword('');

        try {
            const result = await generateSeoArticle(
                topic, 
                length, 
                keywords, 
                { agenda: optAgenda, meta: optMeta, faq: optFAQ, refLinks: optRefLinks }
            );
            setResultText(result.fullText);
            setImageKeyword(result.imageKeyword);

            logUserActivity({
                uid: user.user_id,
                act: 'seo',
                topic: topic,
                prmt: `Keywords: ${keywords}, Length: ${length}`,
                res: result.fullText,
                params: JSON.stringify({ options: { optAgenda, optMeta, optFAQ } })
            });

        } catch (e: any) {
            console.error(e);
            setErrorMsg(`生成失敗: ${e.message || "未知錯誤"}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCopy = () => {
        if (!resultText) return;
        navigator.clipboard.writeText(resultText).then(() => {
            setCopyBtnText('已複製！');
            setTimeout(() => setCopyBtnText('複製全文'), 2000);
        });
    };

    return {
        topic, setTopic,
        length, setLength,
        keywords, setKeywords,
        options: { optAgenda, setOptAgenda, optMeta, setOptMeta, optFAQ, setOptFAQ, optRefLinks, setOptRefLinks },
        resultText, imageKeyword, setImageKeyword,
        isGenerating, errorMsg, copyBtnText,
        handleGenerate, handleCopy
    };
};
