
export interface OpportunityPost {
  username?: string;
  content: string;
  url: string;
  reasoning: string; // Why AI selected this
  intentScore: number; // 1-10
  replyCount?: string; // New: Estimated reply count from snippet
  likeCount?: string; // New: Estimated like count from snippet
}

// Enums
export enum AppView {
  LOGIN = 'LOGIN',
  MARKET = 'MARKET', // New Homepage
  CREATE = 'CREATE',
  SCHEDULE = 'SCHEDULE',
  SETTINGS = 'SETTINGS',
  ANALYTICS = 'ANALYTICS',
  AUTOMATION = 'AUTOMATION',
  SEO_ARTICLES = 'SEO_ARTICLES',
  THREADS_NURTURE = 'THREADS_NURTURE',
  CONNECT = 'CONNECT', 
  PRICING = 'PRICING',
  REFERRAL = 'REFERRAL',
  CONTACT_SUPPORT = 'CONTACT_SUPPORT',
  ADMIN = 'ADMIN'
}

export enum ErrorCode {
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  FACEBOOK_API_ERROR = 'FACEBOOK_API_ERROR',
  AI_GENERATION_ERROR = 'AI_GENERATION_ERROR',
}

// Stock Market Types
export interface StockTrend {
    id: string; // Hash or Title
    title: string;
    price: number; // Heat Score 0-100
    change: number; // Percentage change
    volume: string; // Formatted number string
    newsUrl: string; // Source link
    aiSummary?: string; // Shared Cache
    summaryUpdatedAt?: number;
    updatedAt: number;
}

// User & Auth
export type UserRole = 'user' | 'starter' | 'pro' | 'business' | 'admin';

export type SubscriptionStatus = 'none' | 'active' | 'canceled' | 'past_due';

export interface Subscription {
    status: SubscriptionStatus;
    planId: string;
    lastPaymentDate?: number;
    nextBillingDate?: number;
    cancelAtPeriodEnd?: boolean;
}

export interface QuotaBatch {
    id: string;
    amount: number;
    initialAmount: number;
    expiresAt: number;
    source: 'trial' | 'topup' | 'subscription' | 'admin_gift' | 'referral' | 'system';
    addedAt: number;
}

export interface UserProfile {
  user_id: string;
  email: string;
  role: UserRole;
  quota_used: number;
  quota_total: number;
  quota_reset_date?: number;
  quota_batches?: QuotaBatch[];
  expiry_warning_level?: number;
  subscription?: Subscription;
  referralCode?: string;
  referredBy?: string;
  referralCount?: number;
  unlockedFeatures?: string[];
  isSuspended?: boolean;
  last_api_call_timestamp?: number;
  
  // Connect Module Limits & Status
  connect_invites_used?: number;
  connect_applications_used?: number;
  hasAgreedConnectTerms?: boolean; // New Field: Legal Disclaimer Agreement
  
  created_at: number;
  updated_at: number;
}

// Connect Module Types
export interface ContactDetails {
    email: string;
    lineId?: string;
    phone?: string;
}

export interface ConnectedAccountData {
    platform: 'Facebook' | 'Instagram' | 'Threads' | 'YouTube' | 'TikTok';
    id: string;
    name: string;
    followers: number;
    engagement: number;
}

export interface SocialCard {
    id: string; // usually same as userId
    userId: string;
    displayName: string;
    avatarUrl?: string;
    role: UserRole;
    tags: string[]; // e.g. "Foodie", "Travel"
    categories: string[]; // e.g. "美食", "旅遊"
    specialties?: string[]; // New: 擅長形式 (Short Video, Blog, etc.)
    platforms?: string[]; // New: Operating Platforms
    
    // Detailed breakdown of connected pages/accounts
    connectedAccounts?: ConnectedAccountData[];

    followersCount: number;
    engagementRate: number;
    
    // New Metrics
    ytAvgViews?: number; // YouTube avg views (monthly)
    tiktokAvgViews?: number; // TikTok avg views (monthly, self-reported)
    websiteAvgViews?: number; // Website avg views (monthly, self-reported)

    priceRange: string; // e.g. "500 - 1,500"
    bio: string;
    isBoosted?: boolean;
    boostExpiresAt?: number;
    contactInfo?: ContactDetails;
    portfolio?: {
        imageUrl: string;
        link: string;
        stats: string;
    }[];
    updatedAt?: number;
    isVisible: boolean;
}

export interface Campaign {
    id: string;
    ownerId: string; // Brand User ID
    brandName: string;
    brandLogo?: string;
    title: string;
    description: string;
    budget: string;
    requirements: string[]; // Custom text requirements
    acceptedSpecialties?: string[]; // New: Structured requirements
    targetPlatforms?: string[]; // New: Target platforms
    contactInfo?: ContactDetails; // New: Brand Contact Info
    category: string;
    deadline: number;
    quotaRequired: number; // For future use
    applicantsCount: number;
    createdAt: number;
    isActive: boolean;
}

// Social & Brand
export interface ThreadsAccount {
  id: string;
  userId: string;
  token: string;
  username: string;
  isActive: boolean;
  personaPrompt?: string;
  accountType?: 'personal' | 'brand';
  safetyFilter?: boolean;
  styleGuide?: string;
}

