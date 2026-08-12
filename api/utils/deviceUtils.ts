/**
 * api/utils/deviceUtils.ts
 *
 * Device fingerprinting and user-agent parsing utilities.
 */
import { createHash } from 'crypto';

export interface DeviceInfo {
  deviceType: string;
  deviceName: string;
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
}

/**
 * Parse user agent string to extract device information.
 */
export function parseUserAgent(userAgent: string | undefined): DeviceInfo {
  if (!userAgent) {
    return {
      deviceType: 'unknown',
      deviceName: 'Unknown Device',
      browser: 'Unknown',
      browserVersion: '',
      os: 'Unknown',
      osVersion: '',
    };
  }

  const ua = userAgent.toLowerCase();

  // Device type
  let deviceType = 'desktop';
  if (/(iphone|ipod|ipad)/i.test(userAgent)) deviceType = 'mobile';
  else if (/android/i.test(userAgent)) deviceType = 'mobile';
  else if (/tablet/i.test(userAgent)) deviceType = 'tablet';

  // Browser detection
  let browser = 'Unknown';
  let browserVersion = '';
  
  if (ua.includes('edge')) {
    browser = 'Edge';
    browserVersion = extractVersion(ua, /edge\/(\d+\.?\d*)/);
  } else if (ua.includes('edg/')) {
    browser = 'Edge Chromium';
    browserVersion = extractVersion(ua, /edg\/(\d+\.?\d*)/);
  } else if (ua.includes('chrome')) {
    browser = 'Chrome';
    browserVersion = extractVersion(ua, /chrome\/(\d+\.?\d*)/);
  } else if (ua.includes('firefox')) {
    browser = 'Firefox';
    browserVersion = extractVersion(ua, /firefox\/(\d+\.?\d*)/);
  } else if (ua.includes('safari')) {
    browser = 'Safari';
    browserVersion = extractVersion(ua, /version\/(\d+\.?\d*)/);
  } else if (ua.includes('opera') || ua.includes('opr/')) {
    browser = 'Opera';
    browserVersion = extractVersion(ua, /(?:opera|opr)\/(\d+\.?\d*)/);
  }

  // OS detection
  let os = 'Unknown';
  let osVersion = '';
  
  if (ua.includes('windows nt 10.0')) {
    os = 'Windows';
    osVersion = '10/11';
  } else if (ua.includes('windows nt 6.3')) {
    os = 'Windows';
    osVersion = '8.1';
  } else if (ua.includes('windows nt 6.2')) {
    os = 'Windows';
    osVersion = '8';
  } else if (ua.includes('windows nt 6.1')) {
    os = 'Windows';
    osVersion = '7';
  } else if (ua.includes('windows')) {
    os = 'Windows';
  } else if (ua.includes('mac os x')) {
    os = 'macOS';
    osVersion = extractVersion(ua, /mac os x (\d+[._]\d+)/);
  } else if (ua.includes('android')) {
    os = 'Android';
    osVersion = extractVersion(ua, /android (\d+\.?\d*)/);
  } else if (ua.includes('iphone') || ua.includes('ipad')) {
    os = 'iOS';
    osVersion = extractVersion(ua, /os (\d+[._]\d+)/);
  } else if (ua.includes('linux')) {
    os = 'Linux';
  }

  const deviceName = `${browser} on ${os}${osVersion ? ' ' + osVersion : ''}`;

  return {
    deviceType,
    deviceName,
    browser,
    browserVersion,
    os,
    osVersion: osVersion.replace('_', '.'),
  };
}

/**
 * Extract version number from user agent using regex.
 */
function extractVersion(ua: string, regex: RegExp): string {
  const match = ua.match(regex);
  return match ? match[1] : '';
}

/**
 * Generate a device fingerprint hash.
 * Combines IP, user agent, and optional additional data.
 */
export function generateDeviceFingerprint(
  ipAddress: string,
  userAgent: string,
  additionalData?: Record<string, any>
): string {
  const data = {
    ip: ipAddress,
    ua: userAgent,
    ...additionalData,
  };

  return createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex');
}

/**
 * Extract client IP address from request.
 * Handles X-Forwarded-For header and Vercel-specific headers.
 */
export function getClientIp(headers: Record<string, string | string[] | undefined>): string {
  // Vercel-specific header
  const forwardedFor = headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    return ips.split(',')[0].trim();
  }

  // Standard headers
  const realIp = headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  // Fallback
  return 'unknown';
}
