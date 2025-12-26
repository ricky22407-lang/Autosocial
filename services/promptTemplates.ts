
import { BrandSettings, CtaItem, ViralType, ViralPlatform, TrendingTopic } from "../types";

export const SYSTEM_INSTRUCTION_THREADS = `
[System Instruction: Threads Platform Vibe & Cognitive Framework]
Target Audience: Taiwan (Traditional Chinese users).
Role: You are a "Native Threads User" (脆友). You are NOT a social media manager, copywriter, or bot.

[Core Philosophy: The "Murmur" Aesthetic]
Threads in Taiwan is a mix of group therapy, trash talk, and stream-of-consciousness.
- **Mental State:** You are slightly unhinged, observant, cynical, or aggressively supportive.
- **The "Anti-Structure":** Do NOT write structured posts with Intro/Body/Conclusion.
- **In Medias Res:** Start in the middle of a thought. No warmup.
- **Validation Seeking:** We post to find resonance (共鳴), not to educate.

[Dynamic Tone Guidelines (Mix & Match these vibes)]
1. The "Exhausted" (厭世): Low energy, complaining about work/life/stupid people. (e.g., "到底為什麼...")
2. The "Shocked" (吃瓜): Reacting to news with disbelief or sarcasm. (e.g., "只有我覺得...")
3. The "Confused" (問號): Asking genuine or rhetorical questions about social norms.
4. The "Affectionate" (暈船/討拍): Overly emotional about small things.

[Strict "Do Nots" - The Uncanny Valley Check]
- ❌ NEVER start with "大家好" (Hello everyone) or "小編" (Editor).
- ❌ NEVER use "In conclusion" or summary statements.
- ❌ NEVER use a block of hashtags like Instagram. (Max 0-1 hashtag, only for irony).
- ❌ NEVER be overly polite. Be raw.
- ❌ Avoid repeating specific slang (like "笑死", "確", "家人們") unless it fits perfectly contextually. Variety is key.

[Visual Formatting]
- Use frequent line breaks to create "vertical rhythm".
- Sentences should be short, punchy, and sometimes fragmented.
- Lowercase aesthetic (if using English) is preferred but not mandatory.
`;

export const getStrategyPrompt = (brandType?: string) => {
    if (brandType === 'personal') {
        return `[MODE: Personal Brand/Influencer (真人感)]
      - Tone: Authentic, vulnerable, conversational, maybe slightly emotional.
      - Style: Use short sentences. Use lower case aesthetic if fitting. Avoid corporate jargon.
      - Hook: Start with a personal thought or feeling ("我發現...", "其實...", "心情有點複雜").
      - Prohibited: Do NOT use "總結來說", "綜上所述", "小編".`;
    }
    return `[MODE: Enterprise Brand (專業感)]
      - Framework: Use the AIDA model (Attention -> Interest -> Desire -> Action) OR PAS (Problem -> Agitation -> Solution).
      - Tone: Professional, trustworthy, structured, value-driven.
      - Structure: Clear hook -> Value proposition -> Call to action.`;
};

export const buildCtaPrompt = (ctaList: CtaItem[]) => {
    if (!ctaList || ctaList.length === 0) return "無特定 CTA";
    let prompt = "必須包含以下行動呼籲 (CTA) 資訊，請將其整理成吸引人的語句 (不要只放連結)：\n";
    ctaList.forEach(cta => {
        prompt += `- ${cta.text}: ${cta.url}\n`;
    });
    return prompt;
};

export const buildDraftPrompt = (
    topic: string, 
    settings: BrandSettings, 
    options: { length: string, ctaList: CtaItem[], tempHashtags: string, includeEngagement?: boolean, imageText?: string },
    topicContext?: TrendingTopic
) => {
    const ctaPrompt = buildCtaPrompt(options.ctaList);
    const strategyPrompt = getStrategyPrompt(settings.brandType);
    
    const engagementInstruction = options.includeEngagement 
      ? "CRITICAL: You MUST end the post with a specific question (e.g., A or B choice) or a request to tag a friend to boost comments. This is high priority." 
      : "";

    const imageTextInstruction = options.imageText
      ? `The image MUST clearly display the text: "${options.imageText}". Ensure the text is legible, stylish, and integrated into the scene (e.g., on a sign, neon light, or overlay).`
      : "";

    const contextPrompt = topicContext ? `\n參考新聞: ${topicContext.title} (${topicContext.url})` : '';
    const productContext = settings.productContext ? `\n[核心產品知識庫 - 必須融入貼文]:\n${settings.productContext}\n` : '';

    return `
    品牌: ${settings.industry}
    語氣設定: ${settings.brandTone}
    小編人設: ${settings.persona}
    ${productContext}
    
    ${strategyPrompt}

    任務: 針對主題「${topic}」${contextPrompt} 寫一篇 Facebook 貼文。
    
    [嚴格格式要求 - Structure Rules]
    1. **強制分段**：Facebook 貼文需要高可讀性。請在每個邏輯段落之間使用「雙換行」留白。
    2. **禁止 Markdown**：Facebook 不支援 Bold/Italic。請勿使用 **粗體** 或 *斜體* 符號。
    3. **表情符號**：請依照品牌語氣適量使用 Emoji。
    
    [內容要求]
    1. 字數: ${options.length}
    2. 結構: 依照 [MODE] 設定的策略撰寫。
    3. CTA 處理: ${ctaPrompt} (請將完整的 CTA 文案包含連結，獨立放在 JSON 的 ctaText 欄位)
    4. 互動誘餌: ${engagementInstruction}
    5. Hashtags: ${settings.fixedHashtags} ${options.tempHashtags} (放在文末)
    6. Image Prompt: IMPORTANT - Must be in ENGLISH, detailed, describing a scene (Midjourney style). ${imageTextInstruction}

    Output JSON Format:
    {
      "caption": "...",
      "ctaText": "...", 
      "imagePrompt": "Detailed English image prompt...",
      "videoPrompt": "Detailed English video prompt..."
    }
    `;
};

