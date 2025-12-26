
import { BrandSettings, CtaItem, ViralType, ViralPlatform, TrendingTopic } from "../types";

// ============================================================================
// THREADS ADVANCED PROMPT LOGIC (Dual-Track)
// ============================================================================

const TAIWAN_THREADS_RULES = `
[🚨 STRICT TAIWAN THREADS FORMATTING RULES]
1. **NO "Hello Everyone"**: NEVER start with "大家好", "哈囉", or generic greetings. Start directly with the thought.
2. **NO Markdown Headers**: Do NOT use ## or ###. Threads is plain text.
3. **Punctuation**: Avoid standard periods (。). Use spaces ( ) or newlines to separate thoughts. This is CRITICAL for the "Threads Vibe".
4. **Natural Flow**: Write as if speaking to a friend (口語化). Avoid "Translationese" (翻譯腔) or robotic transitions like "Firstly/Secondly".
5. **Structure**: Keep it fragmented. A "Stream of consciousness" (碎碎念) style is better than a structured essay.
6. **Engagement**: Don't preach. Invite discussion or relate to common experiences.
7. **Emoji Control**: Use emojis SPARINGLY. Maximum 1-2 emojis per paragraph. **CRITICAL**: Only place emojis at the END of a sentence or block. DO NOT insert emojis in the middle of a sentence (e.g. "Today ☀️ is hot").
`;

const THREADS_PERSONAL_CORE = `
[MODE: PERSONAL / AUTHENTIC CREATOR]
You are a typical "Netizen" (脆友) on Threads Taiwan.
- **Mental State**: Subjective, emotional, reactive, or "lying flat" (躺平).
- **Tone**: Casual, sometimes sarcastic, sometimes just murmuring.
- **Particles**: Use natural Taiwanese sentence-ending particles (e.g., 啦, 吧, 嗎, 喔, 耶, 欸) to sound alive.
- **Emoji Strategy**: Use 🫠, 💀, 🤡, 🙃, 😭 for negative/funny emotions. Remember: Low density, end of sentences only.
${TAIWAN_THREADS_RULES}
`;

const THREADS_BRAND_CORE = `
[MODE: BRAND / PROFESSIONAL FRIEND]
You are a "Social Editor" (社群小編) who acts like a real person, not a robot.
- **Goal**: Engage, don't just broadcast. Be a "Friend" first, "Brand" second.
- **Tone**: Warm, helpful, slightly playful, but maintains brand safety.
- **Particles**: Use polite but casual particles (e.g., 喔, 呢, 吧) to soften the tone. Avoid overly aggressive slang unless specified.
- **Format**: Short paragraphs. Easy to read on mobile.
- **Emoji Strategy**: Clean and minimal. Use friendly emojis (✨, 🙌, ❤️) but do not overdo it.
${TAIWAN_THREADS_RULES}
`;

const SAFETY_GUARDRAILS = `
[🛡️ BRAND SAFETY GUARDRAILS - STRICTLY ENFORCED]
- **NO Politics**: Avoid any mention of political parties, cross-strait relations, or controversial policies.
- **NO NSFW**: Avoid sexual, violent, or gory content.
- **NO Negativity**: Avoid attacking specific groups or individuals.
- **Tone Check**: Even if the topic is negative (e.g., a disaster), focus on safety, care, and positive support.
`;

export const getThreadsSystemInstruction = (
    type: 'personal' | 'brand', 
    styleDNA?: string, 
    safeMode?: boolean
) => {
    let base = type === 'personal' ? THREADS_PERSONAL_CORE : THREADS_BRAND_CORE;
    
    if (safeMode || type === 'brand') {
        base += `\n${SAFETY_GUARDRAILS}`;
    }

    if (styleDNA) {
        base += `\n\n[🧬 USER STYLE DNA]\nAdopt this specific writing persona:\n${styleDNA}\n\n*Prioritize this DNA over generic instructions.*`;
    }

    return base;
};

// Legacy Export for backward compatibility (defaults to personal)
export const SYSTEM_INSTRUCTION_THREADS = THREADS_PERSONAL_CORE;

// ============================================================================
// FACEBOOK & OTHER PROMPTS
// ============================================================================

