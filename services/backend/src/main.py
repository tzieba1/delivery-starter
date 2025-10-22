"""
Backend API - Delivery Application
Domain: Order management, driver assignment, delivery tracking
"""
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
from datetime import datetime
from enum import Enum
import os

from .version import __version__, __build_info__
from .models import Order, OrderStatus, DeliveryLocation
from .schemas import (
    OrderCreate,
    OrderResponse,
    OrderUpdate,
    LocationUpdate,
    HealthResponse
)

app = FastAPI(
    title="Delivery API",
    description="Backend for mobile delivery application",
    version=__version__,
)

# CORS configuration for mobile apps
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "exp://localhost:8081",      # Expo development (iOS)
        "http://localhost:8081",      # Expo web
        "exp://192.168.*.*:8081",     # Expo on LAN
        "https://*.example.com",      # Production domain
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage (replace with database in production)
orders_db: dict[str, Order] = {}
order_counter = 1


@app.get("/")
async def root():
    """Root endpoint - API information"""
    return {
        "service": "Delivery API",
        "version": __version__,
        "environment": os.getenv("ENVIRONMENT", "development"),
        "endpoints": {
            "health": "/health",
            "docs": "/docs",
            "orders": "/api/v1/orders",
        }
    }


@app.get("/health", response_model=HealthResponse)
async def health():
    """
    Health check endpoint
    Used by Docker healthcheck and mobile app connectivity validation
    """
    return HealthResponse(
        status="healthy",
        version=__version__,
        timestamp=datetime.utcnow(),
        build_info=__build_info__,
        database_connected=True,  # TODO: Actual DB check
    )


@app.post("/api/v1/orders", response_model=OrderResponse, status_code=201)
async def create_order(order: OrderCreate):
    """
    Create new delivery order
    
    Mobile app calls this when user places order
    """
    global order_counter
    
    order_id = f"ORD-{order_counter:06d}"
    order_counter += 1
    
    new_order = Order(
        id=order_id,
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        pickup_address=order.pickup_address,
        delivery_address=order.delivery_address,
        items=order.items,
        total_amount=order.total_amount,
        status=OrderStatus.PENDING,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    
    orders_db[order_id] = new_order
    
    return OrderResponse.from_order(new_order)


@app.get("/api/v1/orders", response_model=List[OrderResponse])
async def list_orders(
    status: Optional[OrderStatus] = None,
    limit: int = 20,
    offset: int = 0,
):
    """
    List orders with optional filtering
    
    Used by mobile app to show order history
    """
    all_orders = list(orders_db.values())
    
    # Filter by status if provided
    if status:
        all_orders = [o for o in all_orders if o.status == status]
    
    # Sort by creation time (newest first)
    all_orders.sort(key=lambda x: x.created_at, reverse=True)
    
    # Pagination
    paginated = all_orders[offset:offset + limit]
    
    return [OrderResponse.from_order(o) for o in paginated]


@app.get("/api/v1/orders/{order_id}", response_model=OrderResponse)
async def get_order(order_id: str):
    """
    Get specific order details
    
    Used by mobile app to show order detail screen
    """
    if order_id not in orders_db:
        raise HTTPException(status_code=404, detail="Order not found")
    
    return OrderResponse.from_order(orders_db[order_id])


@app.patch("/api/v1/orders/{order_id}", response_model=OrderResponse)
async def update_order(order_id: str, update: OrderUpdate):
    """
    Update order status or details
    
    Used by driver app to update delivery status
    """
    if order_id not in orders_db:
        raise HTTPException(status_code=404, detail="Order not found")
    
    order = orders_db[order_id]
    
    # Update fields that are provided
    if update.status is not None:
        order.status = update.status
    
    if update.driver_id is not None:
        order.driver_id = update.driver_id
    
    if update.notes is not None:
        order.notes = update.notes
    
    order.updated_at = datetime.utcnow()
    
    return OrderResponse.from_order(order)


@app.post("/api/v1/orders/{order_id}/location")
async def update_delivery_location(order_id: str, location: LocationUpdate):
    """
    Update driver's current location during delivery
    
    Used by driver app to provide real-time tracking
    """
    if order_id not in orders_db:
        raise HTTPException(status_code=404, detail="Order not found")
    
    order = orders_db[order_id]
    
    # Validate order is in delivery state
    if order.status not in [OrderStatus.PICKED_UP, OrderStatus.IN_TRANSIT]:
        raise HTTPException(
            status_code=400,
            detail="Order is not in delivery state"
        )
    
    order.current_location = DeliveryLocation(
        latitude=location.latitude,
        longitude=location.longitude,
        timestamp=datetime.utcnow(),
    )
    
    order.updated_at = datetime.utcnow()
    
    return {"status": "location updated"}


@app.delete("/api/v1/orders/{order_id}", status_code=204)
async def cancel_order(order_id: str):
    """
    Cancel an order
    
    Only allowed if order hasn't been picked up
    """
    if order_id not in orders_db:
        raise HTTPException(status_code=404, detail="Order not found")
    
    order = orders_db[order_id]
    
    if order.status not in [OrderStatus.PENDING, OrderStatus.CONFIRMED]:
        raise HTTPException(
            status_code=400,
            detail="Cannot cancel order in current state"
        )
    
    order.status = OrderStatus.CANCELLED
    order.updated_at = datetime.utcnow()
    
    return None


@app.get("/api/v1/orders/{order_id}/track")
async def track_order(order_id: str):
    """
    Get real-time tracking information
    
    Used by customer app to see delivery progress
    """
    if order_id not in orders_db:
        raise HTTPException(status_code=404, detail="Order not found")
    
    order = orders_db[order_id]
    
    response = {
        "order_id": order.id,
        "status": order.status.value,
        "estimated_delivery": None,  # TODO: Calculate ETA
    }
    
    if order.current_location:
        response["current_location"] = {
            "latitude": order.current_location.latitude,
            "longitude": order.current_location.longitude,
            "timestamp": order.current_location.timestamp.isoformat(),
        }
    
    return response


@app.get("/api/v1/config")
async def get_mobile_config():
    """
    Configuration endpoint for mobile apps
    
    Returns app-level settings and feature flags
    Mobile apps should check this on startup
    """
    return {
        "api_version": __version__,
        "min_app_version": "1.0.0",  # Minimum compatible app version
        "features": {
            "real_time_tracking": True,
            "in_app_chat": False,      # Not implemented yet
            "payment_integration": False,
        },
        "map_provider": "google_maps",
        "support_phone": "+1-555-0100",
    }
