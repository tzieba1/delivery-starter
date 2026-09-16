# Backend Tests

Simple, pragmatic tests for the Delivery API backend.

## Running Tests

### Using Make (Recommended)
```bash
make test-backend
```

### Using Docker Compose Directly
```bash
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.dev.yml run --rm backend pytest
```

### Run Specific Tests
```bash
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.dev.yml run --rm backend pytest tests/test_api.py::TestOrderFlow
```

### Run with Verbose Output
```bash
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.dev.yml run --rm backend pytest -v
```

### Run Without Coverage Report
```bash
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.dev.yml run --rm backend pytest --no-cov
```

## Test Structure

```
tests/
├── README.md           # This file
├── conftest.py         # Test fixtures and setup
└── test_api.py         # API integration tests
```

## Test Coverage

The test suite covers:

### ✓ Basic Endpoints
- Health check endpoint
- Root/info endpoint

### ✓ Order Management
- Create orders
- Retrieve orders by ID
- List all orders
- Update order status
- Cancel/delete orders
- 404 handling

### ✓ Input Validation
- Missing required fields
- Invalid phone numbers
- Negative amounts
- Empty order items

### ✓ Location Tracking
- Update driver location
- Track order location
- Invalid coordinate validation

## Test Fixtures

Common fixtures available in `conftest.py`:

- **client**: FastAPI test client
- **sample_order_data**: Valid order payload
- **created_order**: Pre-created order for testing
- **sample_location_data**: Valid GPS coordinates

## Coverage Report

After running tests, view the HTML coverage report:
```bash
open htmlcov/index.html
```

## Adding New Tests

1. Add new test functions to `test_api.py` or create new test files
2. Use descriptive test names: `test_<action>_<expected_result>`
3. Group related tests in classes
4. Use fixtures to reduce duplication
5. Keep tests focused and independent

Example:
```python
def test_create_order_with_notes(client, sample_order_data):
    """Test creating an order with special notes."""
    data = {**sample_order_data, "notes": "Ring doorbell"}
    response = client.post("/api/v1/orders", json=data)
    assert response.status_code == 201
    assert response.json()["notes"] == "Ring doorbell"
```

## Continuous Integration

These tests are designed to run in CI/CD pipelines:
- Fast execution (< 1 second)
- No external dependencies
- Isolated test database (in-memory)
- Clear pass/fail signals
