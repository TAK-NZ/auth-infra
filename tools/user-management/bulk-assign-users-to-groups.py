#!/usr/bin/env python3
"""
Bulk assign users to groups in Authentik via API
Usage: python3 bulk-assign-users-to-groups.py <token> <csv_file> [base_url]
"""

import requests
import sys
import csv
import argparse

def get_all_groups(base_url, headers):
    """Get all groups from Authentik with larger page size"""
    response = requests.get(f"{base_url}/core/groups/?page_size=100", headers=headers)
    if response.status_code == 200:
        return response.json()['results']
    return []

def get_groups_with_pattern(base_url, headers, prefix, suffix=None):
    """Get all groups that start with prefix and optionally end with suffix"""
    all_groups = get_all_groups(base_url, headers)
    if suffix:
        return [group['name'] for group in all_groups if group['name'].startswith(prefix) and group['name'].endswith(suffix)]
    else:
        return [group['name'] for group in all_groups if group['name'].startswith(prefix)]

def load_users_from_csv(csv_file):
    """Load users and their static groups from CSV file"""
    users = {}
    with open(csv_file, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            username = row['username']
            static_groups = [g.strip() for g in row['static_groups'].split(',') if g.strip()]
            users[username] = static_groups
    return users

def get_user_pk(base_url, headers, username):
    """Get user primary key by username (case insensitive)"""
    username_lower = username.lower()
    response = requests.get(f"{base_url}/core/users/?username={username_lower}", headers=headers)
    if response.status_code == 200:
        data = response.json()
        if data['results']:
            return data['results'][0]['pk']
    return None

def get_group_pk(base_url, headers, group_name):
    """Get group primary key by name"""
    response = requests.get(f"{base_url}/core/groups/?name={group_name}", headers=headers)
    if response.status_code == 200:
        data = response.json()
        if data['results']:
            return data['results'][0]['pk']
    return None

def add_user_to_group(base_url, headers, user_pk, group_pk):
    """Add user to group"""
    response = requests.post(
        f"{base_url}/core/groups/{group_pk}/add_user/",
        json={"pk": user_pk},
        headers=headers
    )
    return response.status_code == 204

def main():
    parser = argparse.ArgumentParser(description='Bulk assign users to groups in Authentik')
    parser.add_argument('token', help='Authentik API token')
    parser.add_argument('csv_file', help='CSV file with users and static groups')
    parser.add_argument('--base-url', default='https://account.demo.tak.nz/api/v3', help='Authentik API base URL')
    
    args = parser.parse_args()
    
    headers = {
        "Authorization": f"Bearer {args.token}",
        "Content-Type": "application/json"
    }
    
    print("Loading users from CSV...")
    users_data = load_users_from_csv(args.csv_file)
    print(f"Loaded {len(users_data)} users")
    
    print("Fetching dynamic groups...")
    bch_groups = get_groups_with_pattern(args.base_url, headers, "tak_BCH - ", "_READ")
    region_groups = get_groups_with_pattern(args.base_url, headers, "tak_Regions -")
    utl_groups = get_groups_with_pattern(args.base_url, headers, "tak_UTL - ", "_READ")
    
    print(f"Found {len(bch_groups)} BCH groups")
    print(f"Found {len(region_groups)} region groups")
    print(f"Found {len(utl_groups)} UTL groups")
    
    # Process each user
    total_assignments = 0
    completed = 0
    
    for username, static_groups in users_data.items():
        user_pk = get_user_pk(args.base_url, headers, username)
        if not user_pk:
            print(f"✗ User not found: {username}")
            continue
        
        print(f"✓ Found user: {username}")
        
        # Combine user's static groups with dynamic groups
        all_groups = static_groups + bch_groups + region_groups + utl_groups
        total_assignments += len(all_groups)
        
        # Assign user to all groups
        for group_name in all_groups:
            group_pk = get_group_pk(args.base_url, headers, group_name)
            if group_pk and add_user_to_group(args.base_url, headers, user_pk, group_pk):
                completed += 1
                print(f"✓ Added {username} to {group_name} ({completed}/{total_assignments})")
            elif not group_pk:
                print(f"✗ Group not found: {group_name}")
            else:
                print(f"✗ Failed to add {username} to {group_name}")
    
    print(f"\nCompleted: {completed}/{total_assignments} assignments")

if __name__ == "__main__":
    main()