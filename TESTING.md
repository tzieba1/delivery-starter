# Testing Guide

## Quick Start

Run all backend tests:
```bash
make test-backend
```

## What Was Added

### Test Infrastructure
1. **pytest dependencies** - Added to `requirements.txt`
   - pytest 7.4.3
   - pytest-cov 4.1.0
   - httpx 0.25.2 (for FastAPI TestClient)

2. **pytest configuration** - `services/backend/pytest.ini`
   - Configured test discovery
   - Enabled coverage reporting (86% coverage achieved)
   - Organized test markers

3. **Test fixtures** - `services/backend/tests/conftest.py`
   - `client`: FastAPI TestClient
   - `sample_order_data`: Valid order payload
   - `created_order`: Pre-created order
   - `sample_location_data`: GPS coordinates
   - `clear_orders_db`: Auto-clears database before each test

### Test Suite

**File**: `services/backend/tests/test_api.py`

**Coverage**: 15 tests covering core functionality

#### Test Categories:

1. **Basic Endpoints** (2 tests)
   - Health check
   - Root/info endpoint

2. **Order Flow** (4 tests)
   - Create orders
   - Get order by ID
   - List orders
   - 404 handling

3. **Order Updates** (2 tests)
   - Update order status
   - Cancel/delete orders

4. **Validation** (4 tests)
   - Missing required fields
   - Invalid phone numbers
   - Negative amounts
   - Empty item lists

5. **Location Tracking** (3 tests)
   - Update driver location
   - Track order
   - Invalid coordinate validation

### Configuration Changes

**Makefile**: Updated test-backend command to use development Docker target

**Dockerfile**: Added test files and pytest.ini to development stage

**Docker Compose**: Tests run using the development configuration

## Test Results

```
✓ 15 passed in 0.25s
✓ 86% code coverage
✓ Fast execution (< 1s)
```

## Mobile Tests

```bash
make test-mobile        # jest (jest-expo preset)
cd services/mobile && npm run lint        # eslint 9 flat config
cd services/mobile && npm run type-check  # tsc --noEmit
```

`src/__tests__/api.test.ts` asserts the mobile `OrderStatus` enum still
matches the backend's, which is the contract most likely to drift.

## Adding More Tests

See `services/backend/tests/README.md` for detailed instructions on:
- Running specific tests
- Adding new test cases
- Understanding test fixtures
- Viewing coverage reports

## CI/CD Ready

These tests are optimized for continuous integration:
- No external dependencies
- Isolated in-memory database
- Fast execution
- Clear pass/fail signals
- Coverage reporting included
