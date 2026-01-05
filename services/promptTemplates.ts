
import { BrandSettings, CtaItem, ViralType, ViralPlatform, TrendingTopic, ImageIntent, UserRole } from "../types";

// ============================================================================
// COMMERCIAL IMAGE PROMPT LOGIC
// ============================================================================

const getStyleKeywords = (style: string): string => {
    const map: Record<string, string> = {
        'minimalist': 'Minimalist design, lots of negative space, clean lines, Apple style, soft shadows, uncluttered composition.',
        'vibrant': 'Pop art vibes, high saturation, bold contrasting colors, energetic, dynamic composition, trendy.',
        'luxury': 'Elegant, sophisticated, dark mood, gold accents, serif typography styling, premium materials, marble and velvet textures.',
        'retro': 'Vintage 90s aesthetic, grain filter, vaporwave colors, nostalgia, flash photography style, lo-fi.',
        'warm_family': 'Cozy atmosphere, warm color temperature (golden hour), soft focus, candid lifestyle moments, authentic, welcoming.',
        'tech_futuristic': 'Cyberpunk elements, neon lights, isometric view, glass textures, data visualization elements, dark mode.',
        'nature_organic': 'Earth tones, natural sunlight, botanical elements, wooden textures, sustainable vibe, fresh, airy.'
    };
    return map[style] || 'Professional commercial photography, clean layout.';
};

const getIndustryLogic = (industry: string): string => {
    // Basic keyword matching
    const lower = industry.toLowerCase();
    if (lower.includes('food') || lower.includes('餐廳') || lower.includes('美食')) return 'Food photography, appetizing, natural texture, social media style.';
    if (lower.includes('beauty') || lower.includes('美妝') || lower.includes('skincare')) return 'Beauty product shot, soft skin texture, pastel tones, clean background.';
    if (lower.includes('tech') || lower.includes('3c') || lower.includes('電子')) return 'Product rendering, studio lighting, modern gadget, clean desk setup.';
    if (lower.includes('travel') || lower.includes('旅遊')) return 'Scenic shot, adventure, wanderlust, travel photography, iconic landmarks.';
    if (lower.includes('fashion') || lower.includes('服飾')) return 'Fashion lookbook, model pose, street style, trendy outfit.';
    return 'Commercial photography.';
};

const getIntentLogic = (intent: ImageIntent): string => {
    switch (intent) {
        case 'product_showcase': return 'Focus on the product in the center. Clean background. "Hero shot" composition.';
        case 'promotion': return 'Layout designed for an ad banner. Leave some negative space on the side. Eye-catching background.';
        case 'lifestyle': return 'Candid shot of people utilizing the product in real life context. Authentic emotion. Natural lighting. Not posed.';
        case 'educational': return 'Infographic style layout or flat lay composition. Knolling photography. Organized items.';
        case 'festival': return 'Festive atmosphere. Holiday decorations. Celebration vibe.';
        default: return '';
    }
};

export const buildCommercialImagePrompt = (
    subject: string,
    settings: BrandSettings,
    intent: ImageIntent,
    userRole: string
): string => {
    const styleKeywords = getStyleKeywords(settings.visualStyle);
    const industryKeywords = getIndustryLogic(settings.industry);
    const intentKeywords = getIntentLogic(intent);
    
    // Color Logic
    let colorInstruction = '';
    if (settings.brandColors && settings.brandColors.length > 0) {
        colorInstruction = `Dominant Color Palette: ${settings.brandColors.join(', ')}. Use these colors for background or accents.`;
    }

    // Brand Name Injection (For Ideogram mainly)
    let textInstruction = '';
    if (settings.brandName && (intent === 'product_showcase' || intent === 'promotion')) {
        textInstruction = `Visible Text: "${settings.brandName}" integrated naturally on the product or background sign. Typography should match the ${settings.visualStyle} style.`;
    }

    // Assembly - STRICTLY STANDARD QUALITY
    return `
    [Subject]: ${subject}
    [Industry Context]: ${industryKeywords}
    [Design Style]: ${styleKeywords}
    [Layout/Intent]: ${intentKeywords}
    [Brand Colors]: ${colorInstruction}
    ${textInstruction}
    
    [Technical Specs]: Standard web quality, realistic social media photo, natural lighting, clear focus. 
    (Do NOT use: 8k, masterpiece, highly detailed, octane render).
    `;
};

// ============================================================================
// NEW: DEDICATED PROMPT GENERATOR
// ============================================================================

export const buildImagePromptGenerationPrompt = (caption: string, intent: string, style: string) => {
    return `
    Role: Art Director.
    Task: Create a concise English image generation prompt based on the following social media caption.
    
    [Caption Context]:
    "${caption.substring(0, 500)}..."

    [Visual Requirements]:
    - Intent: ${intent} (e.g. Lifestyle, Product Shot)
    - Style: ${style} (e.g. Minimalist, Warm)
    
    [Instructions]:
    1. Describe the MAIN visual subject clearly (What is in the photo?).
    2. Add lighting and mood keywords based on the Style.
    3. Keep it realistic and suitable for standard commercial photography.
    4. Output ONLY the English prompt string. No explanations.
    `;
};

