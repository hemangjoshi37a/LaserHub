
import requests

def test_upload():
    url = "http://localhost:8000/api/upload/"
    file_path = "/home/hemang/Documents/GitHub/LaserHub/mew_dove_2b_b55.svg"
    # Explicitly set the MIME type to image/svg+xml
    files = {'file': ('mew_dove_2b_b55.svg', open(file_path, 'rb'), 'image/svg+xml')}
    try:
        response = requests.post(url, files=files)
        print(f"Status Code: {response.status_code}")
        print(f"Response Body: {response.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_upload()
