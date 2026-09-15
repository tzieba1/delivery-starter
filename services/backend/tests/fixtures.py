"""
Pytest configuration and fixtures for backend tests.
"""
import pytest
from fastapi.testclient import TestClient
from src.main import app, orders_db


@pytest.fixture(autouse=True)
def clear_orders_db():
    """
    Automatically clear the in-memory orders database before each test.
    This ensures test isolation - each test starts with a clean slate.
    """
    orders_db.clear()
    yield
    orders_db.clear()


@pytest.fixture
def client():
    """
    Provides a FastAPI TestClient for making requests to the API.

    The TestClient allows you to test your API endpoints without
    running an actual server - it's synchronous and fast.
    """
    return TestClient(app)


@pytest.fixture
def sample_order_data():
    """
    Provides a valid order payload for testing order creation.
    This reduces duplication across tests.
    """
    return {
        "customer_name": "John Doe",
        "customer_phone": "+15550123456",  # Must match pattern: ^\+?1?\d{9,15}$
        "pickup_address": "123 Restaurant St",
        "delivery_address": "456 Customer Ave",
        "items": [
            {
                "name": "Burger",
                "quantity": 2,
                "price": 12.99,
                "notes": "No onions"
            },
            {
                "name": "Fries",
                "quantity": 1,
                "price": 4.99,
                "notes": None
            }
        ],
        "total_amount": 30.97
    }


@pytest.fixture
def created_order(client, sample_order_data):
    """
    Provides a pre-created order for tests that need an existing order.

    This fixture creates an order and returns the response data,
    including the order_id. Useful for testing update/delete operations.
    """
    response = client.post("/api/v1/orders", json=sample_order_data)
    assert response.status_code == 201
    return response.json()


@pytest.fixture
def sample_location_data():
    """
    Provides valid location data for testing location updates.
    """
    return {
        "latitude": 40.7128,
        "longitude": -74.0060
    }