export const getStrategyPrompt = (brandType?: string) => {
    if (brandType === 'personal') {
        return `[Framework: Personal/Influencer]
      - Focus: Personal narrative, "I" perspective, authentic sharing.
      - Structure: Hook (Personal realization) -> Story -> Soft Value.`;
    }
    return `[Framework: Enterprise/Brand]
      - Focus: Value proposition, Trust, Clarity.
      - Structure: Hook (Pain point) -> Solution (Product) -> Call to Action.`;
};

export const buildCtaPrompt = (ctaList: CtaItem[]) => {
    if (!ctaList || ctaList.length === 0) return "CTA: Encourage engagement (e.g., 'What do you think?', 'Tag a friend').";
    let prompt = "Mandatory CTA (Weave these naturally into the ending, don't just paste links):\n";
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
    
    const referenceMaterials = settings.referenceFiles.map((f, i) => `[Reference Doc ${i+1}]: ${f.content.substring(0, 1000)}`).join('\n');
    const productContext = settings.productContext 
        ? `[Core Product Knowledge]: ${settings.productContext}` 
        : `[Brand Services]: ${settings.services}\n[Website]: ${settings.website}`;

    const styleInstruction = settings.brandStyleGuide 
        ? `[🔥 CRITICAL: BRAND STYLE DNA]\nAdopt the following writing style extracted from the brand's best past posts. \n${settings.brandStyleGuide}\n\n*Prioritize this Style DNA over generic tone settings.*`
        : `[Tone Settings]\nTone: ${settings.brandTone}\nPersona: ${settings.persona}`;

    const contextPrompt = topicContext ? `\n[News Context]: ${topicContext.title} (${topicContext.url})` : '';

    return `
    Role: You are the AI twin of this brand's best social media manager.
    Task: Write a Facebook post about "${topic}".

    ${productContext}
    ${referenceMaterials}
    
    ${styleInstruction}
    
    ${strategyPrompt}

    [Content Source Rules]
    1. **Grounding**: Use facts from [Core Product Knowledge] and [Reference Docs] if relevant. Do not invent product features.
    2. **News Integration**: If [News Context] is provided, link the news topic to the brand's value proposition naturally.

    [Drafting Instructions - "The Anti-AI Vibe"]
    1. **No Robot-Speak**: Avoid cliches like "In today's digital age", "Unlock your potential", "Game-changer".
    2. **Hook**: Start immediately. No "Hello everyone". Jump into the pain point or the emotion.
    3. **Formatting**: Use double line breaks between paragraphs for readability. 
    4. **Length**: ${options.length}.
    5. **Hashtags**: Put at the very end: ${settings.fixedHashtags} ${options.tempHashtags}
    6. **CTA**: ${ctaPrompt} (Return CTA text in JSON 'ctaText' field, but also weave the logic into the caption end).

    Output JSON Format:
    {
      "caption": "The full post text (Traditional Chinese, Taiwan phrasing, emojis included)",
      "ctaText": "Standalone CTA text with links", 
      "imagePrompt": "Detailed English image prompt describing a scene/mood (Midjourney style)",
      "videoPrompt": "Detailed English video prompt for Veo"
    }
    `;
};

// ============================================================================
// VIRAL MODE (Xiaohongshu/Clickbait Style)
// ============================================================================