export interface AutoReplyRule {
  keyword: string;
  response: string;
}

export interface AutoPilotConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  postWeekDays?: number[];
  postTime: string;
  source: 'trending' | 'keywords';
  keywords: string[];
  mediaTypePreference: 'image' | 'video' | 'mixed';
}

export interface ThreadsAutoPilotConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  postWeekDays: number[];
  postTime: string;
  imageMode: 'ai_url' | 'stock_url' | 'none';
  targetAccountIds: string[];
}

export interface BrandSettings {
  brandName?: string;
  industry: string;
  brandType?: 'personal' | 'enterprise';
  services?: string;
  website?: string;
  productInfo: string;
  brandTone: string;
  persona: string;
  brandColors: string[];
  targetAudience: string;
  visualStyle: string;
  facebookPageId: string;
  facebookToken: string;
  threadsAccounts?: ThreadsAccount[];
  referenceFiles: { name: string; content: string }[];
  fixedHashtags?: string;
  logoUrl?: string;
  brandStyleGuide?: string;
  competitorUrls?: string[];
  autoReply?: {
    enabled: boolean;
    defaultResponse: string;
    rules: AutoReplyRule[];
  };
  autoPilot?: AutoPilotConfig;
  threadsAutoPilot?: ThreadsAutoPilotConfig;
  
  // Connect Module Settings
  connectProfile?: SocialCard;
}

// Content
export interface Post {
  id: string;
  userId: string;
  topic: string;
  caption: string;
  firstComment?: string;
  mediaPrompt: string;
  mediaType: 'image' | 'video';
  mediaUrl?: string;
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  scheduledDate?: string;
  publishedUrl?: string;
  errorLog?: string;
  syncInstagram?: boolean;
  createdAt: number;
}

export interface TrendingTopic {
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
}

export interface CtaItem {
    text: string;
    url: string;
}

export type ImageIntent = 'product_showcase' | 'promotion' | 'lifestyle' | 'educational' | 'festival';

// Analytics
export interface DemographicData {
    ageGroup: string;
    gender: 'M' | 'F' | 'U';
    value: number;
}

export interface AnalyticsData {
  followers: number;
  followersGrowth: number;
  reach: number; // Unique Users
  impressions: number; // Total Views
  engagementRate: number;
  negativeFeedback: number;
  period: string;
  demographics?: DemographicData[];
}

export interface TopPostData {
  id: string;
  message: string;
  imageUrl: string;
  reach: number;
  engagedUsers: number;
  created_time: string;
  permalink_url: string;
}

export interface DashboardStats {
    totalUsers: number;
    activeUsersToday: number;
    totalApiCallsToday: number;
    errorCountToday: number;
}

// System & Admin
export interface LogEntry {
    id: string;
    timestamp: number;
    userEmail: string;
    action: string;
    status: 'success' | 'warning' | 'error';
    details: string;
}

export interface SystemConfig {
    maintenanceMode: boolean;
    dryRunMode: boolean;
}

export interface UserReport {
    id: string;
    userId: string;
    userEmail: string;
    description: string;
    userAgent: string;
    currentView: string;
    timestamp: number;
    status: 'OPEN' | 'RESOLVED' | 'CLOSED';
}

export interface AdminKey {
    key: string;
    type: 'RESET_QUOTA' | 'UPGRADE_ROLE' | 'UNLOCK_FEATURE' | 'ADD_POINTS';
    targetRole?: UserRole;
    targetFeature?: string;
    pointsAmount?: number;
    createdBy: string;
    createdAt: number;
    expiresAt: number;
    isUsed: boolean;
    usedBy?: string;
    usedAt?: number;
}

export interface UsageLog {
    uid: string;
    act: string;
    topic?: string;
    prmt?: string;
    res?: string;
    params?: string;
    ts: number;
}

export interface QuotaTransaction {
    txId: string;
    userId: string;
    amount: number;
    balanceAfter: number;
    action: string;
    timestamp: number;
    metadata?: any;
}

export interface QueueState {
    isQueuing: boolean;
    position: number;
    totalWaiting: number;
    currentAction: string;
}

// Viral & DNA
export type ViralType = 'shocking' | 'story' | 'contrarian' | 'educational' | 'listicle' | 'auto';
export type ViralPlatform = 'facebook' | 'instagram' | 'threads' | 'linkedin';

export interface TitleScore {
    title: string;
    score: number;
    breakdown: {
        emotion: number;
        curiosity: number;
        identity: number;
        specific: number;
        authenticity: number;
    };
    comment: string;
}

export interface ViralPostDraft {
    versions: string[];
    imagePrompt: string;
}

export interface DNALabAnalysis {
    species: string;
    visualDescription: string;
    stats: {
        chaos: number;
        chill: number;
        intellect: number;
        aggression: number;
        emo: number;
        luck: number;
    };
    title: string;
    comment: string;
    imageUrl?: string;
}

// API Response
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: ErrorCode;
    message: string;
    details?: any;
  };
  timestamp: number;
}
