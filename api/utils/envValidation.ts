/**
 * api/utils/envValidation.ts
 *
 * Environment variable validation and type checking.
 * Ensures all required configuration is present and valid.
 */

interface EnvConfig {
  // Supabase
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  
  // JWT
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ACCESS_EXPIRES?: string;
  JWT_REFRESH_EXPIRES?: string;
  
  // Node environment
  NODE_ENV?: string;
  
  // WhatsApp (optional)
  WHATSAPP_API_KEY?: string;
  WHATSAPP_PHONE_ID?: string;
  
  // Email (optional)
  EMAIL_FROM?: string;
  
  // Cookie domain (optional)
  COOKIE_DOMAIN?: string;
  COOKIE_SECURE?: string;
}

/**
 * Validate that environment variable exists and is non-empty
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  
  return value.trim();
}

/**
 * Get optional environment variable with default
 */
function getEnv(name: string, defaultValue: string = ''): string {
  return (process.env[name] || defaultValue).trim();
}

/**
 * Validate URL format
 */
function validateUrl(url: string, name: string): void {
  try {
    new URL(url);
  } catch {
    throw new Error(`Invalid URL format for ${name}: ${url}`);
  }
}

/**
 * Validate JWT secret strength
 */
function validateJwtSecret(secret: string, name: string): void {
  if (secret.length < 32) {
    console.warn(`⚠️  WARNING: ${name} should be at least 32 characters for production use`);
  }
  
  // Check if it's the default/example secret
  const dangerousDefaults = ['your-secret-here', 'changeme', 'secret', '12345'];
  if (dangerousDefaults.some(def => secret.toLowerCase().includes(def))) {
    throw new Error(`${name} appears to be a default value. Use a strong random secret!`);
  }
}

/**
 * Validate and load environment configuration
 */
export function validateEnvironment(): EnvConfig {
  const errors: string[] = [];
  
  try {
    // Required variables
    const SUPABASE_URL = requireEnv('SUPABASE_URL');
    validateUrl(SUPABASE_URL, 'SUPABASE_URL');
    
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    if (SUPABASE_SERVICE_ROLE_KEY.length < 20) {
      errors.push('SUPABASE_SERVICE_ROLE_KEY appears to be invalid (too short)');
    }
    
    const JWT_ACCESS_SECRET = requireEnv('JWT_ACCESS_SECRET');
    validateJwtSecret(JWT_ACCESS_SECRET, 'JWT_ACCESS_SECRET');
    
    const JWT_REFRESH_SECRET = requireEnv('JWT_REFRESH_SECRET');
    validateJwtSecret(JWT_REFRESH_SECRET, 'JWT_REFRESH_SECRET');
    
    // Ensure refresh and access secrets are different
    if (JWT_ACCESS_SECRET === JWT_REFRESH_SECRET) {
      errors.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
    }
    
    // Optional variables with defaults
    const JWT_ACCESS_EXPIRES = getEnv('JWT_ACCESS_EXPIRES', '15m');
    const JWT_REFRESH_EXPIRES = getEnv('JWT_REFRESH_EXPIRES', '7d');
    const NODE_ENV = getEnv('NODE_ENV', 'development');
    
    // Production checks
    if (NODE_ENV === 'production') {
      // Warn about missing optional but recommended variables
      if (!process.env.COOKIE_DOMAIN) {
        console.warn('⚠️  WARNING: COOKIE_DOMAIN not set. Cookies may not work correctly.');
      }
      
      if (getEnv('COOKIE_SECURE', 'true') !== 'true') {
        console.warn('⚠️  WARNING: COOKIE_SECURE is not enabled. Use HTTPS in production!');
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Environment validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
    }
    
    console.log('✅ Environment validation passed');
    
    return {
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      JWT_ACCESS_SECRET,
      JWT_REFRESH_SECRET,
      JWT_ACCESS_EXPIRES,
      JWT_REFRESH_EXPIRES,
      NODE_ENV,
      WHATSAPP_API_KEY: getEnv('WHATSAPP_API_KEY'),
      WHATSAPP_PHONE_ID: getEnv('WHATSAPP_PHONE_ID'),
      EMAIL_FROM: getEnv('EMAIL_FROM'),
      COOKIE_DOMAIN: getEnv('COOKIE_DOMAIN'),
      COOKIE_SECURE: getEnv('COOKIE_SECURE', 'true'),
    };
  } catch (error: any) {
    console.error('❌ Environment validation failed:', error.message);
    
    // In development, show helpful error
    if (process.env.NODE_ENV !== 'production') {
      console.error('\n📝 Make sure you have a .env.local file with all required variables.');
      console.error('   See .env.example for reference.\n');
    }
    
    throw error;
  }
}

/**
 * Validate environment on module load (but don't throw in test environments)
 */
let validatedConfig: EnvConfig | null = null;

export function getValidatedConfig(): EnvConfig {
  if (!validatedConfig) {
    // Skip validation in test environment
    if (process.env.NODE_ENV === 'test') {
      return {} as EnvConfig;
    }
    
    validatedConfig = validateEnvironment();
  }
  
  return validatedConfig;
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
}

/**
 * Get safe environment info (for logging, excludes secrets)
 */
export function getSafeEnvInfo(): Record<string, string> {
  return {
    NODE_ENV: process.env.NODE_ENV || 'development',
    SUPABASE_URL: process.env.SUPABASE_URL || '[NOT SET]',
    JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES || '15m',
    JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES || '7d',
    COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || '[NOT SET]',
    COOKIE_SECURE: process.env.COOKIE_SECURE || 'true',
  };
}
