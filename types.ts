

// ==========================================
// Core & API Types
// ==========================================

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
  // Auth
  UNAUTHORIZED = 'AUTH_001',
  FORBIDDEN = 'AUTH_002',
  TOKEN_EXPIRED = 'AUTH_003',
  
  // Resources
  NOT_FOUND = 'RES_001',
  VALIDATION_ERROR = 'RES_002',
  
  // Business Logic
  QUOTA_EXCEEDED = 'BIZ_001',
  FEATURE_LOCKED = 'BIZ_002',
  
  // External APIs
  FACEBOOK_API_ERROR = 'EXT_FB_001',
  AI_API_ERROR = 'EXT_AI_001',
  
  // System
  INTERNAL_ERROR = 'SYS_001',
  MAINTENANCE_MODE = 'SYS_002'
}

// ==========================================
// Domain: User & Membership
// ==========================================

// Tier Structure:
// user (Free): 10 Credits. FB Text Only.
// starter: 500 Credits. FB Schedule, AI Image, Basic Analytics.
// pro: 2000 Credits. Threads Nurture, SEO, Adv Analytics.
// business: 5000+ Credits. AutoPilot, Multi-Account.
// admin: Unlimited.
export type UserRole = 'user' | 'starter' | 'pro' | 'business' | 'admin';

export interface UserProfile {
  user_id: string;
  email: string;
  role: UserRole;
  // Use flat properties to match authService implementation
  quota_total: number;
  quota_used: number;
  quota_reset_date: number; // Timestamp
  
  isSuspended: boolean;
  unlockedFeatures: string[]; 
  
  // Referral System
  referralCode?: string; // My code to invite others
  referredBy?: string;   // Who invited me
  referralCount?: number;

  created_at: number;
  updated_at: number;
}

// ==========================================
// Domain: Brand & Settings
// ==========================================

export interface ReferenceFile {
  name: string;
  content: string;
}

export interface ThreadsAccount {
  id: string;
  username: string; // Friendly name for UI
  userId: string;   // Threads User ID
  token: string;    // Threads Access Token
  isActive: boolean;
  personaPrompt?: string; // New: Specific persona for this account
}

export interface ThreadsAutoPilotConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  postWeekDays: number[]; // 0-6
  postTime: string;
  imageMode: 'ai_url' | 'stock_url' | 'none';
  targetAccountIds?: string[]; // New: Specific accounts to nurture
  lastRunAt?: number;
  // Removed deprecated autoLikeEnabled
}

export interface BrandSettings {
  // Identity
  industry: string;
  services: string;
  website: string;
  productInfo: string;
  productContext?: string; // New: Deeply analyzed product knowledge base (TXT analysis result)
  brandTone: string;
  persona: string;
  logoUrl?: string; // New: Base64 or URL for Watermark
  
  // API Config (Sensitive data should be handled carefully)
  facebookPageId: string;
  facebookToken: string;
  tokenExpiry?: number;
  
  // Threads Config (New)
  threadsAccounts?: ThreadsAccount[];
  threadsAutoPilot?: ThreadsAutoPilotConfig; // New

  // Content Strategy
  competitors: string[];
  fixedHashtags: string;
  referenceFiles: ReferenceFile[];
  
  // Modules
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
  postWeekDays?: number[]; // Changed to array for multiple days. 0 (Sun) - 6 (Sat)
  postTime: string;
  source: 'trending' | 'competitor' | 'keywords';
  keywords: string[];
  mediaTypePreference: 'image' | 'video' | 'mixed';
  lastRunAt?: number;
}

// ==========================================
// Domain: Content & Post
// ==========================================

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
  syncInstagram?: boolean; // New: Sync to IG
}

export interface TrendingTopic {
  title: string;
  description: string;
  url?: string;
  imageUrl?: string; // New: Source image from RSS/News
}

// New: Global Cache Structure
export interface CachedTrendData {
  id: string;        // Key: YYYY-MM-DD_Industry
  topics: TrendingTopic[];
  createdAt: number;
  industry: string;
}

// ==========================================
// Domain: Analytics
// ==========================================

export interface AnalyticsData {
  followers: number;
  followersGrowth: number;
  reach: number;
  engagementRate: number;
  period: string;
}

export interface CompetitorData {
    name: string;
    sentiment: 'Positive' | 'Neutral' | 'Negative';
    recentTopic: string;
    engagementLevel: 'High' | 'Medium' | 'Low';
    summary: string;
}

export interface TopPostData {
  id: string;
  message: string;
  imageUrl?: string;
  created_time: string;
  reach: number;
  engagedUsers: number;
  permalink_url: string;
  type: 'reach' | 'engagement'; // Label for UI
}

// ==========================================
// Domain: Admin & System
// ==========================================

export interface AdminKey {
  key: string;
  type: 'RESET_QUOTA' | 'UPGRADE_ROLE' | 'UNLOCK_FEATURE';
  targetRole?: UserRole;
  targetFeature?: 'ANALYTICS' | 'AUTOMATION' | 'SEO' | 'THREADS'; // Added THREADS
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  isUsed: boolean;
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

// Frontend Routing Enum
export enum AppView {
  LOGIN = 'LOGIN',
  SETTINGS = 'SETTINGS',
  CREATE = 'CREATE',
  SCHEDULE = 'SCHEDULE',
  ANALYTICS = 'ANALYTICS',
  AUTOMATION = 'AUTOMATION',
  SEO_ARTICLES = 'SEO_ARTICLES',
  THREADS_NURTURE = 'THREADS_NURTURE',
  REFERRAL = 'REFERRAL', // New View
  ADMIN = 'ADMIN'
}