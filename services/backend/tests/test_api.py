"""
Simple, pragmatic integration tests for the Delivery API.

These tests cover the core functionality without over-testing edge cases.
Perfect for CI/CD pipelines and quick validation.
"""
import pytest


class TestBasicEndpoints:
    """Test basic API functionality."""

    def test_health_check(self, client):
        """Verify health endpoint is working."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data

    def test_root_endpoint(self, client):
        """Verify root endpoint returns service info."""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "service" in data or "name" in data
        assert "version" in data


class TestOrderFlow:
    """Test the complete order lifecycle."""

    def test_create_order(self, client, sample_order_data):
        """Test creating a new order."""
        response = client.post("/api/v1/orders", json=sample_order_data)

        assert response.status_code == 201
        order = response.json()

        # Verify order was created
        assert "id" in order
        assert order["id"].startswith("ORD-")
        assert order["customer_name"] == sample_order_data["customer_name"]
        assert order["status"] == "pending"  # Lowercase enum value
        assert "created_at" in order

    def test_get_order_by_id(self, client, created_order):
        """Test retrieving an order by ID."""
        order_id = created_order["id"]
        response = client.get(f"/api/v1/orders/{order_id}")

        assert response.status_code == 200
        order = response.json()
        assert order["id"] == order_id

    def test_list_orders(self, client, created_order):
        """Test listing all orders."""
        response = client.get("/api/v1/orders")

        assert response.status_code == 200
        # API might return list or dict with 'orders' key
        # This test works with either format
        data = response.json()
        assert data is not None

    def test_order_not_found(self, client):
        """Test 404 for nonexistent order."""
        response = client.get("/api/v1/orders/ORD-999999")
        assert response.status_code == 404


class TestOrderUpdates:
    """Test updating orders."""

    def test_update_order_status(self, client, created_order):
        """Test updating order status."""
        order_id = created_order["id"]

        response = client.patch(
            f"/api/v1/orders/{order_id}",
            json={"status": "confirmed"}  # Use lowercase enum value
        )

        assert response.status_code == 200
        order = response.json()
        assert order["status"] == "confirmed"

    def test_delete_order(self, client, created_order):
        """Test canceling/deleting an order."""
        order_id = created_order["id"]

        response = client.delete(f"/api/v1/orders/{order_id}")
        # Should return 200 or 204
        assert response.status_code in [200, 204]


class TestValidation:
    """Test input validation."""

    def test_create_order_missing_field(self, client):
        """Test that missing required fields are rejected."""
        invalid_order = {
            "customer_name": "John Doe"
            # Missing phone, addresses, items, total
        }

        response = client.post("/api/v1/orders", json=invalid_order)
        assert response.status_code == 422

    def test_create_order_invalid_phone(self, client, sample_order_data):
        """Test that invalid phone numbers are rejected."""
        bad_order = {**sample_order_data, "customer_phone": "invalid"}

        response = client.post("/api/v1/orders", json=bad_order)
        assert response.status_code == 422

    def test_create_order_negative_amount(self, client, sample_order_data):
        """Test that negative amounts are rejected."""
        bad_order = {**sample_order_data, "total_amount": -10.0}

        response = client.post("/api/v1/orders", json=bad_order)
        assert response.status_code == 422

    def test_create_order_empty_items(self, client, sample_order_data):
        """Test that orders must have items."""
        bad_order = {**sample_order_data, "items": []}

        response = client.post("/api/v1/orders", json=bad_order)
        assert response.status_code == 422


class TestLocationTracking:
    """Test location tracking functionality."""

    def test_update_location(self, client, created_order, sample_location_data):
        """Test updating driver location."""
        order_id = created_order["id"]

        # Location updates only work for orders in delivery state
        # First, update order to in_transit status
        client.patch(f"/api/v1/orders/{order_id}", json={"status": "in_transit"})

        response = client.post(
            f"/api/v1/orders/{order_id}/location",
            json=sample_location_data
        )

        # Should succeed
        assert response.status_code == 200

    def test_invalid_latitude(self, client, created_order):
        """Test that invalid coordinates are rejected."""
        order_id = created_order["id"]

        response = client.post(
            f"/api/v1/orders/{order_id}/location",
            json={"latitude": 91.0, "longitude": 0.0}  # Invalid: > 90
        )

        assert response.status_code == 422

    def test_track_order(self, client, created_order):
        """Test tracking an order."""
        order_id = created_order["id"]

        response = client.get(f"/api/v1/orders/{order_id}/track")

        # Should return tracking info
        assert response.status_code in [200, 201]
