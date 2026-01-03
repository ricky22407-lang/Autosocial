
export enum AppView {
  LOGIN = 'LOGIN',
  CREATE = 'CREATE',
  SCHEDULE = 'SCHEDULE',
  SETTINGS = 'SETTINGS',
  ANALYTICS = 'ANALYTICS',
  DNA_LAB = 'DNA_LAB',
  AUTOMATION = 'AUTOMATION',
  SEO_ARTICLES = 'SEO_ARTICLES',
  THREADS_NURTURE = 'THREADS_NURTURE',
  MARKETPLACE = 'MARKETPLACE',
  PRICING = 'PRICING',
  REFERRAL = 'REFERRAL',
  CONTACT_SUPPORT = 'CONTACT_SUPPORT',
  ADMIN = 'ADMIN'
}

export type UserRole = 'user' | 'starter' | 'pro' | 'business' | 'admin';

export interface QuotaBatch {
  id: string;
  amount: number;
  initialAmount: number;
  expiresAt: number;
  source: string;
  addedAt: number;
}

export interface UserProfile {
  user_id: string;
  email: string;
  role: UserRole;
  quota_total: number;
  quota_used: number;
  quota_reset_date?: number;
  quota_batches?: QuotaBatch[];
  expiry_warning_level?: number;
  isSuspended?: boolean;
  unlockedFeatures?: string[];
  referralCode?: string;
  referredBy?: string;
  referralCount?: number;
  last_api_call_timestamp?: number;
  created_at: number;
  updated_at: number;
  marketplaceConsent?: boolean;
  invitesTotalThisMonth?: number;
  invitesUsedThisMonth?: number;
  isInfluencer?: boolean;
  influencerProfile?: InfluencerProfile;
  subscription?: {
    status: SubscriptionStatus;
    planId: string;
    nextBillingDate?: number;
  };
  receivedInvitations?: MarketplaceInvitation[];
}

export interface InfluencerProfile {
  isPublic: boolean;
  categories: string[];
  contentStyles: string[]; 
  bio: string;
  minPrice: number;
  platforms: {
    facebook?: { id: string; name: string; followers: number; };
    threads?: { id: string; username: string; followers: number; };
  };
  aiTags: string[];
  rating: number;
  completedJobs: number;
  boostExpiresAt?: number;
}

export interface BrandSettings {
  industry: string;
  brandName: string;
  brandType: 'enterprise' | 'personal';
  services: string;
  website: string;
  productInfo: string;
  brandTone: string;
  persona: string;
  brandColors: string[];
  targetAudience: string;
  visualStyle: string;
  facebookPageId: string;
  facebookToken: string;
  threadsAccounts: ThreadsAccount[];
  referenceFiles: { name: string; content: string }[];
  fixedHashtags: string;
  autoReply: { enabled: boolean; defaultResponse: string; rules: AutoReplyRule[] };
  autoPilot: AutoPilotConfig;
  threadsAutoPilot?: ThreadsAutoPilotConfig;
  competitorUrls?: string[];
  logoUrl?: string;
  brandStyleGuide?: string;
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
  lastRunAt?: number;
}

export interface ThreadsAutoPilotConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  postWeekDays: number[];
  postTime: string;
  imageMode: 'ai_url' | 'stock_url' | 'none';
  targetAccountIds: string[];
}

export interface Post {
  id: string;
  userId: string;
  topic: string;
  caption: string;
  firstComment?: string;
  mediaPrompt: string;
  mediaType: 'image' | 'video';
  mediaUrl?: string;
  status: 'published' | 'scheduled' | 'failed' | 'draft';
  scheduledDate?: string;
  syncInstagram?: boolean;
  createdAt: number;
  publishedUrl?: string;
  errorLog?: string;
}

export interface ProjectListing {
    id: string;
    brandId: string;
    brandName: string;
    brandEmail: string;
    title: string;
    description: string;
    budget: string;
    requirements: string[];
    createdAt: number;
    expiresAt: number;
    status: 'open' | 'closed';
    applicantCount: number;
}

export interface ProjectApplication {
    id: string;
    projectId: string;
    influencerId: string;
    influencerEmail: string;
    influencerProfile: InfluencerProfile;
    proposal: string;
    price: number;
    isFeatured: boolean;
    timestamp: number;
    status: 'pending' | 'accepted' | 'rejected';
}

export interface TrendingTopic {
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
}

export type ImageIntent = 'product_showcase' | 'promotion' | 'lifestyle' | 'educational' | 'festival';

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
  permalink_url: string;
  reach: number;
  engagedUsers: number;
}

export interface CompetitorInsight {
  name: string;
  recentActivity: string;
  vibe: string;
  strategySuggestion: string;
}

export interface ThreadsAccount {
  id: string;
  userId: string;
  token: string;
  username: string;
  isActive: boolean;
  accountType: 'personal' | 'brand';
  personaPrompt?: string;
  styleGuide: string;
  safetyFilter?: boolean;
}

export enum ErrorCode {
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  FORBIDDEN = 'FORBIDDEN',
  UNAUTHORIZED = 'UNAUTHORIZED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  FACEBOOK_API_ERROR = 'FACEBOOK_API_ERROR',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED'
}

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

export interface CtaItem {
  text: string;
  url: string;
}

export type ViralType = 'auto' | 'tutorial' | 'review' | 'news';
export type ViralPlatform = 'facebook' | 'instagram' | 'threads';

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
    professionalism?: number;
    chill?: number;
    intellect: number;
    aggression: number;
    emo: number;
    duality?: number;
    luck?: number;
  };
  title: string;
  comment: string;
  imageUrl?: string;
}

export interface ThreadLead {
  id: string;
  username: string;
  content: string;
  permalink: string;
  engagementScore: number;
  purchaseIntent: 'high' | 'medium' | 'low';
  reasoning: string;
}

export type SubscriptionStatus = 'none' | 'active' | 'cancelled' | 'expired';

export interface MarketplaceInvitation {
  id: string;
  brandEmail: string;
  brandName: string;
  message: string;
  timestamp: number;
  status: 'pending' | 'accepted' | 'declined';
}

export interface AdminKey {
  key: string;
  type: 'RESET_QUOTA' | 'UPGRADE_ROLE' | 'UNLOCK_FEATURE' | 'ADD_POINTS';
  targetRole?: UserRole;
  targetFeature?: 'ANALYTICS' | 'AUTOMATION' | 'SEO' | 'THREADS';
  pointsAmount?: number;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  isUsed: boolean;
}

export interface UsageLog {
  uid: string;
  act: string;
  ts: number;
  topic?: string;
  prmt?: string;
  res?: string;
  params?: string;
}

export interface DashboardStats {
  totalUsers: number;
  activeUsersToday: number;
  totalApiCallsToday: number;
  errorCountToday: number;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  status: 'error' | 'warning' | 'info';
  action: string;
  userEmail: string;
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
  status: 'OPEN' | 'CLOSED';
}

export interface QuotaTransaction {
  id: string;
  userId: string;
  amount: number;
  type: 'deduction' | 'topup' | 'reset';
  action: string;
  timestamp: number;
}

export interface QueueState {
  isQueuing: boolean;
  position: number;
  totalWaiting: number;
  currentAction: string;
}
