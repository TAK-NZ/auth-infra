#!/usr/bin/env python3
"""
Export all users from Authentik to CSV format
Usage: python3 export-users.py <token> [base_url]
"""

import requests
import csv
import argparse
import sys

def get_all_users(base_url, headers):
    """Get all users from Authentik"""
    users = []
    page = 1
    while True:
        response = requests.get(f"{base_url}/core/users/?page={page}&page_size=100", headers=headers)
        if response.status_code != 200:
            print(f"Error fetching users: {response.text}")
            break
        
        data = response.json()
        users.extend(data['results'])
        
        if not data.get('next'):
            break
        page += 1
    
    return users

def get_user_groups(base_url, headers, user_pk):
    """Get groups for a specific user"""
    response = requests.get(f"{base_url}/core/users/{user_pk}/", headers=headers)
    if response.status_code == 200:
        user_data = response.json()
        return [group['name'] for group in user_data.get('groups_obj', [])]
    return []

def main():
    parser = argparse.ArgumentParser(description='Export users from Authentik to CSV')
    parser.add_argument('token', help='Authentik API token')
    parser.add_argument('--base-url', default='https://account.demo.tak.nz/api/v3', help='Authentik API base URL')
    parser.add_argument('--output', default='exported-users.csv', help='Output CSV file')
    
    args = parser.parse_args()
    
    headers = {
        "Authorization": f"Bearer {args.token}",
        "Content-Type": "application/json"
    }
    
    print("Fetching users from Authentik...")
    users = get_all_users(args.base_url, headers)
    print(f"Found {len(users)} users")
    
    # Filter out system users and prepare data
    user_data = []
    for user in users:
        # Skip system users
        if user.get('type') != 'internal' or user.get('username') in ['akadmin', 'authentik-default']:
            continue
        
        print(f"Processing user: {user['username']}")
        
        # Get user groups
        groups = get_user_groups(args.base_url, headers, user['pk'])
        filtered_groups = [
            g for g in groups
            if not g.startswith('tak_Regions') and not g.startswith('tak_UTL') and not g.startswith('tak_BCH')
        ]
        groups_str = ','.join(filtered_groups) if filtered_groups else ''
        
        if filtered_groups:
            print(f"  Found {len(filtered_groups)} groups: {filtered_groups[:3]}{'...' if len(filtered_groups) > 3 else ''}")
        else:
            print(f"  No groups found")
        
        # Extract TAK attributes
        attributes = user.get('attributes', {})
        
        user_data.append({
            'username': user['username'],
            'name': user.get('name', ''),
            'takRole': attributes.get('takRole', ''),
            'takColor': attributes.get('takColor', ''),
            'takCallsign': attributes.get('takCallsign', ''),
            'takColorLabel': attributes.get('takColorLabel', ''),
            'password': '',  # Empty password to avoid overwriting existing passwords
            'static_groups': groups_str
        })
    
    # Write to CSV
    print(f"Writing {len(user_data)} users to {args.output}...")
    with open(args.output, 'w', newline='') as csvfile:
        fieldnames = ['username', 'name', 'takRole', 'takColor', 'takCallsign', 'takColorLabel', 'password', 'static_groups']
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        
        writer.writeheader()
        for user in user_data:
            writer.writerow(user)
    
    print(f"Export complete: {args.output}")
    print("Note: Passwords are set to '<exported>' and will need to be updated manually")

if __name__ == "__main__":
    main()