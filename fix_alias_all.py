import os
import re

src_root = '/Users/sagbharg/Documents/Kinematic/kinematic-dashboard/src'

def fix_imports(file_path):
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Calculate depth relative to src/
    # e.g. src/lib/auth.ts -> depth 1
    # e.g. src/app/login/page.tsx -> depth 2
    rel_path = os.path.relpath(file_path, src_root)
    depth = rel_path.count(os.sep)
    
    prefix = '../' * depth
    if not prefix: prefix = './'
    
    # Replace '@/foo' with '../foo' (based on depth)
    new_content = re.sub(r"from '@/(.*?)'", f"from '{prefix}\\1'", content)
    new_content = re.sub(r'from "@/(.*?)"', f'from "{prefix}\\1"', new_content)
    
    if content != new_content:
        with open(file_path, 'w') as f:
            f.write(new_content)
        print(f"Fixed: {rel_path} (Depth: {depth})")

for root, _, files in os.walk(src_root):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            fix_imports(os.path.join(root, file))
