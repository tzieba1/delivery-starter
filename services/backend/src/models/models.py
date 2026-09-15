"""
Domain Models - Delivery Application
Represents core business entities
"""
from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional, List
from enum import Enum


class OrderStatus(str, Enum):
    """
    Order lifecycle states
    
    State machine:
    PENDING → CONFIRMED → PICKED_UP → IN_TRANSIT → DELIVERED
                    ↓
                CANCELLED
    """
    PENDING = "pending"           # Order created, awaiting confirmation
    CONFIRMED = "confirmed"       # Restaurant confirmed order
    PICKED_UP = "picked_up"       # Driver picked up from restaurant
    IN_TRANSIT = "in_transit"     # Driver en route to customer
    DELIVERED = "delivered"       # Order completed
    CANCELLED = "cancelled"       # Order cancelled


class DeliveryLocation(BaseModel):
    """Geographic location for tracking"""
    latitude: float
    longitude: float
    timestamp: datetime


class OrderItem(BaseModel):
    """Individual item in an order"""
    name: str
    quantity: int
    price: float
    notes: Optional[str] = None


class Order(BaseModel):
    """
    Core order entity

    Represents a delivery order from creation through completion
    """
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "ORD-000001",
                "customer_name": "John Doe",
                "customer_phone": "+1-555-0123",
                "pickup_address": "123 Restaurant St",
                "delivery_address": "456 Customer Ave",
                "items": [
                    {
                        "name": "Burger",
                        "quantity": 2,
                        "price": 12.99,
                    }
                ],
                "total_amount": 25.98,
                "status": "pending",
                "created_at": "2024-01-15T10:30:00Z",
                "updated_at": "2024-01-15T10:30:00Z",
            }
        }
    )

    id: str
    customer_name: str
    customer_phone: str
    pickup_address: str
    delivery_address: str
    items: List[OrderItem]
    total_amount: float
    status: OrderStatus
    driver_id: Optional[str] = None
    notes: Optional[str] = None
    current_location: Optional[DeliveryLocation] = None
    created_at: datetime
    updated_at: datetime