// ============================================================================
// THREADS & OTHERS (Existing)
// ============================================================================

const TAIWAN_THREADS_RULES = `
[🚨 STRICT TAIWAN THREADS FORMATTING RULES]
1. **NO "Hello Everyone"**: NEVER start with "大家好", "哈囉". Start directly with the thought.
2. **NO Markdown Headers**: Do NOT use ## or ###.
3. **Punctuation**: Avoid standard periods (。). Use spaces ( ) or newlines.
4. **Natural Flow**: Write as if speaking to a friend (口語化).
5. **Structure**: Keep it fragmented. A "Stream of consciousness" (碎碎念) style.
6. **Line Breaks**: Force Double Newlines (\\n\\n) to separate paragraphs.
`;

const THREADS_PERSONAL_CORE = `
[MODE: PERSONAL / AUTHENTIC CREATOR]
You are a typical "Netizen" (脆友) on Threads Taiwan.
- **Mental State**: Subjective, emotional, or "lying flat" (躺平).
- **Tone**: Casual, sometimes sarcastic.
- **Particles**: Use natural Taiwanese sentence-ending particles (e.g., 啦, 吧, 嗎, 喔).
${TAIWAN_THREADS_RULES}
`;

const THREADS_BRAND_CORE = `
[MODE: BRAND / PROFESSIONAL FRIEND]
You are a "Social Editor" (社群小編) who acts like a real person.
- **Goal**: Engage, don't just broadcast.
- **Tone**: Warm, helpful, slightly playful.
${TAIWAN_THREADS_RULES}
`;

export const getThreadsSystemInstruction = (type: 'personal' | 'brand', styleDNA?: string, safeMode?: boolean) => {
    let base = type === 'personal' ? THREADS_PERSONAL_CORE : THREADS_BRAND_CORE;
    if (safeMode || type === 'brand') base += `\n[🛡️ BRAND SAFETY]: NO Politics, NO NSFW, NO Negativity.`;
    if (styleDNA) base += `\n\n[🧬 USER STYLE DNA]:\n${styleDNA}\n\n*Prioritize this DNA.*`;
    return base;
};

export const SYSTEM_INSTRUCTION_THREADS = THREADS_PERSONAL_CORE;

export const getStrategyPrompt = (brandType?: string) => {
    if (brandType === 'personal') {
        return `[Framework: Personal/Influencer]\n- Focus: Personal narrative, "I" perspective.\n- Structure: Hook -> Story -> Value.`;
    }
    return `[Framework: Enterprise/Brand]\n- Focus: Value proposition, Trust.\n- Structure: Hook -> Solution -> CTA.`;
};

export const buildCtaPrompt = (ctaList: CtaItem[]) => {
    if (!ctaList || ctaList.length === 0) return "CTA: Encourage engagement.";
    let prompt = "Mandatory CTA:\n";
    ctaList.forEach(cta => { prompt += `- ${cta.text}: ${cta.url}\n`; });
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
    
    const referenceMaterials = settings.referenceFiles.map((f, i) => `[Ref ${i+1}]: ${f.content.substring(0, 800)}`).join('\n');
    const styleInstruction = settings.brandStyleGuide ? `[BRAND STYLE DNA]:\n${settings.brandStyleGuide}` : `[Tone]: ${settings.brandTone}`;
    const contextPrompt = topicContext ? `\n[News Context]: ${topicContext.title} (${topicContext.url})` : '';

    return `
    Role: Professional Social Media Manager (Taiwan).
    Task: Write a Facebook post about "${topic}".

    ${referenceMaterials}
    ${styleInstruction}
    ${strategyPrompt}
    ${contextPrompt}

    [Drafting Instructions]
    1. **No Robot-Speak**: Avoid "In today's digital age".
    2. **Hook**: Start immediately. No "Hello everyone".
    3. **Formatting**: Use double line breaks.
    4. **Length**: ${options.length}.
    5. **Hashtags**: Put at the very end: ${settings.fixedHashtags} ${options.tempHashtags}
    6. **CTA**: ${ctaPrompt}

    Output JSON Format (Do NOT generate image prompts here):
    {
      "caption": "The full post text (Traditional Chinese, Taiwan phrasing, emojis included)",
      "ctaText": "Standalone CTA text"
    }
    `;
};