export const buildViralPrompt = (
    topic: string,
    options: { audience: string, viralType: string | 'auto', platform: ViralPlatform, versionCount: number },
    settings: BrandSettings
) => {
    const productInfo = settings.productContext || settings.services || '';
    
    return `
    Role: Professional Viral Marketing Copywriter (Taiwan Market).
    Task: Write ONE high-converting, "Viral Style" Facebook post about: "${topic}".
    Language: Traditional Chinese (Taiwan).
    
    [Context Info]
    Product/Brand: ${productInfo}
    Target Audience: ${options.audience}

    [🔥 STRATEGY: THE "XIAOHONGSHU" (小紅書) FORMULA]
    You must adopt a "Key Opinion Consumer" (KOC) persona. Do NOT sound like a company.
    
    1. **The Hook (First Line)**: 
       - Must be a "Regret", "Warning", or "Shocking Discovery" headline.
       - Use brackets like 【...】 or emojis 🚨 / 🔥.
       - Example: "【救命】真的後悔沒早點知道..." or "🚨千萬不要亂買，除非你看過這篇！".

    2. **The Vibe**: 
       - "Bestie talk" (姐妹閒聊). 
       - Use emotional keywords: "真的絕了", "寶藏", "避雷", "感動哭", "懂的都懂".
       - Be slightly exaggerated but authentic.

    3. **The Format (Critical)**: 
       - **Double line breaks** between EVERY paragraph. No walls of text.
       - Use emojis as bullet points (✨, 👉, ✅, ❌) to list benefits or features.
       - Short sentences. Fast rhythm.

    [🖼️ VISUAL PROMPT INSTRUCTION (STRICT)]
    You MUST generate a "imagePrompt" field for AI image generation.
    - **Language**: English ONLY. (Do NOT use Chinese in imagePrompt).
    - **Style**: Photorealistic, Cinematic Lighting, 8K, Commercial Photography, Depth of Field.
    - **Content**: Visually represent the topic "${topic}" in a stunning, high-quality way. 
    - **Example**: "A close-up of a glowing skincare bottle on a marble table, water droplets, soft morning sunlight, 8k resolution, shot on Hasselblad."

    Output JSON Schema:
    {
      "caption": "The full post content in Traditional Chinese. Include headline at the top and hashtags at the bottom.",
      "imagePrompt": "Detailed ENGLISH image prompt. High quality photography style."
    }
    `;
};

export const buildAnalysisPrompt = (posts: string) => `
      You are a Computational Linguist specializing in Social Media Analysis.
      
      Input: A collection of a brand's recent Facebook posts.
      Task: Deconstruct the writing style to create a "Brand Style DNA" prompt instruction.
      
      Analyze these dimensions:
      1. **Sentence Rhythm**: Short vs Long? Fragmented? Formal vs Conversational?
      2. **Vocabulary**: Slang usage? Professional jargon? Warm vs Distant?
      3. **Formatting**: Line break frequency? Bullet points usage?
      4. **Emoji Signature**: Heavy usage? Specific recurring emojis?
      5. **Hook Strategy**: How do they start posts? (Question? Statement? Story?)
      
      Posts to Analyze:
      ${posts.substring(0, 10000)}

      Output: A concise, directive paragraph (in English) that instructs an AI how to write exactly like this. 
      Start with "Write in a style that is..."
      Do NOT describe the brand ("This brand sells shoes"), describe the *Voice* ("The voice is energetic, uses frequent exclamations...").
`;

// NEW: Threads Specific Style Analysis
export const buildThreadsAnalysisPrompt = (posts: string) => `
      You are an expert on "Threads" (the social app) culture in Taiwan.
      
      Input: Recent Threads posts from a user.
      Task: Create a "Persona Instruction" (DNA) that helps an AI write EXACTLY like this user.
      
      Focus on:
      - **Chaos Level**: Is it organized or random murmuring?
      - **Emotion**: Is it cranky (厭世), happy, or neutral?
      - **Formatting**: Do they use periods? (Threads users often don't). Do they use vertical spacing?
      - **Keywords**: Any specific catchphrases (e.g., 笑死, www, 煩)?
      
      Target Posts:
      ${posts.substring(0, 10000)}
      
      Output: A single paragraph instruction (in English) starting with "You are a Threads user who..."
`;

export const buildSeoArticlePrompt = (topic: string, length: string, keywords: string, options: { agenda: boolean, meta: boolean, faq: boolean, refLinks: boolean }) => `
    Role: Senior SEO Content Strategist (Taiwan).
    Task: Write a comprehensive, high-value blog article on "${topic}".

    [Requirements]
    1. Length: ${length} (Strictly adhere to this).
    2. Keywords: ${keywords} (Integrate naturally for SEO).
    3. Language: Traditional Chinese (Taiwan).
    4. Structure:
       ${options.agenda ? '- Include "Table of Contents" (目錄) at the top.' : ''}
       ${options.meta ? '- Include "Meta Description" for search engines.' : ''}
       - Introduction (Hook)
       - Main Body (Use H2/H3)
       ${options.faq ? '- FAQ Section (3-5 common questions).' : ''}
       ${options.refLinks ? '- References/External Links (simulated).' : ''}
       - Conclusion

    Output JSON Format:
    {
       "fullText": "The complete article in Markdown...",
       "imageKeyword": "Single English keyword for stock image search"
    }
`;
