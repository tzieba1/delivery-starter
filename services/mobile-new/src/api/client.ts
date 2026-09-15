/**
 * API Client - Backend Communication Layer
 * 
 * Handles HTTP requests with environment-aware base URL configuration,
 * structured error handling, and request/response interceptors
 */
import axios, { AxiosInstance, AxiosError } from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Determine API base URL based on environment
 * 
 * Development considerations:
 * - iOS Simulator: localhost works directly
 * - Android Emulator: 10.0.2.2 maps to host machine
 * - Physical devices: Requires host machine's LAN IP (configured via extra.apiUrl)
 */
const getApiUrl = (): string => {
  // Check if custom API URL provided via app.config.js
  const configUrl = Constants.expoConfig?.extra?.apiUrl;
  if (configUrl) {
    return configUrl;
  }

  // Development environment defaults
  if (__DEV__) {
    return Platform.select({
      ios: 'http://localhost:8000',
      android: 'http://10.0.2.2:8000',
      default: 'http://localhost:8000',
    }) as string;
  }

  // Production: must be configured in app.config.js
  // Default will fail, forcing explicit configuration
  return 'https://api.production.example.com';
};

/**
 * Create configured Axios instance
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: getApiUrl(),
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor
 * 
 * Add authentication tokens, logging, etc.
 */
apiClient.interceptors.request.use(
  (config) => {
    // Log requests in development
    if (__DEV__) {
      console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    }

    // TODO: Add authentication token
    // const token = await getAuthToken();
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor
 * 
 * Handle errors consistently across the application
 */
apiClient.interceptors.response.use(
  (response) => {
    // Log successful responses in development
    if (__DEV__) {
      console.log(`[API] ✓ ${response.config.method?.toUpperCase()} ${response.config.url}`);
    }
    return response;
  },
  (error: AxiosError) => {
    // Structured error logging
    if (error.response) {
      // Server responded with error status (4xx, 5xx)
      console.error(
        `[API] ✗ ${error.response.status} ${error.config?.method?.toUpperCase()} ${error.config?.url}`,
        error.response.data
      );

      // Handle specific error codes
      switch (error.response.status) {
        case 401:
          // Unauthorized - token expired or invalid
          // TODO: Trigger re-authentication flow
          console.warn('[API] Unauthorized - authentication required');
          break;
        case 403:
          // Forbidden - insufficient permissions
          console.warn('[API] Forbidden - insufficient permissions');
          break;
        case 404:
          // Not found - resource doesn't exist
          console.warn('[API] Resource not found');
          break;
        case 422:
          // Validation error - invalid request data
          console.warn('[API] Validation error:', error.response.data);
          break;
        case 500:
          // Server error - backend issue
          console.error('[API] Server error - backend issue');
          break;
        case 503:
          // Service unavailable - backend down or overloaded
          console.error('[API] Service unavailable');
          break;
      }
    } else if (error.request) {
      // Request made but no response received (network issue)
      console.error('[API] Network error - no response received');
      console.error('Request config:', error.config?.url);
      
      // This typically indicates:
      // 1. Backend is down
      // 2. Network connectivity issue
      // 3. CORS configuration problem
      // 4. Incorrect API URL (common in development)
    } else {
      // Error setting up request
      console.error('[API] Request setup error:', error.message);
    }

    return Promise.reject(error);
  }
);

/**
 * Helper function to check API connectivity
 * 
 * Useful for debugging network issues
 */
export const checkApiConnection = async (): Promise<boolean> => {
  try {
    await apiClient.get('/health');
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Export API base URL for reference
 */
export const API_BASE_URL = getApiUrl();

// Log API configuration in development
if (__DEV__) {
  console.log('[API] Base URL:', API_BASE_URL);
  console.log('[API] Platform:', Platform.OS);
  console.log('[API] Environment:', __DEV__ ? 'development' : 'production');
}
