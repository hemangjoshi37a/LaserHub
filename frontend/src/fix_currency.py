import os
import re

src_dir = r"c:\Users\nitya\Desktop\LaserHub\frontend\src"

def get_relative_path(file_path):
    # depth from src
    rel_path = os.path.relpath(file_path, src_dir)
    depth = rel_path.count(os.sep)
    if depth == 0:
        return "./utils/formatPrice"
    elif depth == 1:
        return "../utils/formatPrice"
    elif depth == 2:
        return "../../utils/formatPrice"
    else:
        return "../../../utils/formatPrice"

for root, _, files in os.walk(src_dir):
    for f in files:
        if f.endswith(".tsx"):
            path = os.path.join(root, f)
            with open(path, "r", encoding="utf-8") as file:
                content = file.read()
            
            # Find and replace
            new_content, count = re.subn(r'\$\{(.*?)\.toFixed\(\d+\)\}', r'{formatPrice(\1)}', content)
            
            new_content, count2 = re.subn(r'>\$(.*?)<', r'>{formatPrice(\1)}<', new_content)
            
            if count > 0 or count2 > 0:
                # Add import if not present
                if "import { formatPrice }" not in new_content:
                    import_path = get_relative_path(path)
                    import_stmt = f"import {{ formatPrice }} from '{import_path}';\n"
                    # Put it after the last import
                    lines = new_content.split('\n')
                    last_import_idx = -1
                    for i, line in enumerate(lines):
                        if line.startswith("import "):
                            last_import_idx = i
                    if last_import_idx != -1:
                        lines.insert(last_import_idx + 1, import_stmt.strip())
                    else:
                        lines.insert(0, import_stmt.strip())
                    new_content = '\n'.join(lines)
                
                with open(path, "w", encoding="utf-8") as file:
                    file.write(new_content)
                print(f"Updated {path}")
