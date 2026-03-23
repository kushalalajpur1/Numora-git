"""
Test script to validate Google Gemini API key and diagnose connection issues.
Run this to see the exact error from Gemini API.
"""

import os
import json
import requests
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    print("[ERROR] GEMINI_API_KEY not set in .env file")
    exit(1)

if api_key == "your-gemini-api-key-here":
    print("[ERROR] GEMINI_API_KEY is still the placeholder value")
    exit(1)

print(f"[OK] API Key found: {api_key[:20]}...{api_key[-10:]}")
print()

# Test 1: Simple message test
print("=" * 60)
print("TEST 1: Simple message request")
print("=" * 60)

payload = {
    "contents": [
        {
            "role": "user",
            "parts": [
                {
                    "text": "Hello, who are you?"
                }
            ]
        }
    ]
}

headers = {
    "content-type": "application/json"
}

print("Request Headers:")
print(json.dumps({k: (v[:20] + "..." if len(str(v)) > 20 else v) for k, v in headers.items()}, indent=2))
print()
print("Request Payload:")
print(json.dumps(payload, indent=2))
print()

try:
    response = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}",
        headers=headers,
        json=payload,
        timeout=30
    )

    print(f"Response Status: {response.status_code}")
    print()

    try:
        response_json = response.json()
        print("Response Body:")
        print(json.dumps(response_json, indent=2))
    except:
        print("Response Body (raw):")
        print(response.text)

    if response.status_code == 200:
        print()
        print("[SUCCESS] API key is valid and Gemini API is responding!")
    else:
        print()
        print(f"[FAILED] Gemini API returned status {response.status_code}")
        print()
        print("Debugging tips:")
        print("1. Check if API key is still active at https://aistudio.google.com/app/apikey")
        print("2. Verify the key isn't expired or revoked")
        print("3. Check your Google Cloud project billing status")
        print("4. Try creating a fresh API key if this one seems problematic")

except Exception as e:
    print(f"[ERROR] Connection Error: {str(e)}")
    print()
    print("Debugging tips:")
    print("1. Check your internet connection")
    print("2. Ensure you can reach https://generativelanguage.googleapis.com")
    print("3. Check firewall/proxy settings if behind corporate network")
