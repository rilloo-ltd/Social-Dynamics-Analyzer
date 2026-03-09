'use client';

import mixpanel from 'mixpanel-browser';

// Initialize Mixpanel
const MIXPANEL_TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;

if (MIXPANEL_TOKEN) {
  mixpanel.init(MIXPANEL_TOKEN, {
    debug: process.env.NODE_ENV === 'development',
    track_pageview: true,
    persistence: 'localStorage',
    autocapture: true, // Automatically track clicks, form submissions, and page views
    record_sessions_percent: 100, // Record 100% of user sessions for replay
    api_host: 'https://api-eu.mixpanel.com', // EU data residency endpoint
  });
}

// Analytics event types
export const MixpanelEvents = {
  // User actions
  PAGE_VIEWED: 'Page Viewed',
  SIGNUP: 'Sign Up',
  LOGIN: 'Login',
  LOGOUT: 'Logout',
  
  // File upload
  FILE_UPLOADED: 'File Uploaded',
  FILE_UPLOAD_FAILED: 'File Upload Failed',
  
  // Analysis
  ANALYSIS_STARTED: 'Analysis Started',
  ANALYSIS_COMPLETED: 'Analysis Completed',
  ANALYSIS_FAILED: 'Analysis Failed',
  BUTTON_CLICKED: 'Button Clicked',
  
  // Sharing
  SHARE_CLICKED: 'Share Clicked',
  SHARE_COMPLETED: 'Share Completed',
  
  // Image generation
  IMAGE_GENERATION_STARTED: 'Image Generation Started',
  IMAGE_GENERATION_COMPLETED: 'Image Generation Completed',
  IMAGE_GENERATION_FAILED: 'Image Generation Failed',
  
  // Feedback
  FEEDBACK_SUBMITTED: 'Feedback Submitted',
  
  // Payments
  PAYMENT_INITIATED: 'Payment Initiated',
  PAYMENT_COMPLETED: 'Payment Completed',
  PAYMENT_FAILED: 'Payment Failed',
};

// Mixpanel wrapper class
class MixpanelService {
  /**
   * Identify a user
   */
  identify(userId: string) {
    if (!MIXPANEL_TOKEN) return;
    mixpanel.identify(userId);
  }

  /**
   * Set user properties
   */
  setUserProperties(properties: Record<string, any>) {
    if (!MIXPANEL_TOKEN) return;
    mixpanel.people.set(properties);
  }

  /**
   * Track an event
   */
  track(eventName: string, properties?: Record<string, any>) {
    if (!MIXPANEL_TOKEN) return;
    
    mixpanel.track(eventName, {
      ...properties,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Track page view
   */
  trackPageView(pageName: string, properties?: Record<string, any>) {
    if (!MIXPANEL_TOKEN) return;
    
    this.track(MixpanelEvents.PAGE_VIEWED, {
      page: pageName,
      url: window.location.href,
      ...properties,
    });
  }

  /**
   * Reset user (on logout)
   */
  reset() {
    if (!MIXPANEL_TOKEN) return;
    mixpanel.reset();
  }

  /**
   * Increment a user property
   */
  incrementUserProperty(property: string, value: number = 1) {
    if (!MIXPANEL_TOKEN) return;
    mixpanel.people.increment(property, value);
  }

  /**
   * Set user property once (won't overwrite if already set)
   */
  setUserPropertyOnce(property: string, value: any) {
    if (!MIXPANEL_TOKEN) return;
    mixpanel.people.set_once(property, value);
  }
}

// Export singleton instance
export const analytics = new MixpanelService();

// Helper functions for common events
export const trackFileUpload = (participantsCount: number, tokensCount: number, userId?: string) => {
  analytics.track(MixpanelEvents.FILE_UPLOADED, {
    participants_count: participantsCount,
    tokens_count: tokensCount,
    user_id: userId,
  });
};

export const trackAnalysis = (analysisType: string, userId?: string) => {
  analytics.track(MixpanelEvents.ANALYSIS_STARTED, {
    analysis_type: analysisType,
    user_id: userId,
  });
};

export const trackShare = (platform: string, shareType: string, userId?: string) => {
  analytics.track(MixpanelEvents.SHARE_CLICKED, {
    platform,
    share_type: shareType,
    user_id: userId,
  });
};

export const trackImageGeneration = (prompt: string, userId?: string) => {
  analytics.track(MixpanelEvents.IMAGE_GENERATION_STARTED, {
    prompt_length: prompt.length,
    user_id: userId,
  });
};

export const trackFeedback = (rating: number, hasComment: boolean, userId?: string) => {
  analytics.track(MixpanelEvents.FEEDBACK_SUBMITTED, {
    rating,
    has_comment: hasComment,
    user_id: userId,
  });
};

export const trackButtonClick = (buttonId: string, buttonLabel?: string, userId?: string) => {
  analytics.track(MixpanelEvents.BUTTON_CLICKED, {
    button_id: buttonId,
    button_label: buttonLabel,
    user_id: userId,
  });
};

// Export mixpanel instance for advanced usage
export { mixpanel };
