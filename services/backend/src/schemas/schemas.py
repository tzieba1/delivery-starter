"""
API Schemas - Request/Response Models
Defines the contract between mobile app and backend API
"""
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional, List, Dict, Any
from ..models import OrderStatus, OrderItem, Order


class OrderCreate(BaseModel):
    """Schema for creating new orders via POST /api/v1/orders"""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "customer_name": "Jane Smith",
                "customer_phone": "+15550123",
                "pickup_address": "Pizza Place, 123 Main St",
                "delivery_address": "456 Oak Avenue, Apt 2B",
                "items": [
                    {
                        "name": "Large Pepperoni Pizza",
                        "quantity": 1,
                        "price": 18.99,
                        "notes": None
                    }
                ],
                "total_amount": 18.99
            }
        }
    )

    customer_name: str = Field(..., min_length=1, max_length=100)
    customer_phone: str = Field(..., pattern=r"^\+?1?\d{9,15}$")
    pickup_address: str = Field(..., min_length=5, max_length=200)
    delivery_address: str = Field(..., min_length=5, max_length=200)
    items: List[OrderItem] = Field(..., min_length=1)
    total_amount: float = Field(..., gt=0)


class OrderUpdate(BaseModel):
    """Schema for updating order status via PATCH /api/v1/orders/{id}"""
    status: Optional[OrderStatus] = None
    driver_id: Optional[str] = None
    notes: Optional[str] = None


class LocationUpdate(BaseModel):
    """Schema for updating driver location during delivery"""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "latitude": 40.7128,
                "longitude": -74.0060
            }
        }
    )

    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)


class OrderResponse(BaseModel):
    """
    Schema for order responses
    
    Returned by GET /api/v1/orders and GET /api/v1/orders/{id}
    Includes computed fields and formatted data for mobile consumption
    """
    id: str
    customer_name: str
    customer_phone: str
    pickup_address: str
    delivery_address: str
    items: List[OrderItem]
    total_amount: float
    status: OrderStatus
    driver_id: Optional[str]
    notes: Optional[str]
    current_location: Optional[Dict[str, Any]]
    created_at: datetime
    updated_at: datetime
    
    # Computed fields for mobile app convenience
    status_display: str
    can_cancel: bool
    
    @classmethod
    def from_order(cls, order: Order) -> "OrderResponse":
        """Convert Order model to API response schema"""
        status_display_map = {
            OrderStatus.PENDING: "Order Placed",
            OrderStatus.CONFIRMED: "Confirmed",
            OrderStatus.PICKED_UP: "Picked Up",
            OrderStatus.IN_TRANSIT: "On The Way",
            OrderStatus.DELIVERED: "Delivered",
            OrderStatus.CANCELLED: "Cancelled",
        }
        
        current_location = None
        if order.current_location:
            current_location = {
                "latitude": order.current_location.latitude,
                "longitude": order.current_location.longitude,
                "timestamp": order.current_location.timestamp.isoformat(),
            }
        
        return cls(
            id=order.id,
            customer_name=order.customer_name,
            customer_phone=order.customer_phone,
            pickup_address=order.pickup_address,
            delivery_address=order.delivery_address,
            items=order.items,
            total_amount=order.total_amount,
            status=order.status,
            driver_id=order.driver_id,
            notes=order.notes,
            current_location=current_location,
            created_at=order.created_at,
            updated_at=order.updated_at,
            status_display=status_display_map[order.status],
            can_cancel=order.status in [OrderStatus.PENDING, OrderStatus.CONFIRMED],
        )


class HealthResponse(BaseModel):
    """Health check response schema"""
    status: str
    version: str
    timestamp: datetime
    build_info: Dict[str, Any]
    database_connected: bool
