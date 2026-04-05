import os

# 1. Project directory (React usually puts source code in 'src')
project_path = './src'  
output_file = 'react_collection.txt'

# 2. Define extensions to include
valid_extensions = ('.js', '.jsx', '.ts', '.tsx', '.css', '.json')

# 3. Directories to skip (prevents overwhelming the output file)
excluded_dirs = {'node_modules', 'dist', 'build', '.git'}

with open(output_file, 'w', encoding='utf-8') as out_file:
    for root, dirs, files in os.walk(project_path):
        # Modify dirs in-place to skip excluded folders
        dirs[:] = [d for d in dirs if d not in excluded_dirs]
        
        for file in files:
            if file.endswith(valid_extensions):
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, start='.')

                out_file.write(f"// --- FILE: {rel_path} ---\n")
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        out_file.write(f.read())
                except Exception as e:
                    out_file.write(f"// Error reading file: {e}")
                
                out_file.write("\n\n")

print(f"Done! Created {output_file}")
