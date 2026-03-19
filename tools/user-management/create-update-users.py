#!/usr/bin/env python3
"""
Create or update users in Authentik from CSV file
Usage: python3 create-update-users.py <token> <csv_file> [base_url]
"""

import requests
import csv
import argparse

def load_users_from_csv(csv_file):
    """Load users from CSV file"""
    users = []
    with open(csv_file, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            users.append(row)
    return users

def get_user_by_username(base_url, headers, username):
    """Get user by username (case insensitive)"""
    username_lower = username.lower()
    response = requests.get(f"{base_url}/core/users/?username={username_lower}", headers=headers)
    if response.status_code == 200:
        data = response.json()
        if data['results']:
            return data['results'][0]
    return None

def create_user(base_url, headers, user_data):
    """Create a new user"""
    username_lower = user_data['username'].lower()
    payload = {
        "username": username_lower,
        "name": user_data['name'],
        "email": username_lower,
        "is_active": True,
        "type": "internal",
        "path": "users",
        "attributes": {
            "takRole": user_data['takRole'],
            "takColor": user_data['takColor'],
            "takCallsign": user_data['takCallsign'],
            "takColorLabel": user_data['takColorLabel']
        }
    }
    
    response = requests.post(f"{base_url}/core/users/", json=payload, headers=headers)
    return response.status_code == 201, response

def update_user(base_url, headers, user_pk, user_data):
    """Update an existing user"""
    username_lower = user_data['username'].lower()
    payload = {
        "name": user_data['name'],
        "email": username_lower,
        "is_active": True,
        "type": "internal",
        "path": "users",
        "attributes": {
            "takRole": user_data['takRole'],
            "takColor": user_data['takColor'],
            "takCallsign": user_data['takCallsign'],
            "takColorLabel": user_data['takColorLabel']
        }
    }
    
    response = requests.patch(f"{base_url}/core/users/{user_pk}/", json=payload, headers=headers)
    return response.status_code == 200, response

def set_user_password(base_url, headers, user_pk, password):
    """Set user password that doesn't expire"""
    payload = {
        "password": password,
        "temporary": False
    }
    response = requests.post(f"{base_url}/core/users/{user_pk}/set_password/", json=payload, headers=headers)
    return response.status_code == 204

def main():
    parser = argparse.ArgumentParser(description='Create or update users in Authentik from CSV')
    parser.add_argument('token', help='Authentik API token')
    parser.add_argument('csv_file', help='CSV file with user data')
    parser.add_argument('--base-url', default='https://account.demo.tak.nz/api/v3', help='Authentik API base URL')
    
    args = parser.parse_args()
    
    headers = {
        "Authorization": f"Bearer {args.token}",
        "Content-Type": "application/json"
    }
    
    print("Loading users from CSV...")
    users = load_users_from_csv(args.csv_file)
    print(f"Loaded {len(users)} users")
    
    created = 0
    updated = 0
    errors = 0
    
    for user_data in users:
        username = user_data['username']
        existing_user = get_user_by_username(args.base_url, headers, username)
        
        if existing_user:
            # Update existing user
            success, response = update_user(args.base_url, headers, existing_user['pk'], user_data)
            if success:
                # Set password only if provided
                if user_data['password'].strip():
                    if set_user_password(args.base_url, headers, existing_user['pk'], user_data['password']):
                        print(f"✓ Updated user with password: {username}")
                    else:
                        print(f"✓ Updated user but failed to set password: {username}")
                else:
                    print(f"✓ Updated user (password unchanged): {username}")
                updated += 1
            else:
                print(f"✗ Failed to update user: {username} - {response.text}")
                errors += 1
        else:
            # Create new user
            success, response = create_user(args.base_url, headers, user_data)
            if success:
                user_pk = response.json()['pk']
                # Set password only if provided
                if user_data['password'].strip():
                    if set_user_password(args.base_url, headers, user_pk, user_data['password']):
                        print(f"✓ Created user with password: {username}")
                    else:
                        print(f"✓ Created user but failed to set password: {username}")
                else:
                    print(f"✓ Created user (no password set): {username}")
                created += 1
            else:
                print(f"✗ Failed to create user: {username} - {response.text}")
                errors += 1
    
    print(f"\nSummary:")
    print(f"Created: {created}")
    print(f"Updated: {updated}")
    print(f"Errors: {errors}")

if __name__ == "__main__":
    main()