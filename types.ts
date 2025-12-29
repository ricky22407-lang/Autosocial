
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

export enum ErrorCode {
  UNAUTHORIZED = 'AUTH_001',
  FORBIDDEN = 'AUTH_002',
  TOKEN_EXPIRED = 'AUTH_003',
  NOT_FOUND = 'RES_001',
  VALIDATION_ERROR = 'RES_002',
  QUOTA_EXCEEDED = 'BIZ_001',
  FEATURE_LOCKED = 'BIZ_002',
  FACEBOOK_API_ERROR = 'EXT_FB_001',
  AI_API_ERROR = 'EXT_AI_001',
  INTERNAL_ERROR = 'SYS_001',
  MAINTENANCE_MODE = 'SYS_002',
  RATE_LIMIT_EXCEEDED = 'SYS_003'
}

export type UserRole = 'user' | 'starter' | 'pro' | 'business' | 'admin';

// NEW: Batch Tracking
export interface QuotaBatch {
  id: string;
  amount: number;        // Current remaining balance in this batch
  initialAmount: number; // Original amount (for records)
  expiresAt: number;     // Expiration Timestamp
  source: 'subscription' | 'topup' | 'referral' | 'admin_gift' | 'trial';
  addedAt: number;
}

export interface UserProfile {
  user_id: string;
  email: string;
  role: UserRole;
  quota_total: number; // Sum of all valid batches (Read-only view)
  quota_used: number;  // Lifetime usage stats
  quota_reset_date: number; // Deprecated but kept for legacy UI compatibility (represents earliest expiry)
  quota_batches?: QuotaBatch[]; // NEW: The source of truth
  expiry_warning_level?: 0 | 1 | 2; 
  isSuspended: boolean;
  unlockedFeatures: string[]; 
  referralCode?: string;
  referredBy?: string;
  referralCount?: number;
  last_api_call_timestamp?: number; 
  created_at: number;
  updated_at: number;
}

export interface QuotaTransaction {
  txId: string;
  userId: string;
  amount: number; // Negative for cost, Positive for refill
  balanceAfter: number;
  action: string;
  refId?: string; // Optional: Post ID or Task ID
  timestamp: number;
  metadata?: any;
}

export interface UsageLog {
  uid: string;
  act: 'draft' | 'img' | 'seo' | 'threads' | 'viral' | 'score' | 'video';
  topic: string;
  prmt: string;
  res: string;
  params?: string;
  ts: number;
}

export interface ReferenceFile {
  name: string;
  content: string;
}

export interface ThreadsAccount {
  id: string;
  username: string;
  userId: string;
  token: string;
  isActive: boolean;
  // New Fields for Style Learning
  accountType: 'personal' | 'brand'; // Personal = Chaos/Authentic, Brand = Safe/Professional
  styleGuide?: string; // AI learned style DNA
  safetyFilter?: boolean; // For Brands to avoid controversy
  personaPrompt?: string; // Manual override
}

export interface ThreadsAutoPilotConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  postWeekDays: number[];
  postTime: string;
  imageMode: 'ai_url' | 'stock_url' | 'none';
  targetAccountIds?: string[];
  lastRunAt?: number;
}

// NEW: Brand Visual Identity Types
export type DesignStyle = 'minimalist' | 'vibrant' | 'luxury' | 'retro' | 'warm_family' | 'tech_futuristic' | 'nature_organic';
export type ImageIntent = 'product_showcase' | 'promotion' | 'lifestyle' | 'educational' | 'festival';

export interface BrandSettings {
  industry: string; // e.g., 'Food', 'Beauty', 'Tech'
  brandName: string; // NEW
  brandType: 'enterprise' | 'personal';
  services: string;
  website: string;
  productInfo: string;
  productContext?: string;
  brandTone: string;
  persona: string;
  logoUrl?: string;
  
  // NEW: Visual Identity
  brandColors: string[]; // Array of Hex Codes [Primary, Secondary, Accent]
  targetAudience: string;
  visualStyle: DesignStyle;
  
