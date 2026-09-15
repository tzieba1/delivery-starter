/**
 * Type Definitions - Delivery Application
 * 
 * Defines TypeScript interfaces mirroring backend API schemas
 * Ensures type safety across mobile application
 */

/**
 * Navigation Type Safety
 * 
 * Defines route parameters for type-safe navigation
 */
export type RootTabParamList = {
  Home: undefined;
  Orders: undefined;
  Profile: undefined;
};

/**
 * Order Status Enum
 * 
 * Mirrors backend OrderStatus enum
 */
export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PICKED_UP = 'picked_up',
  IN_TRANSIT = 'in_transit',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

/**
 * Order Item
 * 
 * Individual item within an order
 */
export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  notes: string | null;
}

/**
 * Geographic Location
 * 
 * Used for driver tracking during delivery
 */
export interface Location {
  latitude: number;
  longitude: number;
  timestamp: string;
}

/**
 * Order Creation Request
 * 
 * POST /api/v1/orders
 */
export interface OrderCreate {
  customer_name: string;
  customer_phone: string;
  pickup_address: string;
  delivery_address: string;
  items: OrderItem[];
  total_amount: number;
}

/**
 * Order Update Request
 * 
 * PATCH /api/v1/orders/{id}
 */
export interface OrderUpdate {
  status?: OrderStatus;
  driver_id?: string;
  notes?: string;
}

/**
 * Location Update Request
 * 
 * POST /api/v1/orders/{id}/location
 */
export interface LocationUpdate {
  latitude: number;
  longitude: number;
}

/**
 * Order Response
 * 
 * GET /api/v1/orders
 * GET /api/v1/orders/{id}
 * 
 * Complete order representation with computed fields
 */
export interface OrderResponse {
  id: string;
  customer_name: string;
  customer_phone: string;
  pickup_address: string;
  delivery_address: string;
  items: OrderItem[];
  total_amount: number;
  status: OrderStatus;
  driver_id: string | null;
  notes: string | null;
  current_location: Location | null;
  created_at: string;
  updated_at: string;
  
  // Computed fields
  status_display: string;
  can_cancel: boolean;
}

/**
 * Health Check Response
 * 
 * GET /health
 */
export interface HealthResponse {
  status: string;
  version: string;
  timestamp: string;
  build_info: {
    version: string;
    commit: string;
    branch: string;
    dirty: boolean;
    commit_date: string;
  };
  database_connected: boolean;
}

/**
 * API Configuration Response
 * 
 * GET /api/v1/config
 * 
 * Feature flags and app-level configuration
 */
export interface ApiConfigResponse {
  api_version: string;
  min_app_version: string;
  features: {
    real_time_tracking: boolean;
    in_app_chat: boolean;
    payment_integration: boolean;
    [key: string]: boolean;
  };
  map_provider: string;
  support_phone: string;
}

/**
 * Order Tracking Response
 * 
 * GET /api/v1/orders/{id}/track
 */
export interface TrackingResponse {
  order_id: string;
  status: string;
  estimated_delivery: string | null;
  current_location?: Location;
}
