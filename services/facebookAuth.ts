
// Facebook SDK Type Definition (Simplified)
declare global {
  interface Window {
    fbAsyncInit: () => void;
    FB: any;
  }
}

const FB_SDK_VERSION = 'v19.0';

// Helper to load SDK
export const initFacebookSdk = (appId: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (window.FB) {
      resolve();
      return;
    }

    window.fbAsyncInit = function() {
      window.FB.init({
        appId: appId,
        cookie: true,
        xfbml: true,
        version: FB_SDK_VERSION
      });
      resolve();
    };

    // Load the SDK asynchronously
    (function(d, s, id) {
      var js, fjs = d.getElementsByTagName(s)[0];
      if (d.getElementById(id)) return;
      js = d.createElement(s) as HTMLScriptElement; 
      js.id = id;
      js.src = "https://connect.facebook.net/en_US/sdk.js";
      if (fjs && fjs.parentNode) fjs.parentNode.insertBefore(js, fjs);
    }(document, 'script', 'facebook-jssdk'));
  });
};

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  tasks?: string[];
}

export const loginAndGetPages = async (): Promise<FacebookPage[]> => {
  if (!window.FB) throw new Error("Facebook SDK not loaded.");

  return new Promise((resolve, reject) => {
    // 1. Login
    window.FB.login((response: any) => {
      if (response.authResponse) {
        // 2. Fetch Accounts (Pages)
        // requesting fields needed for operation
        window.FB.api('/me/accounts', { fields: 'name,id,access_token,category,tasks' }, (pageResponse: any) => {
            if (pageResponse && !pageResponse.error) {
                resolve(pageResponse.data as FacebookPage[]);
            } else {
                reject(new Error(pageResponse.error?.message || "Failed to fetch pages"));
            }
        });
      } else {
        reject(new Error("User cancelled login or did not fully authorize."));
      }
    }, { 
        // 3. Permissions Scope (Updated)
        // read_insights: Required for page_impressions, page_fans_gender_age
        // pages_read_engagement: Required for comments/likes
        // pages_manage_posts: Required for publishing
        // pages_messaging: Required for auto-reply (Messenger)
        scope: 'public_profile,pages_show_list,pages_read_engagement,pages_manage_posts,read_insights,pages_messaging' 
    });
  });
};