  brandStylePrompt?: string; // For Image Generation Style (Legacy/Override)
  brandStyleGuide?: string; // NEW: For Text Generation Style (AI Analyzed)
  
  // Facebook Page Settings (User Specific)
  facebookPageId: string;
  facebookToken: string;
  
  tokenExpiry?: number;
  
  threadsAccounts?: ThreadsAccount[];
  threadsAutoPilot?: ThreadsAutoPilotConfig;
  fixedHashtags: string;
  referenceFiles: ReferenceFile[];
  autoReply: AutoReplyConfig;
  autoPilot: AutoPilotConfig;
}

export interface AutoReplyRule {
  keyword: string;
  response: string;
}

export interface AutoReplyConfig {
  enabled: boolean;
  defaultResponse: string;
  rules: AutoReplyRule[];
}

export interface AutoPilotConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  postWeekDays?: number[];
  postTime: string;
  source: 'trending' | 'keywords'; // Removed 'competitor'
  keywords: string[];
  mediaTypePreference: 'image' | 'video' | 'mixed';
  lastRunAt?: number;
}

export interface CtaItem {
  text: string;
  url: string;
}

export interface Post {
  id: string;
  userId: string;
  topic: string;
  caption: string;
  mediaType: 'image' | 'video' | 'none';
  mediaUrl?: string;
  mediaPrompt: string;
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  scheduledDate?: string;
  publishedUrl?: string;
  firstComment?: string;
  errorLog?: string;
  createdAt: number;
  syncInstagram?: boolean;
}

export interface TrendingTopic {
  title: string;
  description: string;
  url?: string;
  imageUrl?: string;
}

export interface CachedTrendData {
  id: string;
  topics: TrendingTopic[];
  createdAt: number;
  industry: string;
}

export type ViralType = 'regret' | 'expose' | 'counter' | 'identity' | 'result';
export type ViralPlatform = 'facebook' | 'threads' | 'xhs';

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

export interface AnalyticsData {
  followers: number;
  followersGrowth: number;
  reach: number;
  engagementRate: number;
  period: string;
}

export interface TopPostData {
  id: string;
  message: string;
  imageUrl?: string;
  created_time: string;
  reach: number;
  engagedUsers: number;
  permalink_url: string;
  type: 'reach' | 'engagement';
}

export interface AdminKey {
  key: string;
  type: 'RESET_QUOTA' | 'UPGRADE_ROLE' | 'UNLOCK_FEATURE' | 'ADD_POINTS'; // Added ADD_POINTS
  targetRole?: UserRole;
  targetFeature?: 'ANALYTICS' | 'AUTOMATION' | 'SEO' | 'THREADS';
  pointsAmount?: number; // Added for point value
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  isUsed: boolean;
  usedBy?: string;
  usedAt?: number;
}

export interface SystemConfig {
  maintenanceMode: boolean;
  dryRunMode: boolean;
  globalAnnouncement?: string;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  userId: string;
  userEmail: string;
  action: string;
  status: 'success' | 'error' | 'warning';
  details: string;
}

export interface UserReport {
  id: string;
  userId: string;
  userEmail: string;
  description: string;
  userAgent: string;
  currentView: string;
  timestamp: number;
  status: 'OPEN' | 'RESOLVED';
}

export interface DashboardStats {
  totalUsers: number;
  activeUsersToday: number;
  totalApiCallsToday: number;
  errorCountToday: number;
}

export enum AppView {
  LOGIN = 'LOGIN',
  SETTINGS = 'SETTINGS',
  CREATE = 'CREATE',
  SCHEDULE = 'SCHEDULE',
  ANALYTICS = 'ANALYTICS',
  AUTOMATION = 'AUTOMATION',
  SEO_ARTICLES = 'SEO_ARTICLES',
  THREADS_NURTURE = 'THREADS_NURTURE',
  REFERRAL = 'REFERRAL',
  ADMIN = 'ADMIN',
  PRICING = 'PRICING',
  CONTACT_SUPPORT = 'CONTACT_SUPPORT'
}
