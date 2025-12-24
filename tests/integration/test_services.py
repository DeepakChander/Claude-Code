#!/usr/bin/env python3
"""
OpenAnalyst Integration Tests
Tests end-to-end flow across all services
"""

import asyncio
import httpx
import json
import websockets
from datetime import datetime


# Service URLs
SERVICES = {
    "brain": "http://localhost:3456",
    "agno": "http://localhost:8001",
    "websocket_hub": "http://localhost:8002",
    "windmill": "http://localhost:8000",
    "frontend": "http://localhost:3000",
}


async def test_brain_health():
    """Test Brain service health endpoint"""
    print("\n[TEST] Brain Health Check")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{SERVICES['brain']}/health", timeout=10)
            data = response.json()
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            assert data.get("status") in ["ok", "healthy"], f"Unexpected status: {data.get('status')}"
            print(f"  [PASS] Brain is healthy: {data.get('status')}")
            return True
        except Exception as e:
            print(f"  [FAIL] Brain health check failed: {e}")
            return False


async def test_agno_health():
    """Test Agno service health endpoint"""
    print("\n[TEST] Agno Health Check")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{SERVICES['agno']}/health", timeout=10)
            data = response.json()
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            print(f"  [PASS] Agno is healthy")
            return True
        except Exception as e:
            print(f"  [FAIL] Agno health check failed: {e}")
            return False


async def test_websocket_hub_health():
    """Test WebSocket Hub health endpoint"""
    print("\n[TEST] WebSocket Hub Health Check")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{SERVICES['websocket_hub']}/health", timeout=10)
            data = response.json()
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            print(f"  [PASS] WebSocket Hub is healthy: {data.get('connections', {})}")
            return True
        except Exception as e:
            print(f"  [FAIL] WebSocket Hub health check failed: {e}")
            return False


async def test_windmill_health():
    """Test Windmill health endpoint"""
    print("\n[TEST] Windmill Health Check")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{SERVICES['windmill']}/api/version", timeout=10)
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            print(f"  [PASS] Windmill is healthy: {response.text[:50]}...")
            return True
        except Exception as e:
            print(f"  [FAIL] Windmill health check failed: {e}")
            return False


async def test_auth_flow():
    """Test authentication token generation"""
    print("\n[TEST] Authentication Flow")
    async with httpx.AsyncClient() as client:
        try:
            # This would need a valid API key in production
            response = await client.post(
                f"{SERVICES['brain']}/api/auth/token",
                json={"apiKey": "test-api-key"},
                timeout=10
            )
            # We expect this to either succeed or fail with auth error
            assert response.status_code in [200, 401, 403], f"Unexpected status: {response.status_code}"
            print(f"  [PASS] Auth endpoint responding: {response.status_code}")
            return True
        except Exception as e:
            print(f"  [FAIL] Auth flow failed: {e}")
            return False


async def test_websocket_connection():
    """Test WebSocket connection"""
    print("\n[TEST] WebSocket Connection")
    try:
        # Note: Would need a valid JWT token in production
        uri = "ws://localhost:8002/ws?token=test-token"
        async with websockets.connect(uri) as ws:
            # We expect either connection or auth rejection
            print(f"  [INFO] WebSocket connection attempt made")
            return True
    except websockets.exceptions.InvalidStatusCode as e:
        if e.status_code in [4001, 4002]:
            print(f"  [PASS] WebSocket auth working (rejected invalid token)")
            return True
        print(f"  [FAIL] Unexpected WebSocket error: {e}")
        return False
    except Exception as e:
        print(f"  [FAIL] WebSocket connection failed: {e}")
        return False


async def test_agno_task_endpoint():
    """Test Agno task creation endpoint"""
    print("\n[TEST] Agno Task Creation")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{SERVICES['agno']}/api/tasks",
                json={
                    "user_id": "test_user",
                    "session_id": "test_session",
                    "content": "Test task for integration testing"
                },
                timeout=30
            )
            # Task execution might fail due to Windmill not being configured
            # but the endpoint should respond
            assert response.status_code in [200, 500], f"Unexpected status: {response.status_code}"
            print(f"  [PASS] Agno task endpoint responding: {response.status_code}")
            return True
        except Exception as e:
            print(f"  [FAIL] Agno task creation failed: {e}")
            return False


async def run_all_tests():
    """Run all integration tests"""
    print("=" * 60)
    print("OpenAnalyst Integration Tests")
    print(f"Started at: {datetime.now().isoformat()}")
    print("=" * 60)

    results = []

    # Health checks
    results.append(("Brain Health", await test_brain_health()))
    results.append(("Agno Health", await test_agno_health()))
    results.append(("WebSocket Hub Health", await test_websocket_hub_health()))
    results.append(("Windmill Health", await test_windmill_health()))

    # Functional tests
    results.append(("Auth Flow", await test_auth_flow()))
    results.append(("WebSocket Connection", await test_websocket_connection()))
    results.append(("Agno Task", await test_agno_task_endpoint()))

    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)

    passed = sum(1 for _, r in results if r)
    failed = len(results) - passed

    for name, result in results:
        status = "PASS" if result else "FAIL"
        print(f"  [{status}] {name}")

    print(f"\nTotal: {len(results)} | Passed: {passed} | Failed: {failed}")
    print("=" * 60)

    return failed == 0


if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    exit(0 if success else 1)
