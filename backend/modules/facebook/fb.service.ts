
import { AppError } from '../../core/appError';
import { ErrorCode } from '../../../types';

export class FacebookService {
  private baseUrl = 'https://graph.facebook.com/v19.0';

  private async fetchGraph(endpoint: string, token: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}/${endpoint}${endpoint.includes('?') ? '&' : '?'}access_token=${token}`;
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers }
    });
    
    const data = await res.json();
    if (data.error) {
      throw new AppError(data.error.message, 400, ErrorCode.FACEBOOK_API_ERROR);
    }
    return data;
  }

  async publishPost(pageId: string, token: string, message: string, mediaUrl?: string) {
    if (!mediaUrl) {
      return this.fetchGraph(`${pageId}/feed`, token, {
        method: 'POST',
        body: JSON.stringify({ message })
      });
    } else {
        // Simple logic for photo/video. In production, need separate endpoints/upload flow.
        const endpoint = mediaUrl.includes('.mp4') ? 'videos' : 'photos';
        return this.fetchGraph(`${pageId}/${endpoint}`, token, {
            method: 'POST',
            body: JSON.stringify({ message, url: mediaUrl })
        });
    }
  }

  async getPageInsights(pageId: string, token: string) {
    return this.fetchGraph(
      `${pageId}/insights`, 
      token, 
      { method: 'GET' }
    ); // simplified
  }
}
