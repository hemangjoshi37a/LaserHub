import requests

def test_register():
    url = "http://localhost:8000/api/auth/register"
    data = {
        "email": "test@test.com",
        "name": "Test User",
        "password": "p" # Too short
    }
    response = requests.post(url, json=data)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")

    data["password"] = "password123" # Correct length
    response = requests.post(url, json=data)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")

if __name__ == "__main__":
    test_register()
