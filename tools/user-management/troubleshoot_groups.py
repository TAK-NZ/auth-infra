#!/usr/bin/env python3
"""
Troubleshoot Authentik group assignment issues
"""
import requests
import csv
import json
from urllib.parse import urljoin

class AuthentikTroubleshooter:
    def __init__(self, base_url, token):
        self.base_url = base_url
        self.headers = {"Authorization": f"Bearer {token}"}
    
    def get_all_groups(self):
        """Get all groups from Authentik"""
        url = urljoin(self.base_url, "/api/v3/core/groups/")
        response = requests.get(url, headers=self.headers)
        if response.status_code == 200:
            return {group['name']: group for group in response.json()['results']}
        return {}
    
    def check_csv_groups(self, csv_file):
        """Check if groups in CSV exist in Authentik"""
        existing_groups = self.get_all_groups()
        print(f"Found {len(existing_groups)} groups in Authentik:")
        for name in sorted(existing_groups.keys()):
            print(f"  - {name}")
        
        print("\nChecking CSV groups...")
        with open(csv_file, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                username = row['username']
                groups_str = row['static_groups'].strip('"')
                
                if not groups_str:
                    continue
                    
                groups = [g.strip() for g in groups_str.split(',')]
                print(f"\nUser: {username}")
                print(f"  Groups in CSV: {groups}")
                
                missing_groups = []
                for group in groups:
                    if group not in existing_groups:
                        missing_groups.append(group)
                
                if missing_groups:
                    print(f"  ❌ Missing groups: {missing_groups}")
                else:
                    print(f"  ✅ All groups exist")
    
    def get_user_groups(self, username):
        """Get groups assigned to a specific user"""
        url = urljoin(self.base_url, f"/api/v3/core/users/?username={username}")
        response = requests.get(url, headers=self.headers)
        if response.status_code == 200:
            users = response.json()['results']
            if users:
                user_id = users[0]['pk']
                groups_url = urljoin(self.base_url, f"/api/v3/core/users/{user_id}/")
                groups_response = requests.get(groups_url, headers=self.headers)
                if groups_response.status_code == 200:
                    return groups_response.json().get('groups', [])
        return []

def main():
    # Configuration - update these values
    AUTHENTIK_URL = "https://auth.dev.tak.nz"  # or your Authentik URL
    API_TOKEN = "your-api-token-here"  # Get from Authentik admin
    CSV_FILE = "users.csv"
    
    troubleshooter = AuthentikTroubleshooter(AUTHENTIK_URL, API_TOKEN)
    
    print("=== Authentik Group Troubleshooting ===\n")
    
    # Check if CSV groups exist in Authentik
    troubleshooter.check_csv_groups(CSV_FILE)
    
    # Test specific user
    test_user = "dj_cmd@tak.nz"
    print(f"\n=== Testing user: {test_user} ===")
    user_groups = troubleshooter.get_user_groups(test_user)
    print(f"Current groups: {[g['name'] for g in user_groups]}")

if __name__ == "__main__":
    main()