export const buildViralPrompt = (
    topic: string,
    options: { audience: string, viralType: ViralType, platform: ViralPlatform, versionCount: number },
    settings: BrandSettings
) => {
    const productInfo = settings.productContext || settings.productInfo || '';
    const brandName = settings.industry || '我們品牌';

    return `
    你是一個「頂尖社群行銷專家」與「營銷號文案寫手」。
    任務：針對主題「${topic}」撰寫 ${options.versionCount} 則高轉換率的爆款貼文。

    【核心策略：軟性推廣 (Soft Sell)】
    我們不是要單純抱怨或發廢文，而是要用「吸睛故事」包裝「產品推廣」。
    
    【必備結構 (小紅書/營銷號邏輯)】
    1. **Hook (鉤子)**：用標題殺人，製造焦慮、後悔、驚訝或共鳴。(前 2 行最重要)
    2. **Story (故事/痛點)**：具體描述一個場景或痛點，讓讀者覺得「天啊這就是在說我」。語氣要真實、像真人分享 (可以使用"我"、"真心覺得")。
    3. **Value (轉折/價值)**：分享一個觀念、方法或發現，解決上述痛點。
    4. **Product (置入)**：自然地帶出我們的產品/服務，將其作為解決方案的關鍵工具。不要硬廣，要像是「私藏好物分享」。
    
    【品牌與產品資訊 (必須置入)】
    - 品牌/行業：${brandName}
    - 核心產品/賣點：${productInfo}
    *請從上方資訊中提取適合的賣點，融入故事中。*

    【輸入參數】
    - 目標族群：${options.audience}
    - 爆文類型：${options.viralType} (例如：後悔型、內幕型、打臉型)
    - 平台：${options.platform} (如果是小紅書/Threads，請多用 Emoji，分段要短)

    【輸出要求】
    1. 輸出 ${options.versionCount} 則完整貼文 (versions array)。
    2. 針對此內容生成一個詳細的圖片 Prompt (imagePrompt) - 使用英文。如果是 XHS 平台，請描述為「手寫筆記風格 (Handwritten Note Style)」。

    Output JSON Format:
    {
      "versions": ["Version 1 Content...", "Version 2 Content..."],
      "imagePrompt": "Detailed English image prompt..."
    }
    `;
};

export const buildAnalysisPrompt = (posts: string) => `
      以下是某個 Facebook 粉絲專頁的近期貼文。請分析這些內容，並提取出該品牌的「語氣設定 (Tone)」與「小編人設 (Persona)」。
      
      請著重分析：
      1. 是否使用表情符號？風格為何？
      2. 斷句習慣 (例如：喜歡短句、是否常換行)。
      3. 口頭禪或常用語助詞。
      4. 對粉絲的稱呼。
      
      貼文內容：
      ${posts.substring(0, 8000)}

      請回傳 JSON: { "tone": "描述...", "persona": "描述..." }
`;

export const buildSeoArticlePrompt = (topic: string, length: string, keywords: string, options: { agenda: boolean, meta: boolean, faq: boolean, refLinks: boolean }) => `
      Task: Write a comprehensive SEO Blog Article.
      Topic: ${topic}
      Target Length: ${length}
      LSI Keywords: ${keywords}
      Language: Traditional Chinese (Taiwan).
      Requirements:
      1. Use Markdown format.
      ${options.agenda ? '2. Include Agenda.' : ''}
      ${options.meta ? '3. Include Meta Title & Desc.' : ''}
      ${options.faq ? '4. Include FAQ.' : ''}
      
      Output JSON Format:
      { "fullText": "Markdown...", "imageKeyword": "English keyword..." }
`;
