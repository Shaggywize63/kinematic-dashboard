import os
import re

root_dir = '/Users/sagbharg/Documents/Kinematic/kinematic-dashboard/src/app/dashboard'

def fix_imports(file_path):
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Calculate relative depth from src/
    # file_path example: .../src/app/dashboard/analytics/page.tsx
    # Relative to src: app/dashboard/analytics/page.tsx (3 levels of directories)
    rel_path = os.path.relpath(file_path, '/Users/sagbharg/Documents/Kinematic/kinematic-dashboard/src')
    depth = rel_path.count(os.sep)
    
    prefix = '../' * depth
    # If depth is 0 (unlikely for dashboard), prefix stays empty or becomes './'
    if not prefix: prefix = './'
    
    # Regex to find from '@/lib/api' or from '@/components/...'
    # but NOT in multiline comments or strings? (Assuming standard imports)
    new_content = re.sub(r"from '@/(.*?)'", f"from '{prefix}\\1'", content)
    new_content = re.sub(r'from "@/(.*?)"', f'from "{prefix}\\1"', new_content)
    # Also for import(...) dynamic
    new_content = re.sub(r"import\('@/(.*?)'\)", f"import('{prefix}\\1')", new_content)
    
    if content != new_content:
        with open(file_path, 'w') as f:
            f.write(new_content)
        print(f"Fixed: {rel_path} (Depth: {depth})")

for root, _, files in os.walk(root_dir):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            fix_imports(os.path.join(root, file))

# Also fix src/app/dashboard/layout.tsx explicitly if missed
fix_imports('/Users/sagbharg/Documents/Kinematic/kinematic-dashboard/src/app/dashboard/layout.tsx')