export const buildViralPrompt = (
    topic: string,
    options: { audience: string; viralType: string | 'auto', platform: ViralPlatform, versionCount: number },
    settings: BrandSettings
) => {
    return `
    Role: Viral Marketing Copywriter (Taiwan).
    Task: Write ONE "Viral Style" Facebook post about: "${topic}".
    Target Audience: ${options.audience}

    [🔥 STRATEGY: XIAOHONGSHU FORMULA]
    1. **Hook**: "Regret", "Warning", or "Shocking". Use brackets 【...】.
    2. **Vibe**: "Bestie talk". Use keywords: "真的絕了", "寶藏", "避雷".
    3. **Format**: Group sentences. Use emojis as bullets.

    Output JSON Schema (Text only):
    {
      "caption": "The full post content in Traditional Chinese."
    }
    `;
};

export const buildAnalysisPrompt = (posts: string) => `
      Analyze these Facebook posts to extract a "Brand Style DNA".
      Focus on: Sentence Rhythm, Vocabulary, Formatting, Emoji usage.
      Input: ${posts.substring(0, 8000)}
      Output: A concise English instruction starting with "Write in a style that is..."
`;

export const buildThreadsAnalysisPrompt = (posts: string) => `
      Analyze these Threads posts to create a "Persona Instruction".
      Focus on: Chaos level, Emotion (cranky/happy), Formatting (no periods?).
      Input: ${posts.substring(0, 8000)}
      Output: A single English instruction paragraph starting with "You are a Threads user who..."
`;

export const buildSeoArticlePrompt = (topic: string, length: string, keywords: string, options: { agenda: boolean, meta: boolean, faq: boolean, refLinks: boolean }) => `
    Role: SEO Content Strategist (Taiwan).
    Task: Write a blog article on "${topic}".
    Length: ${length}. Keywords: ${keywords}.
    Structure: ${options.agenda ? 'Agenda,' : ''} Intro, Body (H2/H3), ${options.faq ? 'FAQ,' : ''} Conclusion.
    Output JSON: { "fullText": "Markdown content...", "imageKeyword": "English keyword for stock photo" }
`;

// ============================================================================
// DNA LAB PROMPT
// ============================================================================

const TIER_APPEARANCE_LOGIC = {
    'user': 'No equipment, just the bare creature skin. Basic look.',
    'starter': 'Wearing simple beginner clothing (e.g., T-shirt, Hoodie, or a basic Suit).',
    'pro': 'Wearing advanced fantasy armor or elegant robes. Equipped with a small accessory like a floating orb or cape.',
    'business': 'Legendary tier equipment. Glowing golden aura. Wearing a crown or futuristic visor. Extremely flashy.',
    'admin': 'God-tier equipment. Cosmic texture. Glitch effects.'
};

export const buildDNALabAnalysisPrompt = (posts: string) => `
    Role: Social Media Psychologist & Game Master.
    Task: Analyze the user's Threads posts to determine their "Digital Soul Species" and RPG Stats.
    
    [Input Posts]:
    "${posts.substring(0, 10000)}"

    [Step 1: Determine Species & Base Look]
    Based on the tone (e.g., Toxic, Chill, Emo, Professional, Chaotic), assign a Fantasy Creature.
    - Examples: 
      - Toxic/Chaos -> Goblin or Imp
      - Chill/Lazy -> Sloth or Snorlax-like creature
      - Professional -> Wise Owl or Robot
      - Emo -> Ghost or weeping spirit
      - Happy/Energetic -> Doge or Slime
    
    [Step 2: Calculate Stats (0-100)]
    - chaos: How unhinged/random?
    - chill: How relaxed/unbothered?
    - intellect: How informative/smart?
    - aggression: How argumentative?
    - emo: How emotional/sad?
    - luck: (Randomize this one high)

    [Step 3: Generate Title & Roast]
    - Title: RPG Style Title (e.g., "Level 99 Keyboard Warrior", "The Midnight Emo Lord").
    - Comment: A short, funny, slightly roasting comment about their posting habits (Traditional Chinese).

    Output JSON ONLY:
    {
      "species": "Name of the creature (e.g. Cyber Goblin)",
      "visualDescription": "A cute 2D Maplestory style [Creature Name], chibi proportions, big head small body, [Color] skin.",
      "stats": { "chaos": 0, "chill": 0, "intellect": 0, "aggression": 0, "emo": 0, "luck": 0 },
      "title": "Traditional Chinese Title",
      "comment": "Traditional Chinese Roast"
    }
`;

export const buildDNALabImagePrompt = (baseDescription: string, userRole: UserRole) => {
    const tierTrait = TIER_APPEARANCE_LOGIC[userRole] || TIER_APPEARANCE_LOGIC['user'];
    
    return `
    Style: Maplestory, 2D Side-Scrolling Game Art, Vector Illustration, Chibi Style, White Background.
    Subject: ${baseDescription}
    Equipment/Outfit: ${tierTrait}
    
    Important:
    - Must be a full body character shot.
    - Clean white background.
    - High quality, sharp lines, vibrant colors.
    `;
};
